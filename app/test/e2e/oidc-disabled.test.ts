import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { get } from 'node:http'
import { setup, url } from '@nuxt/test-utils/e2e'
import { afterAll, describe, expect, it } from 'vitest'
import { createOidcProvider, freeTestPort } from '../helpers/oidc-provider'
import { testSecretKey } from '../secret'

describe('OIDC auto-login remains opt-in and uses the session cookie policy', async () => {
  const provider = await createOidcProvider(),
    port = await freeTestPort()
  Object.assign(process.env, {
    BOOKMARK_SECRET_KEY: testSecretKey,
    DATABASE_PATH: join(mkdtempSync(join(tmpdir(), 'bp-oidc-off-')), 'bookmark.db'),
    MIGRATIONS_FOLDER: fileURLToPath(new URL('../../drizzle', import.meta.url)),
    ADMIN_USERNAME: 'admin',
    ADMIN_PASSWORD: 'admin-pass-1',
    OIDC_DISCOVERY_URL: provider.origin,
    OIDC_CLIENT_ID: 'bookmark-test',
    OIDC_CLIENT_SECRET: 'fixture-client-secret',
    OIDC_REDIRECT_URI: `http://127.0.0.1:${port}/api/v1/auth/oidc/callback`,
    OIDC_AUTO_LOGIN: 'false',
    SESSION_COOKIE_SECURE: 'true',
    AUTH_TRUSTED_HEADER_ENABLED: 'false',
  })
  await setup({
    rootDir: fileURLToPath(new URL('../..', import.meta.url)),
    port,
    server: true,
    browser: false,
  })
  afterAll(() => provider.close())
  it('renders a document without a provider request while auto-login is disabled', async () => {
    const result = await new Promise<{ status: number; location?: string }>((resolve, reject) => {
      const request = get(
        url('/'),
        { headers: { 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' } },
        (response) => {
          response.resume()
          resolve({ status: response.statusCode!, location: response.headers.location })
        },
      )
      request.on('error', reject)
    })
    expect(result).toEqual({ status: 200, location: undefined })
    expect(provider.requests).toEqual([])
  })
  it('sets a Secure HttpOnly SameSite=Lax session-only suppression cookie on sign-out', async () => {
    const response = await globalThis.fetch(url('/api/v1/auth/logout'), {
      method: 'POST',
      headers: { origin: url('/') },
      body: '{}',
    })
    expect(response.status).toBe(200)
    const cookie = response.headers
      .getSetCookie()
      .find((value) => value.startsWith('bp-oidc-auto=1'))!
    expect(cookie).toContain('Secure')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).not.toMatch(/Max-Age|Expires/i)
  })
})
