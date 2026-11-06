import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { get as httpsGet } from 'node:https'
import { request as httpRequest } from 'node:http'
import { setup, url } from '@nuxt/test-utils/e2e'
import { afterAll, describe, expect, it } from 'vitest'
import { createOidcProvider, freeTestPort } from '../helpers/oidc-provider'
import { testSecretKey } from '../secret'

const navigate = { 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' }
const token = 'bp_' + 'b'.repeat(43)

describe('real OpenID HTTP flow against the local TLS provider', async () => {
  const provider = await createOidcProvider()
  const port = await freeTestPort()
  const directory = mkdtempSync(join(tmpdir(), 'bp-oidc-http-'))
  Object.assign(process.env, {
    BOOKMARK_SECRET_KEY: testSecretKey,
    DATABASE_PATH: join(directory, 'bookmark.db'),
    MIGRATIONS_FOLDER: fileURLToPath(new URL('../../drizzle', import.meta.url)),
    ADMIN_USERNAME: 'admin',
    ADMIN_PASSWORD: 'admin-pass-1',
    ADMIN_API_TOKEN: token,
    OIDC_DISCOVERY_URL: provider.origin + '/.well-known/openid-configuration',
    OIDC_CLIENT_ID: 'bookmark-test',
    OIDC_CLIENT_SECRET: 'fixture-client-secret',
    OIDC_REDIRECT_URI: `http://127.0.0.1:${port}/api/v1/auth/oidc/callback`,
    OIDC_AUTO_LOGIN: 'true',
    OIDC_AUTO_LOGIN_RETRY_SECONDS: '60',
    OIDC_PROVIDER_NAME: 'Fixture ID',
    OIDC_ROLE_MAPPING: JSON.stringify({
      'fixture-viewer': 'viewer',
      'fixture-editor': 'editor',
      'fixture-admin': 'admin',
    }),
    LOCAL_LOGIN_ENABLED: 'false',
    SESSION_COOKIE_SECURE: 'false',
    AUTH_TRUSTED_HEADER_ENABLED: 'true',
    AUTH_TRUSTED_PROXIES: '127.0.0.1/32',
    NODE_EXTRA_CA_CERTS: provider.caFile,
  })
  await setup({
    rootDir: fileURLToPath(new URL('../..', import.meta.url)),
    server: true,
    browser: false,
    port,
  })
  afterAll(() => provider.close())

  class Browser {
    cookies = new Map<string, string>()
    async request(path: string, init: RequestInit = {}) {
      const headers = new Headers(init.headers)
      if (this.cookies.size)
        headers.set('cookie', [...this.cookies].map(([key, value]) => key + '=' + value).join('; '))
      // fetch rewrites Sec-Fetch-Mode to cors; native HTTP preserves browser navigation metadata.
      const response = await new Promise<Response>((resolve, reject) => {
        const request = httpRequest(
          url(path),
          { method: init.method ?? 'GET', headers: Object.fromEntries(headers) },
          (incoming) => {
            const chunks: Buffer[] = [],
              responseHeaders = new Headers()
            for (let i = 0; i < incoming.rawHeaders.length; i += 2)
              responseHeaders.append(incoming.rawHeaders[i]!, incoming.rawHeaders[i + 1]!)
            incoming.on('data', (chunk: Buffer) => chunks.push(chunk))
            incoming.on('end', () =>
              resolve(
                new Response(Buffer.concat(chunks), {
                  status: incoming.statusCode,
                  headers: responseHeaders,
                }),
              ),
            )
            incoming.on('error', reject)
          },
        )
        request.on('error', reject)
        if (typeof init.body === 'string') request.write(init.body)
        request.end()
      })
      for (const cookie of response.headers.getSetCookie()) {
        const part = cookie.split(';')[0]!,
          index = part.indexOf('='),
          key = part.slice(0, index),
          value = part.slice(index + 1)
        if (!value || /max-age=0(?:;|$)/i.test(cookie)) this.cookies.delete(key)
        else this.cookies.set(key, value)
      }
      return response
    }
  }
  async function api(method: string, path: string, body?: unknown) {
    const response = await globalThis.fetch(url(path), {
      method,
      headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    expect(response.ok, method + ' ' + path).toBe(true)
    return response.json()
  }
  async function authorize(target: string, sso = true) {
    expect(new URL(target).origin).toBe(provider.origin)
    return new Promise<string>((resolve, reject) => {
      const request = httpsGet(
        target,
        { ca: provider.ca, headers: sso ? { cookie: 'mock-sso=1' } : {} },
        (response) => {
          response.resume()
          if (response.statusCode !== 302 || !response.headers.location)
            reject(new Error('Fixture authorization did not redirect'))
          else resolve(response.headers.location)
        },
      )
      request.on('error', reject)
    })
  }
  async function start(browser: Browser, returnTo = '/', silent = true) {
    return browser.request(
      '/api/v1/auth/oidc/start?' +
        new URLSearchParams({ returnTo, ...(silent ? { silent: '1' } : {}) }),
    )
  }
  async function flow(browser: Browser, returnTo = '/', silent = true, sso = true) {
    const started = await start(browser, returnTo, silent)
    expect(started.status).toBe(302)
    const callback = new URL(await authorize(started.headers.get('location')!, sso))
    return browser.request(callback.pathname + callback.search)
  }

  it.each(['discovery-reset', 'discovery-error'] as const)(
    'returns anonymously and suppresses unavailable discovery: %s',
    async (fault) => {
      provider.configure({ fault })
      const browser = new Browser()
      const response = await start(browser, '/?view=tiles')
      expect(response.status).toBe(302)
      expect(response.headers.get('location')).toBe('/?view=tiles')
      expect(
        response.headers
          .getSetCookie()
          .some(
            (cookie) =>
              cookie.startsWith('bp-oidc-auto=1') &&
              /HttpOnly/i.test(cookie) &&
              /SameSite=Lax/i.test(cookie) &&
              /Max-Age=60/i.test(cookie),
          ),
      ).toBe(true)
      expect((await browser.request('/?view=tiles', { headers: navigate })).status).toBe(200)
      expect(await (await browser.request('/')).text()).not.toContain(
        'Sign-in with Fixture ID failed',
      )
    },
  )

  it('redirects only document navigation before rendering and restores the full return path on success', async () => {
    provider.configure({ role: 'admin', name: 'Fixture Administrator' })
    const browser = new Browser(),
      returnTo = '/admin/users?from=portal'
    const first = await browser.request(returnTo, { headers: navigate })
    expect(first.status).toBe(302)
    const startUrl = new URL(first.headers.get('location')!, url('/'))
    expect(startUrl.pathname).toBe('/api/v1/auth/oidc/start')
    expect(startUrl.searchParams.get('returnTo')).toBe(returnTo)
    const started = await browser.request(startUrl.pathname + startUrl.search)
    const authorization = new URL(started.headers.get('location')!)
    expect(authorization.searchParams.get('prompt')).toBe('none')
    expect(authorization.searchParams.get('code_challenge_method')).toBe('S256')
    const callback = new URL(await authorize(authorization.href))
    const completed = await browser.request(callback.pathname + callback.search)
    expect(completed.status).toBe(302)
    expect(completed.headers.get('location')).toBe(returnTo)
    expect(browser.cookies.has('bp-oidc-auto')).toBe(false)
    const session = await (await browser.request('/api/v1/auth/session')).json()
    expect(session.actor).toMatchObject({
      role: 'admin',
      displayName: 'Fixture Administrator',
      username: 'fixture.user@example.test',
      authMethod: 'oidc',
      authProvider: 'Fixture ID',
    })
    const users = await api('GET', '/api/v1/users')
    expect(
      users.users.find((user: { authSource: string }) => user.authSource === 'oidc'),
    ).toMatchObject({ displayName: 'Fixture Administrator', authSource: 'oidc' })
    // Simulate the browser discarding its expired seven-day session cookie.
    browser.cookies.delete('nuxt-session')
    expect((await browser.request('/?view=tiles', { headers: navigate })).status).toBe(302)
  })

  it('treats a genuinely expired sealed session as anonymous on the next document navigation', async () => {
    provider.configure({ role: 'viewer' })
    const browser = new Browser()
    await flow(browser)
    const actor = (await (await browser.request('/api/v1/auth/session')).json()).actor
    // Use the pinned Nuxt sealing primitive to backdate a real encrypted session, not an unsigned mock.
    const require = createRequire(import.meta.url)
    const module = (await import(
      pathToFileURL(join(dirname(require.resolve('nuxt/package.json')), 'dist/server/iron.js')).href
    )) as {
      seal(value: unknown, password: Buffer, options: { ttl: number }): Promise<string>
    }
    const expired = await module.seal(
      {
        nuxt: 1,
        id: 'expired-fixture-session',
        data: { userId: actor.userId, signInMethod: 'oidc' },
      },
      Buffer.from(testSecretKey, 'base64'),
      { ttl: -8 * 86400_000 },
    )
    browser.cookies.set('nuxt-session', expired)
    expect((await (await browser.request('/api/v1/auth/session')).json()).actor.role).toBe(
      'anonymous',
    )
    expect((await browser.request('/?view=list', { headers: navigate })).status).toBe(302)
  })

  it('falls back after discovery becomes unavailable even when metadata was cached by a previous login', async () => {
    provider.configure({ fault: 'discovery-reset' })
    const browser = new Browser()
    const response = await start(browser, '/?view=list')
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/?view=list')
    expect(browser.cookies.has('bp-oidc-auto')).toBe(true)
  })

  it('bounds the sealed return-path transaction without returning a raw cookie-size error', async () => {
    provider.configure({})
    const browser = new Browser(),
      path = '/?q=' + 'x'.repeat(2100)
    expect((await start(browser, path, false)).status).toBe(400)
    const response = await browser.request(path, { headers: navigate })
    expect(response.status).toBe(302)
    expect(new URL(response.headers.get('location')!, url('/')).searchParams.get('returnTo')).toBe(
      '/',
    )
  })

  it.each([
    'login_required',
    'interaction_required',
    'consent_required',
    'account_selection_required',
    'access_denied',
    'unknown_provider_error',
  ])('silently falls back and clears the transaction for provider error %s', async (error) => {
    provider.configure({ error })
    const browser = new Browser(),
      returnTo = '/?view=list&q=group%3AA'
    const result = await flow(browser, returnTo)
    expect(result.status).toBe(302)
    expect(result.headers.get('location')).toBe(returnTo)
    expect(browser.cookies.has('bp-oidc-auto')).toBe(true)
    const page = await browser.request(returnTo, { headers: navigate })
    expect(page.status).toBe(200)
    const html = await page.text()
    expect(html).toContain('Sign in')
    expect(html).not.toContain('Private provider diagnostic')
    expect(html).not.toContain('Sign-in with Fixture ID failed')
    const session = await (await browser.request('/api/v1/auth/session')).json()
    expect(session.actor.role).toBe('anonymous')
    // A replay cannot use the completed/failed transaction; the safe fallback is a portal redirect.
    const replay = await browser.request('/api/v1/auth/oidc/callback?code=replayed&state=old')
    expect(replay.status).toBe(302)
  })

  it.each([
    'exchange-error',
    'exchange-reset',
    'bad-signature',
    'bad-issuer',
    'bad-audience',
    'expired-token',
    'state-mismatch',
  ] as const)('silently rejects exchange/token failure %s', async (fault) => {
    provider.configure({ fault })
    const browser = new Browser()
    const result = await flow(browser, '/?view=tiles')
    expect(result.status).toBe(302)
    expect(result.headers.get('location')).toBe('/?view=tiles')
    expect(browser.cookies.has('bp-oidc-auto')).toBe(true)
    expect((await (await browser.request('/api/v1/auth/session')).json()).actor.role).toBe(
      'anonymous',
    )
    expect(
      await (await browser.request('/?view=tiles', { headers: navigate })).text(),
    ).not.toContain('Sign-in with Fixture ID failed')
  })

  it('shows only a readable interactive error and does not start another automatic attempt', async () => {
    provider.configure({ error: 'access_denied' })
    const browser = new Browser()
    const result = await flow(browser, '/?view=tiles', false)
    expect(result.headers.get('location')).toBe('/?view=tiles')
    const html = await (await browser.request('/?view=tiles', { headers: navigate })).text()
    expect(html).toContain('Sign-in with Fixture ID failed: access denied')
    expect(html).not.toContain('Private provider diagnostic')
    expect(browser.cookies.has('bp-oidc-auto')).toBe(true)
    expect(
      await (await browser.request('/?view=tiles', { headers: navigate })).text(),
    ).not.toContain('Sign-in with Fixture ID failed')
  })

  it('suppresses sign-out until explicit sign-in and clears suppression after successful OIDC or break-glass login', async () => {
    provider.configure({ role: 'editor' })
    const browser = new Browser()
    await flow(browser)
    const signedOut = await browser.request('/api/v1/auth/logout', {
      method: 'POST',
      headers: { origin: url('/') },
      body: '{}',
    })
    expect(signedOut.status).toBe(200)
    const cookie = signedOut.headers
      .getSetCookie()
      .find((value) => value.startsWith('bp-oidc-auto=1'))!
    expect(cookie).toContain('HttpOnly')
    expect(cookie).not.toMatch(/Max-Age|Expires/i)
    expect((await browser.request('/', { headers: navigate })).status).toBe(200)
    await flow(browser, '/', false)
    expect(browser.cookies.has('bp-oidc-auto')).toBe(false)
    await browser.request('/api/v1/auth/logout', {
      method: 'POST',
      headers: { origin: url('/') },
      body: '{}',
    })
    const local = await browser.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { origin: url('/'), 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin-pass-1' }),
    })
    expect(local.status).toBe(200)
    expect(browser.cookies.has('bp-oidc-auto')).toBe(false)
    expect((await (await browser.request('/api/v1/auth/session')).json()).actor.authMethod).toBe(
      'break-glass',
    )
  })

  it.each(['viewer', 'editor', 'admin'] as const)(
    'reapplies the mapped %s role and refreshes the display name on every sign-in',
    async (role) => {
      provider.configure({ role, name: 'Name for ' + role })
      const browser = new Browser()
      await flow(browser)
      expect((await (await browser.request('/api/v1/auth/session')).json()).actor).toMatchObject({
        role,
        displayName: 'Name for ' + role,
      })
    },
  )
  it.each([
    undefined,
    [],
    ['Bookmark.Admin'],
    ['fixture-viewer', 'unmapped'],
    ['fixture-editor', 'fixture-admin'],
  ])(
    'keeps latest role-claim diagnostics admin-only and explains fallback for %j',
    async (roleValues) => {
      provider.configure({ subject: 'role-diagnostic-user', roleValues })
      const browser = new Browser()
      await flow(browser)
      const actor = (await (await browser.request('/api/v1/auth/session')).json()).actor
      const expected =
        Array.isArray(roleValues) && roleValues.includes('fixture-admin') ? 'admin' : 'viewer'
      expect(actor.role).toBe(expected)
      expect(actor).not.toHaveProperty('oidcRoleDiagnostics')
      const response = await new Browser().request('/api/v1/users', {
        headers: { authorization: 'Bearer ' + token },
      })
      const user = (await response.json()).users.find(
        (item: { oidcRoleDiagnostics?: { subject: string } }) =>
          item.oidcRoleDiagnostics?.subject === 'role-diagnostic-user',
      )
      expect(user.oidcRoleDiagnostics).toMatchObject({
        issuer: provider.origin,
        subject: 'role-diagnostic-user',
        claim: 'roles',
        values: roleValues ?? [],
        matched:
          Array.isArray(roleValues) &&
          roleValues.some((v) => ['fixture-viewer', 'fixture-editor', 'fixture-admin'].includes(v)),
        truncated: false,
        ignoredNonStringValues: false,
      })
      if (expected !== 'admin') expect((await browser.request('/api/v1/users')).status).toBe(403)
      expect((await new Browser().request('/api/v1/users')).status).toBe(403)
    },
  )

  it('falls back to the canonical user name when the provider has no name claim', async () => {
    provider.configure({ name: null })
    const browser = new Browser()
    await flow(browser)
    expect((await (await browser.request('/api/v1/auth/session')).json()).actor.displayName).toBe(
      'fixture.user@example.test',
    )
  })

  it.each([
    'https://other.example/path',
    '//other.example/path',
    '/\\other.example',
    '/%5cother.example',
    '/%252f%252fother.example',
    '/%00bad',
    '/%0d%0aLocation:bad',
    'relative',
    '/api/v1/auth/oidc/start',
  ])('rejects unsafe return path %s before discovery', async (returnTo) => {
    const browser = new Browser()
    expect((await start(browser, returnTo, false)).status).toBe(400)
  })
  it('rejects duplicate return parameters', async () => {
    expect(
      (await new Browser().request('/api/v1/auth/oidc/start?returnTo=/&returnTo=/admin')).status,
    ).toBe(400)
  })

  it('does not redirect API/assets/metrics, curl, partial fetch metadata, POST or token/header clients', async () => {
    provider.configure({})
    const browser = new Browser()
    for (const path of [
      '/api/health',
      '/api/v1/entries',
      '/metrics',
      '/branding/bookmark-page-icon.png',
      '/_nuxt/missing.js',
    ]) {
      const response = await browser.request(path, { headers: navigate })
      expect(response.headers.get('location')).toBeNull()
    }
    for (const headers of [
      {},
      { 'sec-fetch-mode': 'navigate' },
      { 'sec-fetch-dest': 'document' },
      { 'sec-fetch-mode': 'cors', 'sec-fetch-dest': 'document' },
      { 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'iframe' },
    ])
      expect((await browser.request('/', { headers })).status).toBe(200)
    expect(
      (await browser.request('/', { method: 'POST', headers: navigate })).headers.get('location'),
    ).toBeNull()
    expect(
      (await browser.request('/', { headers: { ...navigate, authorization: 'Bearer ' + token } }))
        .status,
    ).toBe(200)
    expect(
      (
        await browser.request('/', { headers: { ...navigate, authorization: 'Bearer invalid' } })
      ).headers.get('location'),
    ).toBeNull()
    const header = new Browser()
    expect(
      (
        await header.request('/', {
          headers: { ...navigate, 'Remote-User': 'fixture-header-user' },
        })
      ).status,
    ).toBe(200)
    expect(
      (
        await (
          await header.request('/api/v1/auth/session', {
            headers: { 'Remote-User': 'fixture-header-user' },
          })
        ).json()
      ).actor,
    ).toMatchObject({
      authMethod: 'trusted-header',
      username: 'fixture-header-user',
      role: 'viewer',
    })
  })

  it('does not widen anonymous visibility through facet counts or expose signed-in fields after silent failure', async () => {
    await api('POST', '/api/v1/fields', {
      key: 'staff_note',
      label: 'Staff',
      type: 'text',
      minRoleToView: 'viewer',
      searchable: true,
    })
    await api('POST', '/api/v1/filters', {
      name: 'Public devices',
      query: 'visibility:public',
      global: true,
      isPublic: true,
    })
    await api('POST', '/api/v1/entries', {
      name: 'Public fixture',
      tags: ['group:A', 'visibility:public'],
      fields: [{ key: 'staff_note', value: 'staff-only-detail' }],
    })
    await api('POST', '/api/v1/entries', { name: 'Private fixture', tags: ['group:Private'] })
    provider.configure({ error: 'login_required' })
    const browser = new Browser()
    await flow(browser)
    const response = await browser.request('/api/v1/entries?q=group:A&facetQuery=group:A')
    const body = await response.json()
    expect(body.entries.map((entry: { name: string }) => entry.name)).toEqual(['Public fixture'])
    expect(body.entries[0].fields).toEqual([])
    expect(body.facets.tags['group:Private']).toBeUndefined()
    expect(body.facets.tags['group:A']).toBe(1)
  })
})
