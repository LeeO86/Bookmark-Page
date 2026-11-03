import { createServer, type Server } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import type { Actor } from '../../server/auth/permissions'
import { bootApplication } from '../../server/db/boot'
import { closeDatabase } from '../../server/db/client'
import { entryWriteSchema } from '../../shared/contracts'
import { createEntry, getEntry, updateEntry } from '../../server/services/entries'
import { runServerCheck } from '../../server/checks/run'
import { leaseChecks } from '../../server/checks/lease'
import { writeSettings } from '../../server/services/settings'
import { browserImageOrigins } from '../../server/services/browser-images'
import { contentSecurityPolicyFor } from '../../server/http/security'
import { createFilter } from '../../server/services/catalog'
import { testSecretKey } from '../secret'
const admin: Actor = {
  role: 'admin',
  kind: 'user',
  label: 'admin',
  userId: null,
  tokenId: null,
  tokenScopes: [],
}
const servers: Server[] = []
let directory = ''
afterEach(async () => {
  for (const s of servers.splice(0)) {
    s.closeAllConnections()
    await new Promise<void>((r) => s.close(() => r()))
  }
  closeDatabase()
  if (directory) rmSync(directory, { recursive: true, force: true })
})
async function boot() {
  directory = mkdtempSync(join(tmpdir(), 'bp-image-'))
  await bootApplication({
    secretKey: testSecretKey,
    databasePath: join(directory, 'bookmark.db'),
    migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)),
  })
}
it('uses the live favicon URL for image checks and validates images on the server', async () => {
  await boot()
  let image = true
  const server = createServer((_, res) => {
    res.writeHead(200, { 'content-type': image ? 'image/svg+xml' : 'text/html' })
    res.end(
      image
        ? '<svg xmlns="http://www.w3.org/2000/svg"><rect width="16" height="16"/></svg>'
        : '<html>not an image</html>',
    )
  })
  servers.push(server)
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const addr = server.address()
  if (!addr || typeof addr === 'string') throw Error('fixture')
  const target = `http://127.0.0.1:${addr.port}/icon.svg`
  const entry = createEntry(
    admin,
    entryWriteSchema.parse({
      name: 'Image device',
      faviconUrl: target,
      checks: [{ name: 'Image', kind: 'image', executor: 'server' }],
    }),
  ).entry
  await runServerCheck(entry.checks[0]!.id)
  expect(getEntry(admin, entry.id).status).toBe('up')
  image = false
  await runServerCheck(entry.checks[0]!.id)
  expect(getEntry(admin, entry.id).status).toBe('down')
  const browser = createEntry(
    admin,
    entryWriteSchema.parse({
      name: 'Browser device',
      faviconUrl: target,
      checks: [{ name: 'Image', kind: 'image', executor: 'client' }],
    }),
  ).entry
  expect(leaseChecks(admin).find((c) => c.id === browser.checks[0]?.id)).toMatchObject({
    kind: 'image',
    url: target,
  })
})
it('does not derive online status from a supplied or cached server image', async () => {
  await boot()
  const entry = createEntry(
    admin,
    entryWriteSchema.parse({
      name: 'Inline target',
      faviconUrl: 'data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22/%3E',
      checks: [{ name: 'Image', kind: 'image', executor: 'server' }],
    }),
  ).entry
  await runServerCheck(entry.checks[0]!.id)
  expect(getEntry(admin, entry.id).status).toBe('unknown')
})
it('keeps direct browser images opt-in and the CSP restricted to visible targets', async () => {
  await boot()
  const entry = createEntry(
    admin,
    entryWriteSchema.parse({
      name: 'Public image',
      faviconUrl: 'http://public-device.example/icon.ico',
      tags: ['image:public'],
    }),
  ).entry
  createEntry(
    admin,
    entryWriteSchema.parse({
      name: 'Private image',
      faviconUrl: 'http://private-device.example/icon.ico',
    }),
  )
  createFilter(admin, {
    name: 'Images',
    query: 'image:public',
    isPublic: true,
    global: true,
    columns: [],
    sort: 0,
  })
  const anonymous = { ...admin, role: 'anonymous' as const, kind: 'anonymous' as const }
  expect(getEntry(admin, entry.id).browserIconUrl).toBeNull()
  expect(browserImageOrigins(anonymous)).toEqual([])
  writeSettings({ browserFavicons: true }, null)
  expect(getEntry(admin, entry.id).browserIconUrl).toBe('http://public-device.example/icon.ico')
  expect(browserImageOrigins(anonymous)).toEqual([
    'http://public-device.example',
    'https://public-device.example',
  ])
  expect(browserImageOrigins(admin)).toContain('http://private-device.example')
  const policy = contentSecurityPolicyFor('', false, browserImageOrigins(anonymous))
  expect(policy).toContain('http://public-device.example')
  expect(policy).not.toContain('private-device')
  writeSettings({ browserFavicons: false }, null)
  updateEntry(admin, entry.id, { checks: [{ name: 'Image', kind: 'image', executor: 'client' }] })
  expect(browserImageOrigins(anonymous)).toContain('http://public-device.example')
  expect(getEntry(admin, entry.id).browserIconUrl).toBeNull()
})
