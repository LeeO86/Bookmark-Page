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
