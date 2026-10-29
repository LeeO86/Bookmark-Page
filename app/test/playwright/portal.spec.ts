import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@nuxt/test-utils/playwright'

const directory = mkdtempSync(join(tmpdir(), 'bookmark-playwright-'))
process.env.BOOKMARK_SECRET_KEY = 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc='
process.env.DATABASE_PATH = join(directory, 'bookmark.db')
process.env.MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url))
process.env.ADMIN_USERNAME = 'admin'
process.env.ADMIN_PASSWORD = 'admin-pass-1'
process.env.SESSION_COOKIE_SECURE = 'false'
process.env.BOOKMARK_FAVICON_FETCH = '0'
process.env.BOOKMARK_MONITORS = '0'
process.env.NUXT_TELEMETRY_DISABLED = '1'

test.use({
  viewport: { width: 1440, height: 900 },
  nuxt: {
    rootDir: fileURLToPath(new URL('../..', import.meta.url)),
  },
})

test('signs in from the portal', async ({ page, goto }) => {
  await goto('/', { waitUntil: 'networkidle' })
  await expect(page.getByRole('heading', { name: 'Bookmark-Page' })).toBeVisible()
  await page.getByTestId('login-button').click()
  await page.getByTestId('login-username').fill('admin')
  await page.getByTestId('login-password').fill('admin-pass-1')
  await page.getByTestId('login-submit').click()
  const account = page.getByRole('button', { name: 'admin' })
  await expect(account).toBeVisible()
  await expect(page.getByTestId('new-entry')).toHaveCount(0)
  await account.click()
  await page.getByRole('menuitem', { name: 'Edit mode' }).click()
  await expect(page.getByTestId('new-entry')).toBeVisible()
  await account.click()
  await page.getByRole('menuitem', { name: 'Admin' }).click()
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  const backup = page.getByRole('link', { name: 'Backup' }).first()
  if (!(await backup.isVisible())) {
    await page.getByRole('button', { name: 'Open sidebar' }).click()
  }
  await backup.click()
  await expect(page.getByRole('heading', { name: 'Backup and restore' })).toBeVisible()
  await page.getByRole('button', { name: 'Download backup' }).click()
  await expect(page.getByText('Backup downloaded.').first()).toBeVisible()
  const csv = page.getByRole('link', { name: 'CSV import' }).first()
  if (!(await csv.isVisible())) {
    await page.getByRole('button', { name: 'Open sidebar' }).click()
  }
  await csv.click()
  await expect(page.getByRole('heading', { name: 'CSV import' })).toBeVisible()
  await page.locator('input[type="file"]').setInputFiles({
    name: 'devices.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Name,Host\nMixer,10.0.0.8\n'),
  })
  await page.getByRole('button', { name: 'Preview import' }).click()
  await expect(page.getByText('Preview only. Nothing was written.').first()).toBeVisible()
})

async function signIn(page: import('@playwright/test').Page) {
  await page.getByTestId('login-button').click()
  await page.getByTestId('login-username').fill('admin')
  await page.getByTestId('login-password').fill('admin-pass-1')
  await page.getByTestId('login-submit').click()
  await expect(page.getByRole('button', { name: 'admin', exact: true })).toBeVisible()
}

test('preserves advanced requests through an unchanged editor save', async ({ page, goto }) => {
  await goto('/', { waitUntil: 'networkidle' })
  await signIn(page)
  const base = new URL(page.url()).origin
  const spec = {
    method: 'POST',
    urlTemplate: 'https://device.invalid/',
    headers: { 'X-Test': '{{entry.name}}' },
    bodyTemplate: 'host={{host}}',
    tlsVerify: true,
    timeoutMs: 9000,
    expectation: {
      status: ['200'],
      bodyContains: 'ready',
      bodyRegex: null,
      jsonPath: null,
      equals: null,
    },
  }
  const response = await page.request.post(base + '/api/v1/entries', {
    headers: { Origin: base },
    data: {
      name: 'Request round-trip',
      host: 'device.invalid',
      checks: [{ name: 'HTTP', kind: 'http', requestSpec: spec }],
      actions: [{ name: 'Action', icon: 'lucide:power', requestSpec: spec }],
    },
  })
  expect(response.ok()).toBe(true)
  const created = await response.json()
  await page.keyboard.press('Shift+E')
  await page.locator(`[data-entry-id="${created.entry.id}"]`).getByTestId('edit-entry').click()
  const savedResponse = page.waitForResponse(
    (r) =>
      r.request().method() === 'PATCH' && r.url() === base + '/api/v1/entries/' + created.entry.id,
  )
  await page.getByTestId('save-entry').click()
  const saved = await (await savedResponse).json()
  expect(saved.entry.actions[0].requestSpec).toEqual(spec)
  expect(saved.entry.actions[0].icon).toBe('lucide:power')
  expect(saved.entry.checks[0].requestSpec).toEqual(spec)
})

test('manages personal views, filters spaced tags and reveals secret links', async ({
  page,
  goto,
}) => {
  await goto('/', { waitUntil: 'networkidle' })
  await signIn(page)
  const base = new URL(page.url()).origin
  const api = async (method: string, path: string, data?: unknown) => {
    const response = await page.request.fetch(base + path, {
      method,
      data,
      headers: { Origin: base },
    })
    expect(response.ok()).toBe(true)
    return response.json()
  }
  await api('POST', '/api/v1/fields', {
    key: 'browsersecret',
    label: 'Browser secret',
    type: 'secret',
    minRoleToView: 'viewer',
  })
  const created = await api('POST', '/api/v1/entries', {
    name: 'Spaced device',
    tags: ['group:Control Room'],
    fields: [{ key: 'browsersecret', value: 'browser-private' }],
    links: [
      {
        label: 'Secure primary',
        type: 'web',
        isPrimary: true,
        urlTemplate: 'https://device.invalid/?key={{field.browsersecret}}',
      },
    ],
  })
  const first = await api('POST', '/api/v1/filters', {
    name: 'Personal A',
    query: '',
    global: false,
  })
  await api('POST', '/api/v1/filters', { name: 'Personal B', query: '', global: false })
  await page.reload({ waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Edit Personal B', exact: true }).click()
  const modal = page.getByRole('dialog')
  await modal.getByRole('button', { name: 'Move up', exact: true }).click()
  await expect
    .poll(async () => {
      const views = await api('GET', '/api/v1/filters')
      return views.filters
        .filter((f: { ownerUserId: string | null }) => f.ownerUserId)
        .map((f: { name: string }) => f.name)
    })
    .toEqual(['Personal B', 'Personal A'])
  await modal.locator('input').fill('Personal renamed')
  await modal.getByRole('button', { name: 'Rename', exact: true }).click()
  await page.getByRole('button', { name: 'Edit Personal renamed', exact: true }).click()
  await modal.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Edit Personal renamed', exact: true }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: 'Control Room 1', exact: true }).click()
  await expect(page.locator(`[data-entry-id="${created.entry.id}"]`)).toBeVisible()
  await expect(page.getByTestId('query-input')).toHaveValue('group:"Control Room"')
  await page.getByRole('button', { name: 'Reveal Secure primary', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Secure primary', exact: true })).toHaveAttribute(
    'href',
    'https://device.invalid/?key=browser-private',
  )
  expect((await api('GET', '/api/v1/entries/' + created.entry.id)).links[0].url).toBeNull()
  await api('DELETE', '/api/v1/filters/' + first.id)
})
