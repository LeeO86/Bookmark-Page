import { createServer, type Server, type ServerResponse } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, it, vi } from 'vitest'
import type { Actor } from '../../server/auth/permissions'
import { bootApplication } from '../../server/db/boot'
import { closeDatabase, getDatabase } from '../../server/db/client'
import { faviconCache, auditLog } from '../../server/db/schema'
import { entryWriteSchema } from '../../shared/contracts'
import { createEntry, getEntry, deleteEntry, updateEntry } from '../../server/services/entries'
import { queueFavicon, refreshStaleFavicons } from '../../server/icons/favicon'
import { previewEntryFavicon, supplyEntryFavicon } from '../../server/icons/supplied'
import { createBackup } from '../../server/backup/export'
import { restoreBackup } from '../../server/backup/restore'
import { testSecretKey } from '../secret'
const admin: Actor = {
  role: 'admin',
  kind: 'user',
  userId: null,
  tokenId: null,
  label: 'test editor',
  tokenScopes: [],
}
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg"><script>bad()</script><rect width="16" height="16" fill="red" onload="bad()"/></svg>'
const payload = { contentType: 'image/svg+xml', data: Buffer.from(svg).toString('base64') }
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=',
  'base64',
)
const servers: Server[] = []
const dirs: string[] = []
afterEach(async () => {
  for (const s of servers.splice(0)) {
    s.closeAllConnections()
    await new Promise<void>((r) => s.close(() => r()))
  }
  closeDatabase()
  vi.unstubAllEnvs()
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})
async function boot() {
  const d = mkdtempSync(join(tmpdir(), 'bp-supplied-'))
  dirs.push(d)
  vi.stubEnv('BOOKMARK_FAVICON_FETCH', '0')
  await bootApplication({
    secretKey: testSecretKey,
    databasePath: join(d, 'bookmark.db'),
    migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)),
  })
}
async function serve(handler: (path: string, res: ServerResponse) => void) {
  const s = createServer((req, res) => handler(req.url!, res))
  servers.push(s)
  await new Promise<void>((r, j) => {
    s.once('error', j)
    s.listen(0, '127.0.0.1', r)
  })
  const addr = s.address()
  if (!addr || typeof addr === 'string') throw Error('fixture')
  return `http://127.0.0.1:${addr.port}`
}
function entry(url: string, faviconUrl?: string) {
  return createEntry(
    admin,
    entryWriteSchema.parse({
      name: 'Device',
      faviconUrl,
      links: [{ label: 'UI', type: 'web', urlTemplate: url, isPrimary: true }],
    }),
  ).entry
}
it('supplies the correct slot, sanitises, audits, preserves icon choice and repeats unchanged', async () => {
  await boot()
  const e = entry('https://device.example/admin', '/vendor/icon.svg')
  updateEntry(admin, e.id, { iconRef: 'lucide:camera' })
  expect(previewEntryFavicon(admin, e.id, payload).currentHash).toBeNull()
  expect(getDatabase().select().from(faviconCache).all()).toHaveLength(0)
  expect(supplyEntryFavicon(admin, e.id, payload).changed).toBe(true)
  const row = getDatabase().select().from(faviconCache).get()!
  expect(row.origin).toBe('url:https://device.example/vendor/icon.svg')
  expect(row.imageSource).toBe('supplied')
  expect(row.suppliedBy).toBe('test editor')
  expect(row.data?.toString()).not.toMatch(/script|onload/)
  expect(getEntry(admin, e.id).iconRef).toBe('lucide:camera')
  expect(supplyEntryFavicon(admin, e.id, payload).changed).toBe(false)
  expect(getDatabase().select().from(faviconCache).get()).toEqual(row)
  expect(
    getDatabase()
      .select()
      .from(auditLog)
      .all()
      .filter((a) => a.action === 'entry.favicon.supply'),
  ).toHaveLength(1)
  for (const actor of [
    { ...admin, role: 'viewer' as const },
    { ...admin, kind: 'token' as const, tokenId: 'read-token', tokenScopes: ['read' as const] },
  ])
    expect(() => supplyEntryFavicon(actor, e.id, payload)).toThrow()
})
it('round-trips supplied bytes and provenance through backups', async () => {
  await boot()
  const e = entry('https://device.example')
  supplyEntryFavicon(admin, e.id, payload)
  const before = getDatabase().select().from(faviconCache).get()!
  const archive = createBackup(admin, false, undefined)
  getDatabase().delete(faviconCache).run()
  restoreBackup(admin, archive, 'merge', false, undefined)
  const after = getDatabase().select().from(faviconCache).get()!
  expect(after.data).toEqual(before.data)
  expect(after.imageSource).toBe('supplied')
  expect(after.suppliedAt).toEqual(before.suppliedAt)
  expect(after.suppliedBy).toBe(before.suppliedBy)
})
it('keeps supplied bytes after failed and successful manual network refreshes and skips them in the background', async () => {
  await boot()
  let healthy = false
  let requests = 0
  const origin = await serve((_, res) => {
    requests++
    res.writeHead(healthy ? 200 : 503, { 'content-type': 'image/png' })
    res.end(healthy ? png : 'down')
  })
  const e = entry(origin, '/icon.png')
  supplyEntryFavicon(admin, e.id, payload)
  const before = getDatabase().select().from(faviconCache).get()!
  vi.stubEnv('BOOKMARK_FAVICON_FETCH', '1')
  await refreshStaleFavicons()
  expect(requests).toBe(0)
  queueFavicon(origin + '/icon.png', true, true)
  await vi.waitFor(() =>
    expect(getDatabase().select().from(faviconCache).get()?.status).toBe('error'),
  )
  healthy = true
  queueFavicon(origin + '/icon.png', true, true)
  await vi.waitFor(() => expect(getDatabase().select().from(faviconCache).get()?.status).toBe('ok'))
  const after = getDatabase().select().from(faviconCache).get()!
  expect(after.data).toEqual(before.data)
  expect(after.imageSource).toBe('supplied')
  expect(after.suppliedAt).toEqual(before.suppliedAt)
})
it('skips orphan retry rows after deletion or an explicit override change', async () => {
  await boot()
  let requests = 0
  const origin = await serve((_, res) => {
    requests++
    res.writeHead(503)
    res.end()
  })
  const e = entry(origin)
  const timestamp = new Date(0)
  getDatabase()
    .insert(faviconCache)
    .values({
      id: 'old',
      origin,
      status: 'error',
      sourceUrl: origin,
      fetchedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .run()
  updateEntry(admin, e.id, { faviconUrl: '/other.png' })
  vi.stubEnv('BOOKMARK_FAVICON_FETCH', '1')
  await refreshStaleFavicons()
  expect(requests).toBe(0)
  deleteEntry(admin, e.id)
  await refreshStaleFavicons()
  expect(requests).toBe(0)
  expect(getDatabase().select().from(faviconCache).get()?.id).toBe('old')
})
it('starts foreground work before queued background retries, including a promoted duplicate', async () => {
  await boot()
  vi.stubEnv('BOOKMARK_FAVICON_FETCH', '1')
  const held: ServerResponse[] = []
  const requests: string[] = []
  const respond = (res: ServerResponse) => {
    res.writeHead(200, { 'content-type': 'image/png' })
    res.end(png)
  }
  const origin = await serve((path, res) => {
    requests.push(path)
    if (path.startsWith('/hold')) held.push(res)
    else respond(res)
  })
  for (let i = 0; i < 4; i++) queueFavicon(origin + '/hold' + i, true, true, 'background')
  await vi.waitFor(() => expect(held).toHaveLength(4))
  queueFavicon(origin + '/background', true, true, 'background')
  queueFavicon(origin + '/promoted', true, true, 'background')
  queueFavicon(origin + '/editor', true, true)
  queueFavicon(origin + '/promoted', true, true)
  respond(held.shift()!)
  await vi.waitFor(() => expect(requests).toHaveLength(7))
  expect(requests.indexOf('/background')).toBeGreaterThan(requests.indexOf('/editor'))
  expect(requests.indexOf('/background')).toBeGreaterThan(requests.indexOf('/promoted'))
  held.forEach(respond)
  await vi.waitFor(() => expect(getDatabase().select().from(faviconCache).all()).toHaveLength(7))
})

it('pauses repeated permanent failures but permits explicit retries and recovery', async () => {
  await boot()
  let healthy = false
  let requests = 0
  const origin = await serve((_, response) => {
    requests++
    response.writeHead(healthy ? 200 : 404, { 'content-type': 'image/png' })
    response.end(healthy ? png : 'missing')
  })
  entry(origin, '/missing.png')
  vi.stubEnv('BOOKMARK_FAVICON_FETCH', '1')
  for (let count = 1; count <= 3; count++) {
    queueFavicon(origin + '/missing.png', true, true)
    await vi.waitFor(() =>
      expect(getDatabase().select().from(faviconCache).get()?.failureCount).toBe(count),
    )
  }
  expect(getDatabase().select().from(faviconCache).get()?.retryPaused).toBe(true)
  getDatabase()
    .update(faviconCache)
    .set({ fetchedAt: new Date(0) })
    .run()
  await refreshStaleFavicons()
  expect(requests).toBe(3)
  healthy = true
  queueFavicon(origin + '/missing.png', true, true)
  await vi.waitFor(() => expect(getDatabase().select().from(faviconCache).get()?.status).toBe('ok'))
  expect(getDatabase().select().from(faviconCache).get()?.retryPaused).toBe(false)
})

it('uses the fetcher validation and size limit for every supplied format', async () => {
  await boot()
  const e = entry('https://formats.example')
  for (const [contentType, bytes] of [
    ['image/png', png],
    ['image/x-icon', Buffer.from([0, 0, 1, 0, 1, 0, 16, 16])],
    ['image/jpeg', Buffer.from([255, 216, 255, 224, 0])],
    ['image/gif', Buffer.from('GIF89a123')],
    ['image/webp', Buffer.from('RIFF1234WEBP123')],
  ] as const) {
    expect(
      previewEntryFavicon(admin, e.id, { contentType, data: bytes.toString('base64') }).image
        .mediaType,
    ).toBe(contentType)
  }
  expect(() =>
    previewEntryFavicon(admin, e.id, {
      contentType: 'image/svg+xml',
      data: Buffer.from('<!DOCTYPE svg><svg/>').toString('base64'),
    }),
  ).toThrow()
  vi.stubEnv('FAVICON_MAX_BYTES', '32')
  expect(() => previewEntryFavicon(admin, e.id, payload)).toThrow('size limit')
})
