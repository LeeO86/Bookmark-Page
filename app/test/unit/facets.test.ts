import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parseQuery } from '../../shared/query'
import {
  simpleFacetTerms,
  toggleSidebarQueryTerm,
  withoutFacetNamespace,
} from '../../shared/query-chips'
import { entryWriteSchema } from '../../shared/contracts'
import { anonymousActor, type Actor } from '../../server/auth/permissions'
import { bootApplication } from '../../server/db/boot'
import { closeDatabase, getDatabase } from '../../server/db/client'
import { checkStatus } from '../../server/db/schema'
import { createEntry, listEntries } from '../../server/services/entries'
import { createFieldDefinition, createFilter } from '../../server/services/catalog'
import { listEntryFacets } from '../../server/services/facets'
import { testSecretKey } from '../secret'

const admin: Actor = { ...anonymousActor, kind: 'user', role: 'admin', label: 'admin' }
const viewer: Actor = { ...admin, role: 'viewer' }
let directory = ''
afterEach(() => {
  closeDatabase()
  if (directory) rmSync(directory, { recursive: true, force: true })
})

describe('namespace counts with visibility enforced on the server', () => {
  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'bp-facets-'))
    await bootApplication({
      secretKey: testSecretKey,
      databasePath: join(directory, 'bookmark.db'),
      migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)),
    })
    createFieldDefinition(admin, {
      key: 'private_note',
      label: 'Private',
      type: 'text',
      minRoleToView: 'admin',
      searchable: true,
      showAsColumnDefault: false,
      sort: 0,
    })
    createFilter(admin, {
      name: 'Public',
      query: 'visibility:public',
      global: true,
      isPublic: true,
      columns: [],
      sort: 0,
    })
    const definitions = [
      { name: 'One', tags: ['group:A', 'type:audio', 'blue', 'visibility:public'], states: ['up'] },
      {
        name: 'Two',
        tags: ['group:B', 'type:audio', 'red', 'visibility:public'],
        states: ['down'],
      },
      {
        name: 'Three',
        tags: ['group:C', 'type:video', 'blue', 'visibility:public'],
        states: [null],
      },
      {
        name: 'Four',
        tags: ['group:A', 'group:B', 'type:audio', 'red', 'visibility:public'],
        states: ['up', 'down'],
      },
      { name: 'Hidden', tags: ['group:hidden', 'type:audio', 'private'], states: ['up'] },
    ]
    for (const definition of definitions) {
      const { entry } = createEntry(
        admin,
        entryWriteSchema.parse({
          name: definition.name,
          tags: definition.tags,
          fields: [{ key: 'private_note', value: 'secret-search-marker' }],
          checks: definition.states.map((_, i) => ({ name: 'Check ' + i, kind: 'icmp' })),
        }),
      )
      for (const [i, state] of definition.states.entries())
        if (state !== null)
          getDatabase()
            .insert(checkStatus)
            .values({
              checkId: entry.checks[i]!.id,
              state: state as 'up' | 'down',
              createdAt: new Date(),
              updatedAt: new Date(),
            })
            .run()
    }
  })
  it('excludes own terms, keeps other namespace filters and counts each matching entry', () => {
    const facets = listEntryFacets(anonymousActor, 'group:A type:audio')
    expect(facets.mode).toBe('disjunctive')
    expect(facets.tags['group:A']).toBe(2)
    expect(facets.tags['group:B']).toBe(2)
    expect(facets.tags['group:C']).toBeUndefined()
    expect(facets.tags['type:audio']).toBe(2)
    expect(facets.tags['group:hidden']).toBeUndefined()
  })
  it('excludes plain-tag and state terms from their own counts with other filters kept', () => {
    const plain = listEntryFacets(anonymousActor, '#blue group:A')
    expect(plain.tags['#blue']).toBe(1)
    expect(plain.tags['#red']).toBe(1)
    expect(plain.tags['group:C']).toBe(1)
    const states = listEntryFacets(anonymousActor, 'state:offline')
    expect(states.state).toEqual({ online: 2, offline: 2, unknown: 1 })
    // A multi-check entry can match both online and offline, just like state: SQL.
    expect(listEntryFacets(anonymousActor, 'state:online group:A').state).toEqual({
      online: 2,
      offline: 1,
      unknown: 0,
    })
  })
  it('retains saved-tab constraints and excludes no hidden fields from the visibility boundary', () => {
    expect(listEntryFacets(anonymousActor, 'group:A', 'type:video').tags['group:C']).toBe(1)
    expect(listEntryFacets(anonymousActor, 'group:A', 'group:A').tags['group:B']).toBe(1)
    expect(listEntryFacets(viewer, 'secret-search-marker').tags).toEqual({})
    expect(listEntryFacets(admin, 'secret-search-marker').tags['group:hidden']).toBe(1)
  })
  it.each(['group:A OR group:B', '(group:A)', 'NOT (group:A OR group:B)'])(
    'keeps filtered counts for typed complex query %s',
    (query) => {
      const expected = new Map<string, number>()
      for (const entry of listEntries(anonymousActor, query).entries)
        for (const tag of entry.tags) {
          const token = tag.namespace ? tag.label : '#' + tag.value
          expected.set(token, (expected.get(token) ?? 0) + 1)
        }
      const facets = listEntryFacets(anonymousActor, query)
      expect(facets.mode).toBe('filtered')
      expect(facets.tags).toEqual(Object.fromEntries(expected))
    },
  )
})

it('recognises only top-level AND terms while keeping quoted parentheses literal', () => {
  expect(simpleFacetTerms('group:A AND -room:B')).toHaveLength(2)
  expect(simpleFacetTerms('group:"A (north)" room:B')).toHaveLength(2)
  expect(simpleFacetTerms('(group:A)')).toBeNull()
  expect(simpleFacetTerms('group:A OR group:B')).toBeNull()
  expect(withoutFacetNamespace(simpleFacetTerms('group:A type:audio')!, 'tag:group')).toEqual(
    parseQuery('type:audio').ok
      ? { type: 'tag', namespace: 'type', value: 'audio', wildcard: false }
      : null,
  )
})

it.each([
  ['group:A type:audio', 'group:B', 'and', 'group:B type:audio'],
  ['group:A', 'group:A', 'and', ''],
  ['-group:A', 'group:A', 'and', ''],
  ['group:A', 'group:B', 'or', 'group:A OR group:B'],
  ['group:A', 'group:B', 'not', 'group:A -group:B'],
  ['group:A -group:B', 'group:B', 'not', 'group:A'],
  ['group:A OR group:B', 'group:C', 'and', '(group:A OR group:B) group:C'],
  ['state:online room:A', 'state:offline', 'and', 'state:offline room:A'],
  ['#blue room:A', '#red', 'and', '#red room:A'],
  ['group:"A (north)" room:A', 'group:B', 'and', 'group:B room:A'],
] as const)('sidebar edit %s + %s (%s)', (query, term, mode, expected) => {
  expect(toggleSidebarQueryTerm(query, term, mode)).toBe(expected)
})
