import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test as nuxtTest } from '@nuxt/test-utils/playwright'
import type { APIRequestContext } from '@playwright/test'
import { createOidcProvider, freeTestPort } from '../helpers/oidc-provider'

const token = 'bp_' + 'z'.repeat(43)
type OidcLab = {
  provider: Awaited<ReturnType<typeof createOidcProvider>>
  port: number
  seeded: boolean
}
const test = nuxtTest.extend<Record<never, never>, { oidcLab: OidcLab }>({
  oidcLab: [
    async ({ browserName }, use) => {
      if (browserName !== 'chromium')
        throw new Error('The OIDC fixture uses a Chromium trust profile')
      const provider = await createOidcProvider(),
        port = await freeTestPort()
      Object.assign(process.env, {
        BOOKMARK_SECRET_KEY: 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=',
        DATABASE_PATH: join(mkdtempSync(join(tmpdir(), 'bp-oidc-browser-')), 'bookmark.db'),
        MIGRATIONS_FOLDER: fileURLToPath(new URL('../../drizzle', import.meta.url)),
        ADMIN_USERNAME: 'admin',
        ADMIN_PASSWORD: 'admin-pass-1',
        ADMIN_API_TOKEN: token,
        SESSION_COOKIE_SECURE: 'false',
        AUTH_TRUSTED_HEADER_ENABLED: 'false',
        LOCAL_LOGIN_ENABLED: 'false',
        BOOKMARK_FAVICON_FETCH: '0',
        BOOKMARK_MONITORS: '0',
        NUXT_TELEMETRY_DISABLED: '1',
        OIDC_DISCOVERY_URL: provider.origin,
        OIDC_CLIENT_ID: 'bookmark-test',
        OIDC_CLIENT_SECRET: 'fixture-client-secret',
        OIDC_REDIRECT_URI: `http://127.0.0.1:${port}/api/v1/auth/oidc/callback`,
        OIDC_AUTO_LOGIN: 'true',
        OIDC_PROVIDER_NAME: 'Fixture ID',
        OIDC_ROLE_MAPPING: JSON.stringify({
          'fixture-viewer': 'viewer',
          'fixture-editor': 'editor',
          'fixture-admin': 'admin',
        }),
        NODE_EXTRA_CA_CERTS: provider.caFile,
      })
      try {
        await use({ provider, port, seeded: false })
      } finally {
        await provider.close()
      }
    },
    { scope: 'worker' },
  ],
  nuxt: [
    async ({ oidcLab }, use) => {
      await use({ rootDir: fileURLToPath(new URL('../..', import.meta.url)), port: oidcLab.port })
    },
    { scope: 'worker' },
  ],
})

async function seed(base: string, request: APIRequestContext, lab: OidcLab) {
  if (lab.seeded) return
  const api = async (method: string, path: string, data: unknown) => {
    const response = await request.fetch(new URL(path, base).href, {
      method,
      headers: { authorization: 'Bearer ' + token },
      data,
    })
    expect(response.ok()).toBe(true)
  }
  await api('PATCH', '/api/v1/settings', { allTabPublic: true })
  await api('POST', '/api/v1/fields', {
    key: 'staff_note',
    label: 'Staff',
    type: 'text',
    minRoleToView: 'viewer',
    searchable: true,
    showAsColumnDefault: true,
  })
  await api('PUT', '/api/v1/scopes/oidc-browser/entries/public', {
    name: 'OIDC fixture device',
    fields: [{ key: 'staff_note', value: 'Signed-in detail' }],
  })
  lab.seeded = true
}

for (const role of ['viewer', 'editor', 'admin'] as const) {
  test(`silently signs in and shows the effective ${role} identity without an anonymous page`, async ({
    baseURL,
    request,
    oidcLab,
  }) => {
    if (!baseURL) throw new Error('Missing portal test URL')
    await seed(baseURL, request, oidcLab)
    oidcLab.provider.configure({ role, name: 'Fixture ' + role })
    const context = await oidcLab.provider.browserContext()
    try {
      await context.addCookies([
        {
          name: 'mock-sso',
          value: '1',
          url: oidcLab.provider.origin,
          secure: true,
          httpOnly: true,
          sameSite: 'Lax',
        },
      ])
      const page = await context.newPage(),
        path = '/?view=list',
        statuses: number[] = []
      const target = new URL(path, baseURL).href
      page.on('response', (response) => {
        if (response.url() === target && response.request().isNavigationRequest())
          statuses.push(response.status())
      })
      await page.goto(target, { waitUntil: 'networkidle' })
      await expect(page).toHaveURL(target)
      expect(statuses[0]).toBe(302)
      expect(statuses.at(-1)).toBe(200)
      await expect(page.getByTestId('login-button')).toHaveCount(0)
      const button = page.getByTestId('user-menu-button')
      await expect(button).toHaveAttribute(
        'title',
        `Fixture ${role} (${role[0]!.toUpperCase() + role.slice(1)})`,
      )
      await expect(page.getByText('Signed-in detail', { exact: true })).toBeVisible()
      await button.click()
      const header = page.getByTestId('user-menu-identity')
      await expect(header).toContainText('Fixture ' + role)
      await expect(header).toContainText('fixture.user@example.test')
      await expect(header).toContainText('Fixture ID')
      await expect(header.getByTestId('user-role')).toHaveText(
        role[0]!.toUpperCase() + role.slice(1),
      )
      const result = await context.request.post(new URL('/api/v1/entries', baseURL).href, {
        headers: { origin: new URL(baseURL).origin },
        data: { name: 'Role check ' + role },
      })
      expect(result.status()).toBe(role === 'viewer' ? 403 : 201)
      if (role !== 'viewer') {
        const data = await result.json()
        await context.request.delete(new URL('/api/v1/entries/' + data.entry.id, baseURL).href, {
          headers: { origin: new URL(baseURL).origin },
        })
      }
      if (role === 'admin') {
        await page.getByRole('menuitem', { name: 'Admin', exact: true }).click()
        await page.goto(new URL('/admin/users', baseURL).href, { waitUntil: 'networkidle' })
        const session = await (
          await context.request.get(new URL('/api/v1/auth/session', baseURL).href)
        ).json()
        const row = page.getByTestId('admin-user-' + session.actor.userId)
        await expect(row).toContainText('Fixture admin')
        await expect(row).toContainText('Role managed by Fixture ID; updated at every sign-in.')
        await expect(row.locator('select')).toBeDisabled()
      }
      // The browser expires the session; the next navigation renews it silently.
      const attempts = oidcLab.provider.requests.filter((item) => item.path === '/authorize').length
      await context.clearCookies({ name: 'nuxt-session' })
      await page.goto(target, { waitUntil: 'networkidle' })
      await expect(page.getByTestId('user-menu-button')).toBeVisible()
      expect(oidcLab.provider.requests.filter((item) => item.path === '/authorize').length).toBe(
        attempts + 1,
      )
    } finally {
      await context.close()
    }
  })
}

