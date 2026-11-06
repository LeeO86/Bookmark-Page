import { getDatabase } from '../db/client'
import { checks, checkStatus } from '../db/schema'

export const inFlightServerChecks = new Set<string>()

export function positiveIntegerEnv(name: string, fallback: number): number {
  const value = Number(process.env[name])
  return Number.isInteger(value) && value > 0 ? value : fallback
}

/** A fresh snapshot keeps edits/deletions authoritative between probes. */
export function serverCheckSchedule(timestamp = Date.now()) {
  const concurrency = positiveIntegerEnv('CHECK_CONCURRENCY', 4)
  const minimum = positiveIntegerEnv('CHECK_MIN_INTERVAL_SECONDS', 15)
  const statuses = new Map(
    getDatabase()
      .select()
      .from(checkStatus)
      .all()
      .map((row) => [row.checkId, row]),
  )
  const due = getDatabase()
    .select()
    .from(checks)
    .all()
    .filter((check) => check.executor === 'server')
    .map((check) => {
      const checkedAt = statuses.get(check.id)?.checkedAt?.getTime() ?? null
      const interval = Math.max(check.intervalSeconds, minimum) * 1000
      const dueAt = checkedAt === null ? check.createdAt.getTime() : checkedAt + interval
      return { check, checkedAt, dueAt, interval }
    })
    .filter((item) => item.dueAt <= timestamp)
    .sort(
      (a, b) =>
        Number(a.checkedAt !== null) - Number(b.checkedAt !== null) ||
        (a.checkedAt ?? 0) - (b.checkedAt ?? 0) ||
        a.check.createdAt.getTime() - b.check.createdAt.getTime() ||
        a.check.id.localeCompare(b.check.id),
    )
  const overdue = due.filter((item) => timestamp - item.dueAt > item.interval)
  return {
    due,
    concurrency,
    inFlight: inFlightServerChecks.size,
    overdue: overdue.length,
    maxOverdueSeconds: Math.max(0, ...due.map((item) => (timestamp - item.dueAt) / 1000)),
  }
}
