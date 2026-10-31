import { createServer, type Server } from 'node:http'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { eq, sql } from 'drizzle-orm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { entryWriteSchema, syncBodySchema } from '../../shared/contracts'
import { faviconCacheKey, resolveFaviconUrl } from '../../shared/favicon'
import type { Actor } from '../../server/auth/permissions'
import { createBackup } from '../../server/backup/export'
import { restoreBackup } from '../../server/backup/restore'
import { bootApplication } from '../../server/db/boot'
import { closeDatabase, getDatabase, migrateDatabase, openDatabase } from '../../server/db/client'
import { clearSecretKey } from '../../server/db/keys'
import { entries, faviconCache } from '../../server/db/schema'
import { fetchFaviconBytes, refreshStaleFavicons } from '../../server/icons/favicon'
import { readPublicIcon } from '../../server/icons/files'
import { createFilter } from '../../server/services/catalog'
import {
  createEntry,
  getEntry,
  listEntryHistory,
  restoreEntry,
  updateEntry,
  upsertManagedEntry,
} from '../../server/services/entries'
import { syncScope } from '../../server/services/sync'
import { testSecretKey } from '../secret'

const admin: Actor = {
  role: 'admin',
  userId: null,
  tokenId: null,
  tokenScopes: [],
  kind: 'user',
  label: 'admin',
}
const anonymous: Actor = { ...admin, role: 'anonymous', kind: 'anonymous', label: 'anonymous' }
const directories: string[] = []
const servers: Server[] = []

