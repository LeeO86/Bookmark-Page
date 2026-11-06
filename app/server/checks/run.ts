import { inFlightServerChecks as inFlight, serverCheckSchedule } from './schedule'
import { imageCheckTarget } from './image-target'
import { eq } from 'drizzle-orm'
import type { RequestSpec } from '../../shared/contracts'
import { getDatabase } from '../db/client'
import { decryptSecret } from '../db/crypto'
import { now } from '../db/ids'
import { checks, checkStatus, entries, fieldDefinitions, fieldValues } from '../db/schema'
import { resolvePlaceholders, redactSecretValues } from '../services/placeholders'
import { publishLive } from '../services/live'
import { probeHttp, probeIcmp, probeTcp, probeImage, type ProbeResult } from './probe'

let pumping = false
let lastCapacityWarning = 0

export async function runDueServerChecks(): Promise<number> {
  return pumpServerChecks()
}

function pumpServerChecks(): number {
  if (pumping) return 0
  pumping = true
  let started = 0
  try {
    const schedule = serverCheckSchedule()
    if (schedule.overdue && Date.now() - lastCapacityWarning >= 60_000) {
      lastCapacityWarning = Date.now()
      console.warn(
        'Server checks are overdue by more than their interval; review CHECK_CONCURRENCY and probe timeouts',
        {
          overdue: schedule.overdue,
          concurrency: schedule.concurrency,
          maxOverdueSeconds: Math.floor(schedule.maxOverdueSeconds),
        },
      )
    }
    for (const { check } of schedule.due) {
      if (inFlight.size >= schedule.concurrency) break
      if (inFlight.has(check.id)) continue
      inFlight.add(check.id)
      started++
      void runServerCheck(check.id)
        .catch(() => {
          // Unexpected probe errors must neither become unhandled rejections nor spin forever.
          if (getDatabase().select().from(checks).where(eq(checks.id, check.id)).get())
            writeStatus(
              check.id,
              { state: 'unknown', latencyMs: null, message: 'Server check could not complete' },
              'server',
            )
        })
        .finally(() => {
          inFlight.delete(check.id)
          pumpServerChecks()
        })
        .catch(() => {
          console.error('Server check scheduling failed; the next monitor sweep will retry')
        })
    }
    return started
  } finally {
    pumping = false
  }
}

export async function runServerCheck(checkId: string): Promise<void> {
  const db = getDatabase()
  const check = db.select().from(checks).where(eq(checks.id, checkId)).get()
  if (!check || check.executor !== 'server') {
    return
  }
  const entry = db.select().from(entries).where(eq(entries.id, check.entryId)).get()
  if (!entry) {
    return
  }
  const host = check.host?.trim() || entry.host || ''
  let result: ProbeResult
  if (check.kind === 'image') {
    const url = imageCheckTarget(check)
    result = url
      ? await probeImage(url, check.tlsVerify, check.timeoutMs)
      : {
          state: 'unknown',
          latencyMs: null,
          message: 'Image checks need a resolved HTTP(S) image target',
        }
  } else if (check.kind === 'icmp') {
    result = await probeIcmp(host, check.timeoutMs)
  } else if (check.kind === 'tcp') {
    result = check.port
      ? await probeTcp(host, check.port, check.timeoutMs)
      : { state: 'unknown', latencyMs: null, message: 'TCP checks need a port' }
  } else {
    result = await runHttp(check, entry, host)
  }
  writeStatus(checkId, result, 'server')
}

async function runHttp(
  check: typeof checks.$inferSelect,
  entry: typeof entries.$inferSelect,
  host: string,
): Promise<ProbeResult> {
  const spec = check.requestSpec as RequestSpec | null
  if (!spec?.urlTemplate) {
    return { state: 'unknown', latencyMs: null, message: 'HTTP checks need a request spec' }
  }
  const fields = fieldMap(entry.id)
  const context = { host: host || null, name: entry.name, fields: fields.values, inputs: {} }
  const secrets = secretValues(entry.id)
  try {
    const url = resolvePlaceholders(spec.urlTemplate, context)
    const headers = Object.fromEntries(
      Object.entries(spec.headers).map(([key, value]) => [
        key,
        resolvePlaceholders(value, context),
      ]),
    )
    const body = spec.bodyTemplate === null ? null : resolvePlaceholders(spec.bodyTemplate, context)
    const result = await probeHttp(
      url,
      spec.expectation,
      check.tlsVerify,
      check.timeoutMs,
      spec.method,
      body,
      headers,
    )
    return { ...result, message: redactSecretValues(result.message, secrets) }
  } catch (error) {
    return {
      state: 'unknown',
      latencyMs: null,
      message: redactSecretValues(
        error instanceof Error ? error.message : 'Invalid HTTP check',
        secrets,
      ),
    }
  }
}

function fieldMap(entryId: string): { values: Record<string, string> } {
  const db = getDatabase()
  const definitions = new Map(
    db
      .select()
      .from(fieldDefinitions)
      .all()
      .map((field) => [field.id, field]),
  )
  const values: Record<string, string> = {}
  for (const value of db.select().from(fieldValues).where(eq(fieldValues.entryId, entryId)).all()) {
    const definition = definitions.get(value.fieldId)
    if (!definition) {
      continue
    }
    if (definition.type === 'secret' && value.valueSecret) {
      values[definition.key] = decryptSecret(value.valueSecret)
    } else if (value.valueText != null) {
      values[definition.key] = value.valueText
    }
  }
  return { values }
}

export function writeStatus(checkId: string, result: ProbeResult, reportedBy: string): void {
  const db = getDatabase()
  const previous = db.select().from(checkStatus).where(eq(checkStatus.checkId, checkId)).get()
  const timestamp = now()
  db.insert(checkStatus)
    .values({
      checkId,
      state: result.state,
      latencyMs: result.latencyMs,
      message: result.message.slice(0, 500),
      checkedAt: timestamp,
      reportedBy,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoUpdate({
      target: checkStatus.checkId,
      set: {
        state: result.state,
        latencyMs: result.latencyMs,
        message: result.message.slice(0, 500),
        checkedAt: timestamp,
        reportedBy,
        updatedAt: timestamp,
      },
    })
    .run()
  if (
    !previous ||
    previous.state !== result.state ||
    previous.message !== result.message.slice(0, 500)
  ) {
    publishLive({ type: 'status' })
  }
}

function secretValues(entryId: string): string[] {
  return getDatabase()
    .select()
    .from(fieldValues)
    .where(eq(fieldValues.entryId, entryId))
    .all()
    .filter((value) => value.valueSecret !== null)
    .map((value) => decryptSecret(value.valueSecret!))
}
