import { combineQueries } from '../../shared/query-chips'
import { parseQuery } from '../../shared/query'
import { initialPortalFilter } from '../../shared/portal'
import type { Actor } from '../auth/permissions'
import { authOptions } from '../auth/status'
import { listFieldDefinitions, listFilters, listNamespaces, listTags } from './catalog'
import { countEntries, listEntries } from './entries'
import type { PreferenceRecord } from './preferences'
import type { publicSettings } from './settings'

/** Uses the same visibility/redaction services as the API, on the original request actor. */
export function initialPortal(
  actor: Actor,
  query: { q: string; tab: string },
  settings: ReturnType<typeof publicSettings>,
  preferences: PreferenceRecord,
) {
  const filters = listFilters(actor)
  const selected = initialPortalFilter(
    filters,
    query.tab,
    actor.role !== 'anonymous' || settings.allTabPublic,
  )
  const combined = combineQueries(selected?.query ?? '', query.q)
  const parsed = parseQuery(combined)
  const activeTab = selected?.id ?? 'all'
  return {
    settings,
    actor: { role: actor.role, label: actor.label, kind: actor.kind, userId: actor.userId },
    authOptions: authOptions(),
    filters,
    allCount: countEntries(actor, ''),
    tags: listTags(actor),
    namespaces: listNamespaces(),
    fields: listFieldDefinitions(actor.role),
    entries: parsed.ok ? listEntries(actor, combined).entries : [],
    queryError: parsed.ok ? null : parsed.message,
    groupBy: Object.hasOwn(preferences.groupModes, activeTab)
      ? (preferences.groupModes[activeTab] ?? null)
      : (selected?.groupBy ?? null),
    preferences,
  }
}