test('falls back to public viewing, prioritises explicit provider sign-in and shows safe interactive errors', async ({
  baseURL,
  request,
  oidcLab,
}) => {
  if (!baseURL) throw new Error('Missing portal test URL')
  await seed(baseURL, request, oidcLab)
  oidcLab.provider.configure({ error: 'login_required' })
  const context = await oidcLab.provider.browserContext()
  try {
    const page = await context.newPage(),
      target = new URL('/?view=list', baseURL).href
    await page.goto(target, { waitUntil: 'networkidle' })
    await expect(page.getByTestId('login-button')).toBeVisible()
    await expect(page.getByText('OIDC fixture device', { exact: true })).toBeVisible()
    await expect(page.getByText('Signed-in detail', { exact: true })).toHaveCount(0)
    await expect(page.getByTestId('sign-in-error')).toHaveCount(0)
    expect(
      (await context.cookies()).some((cookie) => cookie.name === 'bp-oidc-auto' && cookie.httpOnly),
    ).toBe(true)
    const attempts = oidcLab.provider.requests.filter((item) => item.path === '/authorize').length
    await page.reload({ waitUntil: 'networkidle' })
    expect(oidcLab.provider.requests.filter((item) => item.path === '/authorize').length).toBe(
      attempts,
    )
    await page.getByTestId('login-button').click()
    const button = page.getByTestId('oidc-sign-in')
    await expect(button).toHaveText('Sign in with Fixture ID')
    const start = new URL((await button.getAttribute('href'))!, baseURL)
    expect(start.searchParams.get('returnTo')).toBe('/?view=list')
    expect(start.searchParams.has('silent')).toBe(false)
    const box = await button.boundingBox(),
      modal = await page.getByRole('dialog').boundingBox()
    expect(box!.width).toBeGreaterThan(modal!.width * 0.75)
    await expect(page.getByTestId('login-username')).toHaveCount(0)
    oidcLab.provider.configure({ error: 'access_denied' })
    await button.click()
    await expect(page).toHaveURL(target)
    await expect(page.getByTestId('sign-in-error')).toContainText(
      'Sign-in with Fixture ID failed: access denied',
    )
    await expect(page.getByTestId('sign-in-error')).not.toContainText('Private provider diagnostic')
  } finally {
    await context.close()
  }
})

test('keeps break-glass login reachable with local login disabled and prevents immediate sign-in after sign-out', async ({
  baseURL,
  request,
  oidcLab,
}) => {
  if (!baseURL) throw new Error('Missing portal test URL')
  await seed(baseURL, request, oidcLab)
  oidcLab.provider.configure({ error: 'login_required' })
  const context = await oidcLab.provider.browserContext()
  try {
    const page = await context.newPage()
    await page.goto(baseURL, { waitUntil: 'networkidle' })
    await page.getByTestId('login-button').click()
    await page.getByRole('button', { name: 'Emergency local sign-in' }).click()
    await page.getByTestId('login-username').fill('admin')
    await page.getByTestId('login-password').fill('admin-pass-1')
    await page.getByTestId('login-submit').click()
    await page.getByTestId('user-menu-button').click()
    await expect(page.getByTestId('user-menu-identity')).toContainText('Break-glass')
    await expect(page.getByTestId('user-role')).toHaveText('Admin')
    await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click()
    await expect(page.getByTestId('login-button')).toBeVisible()
    const attempts = oidcLab.provider.requests.filter((item) => item.path === '/authorize').length
    await page.reload({ waitUntil: 'networkidle' })
    expect(oidcLab.provider.requests.filter((item) => item.path === '/authorize').length).toBe(
      attempts,
    )
    expect(
      (await context.cookies()).find((cookie) => cookie.name === 'bp-oidc-auto')?.expires,
    ).toBe(-1)
  } finally {
    await context.close()
  }
})
