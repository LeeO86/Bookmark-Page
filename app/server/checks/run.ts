import { eq } from 'drizzle-orm'
import type { RequestSpec } from '../../shared/contracts'
import { getDatabase } from '../db/client'
import { decryptSecret } from '../db/crypto'
import { now } from '../db/ids'
import { checks, checkStatus, entries, fieldDefinitions, fieldValues } from '../db/schema'
import { resolveLinkUrl } from '../services/placeholders'
import { publishLive } from '../services/live'
import { probeHttp, probeIcmp, probeTcp, type ProbeResult } from './probe'

const inFlight = new Set<string>()

export async function runDueServerChecks(): Promise<number> {
  const concurrency = numberEnv('CHECK_CONCURRENCY', 4)
  const minimum = numberEnv('CHECK_MIN_INTERVAL_SECONDS', 15)
  const rows = getDatabase()
    .select()
    .from(checks)
    .all()
    .filter((check) => check.executor === 'server')
  const statuses = new Map(
    getDatabase()
      .select()
      .from(checkStatus)
      .all()
      .map((status) => [status.checkId, status]),
  )
  let started = 0
  for (const check of rows) {
    if (inFlight.size >= concurrency) {
      break
    }
    if (inFlight.has(check.id)) {
      continue
    }
    const status = statuses.get(check.id)
    const interval = Math.max(check.intervalSeconds, minimum) * 1000
    if (status?.checkedAt && Date.now() - status.checkedAt.getTime() < interval) {
      continue
    }
    inFlight.add(check.id)
    started += 1
    void runServerCheck(check.id).finally(() => {
      inFlight.delete(check.id)
    })
  }
  return started
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
  if (check.kind === 'icmp') {
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
  const resolved = resolveLinkUrl(
    spec.urlTemplate,
    { host: host || null, name: entry.name, fields: fields.values },
    new Set(),
  )
  if (!resolved.url) {
    return { state: 'unknown', latencyMs: null, message: resolved.error ?? 'Check URL is invalid' }
  }
  return probeHttp(
    resolved.url,
    spec.expectation,
    check.tlsVerify,
    check.timeoutMs,
    spec.method,
    spec.bodyTemplate,
  )
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

function numberEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) {
    return fallback
  }
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : fallback
}
