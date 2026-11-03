import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@nuxt/test-utils/playwright'
import { imageBrowser } from '../helpers/image-browser'
import { probeImageTarget } from '../../app/utils/image-probe'

const directory = mkdtempSync(join(tmpdir(), 'bp-image-portal-'))
const token = 'bp_' + 'c'.repeat(43)
process.env.BOOKMARK_SECRET_KEY = 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc='
process.env.DATABASE_PATH = join(directory, 'bookmark.db')
process.env.MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url))
process.env.ADMIN_USERNAME = 'admin'
process.env.ADMIN_PASSWORD = 'admin-pass-1'
process.env.ADMIN_API_TOKEN = token
process.env.SESSION_COOKIE_SECURE = 'false'
process.env.BOOKMARK_FAVICON_FETCH = '0'
process.env.BOOKMARK_MONITORS = '0'
process.env.AUTH_TRUSTED_HEADER_ENABLED = 'false'
process.env.NUXT_TELEMETRY_DISABLED = '1'

test.use({ nuxt: { rootDir: fileURLToPath(new URL('../..', import.meta.url)) } })

test('real HTTPS image display, probes, browser restrictions and leased status', async ({
  baseURL,
  browserName,
  request,
}, testInfo) => {
  if (!baseURL) throw new Error('Missing Nuxt test URL')
  const api = async (method: string, path: string, body?: unknown) => {
    const response = await request.fetch(new URL(path, baseURL).href, {
      method,
      headers: { authorization: 'Bearer ' + token },
      data: body,
    })
    if (!response.ok())
      throw new Error(
        method +
          ' ' +
          path +
          ': ' +
          response.status() +
          ' ' +
          (await response.text()).slice(0, 300),
      )
    return response.json()
  }
  const lab = await imageBrowser(baseURL, token, browserName)
  const ids: string[] = []
  try {
    for (const [name, target] of Object.entries(lab.targets)) {
      const result = await api('POST', '/api/v1/entries', {
        name: 'Image ' + name,
        faviconUrl: target,
        links: [{ label: 'UI', urlTemplate: target, type: 'web', isPrimary: true }],
      })
      ids.push(result.entry.id)
    }
    await api('PATCH', '/api/v1/settings', { browserFavicons: false })
    const page = await lab.context.newPage()
    const failed: string[] = []
    page.on('requestfailed', (req) => {
      if (req.url().startsWith(lab.targets.untrusted)) failed.push(req.failure()?.errorText ?? '')
    })
    const response = await page.goto(lab.origin + '/?view=cards', { waitUntil: 'networkidle' })
    expect(response?.headers()['content-security-policy']).toContain("img-src 'self' data:;")
    const icon = page.locator(`[data-entry-id="${ids[0]}"]`).getByTestId('entry-favicon')
    await expect(icon.locator('img')).toHaveCount(0)
    expect(lab.seen).toHaveLength(0)

    await api('PATCH', '/api/v1/settings', { browserFavicons: true })
    const enabled = await page.reload({ waitUntil: 'networkidle' })
    expect(enabled?.headers()['content-security-policy']).toContain(new URL(lab.targets.ip).origin)
    if (browserName === 'chromium') {
      await expect(icon.locator('img')).toBeVisible()
      await expect
        .poll(() =>
          icon
            .locator('img')
            .evaluate(
              (img) => img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0,
            ),
        )
        .toBe(true)
    } else await expect(icon.locator('img')).toHaveCount(0)
    for (const id of ids.slice(1))
      await expect(
        page.locator(`[data-entry-id="${id}"]`).getByTestId('entry-favicon').locator('img'),
      ).toHaveCount(0)

    const ipProbe = await page.evaluate(probeImageTarget, { url: lab.targets.ip, timeoutMs: 2000 })
    expect(ipProbe.state).toBe(browserName === 'chromium' ? 'up' : 'down')
    expect(
      (await page.evaluate(probeImageTarget, { url: lab.targets.hostname, timeoutMs: 2000 })).state,
    ).toBe('down')
    expect(
      (await page.evaluate(probeImageTarget, { url: lab.targets.untrusted, timeoutMs: 2000 }))
        .state,
    ).toBe('down')
    // Firefox may expose only NS_ERROR_FAILURE for a rejected certificate.
    expect(failed.length).toBeGreaterThan(0)
    expect(lab.untrustedRequests()).toBe(0)
    expect(
      (await page.evaluate(probeImageTarget, { url: lab.origin + '/probe-image', timeoutMs: 2000 }))
        .state,
    ).toBe('up')
    expect(
      (
        await page.evaluate(probeImageTarget, {
          url: lab.origin + '/probe-not-image',
          timeoutMs: 2000,
        })
      ).state,
    ).toBe('down')
    const timeout = await page.evaluate(probeImageTarget, {
      url: lab.origin + '/probe-hang',
      timeoutMs: 150,
    })
    expect(timeout.state).toBe('down')
    expect(timeout.message).toContain('timed out')
    expect(lab.seen.filter((host) => host.startsWith('device.example.test:'))).toHaveLength(0)

    await api('PATCH', '/api/v1/entries/' + ids[0], {
      checks: [
        { name: 'Image', kind: 'image', executor: 'client', intervalSeconds: 60, timeoutMs: 2000 },
      ],
    })
    await page.reload({ waitUntil: 'networkidle' })
    await expect
      .poll(async () => (await api('GET', '/api/v1/entries/' + ids[0])).status)
      .toBe(browserName === 'chromium' ? 'up' : 'down')
    await api('PATCH', '/api/v1/settings', { browserFavicons: false })
    const probeOnly = await page.reload({ waitUntil: 'networkidle' })
    expect(probeOnly?.headers()['content-security-policy']).toContain(
      new URL(lab.targets.ip).origin,
    )
    await expect(icon.locator('img')).toHaveCount(0)
    await testInfo.attach('image-compatibility.json', {
      contentType: 'application/json',
      body: JSON.stringify({
        browser: browserName,
        version: lab.version,
        trustedHttpsPortal: true,
        nonLoopbackHttpIp: true,
        httpIpProbe: ipProbe.state,
        hostnamePlainHttpRequests: 0,
        untrustedCertificate: 'down',
        nonImage: 'down',
        timeout: 'down',
      }),
    })
  } finally {
    await lab.close()
    for (const id of ids) await api('DELETE', '/api/v1/entries/' + id).catch(() => {})
    await api('PATCH', '/api/v1/settings', { browserFavicons: false }).catch(() => {})
  }
})
