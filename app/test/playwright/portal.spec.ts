import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@nuxt/test-utils/playwright'

const directory = join(tmpdir(), 'bookmark-playwright')
mkdirSync(directory, { recursive: true })
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
  nuxt: {
    rootDir: fileURLToPath(new URL('../..', import.meta.url)),
  },
})

test('signs in from the portal', async ({ page, goto }) => {
  await goto('/')
  await expect(page.getByRole('heading', { name: 'Bookmark-Page' })).toBeVisible()
  await page.getByTestId('login-button').click()
  await page.getByTestId('login-username').fill('admin')
  await page.getByTestId('login-password').fill('admin-pass-1')
  await page.getByTestId('login-submit').click()
  await expect(page.getByTestId('new-entry')).toBeVisible()
  await page.getByRole('link', { name: 'Admin' }).click()
  await page.getByRole('link', { name: 'Backup' }).first().click()
  await expect(page.getByRole('heading', { name: 'Backup and restore' })).toBeVisible()
  await page.getByRole('button', { name: 'Download backup' }).click()
  await expect(page.getByText('Backup downloaded.').first()).toBeVisible()
  await page.getByRole('link', { name: 'CSV import' }).first().click()
  await expect(page.getByRole('heading', { name: 'CSV import' })).toBeVisible()
  await page.locator('input[type="file"]').setInputFiles({
    name: 'devices.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Name,Host\nMixer,10.0.0.8\n'),
  })
  await page.getByRole('button', { name: 'Preview import' }).click()
  await expect(page.getByText('Preview only. Nothing was written.').first()).toBeVisible()
})
