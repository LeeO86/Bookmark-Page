import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sql } from 'drizzle-orm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bootApplication } from '../../server/db/boot'
import { closeDatabase, getDatabase } from '../../server/db/client'
import { pingDatabase } from '../../server/db/health'
import type { AppSettings } from '../../server/db/settings'

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url))
const directories: string[] = []

afterEach(() => {
  closeDatabase()
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('bootApplication', () => {
  it('opens a WAL database, migrates once, and answers a ping', () => {
    const settings = tempSettings('test-secret')
    bootApplication(settings)
    bootApplication(settings)

    const database = getDatabase()
    expect(database.$client.pragma('journal_mode', { simple: true })).toBe('wal')
    expect(pingDatabase(database)).toBe('ok')
    const rows: unknown = database.all(sql`select id from __drizzle_migrations`)
    expect(Array.isArray(rows)).toBe(true)
    if (Array.isArray(rows)) {
      expect(rows).toHaveLength(1)
    }
  })

  it('exits when the secret is missing and does not print the key', () => {
    const settings = tempSettings('   ')
    const logged = captureExit(() => bootApplication(settings))
    expect(logged).toContain('BOOKMARK_SECRET_KEY is required')
    expect(logged).not.toContain('super-secret-value')
  })

  it('exits when the database path cannot be created', () => {
    const directory = mkdtempSync(join(tmpdir(), 'bookmark-boot-'))
    directories.push(directory)
    const blocker = join(directory, 'not-a-directory')
    writeFileSync(blocker, 'file')
    const logged = captureExit(() =>
      bootApplication({
        secretKey: 'super-secret-value',
        databasePath: join(blocker, 'bookmark.db'),
        migrationsFolder,
      }),
    )
    expect(logged).not.toContain('super-secret-value')
  })
})

function tempSettings(secretKey: string): AppSettings {
  const directory = mkdtempSync(join(tmpdir(), 'bookmark-boot-'))
  directories.push(directory)
  return {
    secretKey,
    databasePath: join(directory, 'bookmark.db'),
    migrationsFolder,
  }
}

function captureExit(run: () => void): string {
  const lines: string[] = []
  const exit = vi.spyOn(process, 'exit').mockImplementation((code?: number): never => {
    throw new Error(`exit:${String(code)}`)
  })
  const error = vi.spyOn(console, 'error').mockImplementation((message: unknown) => {
    lines.push(String(message))
  })
  try {
    expect(run).toThrow('exit:1')
  } finally {
    exit.mockRestore()
    error.mockRestore()
  }
  return lines.join('\n')
}
