import { eq } from 'drizzle-orm'
import { combineQueries, simpleFacetTerms, withoutFacetNamespace } from '../../shared/query-chips'
import { parseQuery, type QueryNode } from '../../shared/query'
import type { EntryFacets } from '../../shared/facets'
import type { Actor } from '../auth/permissions'
import { getDatabase } from '../db/client'
import { entries, entryTags, tags, checks, checkStatus } from '../db/schema'
import { badRequest } from '../http/errors'
import { entryQueryWhere } from './entries'

export function listEntryFacets(actor: Actor, query: string, baseQuery = ''): EntryFacets {
  const parsed = parseQuery(query),
    base = parseQuery(baseQuery)
  if (!parsed.ok || !base.ok) throw badRequest('Invalid facet query', 'invalid_query')
  const terms = simpleFacetTerms(query)
  const db = getDatabase()
  const and = (left: QueryNode | null, right: QueryNode | null): QueryNode | null =>
    left && right ? { type: 'and', left, right } : (left ?? right)
  const ids = (ast: QueryNode | null) =>
    new Set(
      db
        .select({ id: entries.id })
        .from(entries)
        .where(entryQueryWhere(actor, ast))
        .all()
        .map((entry) => entry.id),
    )
  const combined = parseQuery(combineQueries(baseQuery, query))
  if (!combined.ok) throw badRequest('Invalid facet query', 'invalid_query')
  const filtered = terms === null ? ids(combined.ast) : null
  const matching = (namespace: string) =>
    filtered ?? ids(and(base.ast, withoutFacetNamespace(terms!, namespace)))
  const links = db
    .select({ entryId: entryTags.entryId, namespace: tags.namespaceName, value: tags.value })
    .from(entryTags)
    .innerJoin(tags, eq(entryTags.tagId, tags.id))
    .all()
  const counts = new Map<string, number>()
  for (const namespace of new Set(links.map((tag) => tag.namespace))) {
    const visible = matching(namespace ? `tag:${namespace}` : 'plain')
    for (const tag of links) {
      if (tag.namespace !== namespace || !visible.has(tag.entryId)) continue
      const token = namespace ? namespace + ':' + tag.value : '#' + tag.value
      counts.set(token, (counts.get(token) ?? 0) + 1)
    }
  }
  const state = { online: 0, offline: 0, unknown: 0 }
  if (terms !== null) {
    for (const value of ['online', 'offline', 'unknown'] as const)
      state[value] = ids(
        and(and(base.ast, withoutFacetNamespace(terms, 'state')), { type: 'state', value }),
      ).size
  } else {
    // Typed complex queries retain the original rendered-entry aggregate status counts.
    const states = new Map<string, Array<'up' | 'down' | 'unknown' | null>>()
    for (const row of db
      .select({ entryId: checks.entryId, state: checkStatus.state })
      .from(checks)
      .leftJoin(checkStatus, eq(checks.id, checkStatus.checkId))
      .all()) {
      if (filtered!.has(row.entryId))
        states.set(row.entryId, [...(states.get(row.entryId) ?? []), row.state])
    }
    for (const values of states.values()) {
      if (values.includes('down')) state.offline++
      else if (values.every((value) => value === 'up')) state.online++
      else state.unknown++
    }
  }
  return {
    mode: terms === null ? 'filtered' : 'disjunctive',
    tags: Object.fromEntries(counts),
    state,
  }
}
