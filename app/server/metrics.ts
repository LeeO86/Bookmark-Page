import { timingSafeEqual } from 'node:crypto'
import { getDatabase } from './db/client'
import { checkStatus, checks, entries } from './db/schema'

let actionExecutions = 0

export function recordActionExecution(): void {
  actionExecutions += 1
}

export function metricsAllowed(authorization: string | undefined): boolean {
  const token = process.env.METRICS_TOKEN?.trim() ?? ''
  if (!token) {
    return true
  }
  const presented = authorization?.toLowerCase().startsWith('bearer ')
    ? authorization.slice('bearer '.length)
    : ''
  const left = Buffer.from(presented)
  const right = Buffer.from(token)
  return left.length === right.length && timingSafeEqual(left, right)
}

export function renderMetrics(): string {
  const db = getDatabase()
  const entryRows = db.select().from(entries).all()
  const checkRows = db.select().from(checks).all()
  const statuses = new Map(
    db
      .select()
      .from(checkStatus)
      .all()
      .map((status) => [status.checkId, status]),
  )
  const counts = { up: 0, down: 0, unknown: 0, unchecked: 0 }
  const lines = [
    '# HELP bookmark_entries Number of entries',
    '# TYPE bookmark_entries gauge',
    `bookmark_entries ${entryRows.length}`,
    '# HELP bookmark_checks Number of checks by state',
    '# TYPE bookmark_checks gauge',
  ]
  const perEntry: string[] = []
  const latency: string[] = []
  for (const check of checkRows) {
    const status = statuses.get(check.id)
    const state = status?.state ?? 'unchecked'
    counts[state] += 1
    const entry = entryRows.find((item) => item.id === check.entryId)
    perEntry.push(
      `bookmark_entry_check_state{entry=${label(check.entryId)},name=${label(entry?.name ?? '')},check=${label(check.name)},state=${label(state)}} 1`,
    )
    if (status?.latencyMs != null) {
      latency.push(
        `bookmark_check_latency_ms{entry=${label(check.entryId)},check=${label(check.name)}} ${status.latencyMs}`,
      )
    }
  }
  for (const state of ['up', 'down', 'unknown', 'unchecked'] as const) {
    lines.push(`bookmark_checks{state=${label(state)}} ${counts[state]}`)
  }
  lines.push(
    '# HELP bookmark_entry_check_state Check state for one entry',
    '# TYPE bookmark_entry_check_state gauge',
    ...perEntry,
    '# HELP bookmark_check_latency_ms Most recent check latency in milliseconds',
    '# TYPE bookmark_check_latency_ms gauge',
    ...latency,
    '# HELP bookmark_action_executions_total Action executions',
    '# TYPE bookmark_action_executions_total counter',
    `bookmark_action_executions_total ${actionExecutions}`,
  )
  return `${lines.join('\n')}\n`
}

function label(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"')}"`
}
