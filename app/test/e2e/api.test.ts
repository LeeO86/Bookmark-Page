import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetch, setup, url } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'
import { testSecretKey } from '../secret'

const rootDir = fileURLToPath(new URL('../..', import.meta.url))
const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url))

describe('HTTP API', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'bookmark-api-'))
  process.env.BOOKMARK_SECRET_KEY = testSecretKey
  process.env.DATABASE_PATH = join(directory, 'bookmark.db')
  process.env.MIGRATIONS_FOLDER = migrationsFolder
  process.env.ADMIN_USERNAME = 'admin'
  process.env.ADMIN_PASSWORD = 'admin-pass-1'
  process.env.AUTH_TRUSTED_HEADER_ENABLED = 'true'
  process.env.AUTH_TRUSTED_PROXIES = '10.0.0.0/8'
  process.env.AUTH_USER_HEADER = 'Remote-User'
  process.env.LOCAL_LOGIN_ENABLED = 'true'

  await setup({
    rootDir,
    server: true,
    browser: false,
  })

  it('serves OpenAPI and rejects a login without Origin', async () => {
    const spec = await fetch('/api/v1/openapi.json')
    expect(spec.status).toBe(200)
    const document = (await spec.json()) as { paths: Record<string, unknown> }
    expect(document.paths['/api/v1/entries']).toBeTruthy()

    const docs = await fetch('/api/v1/docs')
    expect(await docs.text()).toContain('Bookmark-Page API')

    const home = await fetch('/')
    const policy = home.headers.get('content-security-policy') ?? ''
    expect(policy).toContain("default-src 'self'")
    expect(policy).toContain("style-src 'self' 'unsafe-inline'")
    expect(policy).toContain('sha256-')
    expect(policy).not.toContain('unsafe-eval')
    expect(home.headers.get('x-content-type-options')).toBe('nosniff')
    expect(home.headers.get('referrer-policy')).toBe('no-referrer')
    expect(home.headers.get('x-frame-options')).toBe('DENY')
    expect(home.headers.get('permissions-policy')).toContain('camera=()')

    const favicon = await fetch('/api/v1/favicon')
    expect(favicon.status).toBe(200)
    expect(favicon.headers.get('content-type')).toContain('image/svg+xml')
    expect(await favicon.text()).toContain('<svg')

    const icon = await fetch('/api/icons/lucide/bookmark')
    const iconPolicy = icon.headers.get('content-security-policy') ?? ''
    expect(iconPolicy).toContain("default-src 'none'")
    expect(iconPolicy).not.toContain("default-src 'self'")

    const rejected = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin-pass-1' }),
    })
    expect(rejected.status).toBe(403)
  })

  it('enforces visibility, secret redaction, and bearer tokens', async () => {
    const admin = await login('admin', 'admin-pass-1')
    expect(admin.response.status).toBe(200)

    const session = await fetch('/api/v1/auth/session', { headers: { cookie: admin.cookie } })
    expect(await session.json()).toMatchObject({ actor: { role: 'admin', label: 'admin' } })

    expect(
      await send(admin.cookie, 'POST', '/api/v1/fields', {
        key: 'note',
        label: 'Note',
        type: 'text',
        minRoleToView: 'anonymous',
        searchable: true,
      }),
    ).toBe(201)
    expect(
      await send(admin.cookie, 'POST', '/api/v1/fields', {
        key: 'password',
        label: 'Password',
        type: 'secret',
        minRoleToView: 'viewer',
        searchable: true,
      }),
    ).toBe(201)
    expect(
      await send(admin.cookie, 'POST', '/api/v1/filters', {
        name: 'Audio',
        query: 'type:audio',
        isPublic: true,
        global: true,
      }),
    ).toBe(201)

    const mixer = await jsonRequest(admin.cookie, 'POST', '/api/v1/entries', {
      name: 'Mixer',
      tags: ['type:audio'],
      fields: [
        { key: 'note', value: 'lawo desk' },
        { key: 'password', value: 'secret-pass' },
      ],
    })
    const camera = await jsonRequest(admin.cookie, 'POST', '/api/v1/entries', {
      name: 'Camera',
      tags: ['type:video'],
      fields: [
        { key: 'note', value: 'cam' },
        { key: 'password', value: 'other-secret' },
      ],
    })

    const anonymous = await fetch(
      '/api/v1/entries?q=' + encodeURIComponent('type:audio OR type:video'),
    )
    const anonymousBody = (await anonymous.json()) as {
      entries: Array<{ name: string; fields: Array<{ key: string }> }>
    }
    expect(anonymousBody.entries.map((entry) => entry.name)).toEqual(['Mixer'])
    expect(anonymousBody.entries[0]?.fields.map((field) => field.key)).toEqual(['note'])

    const hidden = await fetch(`/api/v1/entries/${camera.body.entry.id}`)
    expect(hidden.status).toBe(404)

    const revealed = await jsonRequest(
      admin.cookie,
      'POST',
      `/api/v1/entries/${mixer.body.entry.id}/fields/password/reveal`,
      {},
    )
    expect(revealed.body.value).toBe('secret-pass')
    const audit = await jsonRequest(admin.cookie, 'GET', '/api/v1/audit')
    expect(JSON.stringify(audit.body)).not.toContain('secret-pass')

    const createdToken = await jsonRequest(admin.cookie, 'POST', '/api/v1/tokens', {
      name: 'reader',
      scopes: ['read'],
    })
    const bearer = await fetch('/api/v1/entries', {
      headers: { authorization: `Bearer ${createdToken.body.token}` },
    })
    expect(bearer.status).toBe(200)

    const headerUser = await fetch('/api/v1/auth/session', {
      headers: { 'remote-user': 'eve' },
    })
    expect(await headerUser.json()).toMatchObject({ actor: { role: 'anonymous' } })
  })
  it('blocks token scope escalation and audits authorized secret-link reveal', async () => {
    const admin = await login('admin', 'admin-pass-1')
    const reader = await jsonRequest(admin.cookie, 'POST', '/api/v1/tokens', {
      name: 'restricted-reader',
      scopes: ['read'],
    })
    const writer = await jsonRequest(admin.cookie, 'POST', '/api/v1/tokens', {
      name: 'restricted-writer',
      scopes: ['write'],
    })
    const call = (token: string, path: string, body: unknown) =>
      fetch(path, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
    expect(
      (
        await call(reader.body.token, '/api/v1/filters', {
          name: 'Exposure',
          global: true,
          isPublic: true,
        })
      ).status,
    ).toBe(403)
    expect(
      (await call(writer.body.token, '/api/v1/tokens', { name: 'Escalated', scopes: ['admin'] }))
        .status,
    ).toBe(403)
    expect((await call(reader.body.token, '/api/v1/checks/lease', { limit: 1 })).status).toBe(403)
    const entry = await jsonRequest(admin.cookie, 'POST', '/api/v1/entries', {
      name: 'Secret URL',
      tags: ['type:audio'],
      fields: [{ key: 'password', value: 'pin' }],
      links: [
        {
          label: 'Secret',
          type: 'web',
          isPrimary: true,
          urlTemplate: 'https://device.invalid/?p={{field.password}}',
        },
      ],
    })
    const response = await fetch(`/api/v1/entries/${entry.body.entry.id}`, {
      headers: { cookie: admin.cookie },
    })
    const detail = (await response.json()) as { links: Array<{ id: string; url: string | null }> }
    expect(detail.links[0]?.url).toBeNull()
    const reveal = `/api/v1/entries/${entry.body.entry.id}/links/${detail.links[0]?.id}/reveal`
    expect(
      (
        await fetch(reveal, {
          method: 'POST',
          headers: { origin: new URL(url('/')).origin, 'content-type': 'application/json' },
          body: '{}',
        })
      ).status,
    ).toBe(403)
    const revealed = await fetch(reveal, {
      method: 'POST',
      headers: {
        cookie: admin.cookie,
        origin: new URL(url('/')).origin,
        'content-type': 'application/json',
      },
      body: '{}',
    })
    expect(revealed.headers.get('cache-control')).toBe('no-store')
    expect(await revealed.json()).toEqual({ url: 'https://device.invalid/?p=pin' })
    const history = await fetch(`/api/v1/entries/${entry.body.entry.id}/history`, {
      headers: { cookie: admin.cookie },
    })
    expect(await history.text()).not.toContain('p=pin')
  })
})

async function login(username: string, password: string) {
  const response = await fetch('/api/v1/auth/login', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: new URL(url('/')).origin,
    },
    body: JSON.stringify({ username, password }),
  })
  const cookies =
    typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : [response.headers.get('set-cookie') ?? '']
  return {
    response,
    cookie: cookies.map((cookie) => cookie.split(';')[0]).join('; '),
  }
}

async function send(cookie: string, method: string, path: string, body?: unknown): Promise<number> {
  const response = await jsonRequest(cookie, method, path, body)
  return response.status
}

async function jsonRequest(
  cookie: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<{
  status: number
  body: { entry: { id: string }; token: string; value: string }
}> {
  const response = await fetch(path, {
    method,
    headers: {
      cookie,
      origin: new URL(url('/')).origin,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const parsed: unknown = method === 'GET' || response.status < 300 ? await response.json() : {}
  return {
    status: response.status,
    body: parsed as { entry: { id: string }; token: string; value: string },
  }
}
