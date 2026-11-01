import { and, eq } from 'drizzle-orm'
import type { z } from 'zod'
import type { filtersSyncSchema } from '../../shared/contracts'
import type { Actor } from '../auth/permissions'
import { requireAdmin } from '../auth/permissions'
import { getDatabase, transaction } from '../db/client'
import { filters } from '../db/schema'
import { badRequest } from '../http/errors'
import { createFilter, updateFilter, deleteFilter, ensureScope } from './catalog'
import { publishLive } from './live'

export function syncFilters(actor: Actor, scope: string, input: z.infer<typeof filtersSyncSchema>) {
  requireAdmin(actor)
  const run = () => {
    ensureScope(scope, actor)
    const seen = new Set<string>()
    const result = {
      created: [] as string[],
      updated: [] as string[],
      deleted: [] as string[],
      unchanged: [] as string[],
    }
    for (const desired of input.filters) {
      if (seen.has(desired.externalKey)) throw badRequest('Duplicate filter external key')
      seen.add(desired.externalKey)
      const db = getDatabase()
      const current = db
        .select()
        .from(filters)
        .where(and(eq(filters.scope, scope), eq(filters.externalKey, desired.externalKey)))
        .get()
      if (current?.ownerUserId) throw badRequest('A personal tab cannot be managed by a scope')
      const values = {
        name: desired.name,
        query: desired.query,
        columns: desired.columns,
        groupBy: desired.groupBy ?? null,
        sort: desired.sort,
        icon: desired.icon ?? null,
        viewMode: desired.viewMode,
        ...(desired.isPublic !== undefined ? { isPublic: desired.isPublic } : {}),
      }
      if (!current) {
        const created = createFilter(actor, { ...values, global: true })
        db.update(filters)
          .set({ scope, externalKey: desired.externalKey })
          .where(eq(filters.id, created.id))
          .run()
        result.created.push(desired.externalKey)
      } else if (
        Object.entries(values).every(
          ([key, value]) =>
            JSON.stringify(current[key as keyof typeof current]) === JSON.stringify(value),
        )
      ) {
        result.unchanged.push(desired.externalKey)
      } else {
        updateFilter(actor, current.id, values)
        result.updated.push(desired.externalKey)
      }
    }
    if (input.purge) {
      for (const row of getDatabase()
        .select()
        .from(filters)
        .where(eq(filters.scope, scope))
        .all()) {
        if (!row.ownerUserId && row.externalKey && !seen.has(row.externalKey)) {
          deleteFilter(actor, row.id)
          result.deleted.push(row.externalKey)
        }
      }
    }
    return result
  }
  if (!input.dryRun) {
    const result = transaction(run)
    publishLive({ type: 'entries' })
    return result
  }
  const sqlite = getDatabase().$client
  sqlite.exec('BEGIN')
  try {
    return run()
  } finally {
    sqlite.exec('ROLLBACK')
  }
}
