import { createServer, type Server } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { eq } from 'drizzle-orm'
import { afterEach, expect, it, vi } from 'vitest'
import { decodeDataImage } from '../../shared/data-image'
import { entryWriteSchema } from '../../shared/contracts'
import { bootApplication } from '../../server/db/boot'
import { closeDatabase, getDatabase } from '../../server/db/client'
import { faviconCache } from '../../server/db/schema'
import { iconCandidates, pickIcon } from '../../server/icons/discover'
import {
  fetchFaviconBytes,
  faviconRetryMs,
  queueFavicon,
  refreshStaleFavicons,
} from '../../server/icons/favicon'
import { readPublicIcon } from '../../server/icons/files'
import { createEntry, getEntry } from '../../server/services/entries'
import { testSecretKey } from '../secret'
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="#2563eb" onload="alert(1)"/><script>alert(1)</script></svg>'
const uri = 'data:image/svg+xml,' + encodeURIComponent(svg)
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=',
  'base64',
)
const servers: Server[] = []
const directories: string[] = []
afterEach(async () => {
  for (const server of servers.splice(0))
    await new Promise<void>((resolve) => server.close(() => resolve()))
  closeDatabase()
  vi.unstubAllEnvs()
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true })
})
async function fixture(
  handler: (path: string) => { type: string; body: string | Buffer; status?: number },
) {
  const requests: string[] = []
  const server = createServer((req, res) => {
    requests.push(req.url!)
    const value = handler(req.url!)
    res.writeHead(value.status ?? 200, { 'content-type': value.type })
    res.end(value.body)
  })
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No fixture address')
  return { origin: `http://127.0.0.1:${address.port}`, requests }
}
async function boot() {
  const dir = mkdtempSync(join(tmpdir(), 'bookmark-inline-'))
  directories.push(dir)
  vi.stubEnv('BOOKMARK_FAVICON_FETCH', '1')
  vi.stubEnv('ADMIN_API_TOKEN', '')
  vi.stubEnv('ADMIN_API_TOKEN_FILE', '')
  const settings = {
    secretKey: testSecretKey,
    databasePath: join(dir, 'bookmark.db'),
    migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)),
  }
  await bootApplication(settings)
  return settings
}
it('recognises percent-encoded and Base64 inline SVG using its own MIME type, with or without type attributes', () => {
  for (const href of [uri, 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64')]) {
    for (const type of ['', ' type="image/png"']) {
      const candidates = iconCandidates(
        `<link rel="icon" sizes="512x512" href="/big.png"><link rel="icon"${type} href="${href}">`,
        'https://device.invalid',
      )
      expect(pickIcon(candidates)).toMatchObject({ href, svg: true })
      expect(Buffer.from(decodeDataImage(href).bytes).toString()).toBe(svg)
    }
  }
  expect(
    decodeDataImage(
      'data:image/png,' + [...png].map((byte) => '%' + byte.toString(16).padStart(2, '0')).join(''),
    ).bytes,
  ).toEqual(new Uint8Array(png))
})
it('rejects invalid, unsupported and oversized inline data', () => {
  for (const bad of [
    'data:image/svg+xml;base64,%%%',
    'data:image/svg+xml,%GG',
    'data:text/html,%3Csvg%3E',
    'data:image/png;base64,YmFk',
    'data:image/svg+xml,not-svg',
    'data:image/svg+xml,' + encodeURIComponent(svg + 'x'.repeat(512 * 1024)),
  ]) {
    expect(() => decodeDataImage(bad)).toThrow()
    expect(iconCandidates(`<link rel="icon" href="${bad}">`, 'https://device.invalid')).toEqual([])
  }
  expect(() => decodeDataImage(uri, 20)).toThrow('size limit')
})
it('stores and serves a sanitised icon when the only page icon is inline', async () => {
  await boot()
  const { origin, requests } = await fixture(() => ({
    type: 'text/html',
    body: `<link rel="icon" href="${uri}">`,
  }))
  const admin = {
    role: 'admin' as const,
    kind: 'user' as const,
    label: 'admin',
    userId: null,
    tokenId: null,
    tokenScopes: [],
  }
  const entry = createEntry(
    admin,
    entryWriteSchema.parse({
      name: 'Inline app',
      links: [{ label: 'Open', urlTemplate: origin, type: 'web', isPrimary: true }],
    }),
  ).entry
  await vi.waitFor(() => expect(getEntry(admin, entry.id).iconUrl).toBeTruthy())
  const id = new URL(getEntry(admin, entry.id).iconUrl!, origin).pathname.split('/').pop()!
  const image = readPublicIcon(admin, 'favicon', id)
  expect(image?.mediaType).toBe('image/svg+xml')
  expect(image?.bytes.toString()).toContain('#2563eb')
  expect(image?.bytes.toString()).not.toMatch(/onload|script/)
  expect(requests).toEqual(['/'])
  expect(entryWriteSchema.safeParse({ name: 'Override', faviconUrl: uri }).success).toBe(true)
  expect((await fetchFaviconBytes(uri, false, true)).bytes.toString()).not.toMatch(/onload|script/)
})
it('tries linked candidates, then manifest images, then favicon.ico, rejecting HTML disguised as an image', async () => {
  const { origin, requests } = await fixture((path) => {
    if (path === '/')
      return {
        type: 'text/html',
        body: '<link rel="icon" href="/bad.svg"><link rel="icon" sizes="64x64" href="/bad.png"><link rel="manifest" href="/manifest.json">',
      }
    if (path === '/bad.svg') return { type: 'image/svg+xml', body: '<!DOCTYPE svg><svg/>' }
    if (path === '/manifest.json')
      return { type: 'application/json', body: '{"icons":[{"src":"/missing.webp"}]}' }
    if (path === '/favicon.ico')
      return { type: 'image/vnd.microsoft.icon', body: Buffer.from([0, 0, 1, 0, 1, 0, 16, 16]) }
    return { type: 'image/png', body: '<html>unavailable</html>' }
  })
  expect((await fetchFaviconBytes(origin, false)).mediaType).toBe('image/x-icon')
  expect(requests).toEqual([
    '/',
    '/bad.svg',
    '/bad.png',
    '/manifest.json',
    '/missing.webp',
    '/favicon.ico',
  ])
})
it('prefers a normal Headlamp icon over its mask-icon and falls back when a declared SVG contains a DOCTYPE', async () => {
  // Headlamp v0.45.0 frontend/index.html also declares a Safari mask SVG with a DOCTYPE.
  const { origin, requests } = await fixture((path) =>
    path === '/'
      ? {
          type: 'text/html',
          body: '<link rel="icon" href="/favicon.ico"><link rel="apple-touch-icon" sizes="180x180" href="/apple.png"><link rel="mask-icon" href="/safari-pinned-tab.svg">',
        }
      : { type: 'image/png', body: png },
  )
  expect((await fetchFaviconBytes(origin, false)).mediaType).toBe('image/png')
  expect(requests).toEqual(['/', '/apple.png'])
})
it('persists failure backoff across restarts, permits manual retries and retains the last good bytes', async () => {
  const settings = await boot()
  let healthy = false
  const { origin, requests } = await fixture(() =>
    healthy ? { type: 'image/png', body: png } : { type: 'text/html', body: 'down', status: 503 },
  )
  queueFavicon(origin, false, true)
  await vi.waitFor(() =>
    expect(getDatabase().select().from(faviconCache).all()[0]?.failureCount).toBe(1),
  )
  await refreshStaleFavicons()
  expect(requests).toHaveLength(1)
  await bootApplication(settings)
  await refreshStaleFavicons()
  expect(requests).toHaveLength(1)
  getDatabase()
    .update(faviconCache)
    .set({ fetchedAt: new Date(Date.now() - 5 * 60_000 - 1) })
    .run()
  await refreshStaleFavicons()
  await vi.waitFor(() =>
    expect(getDatabase().select().from(faviconCache).all()[0]?.failureCount).toBe(2),
  )
  expect([1, 2, 3, 4].map(faviconRetryMs)).toEqual([300_000, 3_600_000, 21_600_000, 21_600_000])
  healthy = true
  queueFavicon(origin, true, true)
  await vi.waitFor(() =>
    expect(getDatabase().select().from(faviconCache).all()[0]?.status).toBe('ok'),
  )
  healthy = false
  queueFavicon(origin, true, true)
  await vi.waitFor(() =>
    expect(getDatabase().select().from(faviconCache).all()[0]?.status).toBe('error'),
  )
  const row = getDatabase()
    .select()
    .from(faviconCache)
    .where(eq(faviconCache.origin, 'url:' + origin + '/'))
    .get()!
  expect(row.data).toEqual(png)
  expect(row.error).toContain('503')
  expect(row.failureCount).toBe(1)
})
