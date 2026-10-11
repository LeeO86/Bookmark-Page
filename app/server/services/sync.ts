import type { SyncEntry } from '../../shared/contracts'
import type { Actor } from '../auth/permissions'
import { getDatabase, transaction } from '../db/client'
import { badRequest } from '../http/errors'
import { deleteManagedEntries, upsertManagedEntry } from './entries'
import { ensureScope } from './catalog'
import { publishLive } from './live'

export interface SyncResult {
  created: Array<{ externalKey: string; name: string }>
  updated: Array<{ externalKey: string; name: string }>
  deleted: Array<{ externalKey: string; name: string }>
  unchanged: Array<{ externalKey: string; name: string }>
}

export function syncScope(
  actor: Actor,
  scope: string,
  input: { entries: SyncEntry[]; purge: boolean; dryRun: boolean },
): SyncResult {
  const run = (): SyncResult => {
    ensureScope(scope, actor)
    const seen = new Set<string>()
    const result: SyncResult = { created: [], updated: [], deleted: [], unchanged: [] }
    for (const entry of input.entries) {
      if (seen.has(entry.externalKey)) {
        throw badRequest(`Duplicate external key ${entry.externalKey}`)
      }
      seen.add(entry.externalKey)
      const status = upsertManagedEntry(scope, entry, actor)
      result[status].push({ externalKey: entry.externalKey, name: entry.name })
    }
    if (input.purge) {
      result.deleted = deleteManagedEntries(scope, seen, actor)
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
    const result = run()
    sqlite.exec('ROLLBACK')
    return result
  } catch (error) {
    sqlite.exec('ROLLBACK')
    throw error
  }
}