afterEach(async () => {
  for (const server of servers.splice(0))
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    )
  vi.unstubAllEnvs()
  closeDatabase()
  clearSecretKey()
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('explicit favicon sources', () => {
  it('upgrades an existing database without changing entries or automatic favicon bytes', () => {
    const directory = mkdtempSync(join(tmpdir(), 'bookmark-favicon-upgrade-'))
    directories.push(directory)
    const previous = join(directory, 'previous')
    mkdirSync(join(previous, 'meta'), { recursive: true })
    const migrations = fileURLToPath(new URL('../../drizzle', import.meta.url))
    const journal = JSON.parse(readFileSync(join(migrations, 'meta/_journal.json'), 'utf8')) as {
      entries: Array<{ tag: string }>
    }
    journal.entries = journal.entries.filter((entry) => entry.tag !== '0007_favicon_override')
    writeFileSync(join(previous, 'meta/_journal.json'), JSON.stringify(journal))
    for (const entry of journal.entries)
      copyFileSync(join(migrations, entry.tag + '.sql'), join(previous, entry.tag + '.sql'))
    const db = openDatabase(join(directory, 'bookmark.db'))
    try {
      migrateDatabase(db, previous)
      db.run(
        sql`insert into entries (id, name, managed_fields, created_at, updated_at) values ('legacy', 'Existing device', '[]', 0, 0)`,
      )
      db.run(
        sql`insert into favicon_cache (id, origin, status, data, created_at, updated_at) values ('cached', 'https://device.invalid', 'ok', ${Buffer.from('existing-icon')}, 0, 0)`,
      )
      migrateDatabase(db, migrations)
      migrateDatabase(db, migrations)
      expect(db.select().from(entries).all()[0]).toMatchObject({
        id: 'legacy',
        name: 'Existing device',
        faviconUrl: null,
      })
      expect(db.select().from(faviconCache).all()[0]).toMatchObject({
        origin: 'https://device.invalid',
        sourceUrl: null,
        direct: false,
        data: Buffer.from('existing-icon'),
      })
    } finally {
      db.$client.close()
    }
  })

  it('resolves paths and host templates and rejects unsupported URLs and credentials', () => {
    expect(resolveFaviconUrl('/vendor/icon.svg', 'https://device.example:8443/admin/')).toBe(
      'https://device.example:8443/vendor/icon.svg',
    )
    expect(resolveFaviconUrl('images/icon.png', 'https://device.example/admin/')).toBe(
      'https://device.example/admin/images/icon.png',
    )
    expect(resolveFaviconUrl('https://{{host}}/icon.ico', null, '10.0.0.8')).toBe(
      'https://10.0.0.8/icon.ico',
    )
    expect(resolveFaviconUrl('https://cdn.example/icon.svg#logo', null)).toBe(
      'https://cdn.example/icon.svg',
    )
    expect(() => resolveFaviconUrl('/icon.svg', null)).toThrow('primary HTTP(S) link')
    expect(() => resolveFaviconUrl('/icon.svg', 'ssh://device.example')).toThrow('HTTP(S)')
    for (const value of [
      'file:///etc/passwd',
      'data:image/svg+xml,test',
      'javascript:alert(1)',
      'https://user:pass@example.com/icon',
      '/{{field.password}}',
      '/bad\\path',
    ]) {
      expect(entryWriteSchema.safeParse({ name: 'Invalid', faviconUrl: value }).success).toBe(false)
    }
    expect(faviconCacheKey('https://device.example/a.svg', true)).not.toBe(
      faviconCacheKey('https://device.example/b.svg', true),
    )
    expect(faviconCacheKey('https://device.example/admin')).toBe('https://device.example')
  })

  it('fetches exact paths, sanitises SVGs, isolates same-origin overrides and enforces anonymous visibility', async () => {
    await boot()
    const { origin, requests } = await fixture()
    vi.stubEnv('BOOKMARK_FAVICON_FETCH', '1')
    const first = createEntry(
      admin,
      entryWriteSchema.parse({
        name: 'Public',
        host: '127.0.0.1',
        faviconUrl: '/one.svg',
        tags: ['group:Public'],
        links: [link(origin + '/admin/')],
      }),
    ).entry
    const second = createEntry(
      admin,
      entryWriteSchema.parse({
        name: 'Private',
        host: '127.0.0.1',
        faviconUrl: '/two.svg',
        tags: ['group:Private'],
        links: [link(origin + '/admin/')],
        confirmDuplicates: true,
      }),
    ).entry
    await vi.waitFor(() =>
      expect(
        getDatabase()
          .select()
          .from(faviconCache)
          .all()
          .filter((row) => row.status === 'ok'),
      ).toHaveLength(2),
    )
    expect(requests.sort()).toEqual(['/one.svg', '/two.svg'])
    const publicIcon = getEntry(admin, first.id).iconUrl
    const privateIcon = getEntry(admin, second.id).iconUrl
    expect(publicIcon).not.toBe(privateIcon)
    const publicId = publicIcon!.split('/').pop()!
    const privateId = privateIcon!.split('/').pop()!
    expect(readPublicIcon(anonymous, 'favicon', publicId)).toBeNull()
    createFilter(admin, {
      name: 'Public',
      query: 'group:Public',
      columns: [],
      sort: 0,
      isPublic: true,
      global: true,
    })
    const image = readPublicIcon(anonymous, 'favicon', publicId)
    expect(image?.mediaType).toBe('image/svg+xml')
    expect(image?.bytes.toString()).toContain('red')
    expect(image?.bytes.toString()).not.toMatch(/onload|script/)
    expect(readPublicIcon(anonymous, 'favicon', privateId)).toBeNull()
    updateEntry(admin, first.id, { iconRef: 'lucide:camera', confirmDuplicates: true })
    expect(getEntry(admin, first.id).iconUrl).toBe('/api/icons/lucide/camera')
    expect(getEntry(admin, first.id).faviconUrl).toBe('/one.svg')
    expect(requests).toHaveLength(2)
  })

  it('refreshes the stored image path and restores discovery when cleared', async () => {
    await boot()
    const { origin, requests } = await fixture()
    vi.stubEnv('BOOKMARK_FAVICON_FETCH', '1')
    const entry = createEntry(
      admin,
      entryWriteSchema.parse({
        name: 'Device',
        faviconUrl: '/one.svg',
        links: [link(origin + '/admin/')],
      }),
    ).entry
    await vi.waitFor(() => expect(getEntry(admin, entry.id).iconUrl).toBeTruthy())
    getDatabase()
      .update(faviconCache)
      .set({ fetchedAt: new Date(0) })
      .run()
    await refreshStaleFavicons()
    await vi.waitFor(() => expect(requests).toHaveLength(2))
    expect(requests).toEqual(['/one.svg', '/one.svg'])
    updateEntry(admin, entry.id, { faviconUrl: null })
    await vi.waitFor(() =>
      expect(
        getDatabase().select().from(faviconCache).where(eq(faviconCache.origin, origin)).get()
          ?.status,
      ).toBe('ok'),
    )
    expect(requests).toEqual(['/one.svg', '/one.svg', '/admin/', '/discovered.svg'])
    expect(getEntry(admin, entry.id).faviconUrl).toBeNull()
    await expect(fetchFaviconBytes(origin + '/missing', false, true)).rejects.toThrow('404')
    await expect(fetchFaviconBytes(origin + '/html', false, true)).rejects.toThrow(
      'supported image',
    )
  })

  it('keeps explicit URLs through managed sync, rejects edits to owned URLs and never fetches on dry runs', async () => {
    await boot()
    const { origin, requests } = await fixture()
    vi.stubEnv('BOOKMARK_FAVICON_FETCH', '1')
    const body = syncBodySchema.parse({
      entries: [{ externalKey: '1', name: 'Managed', faviconUrl: origin + '/one.svg' }],
    })
    expect(syncScope(admin, 'v1-import', { ...body, dryRun: true }).created).toHaveLength(1)
    expect(requests).toEqual([])
    expect(getDatabase().select().from(faviconCache).all()).toEqual([])
    expect(syncScope(admin, 'v1-import', body).created).toHaveLength(1)
    const { listEntries } = await import('../../server/services/entries')
    const entry = listEntries(admin, '').entries[0]!
    expect(entry.managedFields).toContain('faviconUrl')
    expect(() => updateEntry(admin, entry.id, { faviconUrl: origin + '/two.svg' })).toThrow(
      'Managed attributes',
    )
    expect(syncScope(admin, 'v1-import', body).unchanged).toHaveLength(1)
    const invalid = {
      ...body.entries[0]!,
      externalKey: 'invalid',
      name: 'Invalid',
      faviconUrl: '/relative.svg',
    }
    expect(() => upsertManagedEntry('v1-import', invalid, admin)).toThrow('primary HTTP(S) link')
    expect(listEntries(admin, '').entries).toHaveLength(1)
    expect(() =>
      upsertManagedEntry('v1-import', { ...body.entries[0]!, faviconUrl: '/relative.svg' }, admin),
    ).toThrow('primary HTTP(S) link')
    expect(getEntry(admin, entry.id).faviconUrl).toBe(origin + '/one.svg')
    await vi.waitFor(() => expect(getEntry(admin, entry.id).iconUrl).toBeTruthy())
    expect(requests).toEqual(['/one.svg'])
  })

  it('round-trips URLs and cache refresh metadata through backups and history', async () => {
    await boot()
    const { origin } = await fixture()
    const sourceUrl = origin + '/one.svg'
    vi.stubEnv('BOOKMARK_FAVICON_FETCH', '1')
    const entry = createEntry(
      admin,
      entryWriteSchema.parse({ name: 'Device', faviconUrl: sourceUrl }),
    ).entry
    await vi.waitFor(() => expect(getEntry(admin, entry.id).iconUrl).toBeTruthy())
    vi.stubEnv('BOOKMARK_FAVICON_FETCH', '0')
    const history = listEntryHistory(admin, entry.id)[0]!
    const archive = createBackup(admin, false, undefined)
    updateEntry(admin, entry.id, { faviconUrl: 'https://device.invalid/two.svg' })
    restoreEntry(admin, entry.id, history.id)
    expect(getEntry(admin, entry.id).faviconUrl).toBe(sourceUrl)
    updateEntry(admin, entry.id, { faviconUrl: null })
    restoreBackup(admin, archive, 'merge', false, undefined)
    expect(getEntry(admin, entry.id).faviconUrl).toBe(sourceUrl)
    expect(restoreBackup(admin, archive, 'merge', false, undefined).entriesUnchanged).toBe(1)
    restoreBackup(admin, archive, 'replace', false, undefined)
    expect(getEntry(admin, entry.id).faviconUrl).toBe(sourceUrl)
    expect(getDatabase().select().from(faviconCache).all()[0]).toMatchObject({
      sourceUrl,
      direct: true,
    })
    expect(() =>
      createEntry(admin, entryWriteSchema.parse({ name: 'No link', faviconUrl: '/relative.svg' })),
    ).toThrow('primary HTTP(S) link')
  })
})

function link(urlTemplate: string) {
  return { label: 'Open', urlTemplate, type: 'web', isPrimary: true, sort: 0, iconRef: null }
}

async function boot() {
  const directory = mkdtempSync(join(tmpdir(), 'bookmark-favicon-'))
  directories.push(directory)
  await bootApplication({
    secretKey: testSecretKey,
    databasePath: join(directory, 'bookmark.db'),
    migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)),
  })
}

async function fixture() {
  const requests: string[] = []
  const server = createServer((request, response) => {
    const url = request.url ?? '/'
    requests.push(url)
    if (url === '/admin/' || url === '/html') {
      response.setHeader('content-type', 'text/html')
      response.end('<link rel="icon" href="/discovered.svg">')
    } else if (url.endsWith('.svg')) {
      response.setHeader('content-type', 'image/svg+xml')
      response.end(
        `<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script><rect width="16" height="16" fill="${url === '/one.svg' ? 'red' : 'blue'}"/></svg>`,
      )
    } else {
      response.statusCode = 404
      response.end('Missing')
    }
  })
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing HTTP fixture port')
  return { origin: `http://127.0.0.1:${address.port}`, requests }
}
