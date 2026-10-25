import { eq } from 'drizzle-orm'
import type { RequestSpec } from '../../shared/contracts'
import type { Actor } from '../auth/permissions'
import { getDatabase } from '../db/client'
import { newId } from '../db/ids'
import { checks, checkStatus, entries, links } from '../db/schema'
import { forbidden } from '../http/errors'
import { entryVisible } from '../services/entries'
import { resolveLinkUrl } from '../services/placeholders'
import { clientChecksAnonymous } from '../services/settings'
import { writeStatus } from './run'

interface Lease {
  checkId: string
  until: number
  userId: string | null
}

const leases = new Map<string, Lease>()

export interface LeasedCheck {
  id: string
  leaseId: string
  name: string
  kind: 'icmp' | 'tcp' | 'http'
  url: string | null
  timeoutMs: number
  note: string | null
}

export function leaseChecks(actor: Actor, limit = 5): LeasedCheck[] {
  if (actor.role === 'anonymous' && !clientChecksAnonymous()) {
    throw forbidden('Sign in to report browser checks')
  }
  const nowMs = Date.now()
  const minimum = numberEnv('CHECK_MIN_INTERVAL_SECONDS', 15)
  const leaseMs = numberEnv('CLIENT_CHECK_LEASE_SECONDS', 30) * 1000
  const db = getDatabase()
  const statuses = new Map(
    db
      .select()
      .from(checkStatus)
      .all()
      .map((status) => [status.checkId, status]),
  )
  const entryRows = new Map(
    db
      .select()
      .from(entries)
      .all()
      .map((entry) => [entry.id, entry]),
  )
  const linkRows = new Map(
    db
      .select()
      .from(links)
      .all()
      .map((link) => [link.id, link]),
  )
  const due = db
    .select()
    .from(checks)
    .all()
    .filter((check) => check.executor === 'client')
    .filter((check) => entryVisible(actor.role, check.entryId, db))
    .filter((check) => {
      const status = statuses.get(check.id)
      const interval = Math.max(check.intervalSeconds, minimum) * 1000
      return !status?.checkedAt || nowMs - status.checkedAt.getTime() >= interval
    })
    .filter((check) => {
      for (const lease of leases.values()) {
        if (lease.checkId === check.id && lease.until > nowMs) {
          return false
        }
      }
      return true
    })
    .slice(0, Math.max(1, Math.min(limit, 20)))

  return due.map((check) => {
    const leaseId = newId()
    leases.set(leaseId, { checkId: check.id, until: nowMs + leaseMs, userId: actor.userId })
    const entry = entryRows.get(check.entryId)
    const link = check.linkId ? linkRows.get(check.linkId) : undefined
    const host = check.host?.trim() || entry?.host || ''
    const spec = check.requestSpec as RequestSpec | null
    const template =
      spec?.urlTemplate ||
      link?.urlTemplate ||
      (host ? `http://${host}${check.port ? `:${check.port}` : ''}/` : '')
    const resolved = template
      ? resolveLinkUrl(
          template,
          { host: host || null, name: entry?.name ?? '', fields: {} },
          secretKeys(template),
        )
      : { url: null, error: 'Check has no target' }
    return {
      id: check.id,
      leaseId,
      name: check.name,
      kind: check.kind,
      url: resolved.url,
      timeoutMs: check.timeoutMs,
      note: resolved.url ? null : resolved.error,
    }
  })
}

export function reportCheck(
  actor: Actor,
  checkId: string,
  input: {
    leaseId: string
    state: 'up' | 'down' | 'unknown'
    latencyMs: number | null
    message: string
  },
): void {
  if (actor.role === 'anonymous' && !clientChecksAnonymous()) {
    throw forbidden('Sign in to report browser checks')
  }
  const lease = leases.get(input.leaseId)
  if (!lease || lease.checkId !== checkId || lease.until < Date.now()) {
    throw forbidden('This check lease has expired')
  }
  if (actor.userId && lease.userId && actor.userId !== lease.userId) {
    throw forbidden('This check lease belongs to another user')
  }
  const db = getDatabase()
  const check = db.select().from(checks).where(eq(checks.id, checkId)).get()
  if (!check || !entryVisible(actor.role, check.entryId, db)) {
    throw forbidden('This check is not visible')
  }
  leases.delete(input.leaseId)
  const reporter = actor.userId ? `client:${actor.label}` : 'client:anonymous'
  writeStatus(
    checkId,
    {
      state: input.state,
      latencyMs: input.latencyMs,
      message: input.message || 'Reported by a browser',
    },
    reporter,
  )
}

function secretKeys(template: string): Set<string> {
  const keys = new Set<string>()
  for (const match of template.matchAll(/\{\{\s*field\.([A-Za-z0-9_]+)\s*\}\}/g)) {
    const key = match[1]
    if (key) {
      keys.add(key)
    }
  }
  return keys
}

function numberEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) {
    return fallback
  }
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : fallback
}
