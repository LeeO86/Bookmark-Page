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

test('admin: file actions are buttons, destructive actions are coloured and every section can be closed', async ({
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
  await api('POST', '/api/v1/users', {
    username: 'admin-ui-viewer',
    password: 'viewer-pass-1',
    role: 'viewer',
  })
  await api('POST', '/api/v1/fields', {
    key: 'admin_ui_note',
    label: 'Admin UI note',
    type: 'text',
    minRoleToView: 'viewer',
  })
  await api('POST', '/api/v1/namespaces', { name: 'admin-ui', label: 'Admin UI namespace' })
  await api('POST', '/api/v1/tokens', { name: 'admin-ui-token', scopes: ['read'] })
  await api('POST', '/api/v1/action-templates', {
    name: 'Admin UI action',
    requestSpec: { method: 'POST', urlTemplate: 'https://device.invalid/' },
  })

  const open = async (path: string) => {
    await page.goto(base + path, { waitUntil: 'networkidle' })
    await expect(page.getByRole('link', { name: 'Close admin portal', exact: true })).toBeVisible()
  }
  const expectButton = async (button: import('@playwright/test').Locator) => {
    await expect(button).toBeVisible()
    const painted = await button.evaluate((element) => {
      const style = getComputedStyle(element)
      return {
        padding: parseFloat(style.paddingInlineStart),
        radius: parseFloat(style.borderRadius),
        surface: style.boxShadow !== 'none' || style.backgroundColor !== 'rgba(0, 0, 0, 0)',
      }
    })
    expect(painted.padding).toBeGreaterThan(0)
    expect(painted.radius).toBeGreaterThan(0)
    expect(painted.surface).toBe(true)
  }
  const expectDanger = async (button: import('@playwright/test').Locator) => {
    await expectButton(button)
    // Check the rendered colour in both themes, independently of the instance accent.
    for (const dark of [false, true]) {
      await page.evaluate((value) => document.documentElement.classList.toggle('dark', value), dark)
      await expect
        .poll(() =>
          button.evaluate((element) => {
            const canvas = document.createElement('canvas')
            canvas.width = canvas.height = 1
            const context = canvas.getContext('2d')
            if (!context) throw new Error('Missing colour sampling context')
            context.fillStyle = getComputedStyle(element).color
            context.fillRect(0, 0, 1, 1)
            const channels = context.getImageData(0, 0, 1, 1).data
            return channels[0]! > channels[1]! + 20 && channels[0]! > channels[2]! + 20
          }),
        )
        .toBe(true)
    }
  }
  const choose = async (
    label: string,
    file: { name: string; mimeType: string; buffer: Buffer },
  ) => {
    const button = page.getByRole('button', { name: label, exact: true })
    await expectButton(button)
    const selection = page.waitForEvent('filechooser')
    await button.click()
    await (await selection).setFiles(file)
    await expect(page.getByText(file.name, { exact: true })).toBeVisible()
  }
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="currentColor"/></svg>',
  )
  await open('/admin')
  await choose('Choose logo', { name: 'admin-ui-logo.svg', mimeType: 'image/svg+xml', buffer: svg })
  await expect(page.getByText('Logo saved', { exact: true }).first()).toBeVisible()
  const fallbackRequests: string[] = []
  const observeLogo = (request: import('@playwright/test').Request) => {
    if (new URL(request.url()).pathname === '/branding/bookmark-page-icon.png')
      fallbackRequests.push(request.url())
  }
  page.on('request', observeLogo)
  await page.getByRole('link', { name: 'Close admin portal', exact: true }).click()
  await expect(page.getByTestId('site-logo')).toHaveAttribute('src', /\/api\/v1\/logo\?v=/)
  expect(fallbackRequests).toEqual([])
  page.off('request', observeLogo)
  await open('/admin')
  await choose('Choose tab icon', {
    name: 'admin-ui-tab.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4N8AAAAASUVORK5CYII=',
      'base64',
    ),
  })
  await expect(page.getByText('Tab icon saved', { exact: true }).first()).toBeVisible()
  for (const name of ['Remove logo', 'Remove tab icon']) {
    const button = page.getByRole('button', { name, exact: true })
    await expectDanger(button)
    await button.click()
    await expect(
      page
        .getByText(name === 'Remove logo' ? 'Logo removed' : 'Tab icon removed', { exact: true })
        .first(),
    ).toBeVisible()
  }

  await open('/admin/icons')
  const upload = page.getByRole('button', { name: 'Upload icon', exact: true })
  await expect(upload).toBeDisabled()
  await page.getByPlaceholder('name', { exact: true }).fill('admin-ui-icon')
  await choose('Choose icon file', {
    name: 'admin-ui-icon.svg',
    mimeType: 'image/svg+xml',
    buffer: svg,
  })
  expect((await api('GET', '/api/v1/icons?q=admin-ui-icon')).icons).toHaveLength(0)
  await upload.click()
  await expect(page.getByText('Icon uploaded', { exact: true }).first()).toBeVisible()
  const removeIcon = page.getByRole('button', { name: 'Delete icon admin-ui-icon', exact: true })
  await expectDanger(removeIcon)
  await removeIcon.click()
  await expect(removeIcon).toHaveCount(0)

  const sections = [
    ['/admin/users', 'Users and roles', 'Delete user admin-ui-viewer'],
    ['/admin/fields', 'Field definitions', 'Delete field Admin UI note'],
    ['/admin/namespaces', 'Tag namespaces', 'Delete namespace Admin UI namespace'],
    ['/admin/tokens', 'API tokens', 'Delete token admin-ui-token'],
    ['/admin/actions', 'Action templates', 'Delete template Admin UI action'],
    ['/admin/auth', 'Auth status', null],
    ['/admin/scopes', 'Ansible scopes', null],
    ['/admin/audit', 'Audit log', null],
  ] as const
  for (const [path, heading, action] of sections) {
    await open(path)
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
    if (action) await expectDanger(page.getByRole('button', { name: action, exact: true }))
  }

  await open('/admin/backup')
  const backup = await api('POST', '/api/v1/backup', { includeSecrets: false })
  await choose('Choose backup file', {
    name: 'admin-ui-backup.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(backup.archive, 'base64'),
  })
  await expectButton(page.getByRole('button', { name: 'Download backup', exact: true }))
  await page.getByLabel('Preview only', { exact: true }).uncheck()
  await expectDanger(page.getByRole('button', { name: 'Restore backup', exact: true }))
  await page.getByRole('combobox', { name: /^Mode/ }).selectOption('replace')
  await expectDanger(page.getByRole('button', { name: 'Replace data', exact: true }))
  await page.getByLabel('Preview only', { exact: true }).check()
  const previewResponse = page.waitForResponse(
    (response) =>
      response.url() === base + '/api/v1/restore' && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Preview restore', exact: true }).click()
  const preview = await previewResponse
  expect(preview.ok()).toBe(true)
  expect(preview.request().postDataJSON()).toMatchObject({ dryRun: true, mode: 'replace' })

  await open('/admin/csv')
  await choose('Choose CSV file', {
    name: 'admin-ui.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Name,Host\nAdmin UI device,10.0.0.10\n'),
  })
  await expectButton(page.getByRole('button', { name: 'Preview import', exact: true }))
  await expectButton(page.getByRole('button', { name: 'Import', exact: true }))

  const close = page.getByRole('link', { name: 'Close admin portal', exact: true })
  await close.focus()
  await close.press('Enter')
  await expect(page).toHaveURL(base + '/')
  await page.setViewportSize({ width: 390, height: 844 })
  await open('/admin/fields')
  const bounds = await close.boundingBox()
  expect(bounds).not.toBeNull()
  expect(bounds!.x).toBeGreaterThan(300)
  expect(bounds!.y).toBeLessThan(80)
  await close.click()
  await expect(page).toHaveURL(base + '/')
})

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

