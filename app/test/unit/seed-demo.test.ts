import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { eq } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { bootApplication } from '../../server/db/boot'
import { closeDatabase, getDatabase } from '../../server/db/client'
import { clearSecretKey } from '../../server/db/keys'
import { entries, filters } from '../../server/db/schema'
import { seedDemo } from '../../server/demo/seed'
import { testSecretKey } from '../secret'

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url))
const directories: string[] = []

afterEach(() => {
  clearSecretKey()
  closeDatabase()
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('seedDemo', () => {
  it('loads a studio start page and can be run again', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'bookmark-demo-'))
    directories.push(directory)
    process.env.ADMIN_USERNAME = 'admin'
    process.env.ADMIN_PASSWORD = 'admin-pass-1'
    process.env.BOOKMARK_FAVICON_FETCH = '0'
    process.env.BOOKMARK_MONITORS = '0'
    await bootApplication({
      secretKey: testSecretKey,
      databasePath: join(directory, 'bookmark.db'),
      migrationsFolder,
    })

    const first = seedDemo()
    const second = seedDemo()
    expect(first.entries).toBeGreaterThanOrEqual(40)
    expect(second.entries).toBe(first.entries)
    expect(getDatabase().select().from(entries).all()).toHaveLength(first.entries)

    const tabs = getDatabase().select().from(filters).where(eq(filters.isPublic, true)).all()
    expect(tabs.map((tab) => tab.name).sort()).toEqual(['Audio desk', 'Control rooms'])
    expect(tabs.every((tab) => tab.viewMode === 'cards' && tab.groupBy === 'room')).toBe(true)

    const listed = await import('../../server/services/entries').then((module) =>
      module.listEntries(
        {
          role: 'admin',
          userId: null,
          tokenId: null,
          tokenScopes: [],
          kind: 'user',
          label: 'admin',
        },
        '',
      ),
    )
    const states = listed.entries.map((entry) => entry.status)
    expect(states).toContain('up')
    expect(states).toContain('down')
    expect(states).toContain('unknown')
    expect(states).toContain(null)
    const secret = listed.entries
      .flatMap((entry) => entry.fields)
      .find((field) => field.key === 'password')
    expect(secret?.masked).toBe(true)
    expect(secret?.value).toBeNull()
  })
})
