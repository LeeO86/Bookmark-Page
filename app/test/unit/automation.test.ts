import { createBackup } from '../../server/backup/export'
import { restoreBackup } from '../../server/backup/restore'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, it, vi } from 'vitest'
import { entryWriteSchema, filtersSyncSchema, syncBodySchema } from '../../shared/contracts'
import type { Actor } from '../../server/auth/permissions'
import { parseRuntimeEnv } from '../../server/config/env'
import { bootApplication } from '../../server/db/boot'
import { closeDatabase, getDatabase } from '../../server/db/client'
import { apiTokens, filters, faviconCache } from '../../server/db/schema'
import { prepareUpload, readPublicIcon } from '../../server/icons/files'
import { bootstrap } from '../../server/services/bootstrap'
import {
  createFilter,
  createIcon,
  createToken,
  listFilters,
  replaceIcon,
} from '../../server/services/catalog'
import { createEntry, getEntry, listEntries } from '../../server/services/entries'
import { syncFilters } from '../../server/services/filters-sync'
import { syncScope } from '../../server/services/sync'
import { writeSettings } from '../../server/services/settings'
import { testSecretKey } from '../secret'
const admin: Actor = {
  role: 'admin',
  userId: null,
  tokenId: null,
  tokenScopes: [],
  kind: 'user',
  label: 'admin',
}
const anonymous: Actor = { ...admin, role: 'anonymous', kind: 'anonymous' }
const directories: string[] = []
afterEach(() => {
  closeDatabase()
  vi.unstubAllEnvs()
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true })
})
async function boot() {
  const directory = mkdtempSync(join(tmpdir(), 'bookmark-automation-'))
  directories.push(directory)
  vi.stubEnv('ADMIN_USERNAME', 'admin')
  vi.stubEnv('ADMIN_PASSWORD', 'admin-pass-1')
  vi.stubEnv('ADMIN_API_TOKEN', '')
  vi.stubEnv('ADMIN_API_TOKEN_FILE', '')
  vi.stubEnv('BOOKMARK_FAVICON_FETCH', '0')
  await bootApplication({
    secretKey: testSecretKey,
    databasePath: join(directory, 'bookmark.db'),
    migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)),
  })
}
it('creates, preserves, rotates and removes only the environment-managed token', async () => {
  await boot()
  const secret = `bp_${'a'.repeat(43)}`
  vi.stubEnv('ADMIN_API_TOKEN', secret)
  await bootstrap()
  const first = getDatabase().select().from(apiTokens).all()[0]!
  expect(first).toMatchObject({
    name: 'bootstrap',
    managedBy: 'bootstrap',
    expiresAt: null,
    scopes: ['admin'],
  })
  expect(first.tokenHash).not.toContain(secret)
  await bootstrap()
  expect(getDatabase().select().from(apiTokens).all()).toEqual([first])
  await createToken({ ...admin, userId: first.userId }, { name: 'bootstrap', scopes: ['admin'] })
  vi.stubEnv('ADMIN_API_TOKEN', `bp_${'b'.repeat(43)}`)
  await bootstrap()
  const rotated = getDatabase()
    .select()
    .from(apiTokens)
    .all()
    .find((row) => row.managedBy)!
  expect(rotated.id).toBe(first.id)
  expect(rotated.tokenHash).not.toBe(first.tokenHash)
  vi.stubEnv('ADMIN_API_TOKEN', '')
  await bootstrap()
  await bootstrap()
  expect(getDatabase().select().from(apiTokens).all()).toMatchObject([
    { name: 'bootstrap', managedBy: null },
  ])
})
it('rejects weak bootstrap credentials and conflicting secret sources', () => {
  expect(() => parseRuntimeEnv({ ADMIN_API_TOKEN: 'bp_short' })).toThrow('32 random bytes')
  expect(() =>
    parseRuntimeEnv({ ADMIN_API_TOKEN: 'bp_any', ADMIN_API_TOKEN_FILE: '/missing' }),
  ).toThrow('only one')
})
it('replaces sanitised icon bytes while preserving references and changing the cache URL', async () => {
  await boot()
  const bytes = (colour: string) =>
    prepareUpload(
      'image/svg+xml',
      Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg"><rect width="16" height="16" fill="${colour}" onload="alert(1)"/></svg>`,
      ).toString('base64'),
    )
  const icon = createIcon(admin, { name: 'mixer', mediaType: 'image/svg+xml', data: bytes('red') })
  const entry = createEntry(
    admin,
    entryWriteSchema.parse({
      name: 'Mixer',
      iconRef: 'upload-name:mixer',
      links: [
        {
          label: 'UI',
          type: 'web',
          urlTemplate: 'https://mixer.invalid',
          isPrimary: true,
          iconRef: 'upload-name:mixer',
        },
      ],
    }),
  ).entry
  expect(entry.iconRef).toBe(icon.ref)
  expect(entry.links[0]?.iconRef).toBe(icon.ref)
  expect(replaceIcon(admin, icon.id, { mediaType: 'image/svg+xml', data: bytes('blue') }).id).toBe(
    icon.id,
  )
  expect(getEntry(admin, entry.id).iconUrl).not.toBe(entry.iconUrl)
  expect(getEntry(admin, entry.id).links[0]?.iconRef).toBe(icon.ref)
  expect(readPublicIcon(admin, 'upload', icon.id)?.bytes.toString()).toContain('blue')
  expect(readPublicIcon(admin, 'upload', icon.id)?.bytes.toString()).not.toContain('onload')
  expect(readPublicIcon(anonymous, 'upload', icon.id)).toBeNull()
  createFilter(admin, {
    name: 'Public',
    query: '',
    columns: [],
    sort: 0,
    global: true,
    isPublic: true,
  })
  expect(readPublicIcon(anonymous, 'upload', icon.id)).not.toBeNull()
  expect(() =>
    createEntry(admin, entryWriteSchema.parse({ name: 'Invalid', iconRef: 'upload-name:mix' })),
  ).toThrow('not found')
  const body = syncBodySchema.parse({
    entries: [{ externalKey: 'mixer', name: 'Managed mixer', iconRef: 'upload-name:mixer' }],
  })
  expect(syncScope(admin, 'mxl', body).created).toHaveLength(1)
  expect(syncScope(admin, 'mxl', body).unchanged).toHaveLength(1)
})
it('purges only scope-owned shared tabs and rolls dry runs and invalid batches back', async () => {
  await boot()
  createFilter(admin, {
    name: 'Manual',
    query: '',
    columns: [],
    sort: 0,
    global: true,
    isPublic: false,
  })
  const body = filtersSyncSchema.parse({
    filters: [{ externalKey: 'one', name: 'Manual', isPublic: true, viewMode: 'tiles' }],
    purge: true,
  })
  expect(syncFilters(admin, 'mxl', { ...body, dryRun: true }).created).toEqual(['one'])
  expect(getDatabase().select().from(filters).all()).toHaveLength(1)
  expect(syncFilters(admin, 'mxl', body).created).toEqual(['one'])
  expect(syncFilters(admin, 'mxl', body).unchanged).toEqual(['one'])
  syncFilters(admin, 'other', body)
  const before = getDatabase().select().from(filters).all()
  expect(() =>
    syncFilters(admin, 'mxl', { ...body, filters: [...body.filters, ...body.filters] }),
  ).toThrow('Duplicate')
  expect(getDatabase().select().from(filters).all()).toEqual(before)
  expect(syncFilters(admin, 'mxl', { ...body, filters: [] }).deleted).toEqual(['one'])
  expect(listFilters(admin)).toHaveLength(2)
  expect(listFilters(admin).some((tab) => tab.scope === 'other')).toBe(true)
  expect(() => syncFilters(anonymous, 'other', body)).toThrow()
})
it('applies the opt-in public default only to new shared tabs', async () => {
  await boot()
  const values = { name: 'Tab', query: '', columns: [], sort: 0, global: true }
  const previous = createFilter(admin, values)
  expect(previous.isPublic).toBe(false)
  writeSettings({ sharedTabsPublicByDefault: true }, null)
  expect(createFilter(admin, { ...values, name: 'New' }).isPublic).toBe(true)
  expect(createFilter(admin, { ...values, name: 'Private', isPublic: false }).isPublic).toBe(false)
  expect(listFilters(admin).find((tab) => tab.id === previous.id)?.isPublic).toBe(false)
})
it('rejects conflicting global tag labels before mutation and preserves omitted labels', async () => {
  await boot()
  const body = syncBodySchema.parse({
    entries: [
      {
        externalKey: 'one',
        name: 'One',
        tags: [{ tag: 'production:demo', label: 'Demo production' }],
      },
      { externalKey: 'two', name: 'Two', tags: ['production:demo'] },
    ],
  })
  expect(syncScope(admin, 'mxl', body).created).toHaveLength(2)
  expect(syncScope(admin, 'mxl', body).unchanged).toHaveLength(2)
  const before = listEntries(admin, '').entries
  expect(before.every((entry) => entry.tags[0]?.displayLabel === 'Demo production')).toBe(true)
  const invalid = syncBodySchema.parse({
    entries: [
      { externalKey: 'one', name: 'Changed', tags: [{ tag: 'production:demo', label: 'A' }] },
      { externalKey: 'new', name: 'New', tags: [{ tag: 'production:demo', label: 'B' }] },
    ],
  })
  expect(() => syncScope(admin, 'mxl', invalid)).toThrow('Conflicting labels')
  expect(listEntries(admin, '').entries).toEqual(before)
})

