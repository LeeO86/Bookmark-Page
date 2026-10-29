import { syncScope } from '../../server/services/sync'
import { createServer } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { bootApplication } from '../../server/db/boot'
import { closeDatabase, getDatabase } from '../../server/db/client'
import { clearSecretKey } from '../../server/db/keys'
import { fieldDefinitions } from '../../server/db/schema'
import { eq } from 'drizzle-orm'
import type { Actor } from '../../server/auth/permissions'
import {
  createEntry,
  getEntry,
  listEntries,
  listEntryHistory,
  updateEntry,
  revealLink,
  upsertManagedEntry,
} from '../../server/services/entries'
import {
  createFieldDefinition,
  createFilter,
  createUser,
  createToken,
  ensureScope,
  updateFilter,
  deleteFilter,
} from '../../server/services/catalog'
import { createBackup } from '../../server/backup/export'
import { restoreBackup } from '../../server/backup/restore'
import { readPreferences, writePreferences } from '../../server/services/preferences'
import {
  entryWriteSchema,
  fieldDefinitionSchema,
  filterWriteSchema,
  syncEntrySchema,
  requestSpecSchema,
} from '../../shared/contracts'
import {
  appendQueryTerm,
  queryChips,
  removeQueryChip,
  applySuggestion,
} from '../../shared/query-chips'
import { parseQuery } from '../../shared/query'
import { openApiDocument } from '../../server/openapi'
import { testSecretKey } from '../secret'
const admin: Actor = {
  role: 'admin',
  userId: null,
  tokenId: null,
  tokenScopes: [],
  kind: 'user',
  label: 'admin',
}
const editor: Actor = { ...admin, role: 'editor' }
const viewer: Actor = { ...admin, role: 'viewer' }
const anonymous: Actor = { ...admin, role: 'anonymous', kind: 'anonymous' }
let directory = ''
beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), 'bookmark-readiness-'))
  await bootApplication({
    secretKey: testSecretKey,
    databasePath: join(directory, 'db.sqlite'),
    migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)),
  })
})
afterEach(() => {
  closeDatabase()
  clearSecretKey()
  rmSync(directory, { recursive: true, force: true })
})
function field(
  key: string,
  role: 'anonymous' | 'viewer' | 'editor' | 'admin' = 'admin',
  type: 'text' | 'secret' = 'text',
) {
  return createFieldDefinition(
    admin,
    fieldDefinitionSchema.parse({ key, label: key, type, minRoleToView: role }),
  )
}
it('filters historical fields by current permission, type, and deletion', () => {
  const def = field('restricted')
  const e = createEntry(
    admin,
    entryWriteSchema.parse({ name: 'Public', fields: [{ key: 'restricted', value: 'sensitive' }] }),
  ).entry
  createFilter(admin, filterWriteSchema.parse({ name: 'Public', global: true, isPublic: true }))
  for (const actor of [anonymous, viewer, editor])
    expect(JSON.stringify(listEntryHistory(actor, e.id))).not.toContain('sensitive')
  expect(JSON.stringify(listEntryHistory(admin, e.id))).toContain('sensitive')
  getDatabase()
    .update(fieldDefinitions)
    .set({ type: 'secret' })
    .where(eq(fieldDefinitions.id, def.id))
    .run()
  expect(JSON.stringify(listEntryHistory(admin, e.id))).not.toContain('sensitive')
  getDatabase().delete(fieldDefinitions).where(eq(fieldDefinitions.id, def.id)).run()
  expect(JSON.stringify(listEntryHistory(admin, e.id))).not.toContain('sensitive')
})
it('preserves hidden fields/actions on editor save and rejects forged writes', () => {
  field('hidden')
  field('visible', 'editor')
  const e = createEntry(
    admin,
    entryWriteSchema.parse({
      name: 'Device',
      fields: [{ key: 'hidden', value: 'keep' }],
      actions: [
        {
          name: 'Admin action',
          minRole: 'admin',
          requestSpec: { method: 'GET', urlTemplate: 'https://example.invalid' },
        },
      ],
    }),
  ).entry
  updateEntry(editor, e.id, { fields: [{ key: 'visible', value: 'new' }], actions: [] })
  const stored = getEntry(admin, e.id)
  expect(stored.fields.map((f) => f.key)).toEqual(['hidden', 'visible'])
  expect(stored.actions.map((a) => a.name)).toEqual(['Admin action'])
  expect(() =>
    updateEntry(editor, e.id, { fields: [{ key: 'hidden', value: 'tampered' }] }),
  ).toThrow()
  expect(() =>
    createEntry(
      editor,
      entryWriteSchema.parse({ name: 'Forge', fields: [{ key: 'hidden', value: 'tampered' }] }),
    ),
  ).toThrow()
  expect(() =>
    updateEntry(editor, e.id, {
      actions: [
        {
          name: 'Admin action',
          minRole: 'editor',
          requestSpec: requestSpecSchema.parse(stored.actions[0]!.requestSpec),
          inputs: [],
        },
      ],
    }),
  ).toThrow()
})
it('read-only tokens cannot mutate any global view and write tokens cannot mint admin tokens', async () => {
  const reader: Actor = { ...admin, tokenId: 'reader', kind: 'token', tokenScopes: ['read'] }
  expect(() =>
    createFilter(reader, filterWriteSchema.parse({ name: 'Leak', global: true, isPublic: true })),
  ).toThrow()
  const f = createFilter(admin, filterWriteSchema.parse({ name: 'Global', global: true }))
  expect(() => updateFilter(reader, f.id, { isPublic: true })).toThrow()
  expect(() => deleteFilter(reader, f.id)).toThrow()
  const owner = await createUser(admin, {
    username: 'owner',
    role: 'admin',
    password: 'test-password',
    breakGlass: false,
  })
  const writer: Actor = {
    ...admin,
    userId: owner.id,
    tokenId: 'writer',
    kind: 'token',
    tokenScopes: ['write'],
  }
  await expect(createToken(writer, { name: 'Escalation', scopes: ['admin'] })).rejects.toThrow()
  expect(() => updateFilter(writer, f.id, { isPublic: true })).toThrow()
})
it('secret-backed links require each field permission, reveal explicitly, and redact history', () => {
  field('credential', 'admin', 'secret')
  const e = createEntry(
    admin,
    entryWriteSchema.parse({
      name: 'Secret link',
      fields: [{ key: 'credential', value: '3xy' }],
      links: [
        {
          label: 'Admin',
          type: 'web',
          isPrimary: true,
          urlTemplate: 'https://device.invalid/?pass={{field.credential}}',
        },
      ],
    }),
  ).entry
  expect(e.links[0]!.url).toBeNull()
  expect(e.links[0]!.requiresReveal).toBe(true)
  expect(() => revealLink(viewer, e.id, e.links[0]!.id)).toThrow()
  expect(revealLink(admin, e.id, e.links[0]!.id).url).toBe('https://device.invalid/?pass=3xy')
  expect(JSON.stringify(listEntryHistory(admin, e.id))).not.toContain('3xy')
})
it('keeps preference data in merge and replace backups and reads legacy archives', async () => {
  const owner = await createUser(admin, {
    username: 'owner',
    role: 'admin',
    password: 'test-password',
    breakGlass: false,
  })
  writePreferences(owner.id, {
    colourMode: 'dark',
    sidebarCollapsed: true,
    viewModes: { all: 'list' },
    groupModes: { all: 'room' },
    tileSize: 'large',
  })
  const archive = createBackup(admin, false, undefined)
  writePreferences(owner.id, { colourMode: 'light', sidebarCollapsed: false })
  restoreBackup(admin, archive, 'merge', false, undefined)
  expect(readPreferences(owner.id)).toMatchObject({
    colourMode: 'dark',
    sidebarCollapsed: true,
    tileSize: 'large',
  })
  restoreBackup(admin, archive, 'replace', false, undefined)
  expect(readPreferences(owner.id)).toMatchObject({
    colourMode: 'dark',
    sidebarCollapsed: true,
    viewModes: { all: 'list' },
    groupModes: { all: 'room' },
  })
})
it('queries and chip removal retain exact tags with spaces, quotes, slashes, parentheses and operators', () => {
  for (const value of ['Control Room', 'A "quote"', 'A\\B (C)', 'AND NOT']) {
    const token = 'group:' + value
    const e = createEntry(admin, entryWriteSchema.parse({ name: value, tags: [token] })).entry
    const query = appendQueryTerm('', token, 'and')
    expect(parseQuery(query)).toMatchObject({
      ok: true,
      ast: { type: 'tag', namespace: 'group', value },
    })
    expect(listEntries(admin, query).entries.map((row) => row.id)).toContain(e.id)
    expect(queryChips(query).chips).toHaveLength(1)
    expect(removeQueryChip(query, 0)).toBe('')
    expect(applySuggestion('group:', token)).toBe(query)
  }
  expect(parseQuery('"group:Control Room"')).toMatchObject({ ok: true, ast: { type: 'text' } })
})
it('documents every path parameter, JSON input, response and authentication', () => {
  const document = openApiDocument() as {
    paths: Record<
      string,
      Record<
        string,
        { parameters: Array<{ name: string; in: string }>; responses: object; requestBody?: object }
      >
    >
    components: { securitySchemes: object }
  }
  for (const [path, methods] of Object.entries(document.paths))
    for (const operation of Object.values(methods)) {
      expect(operation.responses).toBeTruthy()
      for (const match of path.matchAll(/\{([^}]+)\}/g))
        expect(operation.parameters.some((p) => p.name === match[1] && p.in === 'path')).toBe(true)
    }
  expect(document.paths['/api/v1/entries']!.post!.requestBody).toBeTruthy()
  expect(document.components.securitySchemes).toHaveProperty('bearerToken')
})

it('discovers favicons after managed commits and never fetches during a dry-run', async () => {
  vi.stubEnv('BOOKMARK_FAVICON_FETCH', '1')
  let hits = 0
  const server = createServer((_request, response) => {
    hits += 1
    response.setHeader('content-type', 'image/svg+xml')
    response.end('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>')
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing port')
  const input = syncEntrySchema.parse({
    externalKey: 'icon',
    name: 'Icon',
    links: [
      {
        label: 'Web',
        urlTemplate: `http://127.0.0.1:${address.port}/`,
        type: 'web',
        isPrimary: true,
      },
    ],
  })
  try {
    syncScope(admin, 'icons', { entries: [input], purge: false, dryRun: true })
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(hits).toBe(0)
    ensureScope('icons', admin)
    upsertManagedEntry('icons', input, admin)
    await vi.waitFor(() =>
      expect(listEntries(admin, 'Icon').entries[0]?.iconUrl).toContain('/api/icons/favicon/'),
    )
    const count = hits
    expect(upsertManagedEntry('icons', input, admin)).toBe('unchanged')
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(hits).toBe(count)
  } finally {
    server.close()
    vi.unstubAllEnvs()
  }
})
