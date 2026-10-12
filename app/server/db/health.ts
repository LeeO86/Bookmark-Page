import { sql } from 'drizzle-orm'
import { healthResponseSchema, type HealthResponse } from '../../shared/health'
import type { AppDatabase } from './client'

export function pingDatabase(database: AppDatabase): 'ok' | 'error' {
  try {
    const row: unknown = database.get(sql`select 1 as ok`)
    if (!isOkRow(row)) {
      return 'error'
    }
    return 'ok'
  } catch {
    return 'error'
  }
}

export function handleHealth(database: AppDatabase | undefined): {
  statusCode: 200 | 503
  body: HealthResponse
} {
  const state = database ? pingDatabase(database) : 'error'
  const body = healthResponseSchema.parse({
    status: state,
    database: state,
  })
  return {
    statusCode: state === 'ok' ? 200 : 503,
    body,
  }
}

function isOkRow(value: unknown): value is { ok: number } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'ok' in value &&
    typeof value.ok === 'number' &&
    value.ok === 1
  )
}
