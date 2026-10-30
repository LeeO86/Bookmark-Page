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

test('renders UI icons and loads fonts without external browser requests', async ({
  page,
  goto,
  context,
  baseURL,
}) => {
  if (!baseURL) throw new Error('Missing local test server URL')
  const origin = new URL(baseURL).origin
  const external: string[] = []
  await context.route('**/*', async (route) => {
    if (new URL(route.request().url()).origin === origin) await route.continue()
    else {
      external.push(route.request().url())
      await route.abort()
    }
  })
  await goto('/', { waitUntil: 'networkidle' })
  for (const view of ['cards', 'tiles', 'list']) {
    const icon = page.getByTestId('view-' + view).locator('.iconify')
    await expect(icon).toBeVisible()
    await expect
      .poll(() => icon.evaluate((element) => getComputedStyle(element).maskImage))
      .not.toBe('none')
  }
  const fonts = await page.evaluate(async () => {
    const faces = [...document.fonts].filter(
      (font) => font.family.replace(/^['"]|['"]$/g, '') === 'Inter Variable',
    )
    await Promise.all(faces.map((font) => font.load()))
    return faces.length
  })
  expect(fonts).toBeGreaterThan(0)
  expect(external).toEqual([])
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

test('uses the bundled banner icon and preserves custom logo precedence', async ({
  page,
  goto,
}) => {
  await goto('/', { waitUntil: 'networkidle' })
  const logo = page.getByTestId('site-logo')
  const bundled = '/branding/bookmark-page-icon.png'
  await expect(logo).toHaveAttribute('src', bundled)
  await expect
    .poll(() =>
      logo.evaluate(
        (image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
      ),
    )
    .toBe(true)
  await signIn(page)
  const base = new URL(page.url()).origin
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#ec4899"/></svg>'
  const uploaded = await page.request.post(base + '/api/v1/settings/logo', {
    headers: { Origin: base },
    data: { contentType: 'image/svg+xml', data: Buffer.from(svg).toString('base64') },
  })
  expect(uploaded.ok()).toBe(true)
  await page.reload({ waitUntil: 'networkidle' })
  await expect(logo).toHaveAttribute('src', /\/api\/v1\/logo\?v=/)
  await expect(logo).toHaveJSProperty('naturalWidth', 16)
  const removed = await page.request.delete(base + '/api/v1/settings/logo', {
    headers: { Origin: base },
    data: {},
  })
  expect(removed.ok()).toBe(true)
  await page.reload({ waitUntil: 'networkidle' })
  await expect(logo).toHaveAttribute('src', bundled)
  await expect
    .poll(() =>
      logo.evaluate(
        (image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
      ),
    )
    .toBe(true)
})

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

for (const view of ['cards', 'tiles'] as const) {
  test(`${view}: whole launcher opens its primary link and modifiers preserve selection and controls`, async ({
    page,
    goto,
    context,
  }) => {
    await goto('/', { waitUntil: 'networkidle' })
    await signIn(page)
    const base = new URL(page.url()).origin
    const primary = base + '/api/health?launcher=' + view
    const secondary = base + '/api/health?secondary=' + view
    const response = await page.request.post(base + '/api/v1/entries', {
      headers: { Origin: base },
      data: {
        name: `Launcher ${view}`,
        host: `${view}.example.invalid`,
        iconRef: 'lucide:camera',
        description: 'Selectable launcher description',
        links: [
          { label: 'Main', urlTemplate: primary, type: 'web', isPrimary: true },
          { label: 'Secondary', urlTemplate: secondary, type: 'web', isPrimary: false },
        ],
      },
    })
    expect(response.ok()).toBe(true)
    const { entry } = await response.json()
    await page.goto(`${base}/?q=Launcher&view=${view}`, { waitUntil: 'networkidle' })
    const card = page.locator(`[data-entry-id="${entry.id}"]`)
    const title = card.getByTestId('entry-title')
    const icon = card.getByTestId('entry-favicon')
    const center = async (locator: import('@playwright/test').Locator) => {
      const box = await locator.boundingBox()
      if (!box) throw new Error('Missing launcher target')
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    }
    const openAt = async (
      position: { x: number; y: number },
      options: { button?: 'left' | 'middle'; modifier?: 'Alt' | 'Control' | 'Meta' } = {},
    ) => {
      // Restore real user focus after closing the previous native tab/window.
      await page.bringToFront()
      const popupPromise = context.waitForEvent('page', { timeout: 15_000 })
      if (options.modifier) await page.keyboard.down(options.modifier)
      try {
        await page.mouse.click(position.x, position.y, { button: options.button ?? 'left' })
      } finally {
        if (options.modifier) await page.keyboard.up(options.modifier)
      }
      const popup = await popupPromise
      await expect(popup).toHaveURL(primary)
      await popup.waitForLoadState()
      expect(await popup.evaluate(() => window.opener === null)).toBe(true)
      await popup.close()
    }
    // Physical coordinates exercise actual browser hit-testing through overlaid text/icons.
    await openAt(await center(icon))
    await openAt(await center(title))
    const box = await card.boundingBox()
    if (!box) throw new Error('Missing card')
    await openAt({ x: box.x + box.width - 4, y: box.y + box.height / 2 })
    if (view === 'cards')
      await openAt(
        await center(card.locator('p').filter({ hasText: 'Selectable launcher description' })),
      )
    await openAt(await center(title), { button: 'middle' })
    await openAt(await center(icon), {
      modifier: process.platform === 'darwin' ? 'Meta' : 'Control',
    })
    await page.evaluate(() => {
      const calls: Array<string | undefined> = []
      Object.defineProperty(window, 'launcherWindowFeatures', { value: calls, configurable: true })
      const original = window.open.bind(window)
      window.open = (url, target, features) => {
        calls.push(features)
        return original(url, target, features)
      }
    })
    await openAt(await center(title), { modifier: 'Alt' })
    const features = await page.evaluate(
      () => (window as unknown as { launcherWindowFeatures: Array<string> }).launcherWindowFeatures,
    )
    expect(features).toHaveLength(1)
    expect(features[0]).toContain('popup=yes')
    expect(features[0]).toContain('noopener')
    expect(features[0]).toContain('noreferrer')
    const pagesBefore = context.pages().length
    await page.keyboard.down('Shift')
    await expect(card).toHaveClass(/selecting-text/)
    const point = await center(title)
    await page.mouse.click(point.x, point.y)
    await page.mouse.click(point.x, point.y, { clickCount: 3 })
    expect(await page.evaluate(() => window.getSelection()?.toString())).toContain('Launcher')
    expect(context.pages()).toHaveLength(pagesBefore)
    await page.keyboard.up('Shift')
    await expect(card).not.toHaveClass(/selecting-text/)
    await page.evaluate(() => window.getSelection()?.removeAllRanges())
    const secondPage = context.waitForEvent('page', { timeout: 15_000 })
    await card.locator(`a[href="${secondary}"]`).click()
    const second = await secondPage
    await second.waitForURL(secondary)
    await second.close()
    await card.locator(`a[href="${secondary}"]`).focus()
    const secondaryKeyboardPage = context.waitForEvent('page', { timeout: 15_000 })
    await page.keyboard.press('Enter')
    const secondaryKeyboard = await secondaryKeyboardPage
    await secondaryKeyboard.waitForURL(secondary)
    await secondaryKeyboard.close()
    expect(context.pages()).toHaveLength(pagesBefore)
    await page.keyboard.press('Shift+E')
    await card.getByTestId('edit-entry').click()
    await expect(page.getByTestId('entry-name')).toHaveValue(`Launcher ${view}`)
    expect(context.pages()).toHaveLength(pagesBefore)
    await page.keyboard.press('Escape')
    await page.keyboard.press('Shift+E')
    await card.getByTestId('entry-link').focus()
    const keyboardPage = context.waitForEvent('page', { timeout: 15_000 })
    await page.keyboard.press('Enter')
    const keyboard = await keyboardPage
    await keyboard.waitForURL(primary)
    await keyboard.close()
  })
}