test('renders configured media without JavaScript and hydrates without fallback images or bootstrap requests', async ({
  page,
  goto,
  browser,
  context,
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
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#ec4899"/></svg>',
  ).toString('base64')
  await api('POST', '/api/v1/settings/logo', { contentType: 'image/svg+xml', data: svg })
  const icon = await api('POST', '/api/v1/icons', {
    name: 'ssr-media-icon',
    contentType: 'image/svg+xml',
    data: svg,
  })
  const view = await api('POST', '/api/v1/filters', {
    name: 'SSR media view',
    query: 'ssr:media',
    global: true,
    isPublic: true,
  })
  const first = await api('POST', '/api/v1/entries', {
    name: 'SSR uploaded icon',
    iconRef: `upload:${icon.id}`,
    tags: ['ssr:media'],
    links: [
      { label: 'Open', type: 'web', isPrimary: true, urlTemplate: 'https://ssr-device.invalid/' },
    ],
  })
  const second = await api('POST', '/api/v1/entries', {
    name: 'SSR Lucide icon',
    iconRef: 'lucide:camera',
    tags: ['ssr:media'],
  })
  const noScript = await browser.newContext({ javaScriptEnabled: false })
  const hydrated = await browser.newContext({
    storageState: await context.storageState(),
    timezoneId: 'Pacific/Honolulu',
  })
  try {
    const staticPage = await noScript.newPage()
    for (const mode of ['cards', 'tiles', 'list']) {
      await staticPage.goto(`${base}/?tab=${view.id}&view=${mode}`, { waitUntil: 'networkidle' })
      const logo = staticPage.getByTestId('site-logo')
      await expect(logo).toHaveAttribute('src', '/api/v1/logo?v=0')
      await expect(logo).toHaveJSProperty('naturalWidth', 16)
      const entry = staticPage.locator(`[data-entry-id="${first.entry.id}"]`)
      await expect(entry).toBeVisible()
      const image = entry.locator('img')
      await expect(image).toHaveAttribute('src', '/api/icons/upload/' + icon.id)
      await expect(image).toHaveJSProperty('naturalWidth', 16)
      const lucide = staticPage
        .locator(`[data-entry-id="${second.entry.id}"]`)
        .locator('[style*="/api/icons/lucide/camera"]')
        .first()
      await expect(lucide).toBeVisible()
      expect(await lucide.evaluate((element) => getComputedStyle(element).maskImage)).toContain(
        '/api/icons/lucide/camera',
      )
      const controlIcon = staticPage.getByTestId('view-cards').locator('.iconify')
      expect(await controlIcon.evaluate((element) => getComputedStyle(element).maskImage)).not.toBe(
        'none',
      )
    }
    const early = await hydrated.newPage()
    const unwanted: string[] = []
    const hydrationErrors: string[] = []
    early.on('console', (message) => {
      if (/hydration/i.test(message.text())) hydrationErrors.push(message.text())
    })
    early.on('request', (request) => {
      if (new URL(request.url()).pathname === '/branding/bookmark-page-icon.png')
        unwanted.push(request.url())
    })
    await hydrated.route('**/api/v1/**', async (route) => {
      const path = new URL(route.request().url()).pathname
      if (
        route.request().method() === 'GET' &&
        /^\/api\/v1\/(?:settings|auth\/session|auth\/options|filters|tags|namespaces|fields|preferences|entries)$/.test(
          path,
        )
      ) {
        unwanted.push(path)
        await route.abort()
      } else await route.continue()
    })
    const response = await early.goto(`${base}/?tab=${view.id}&view=cards`, {
      waitUntil: 'networkidle',
    })
    expect(await response!.text()).toContain('src="/api/v1/logo?v=0"')
    await expect(early.getByTestId('site-logo')).toHaveJSProperty('naturalWidth', 16)
    await expect(early.locator(`[data-entry-id="${first.entry.id}"]`)).toBeVisible()
    await early.getByTestId('view-list').click()
    await expect(early).toHaveURL(/view=list/)
    expect(unwanted).toEqual([])
    expect(hydrationErrors).toEqual([])
  } finally {
    await noScript.close()
    await hydrated.close()
    for (const id of [first.entry.id, second.entry.id])
      await api('DELETE', '/api/v1/entries/' + id, {})
    await api('DELETE', '/api/v1/filters/' + view.id, {})
    await api('DELETE', '/api/v1/icons/' + icon.id, {})
    await api('DELETE', '/api/v1/settings/logo', {})
  }
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
  const facet = page.getByRole('button', { name: /^Control Room \d+$/ })
  await facet.click()
  await expect(page.getByTestId('query-input')).toHaveValue('')
  await facet.click({ modifiers: ['Shift'] })
  await expect(page.getByTestId('query-input')).toHaveValue('group:"Control Room"')
  await facet.click({ modifiers: ['Shift'] })
  await expect(page.getByTestId('query-input')).toHaveValue('')
  await facet.click({ modifiers: ['Alt'] })
  await expect(page.getByTestId('query-input')).toHaveValue('-group:"Control Room"')
  await expect(page.getByRole('button', { name: 'Control Room 0', exact: true })).toBeVisible()
  await facet.click({ modifiers: ['Alt'] })
  await expect(page.getByTestId('query-input')).toHaveValue('')
  await page
    .getByTestId('query-input')
    .fill('group:"Control Room" group:"Control Room" group:"Control Room"')
  await facet.click()
  await expect(page.getByTestId('query-input')).toHaveValue('')
  await facet.click()
  await page.getByRole('button', { name: 'Reveal Secure primary', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Secure primary', exact: true })).toHaveAttribute(
    'href',
    'https://device.invalid/?key=browser-private',
  )
  expect((await api('GET', '/api/v1/entries/' + created.entry.id)).links[0].url).toBeNull()
  await api('DELETE', '/api/v1/filters/' + first.id)
})

test('edits and clears an expert favicon path without changing the primary link', async ({
  page,
  goto,
}) => {
  await goto('/', { waitUntil: 'networkidle' })
  await signIn(page)
  const base = new URL(page.url()).origin
  const response = await page.request.post(base + '/api/v1/entries', {
    headers: { Origin: base },
    data: {
      name: 'Expert favicon browser',
      faviconUrl: '/old/icon.svg',
      links: [
        {
          label: 'Open',
          urlTemplate: 'https://device.invalid/admin/',
          type: 'web',
          isPrimary: true,
        },
      ],
    },
  })
  expect(response.ok()).toBe(true)
  const { entry } = await response.json()
  await page.reload({ waitUntil: 'networkidle' })
  await page.keyboard.press('Shift+E')
  const edit = async () => {
    await page.locator(`[data-entry-id="${entry.id}"]`).getByTestId('edit-entry').click()
    await expect(page.getByTestId('entry-favicon-url')).toBeVisible()
  }
  const save = async () => {
    const savedResponse = page.waitForResponse(
      (r) => r.request().method() === 'PATCH' && r.url() === base + '/api/v1/entries/' + entry.id,
    )
    await page.getByTestId('save-entry').click()
    const saved = await savedResponse
    expect(saved.ok()).toBe(true)
    return (await saved.json()).entry
  }
  await edit()
  await expect(page.getByTestId('entry-favicon-url')).toHaveValue('/old/icon.svg')
  await page.getByTestId('entry-favicon-url').fill('/vendor/device-icon.png')
  const saved = await save()
  expect(saved.faviconUrl).toBe('/vendor/device-icon.png')
  expect(saved.links[0].urlTemplate).toBe('https://device.invalid/admin/')
  await page.reload({ waitUntil: 'networkidle' })
  await edit()
  await expect(page.getByTestId('entry-favicon-url')).toHaveValue('/vendor/device-icon.png')
  await page.getByTestId('entry-favicon-url').fill('')
  expect((await save()).faviconUrl).toBeNull()
  const removed = await page.request.delete(base + '/api/v1/entries/' + entry.id, {
    headers: { Origin: base },
    data: {},
  })
  expect(removed.ok()).toBe(true)
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
    // A plain HTML target avoids Chromium's background JSON-viewer load lifecycle.
    for (const url of [primary, secondary]) {
      await context.route(url, (route) =>
        route.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><title>Launcher target</title>',
        }),
      )
    }
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
      // Native background-tab closure can finish before opener focus is restored.
      await expect.poll(() => page.evaluate(() => document.hasFocus())).toBe(true)
      const link = card.getByTestId('entry-link')
      const bounds = await link.boundingBox()
      if (!bounds) throw new Error('Missing launcher anchor')
      const [popup] = await Promise.all([
        context.waitForEvent('page', { timeout: 15_000 }),
        link.click({
          position: { x: position.x - bounds.x, y: position.y - bounds.y },
          button: options.button ?? 'left',
          modifiers: options.modifier ? [options.modifier] : [],
        }),
      ])
      await expect(popup).toHaveURL(primary)
      await expect(popup).toHaveTitle('Launcher target')
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
