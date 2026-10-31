import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { entryWriteSchema } from '../../shared/contracts'
import { initialPortalFilter } from '../../shared/portal'
import type { Actor } from '../../server/auth/permissions'
import { anonymousActor } from '../../server/auth/permissions'
import { bootApplication } from '../../server/db/boot'
import { closeDatabase, getDatabase } from '../../server/db/client'
import { clearSecretKey } from '../../server/db/keys'
import { faviconCache } from '../../server/db/schema'
import { createFieldDefinition, createFilter } from '../../server/services/catalog'
import { createEntry } from '../../server/services/entries'
import { initialPortal } from '../../server/services/portal'
import { publicSettings, saveLogo } from '../../server/services/settings'
import { testSecretKey } from '../secret'

const admin: Actor = { ...anonymousActor, role: 'admin', kind: 'user', label: 'admin' }
const preferences = {
  colourMode: null,
  viewModes: {},
  groupModes: {},
  facetsOpen: false,
  sidebarCollapsed: false,
  tileSize: 'regular' as const,
}
let directory = ''
afterEach(() => {
  closeDatabase()
  clearSecretKey()
  if (directory) rmSync(directory, { force: true, recursive: true })
})

describe('initial server-rendered portal data', () => {
  it('starts with configured branding and the visible cached image URL, with role redaction', async () => {
    await boot()
    saveLogo(
      'image/svg+xml',
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>').toString(
        'base64',
      ),
      null,
    )
    createFieldDefinition(admin, {
      key: 'admin_note',
      label: 'Admin note',
      type: 'text',
      minRoleToView: 'admin',
      searchable: true,
      showAsColumnDefault: true,
      sort: 0,
    })
    createFieldDefinition(admin, {
      key: 'password',
      label: 'Password',
      type: 'secret',
      minRoleToView: 'viewer',
      searchable: false,
      showAsColumnDefault: false,
      sort: 1,
    })
    createFilter(admin, {
      name: 'Public',
      query: 'group:public',
      global: true,
      isPublic: true,
      columns: [],
      sort: 0,
    })
    createEntry(
      admin,
      entryWriteSchema.parse({
        name: 'Visible device',
        tags: ['group:public'],
        links: [
          { label: 'Open', urlTemplate: 'https://device.invalid/', type: 'web', isPrimary: true },
        ],
        fields: [
          { key: 'admin_note', value: 'restricted metadata' },
          { key: 'password', value: 'never serialize plaintext' },
        ],
      }),
    )
    createEntry(
      admin,
      entryWriteSchema.parse({
        name: 'Hidden device',
        tags: ['group:hidden'],
        iconRef: 'lucide:key',
      }),
    )
    getDatabase()
      .insert(faviconCache)
      .values({
        id: 'cached-icon',
        origin: 'https://device.invalid',
        status: 'ok',
        mediaType: 'image/svg+xml',
        data: Buffer.from('<svg/>'),
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .run()
    const guest = initialPortal(anonymousActor, { q: '', tab: '' }, publicSettings(), preferences)
    expect(guest.settings.hasLogo).toBe(true)
    expect(guest.entries.map((entry) => entry.name)).toEqual(['Visible device'])
    expect(guest.entries[0]?.iconUrl).toBe('/api/icons/favicon/cached-icon')
    expect(JSON.stringify(guest)).not.toMatch(
      /Hidden device|restricted metadata|never serialize plaintext|Admin note|Password|lucide:key/,
    )
    const privileged = initialPortal(admin, { q: '', tab: '' }, publicSettings(), preferences)
    expect(privileged.entries).toHaveLength(2)
    expect(JSON.stringify(privileged)).toContain('restricted metadata')
    expect(JSON.stringify(privileged)).not.toContain('never serialize plaintext')
    expect(privileged.actor).not.toHaveProperty('tokenScopes')
    expect(privileged.actor).not.toHaveProperty('tokenId')
  })

  it('combines the selected public filter and query without widening anonymous visibility', async () => {
    await boot()
    const view = createFilter(admin, {
      name: 'Public',
      query: 'group:public',
      global: true,
      isPublic: true,
      columns: [],
      sort: 0,
    })
    createEntry(admin, entryWriteSchema.parse({ name: 'Public', tags: ['group:public'] }))
    createEntry(admin, entryWriteSchema.parse({ name: 'Private', tags: ['group:private'] }))
    const data = initialPortal(
      anonymousActor,
      { q: 'group:public OR group:private', tab: view.id },
      publicSettings(),
      preferences,
    )
    expect(data.entries.map((entry) => entry.name)).toEqual(['Public'])
    const invalid = initialPortal(
      anonymousActor,
      { q: '(', tab: view.id },
      publicSettings(),
      preferences,
    )
    expect(invalid.entries).toEqual([])
    expect(invalid.queryError).toBeTruthy()
  })

  it('uses the same permitted default filter and grouping before and after hydration', async () => {
    await boot()
    const view = createFilter(admin, {
      name: 'Public',
      query: '',
      global: true,
      isPublic: true,
      columns: [],
      groupBy: 'room',
      viewMode: 'tiles',
      sort: 0,
    })
    const data = initialPortal(anonymousActor, { q: '', tab: 'not-permitted' }, publicSettings(), {
      ...preferences,
      groupModes: { [view.id]: 'vendor' },
    })
    expect(initialPortalFilter(data.filters, 'not-permitted', false)?.id).toBe(view.id)
    expect(data.groupBy).toBe('vendor')
    expect(data.filters[0]?.viewMode).toBe('tiles')
    expect(initialPortalFilter(data.filters, 'not-permitted', true)).toBeNull()
  })
})

async function boot() {
  directory = mkdtempSync(join(tmpdir(), 'bookmark-portal-ssr-'))
  await bootApplication({
    secretKey: testSecretKey,
    databasePath: join(directory, 'bookmark.db'),
    migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)),
  })
}
