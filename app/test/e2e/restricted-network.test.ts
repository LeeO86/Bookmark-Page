import { createServer, type ServerResponse } from 'node:http'
import { gzipSync } from 'node:zlib'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setup, url } from '@nuxt/test-utils/e2e'
import { afterAll, describe, expect, it } from 'vitest'
import { testSecretKey } from '../secret'

const svg =
  '<svg xmlns="http://www.w3.org/2000/svg"><script>unsafe()</script><rect width="16" height="16"/></svg>'
const held = new Map<string, ServerResponse>()
const probePaths: string[] = []

describe('restricted-network HTTP regressions', async () => {
  const fixture = createServer((req, res) => {
    const path = req.url!
    if (path.startsWith('/probe/')) probePaths.push(path)
    if (path === '/late-failure' || path.startsWith('/probe/')) {
      held.set(path, res)
      return
    }
    res.writeHead(200, { 'content-type': 'image/svg+xml', 'content-encoding': 'gzip' })
    res.end(gzipSync(svg))
  })
  await new Promise<void>((resolve) => fixture.listen(0, '127.0.0.1', resolve))
  const address = fixture.address()
  if (!address || typeof address === 'string') throw new Error('No fixture port')
  const origin = `http://127.0.0.1:${address.port}`
  const token = 'bp_' + 'c'.repeat(43)
  Object.assign(process.env, {
    BOOKMARK_SECRET_KEY: testSecretKey,
    DATABASE_PATH: join(mkdtempSync(join(tmpdir(), 'bp-network-http-')), 'bookmark.db'),
    MIGRATIONS_FOLDER: fileURLToPath(new URL('../../drizzle', import.meta.url)),
    ADMIN_USERNAME: 'admin',
    ADMIN_PASSWORD: 'admin-pass-1',
    ADMIN_API_TOKEN: token,
    BOOKMARK_MONITORS: '1',
    BOOKMARK_FAVICON_FETCH: '1',
    CHECK_CONCURRENCY: '2',
    CHECK_MIN_INTERVAL_SECONDS: '1',
    FAVICON_TIMEOUT_MS: '15000',
    SESSION_COOKIE_SECURE: 'false',
  })
  await setup({
    rootDir: fileURLToPath(new URL('../..', import.meta.url)),
    server: true,
    browser: false,
  })
  afterAll(async () => {
    fixture.closeAllConnections()
    await new Promise<void>((resolve) => fixture.close(() => resolve()))
  })
  async function api(method: string, path: string, body?: unknown) {
    const response = await globalThis.fetch(url(path), {
      method,
      headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    expect(response.ok).toBe(true)
    return response.json()
  }
  it('keeps a supplied slot successful when an earlier HTTP favicon request fails later', async () => {
    const { entry } = await api('POST', '/api/v1/entries', {
      name: 'Late failure device',
      faviconUrl: origin + '/late-failure',
    })
    await expect.poll(() => held.has('/late-failure')).toBe(true)
    await api('PUT', `/api/v1/entries/${entry.id}/favicon`, {
      contentType: 'image/svg+xml',
      data: Buffer.from(svg).toString('base64'),
    })
    const before = await api('GET', `/api/v1/entries/${entry.id}`)
    held.get('/late-failure')!.writeHead(404).end()
    await expect
      .poll(async () => (await api('GET', `/api/v1/entries/${entry.id}`)).faviconStatus.fetchedAt)
      .not.toBe(before.faviconStatus.fetchedAt)
    const after = await api('GET', `/api/v1/entries/${entry.id}`)
    expect(after.faviconStatus).toMatchObject({
      status: 'ok',
      source: 'supplied',
      error: null,
      failureCount: 0,
      suppliedBy: before.faviconStatus.suppliedBy,
      suppliedAt: before.faviconStatus.suppliedAt,
    })
    expect(after.iconUrl).toBe(before.iconUrl)
    const image = await globalThis.fetch(url(after.iconUrl), {
      headers: { authorization: 'Bearer ' + token },
    })
    expect(await image.text()).not.toContain('script')
  })
  it('refills freed check slots immediately, eventually runs every due check, and exposes capacity warnings through metrics', async () => {
    const { entry } = await api('POST', '/api/v1/entries', {
      name: 'Queue capacity device',
      checks: Array.from({ length: 8 }, (_, i) => ({
        name: 'HTTP ' + i,
        kind: 'http',
        executor: 'server',
        intervalSeconds: 1,
        timeoutMs: 12000,
        requestSpec: { method: 'GET', urlTemplate: `${origin}/probe/${i}`, timeoutMs: 12000 },
      })),
    })
    try {
      await expect.poll(() => probePaths.length, { timeout: 10000 }).toBe(2)
      const metrics = await (await globalThis.fetch(url('/metrics'))).text()
      expect(metrics).toContain('bookmark_server_check_concurrency 2')
      expect(metrics).toContain('bookmark_server_checks_in_flight 2')
      await expect
        .poll(
          async () =>
            /bookmark_server_checks_overdue [1-8]/.test(
              await (await globalThis.fetch(url('/metrics'))).text(),
            ),
          { timeout: 2500 },
        )
        .toBe(true)
      const freedAt = Date.now()
      held.get(probePaths[0]!)!.end('ok')
      await expect.poll(() => probePaths.length, { timeout: 2500, interval: 25 }).toBe(3)
      expect(Date.now() - freedAt).toBeLessThan(3000)
      for (let count = 4; count <= 8; count++) {
        const active = [...held.values()].find((response) => !response.writableEnded)
        expect(active).toBeDefined()
        active!.end('ok')
        await expect.poll(() => probePaths.length, { timeout: 2500, interval: 25 }).toBe(count)
      }
      for (const response of held.values()) if (!response.writableEnded) response.end('ok')
      expect(new Set(probePaths).size).toBe(8)
      await expect
        .poll(async () =>
          (await (await globalThis.fetch(url('/metrics'))).text()).includes(
            'bookmark_checks{state="up"} 8',
          ),
        )
        .toBe(true)
    } finally {
      await api('DELETE', `/api/v1/entries/${entry.id}`)
      for (const response of held.values()) if (!response.writableEnded) response.end('ok')
    }
  })
})