it('round-trips new metadata and merges owned tabs by scope/key without duplicating them', async () => {
  await boot()
  vi.stubEnv('ADMIN_API_TOKEN', `bp_${'a'.repeat(43)}`)
  await bootstrap()
  syncFilters(
    admin,
    'mxl',
    filtersSyncSchema.parse({ filters: [{ externalKey: 'tools', name: 'Tools' }] }),
  )
  getDatabase()
    .insert(faviconCache)
    .values({
      id: 'failed',
      origin: 'https://down.invalid',
      status: 'error',
      failureCount: 3,
      fetchedAt: new Date(0),
      error: 'Unavailable',
      createdAt: new Date(0),
      updatedAt: new Date(0),
    })
    .run()
  const archive = createBackup(admin, false, undefined)
  restoreBackup(admin, archive, 'replace', false, undefined)
  expect(getDatabase().select().from(apiTokens).all()[0]?.managedBy).toBe('bootstrap')
  expect(getDatabase().select().from(faviconCache).all()[0]?.failureCount).toBe(3)
  expect(getDatabase().select().from(filters).all()[0]).toMatchObject({
    scope: 'mxl',
    externalKey: 'tools',
  })
  getDatabase().update(filters).set({ id: 'existing-scope-tab' }).run()
  restoreBackup(admin, archive, 'merge', false, undefined)
  expect(getDatabase().select().from(filters).all()).toMatchObject([
    { id: 'existing-scope-tab', scope: 'mxl', externalKey: 'tools' },
  ])
})

it('reads the bootstrap token from a mounted secret file', () => {
  const directory = mkdtempSync(join(tmpdir(), 'bookmark-token-file-'))
  directories.push(directory)
  const path = join(directory, 'token')
  const secret = `bp_${'z'.repeat(43)}`
  writeFileSync(path, secret + '\n', { mode: 0o600 })
  expect(parseRuntimeEnv({ ADMIN_API_TOKEN_FILE: path }).adminApiToken).toBe(secret)
})
