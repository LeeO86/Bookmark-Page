import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { bootApplication } from '../../server/db/boot'
import { closeDatabase, getDatabase } from '../../server/db/client'
import { handleHealth, pingDatabase } from '../../server/db/health'

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url))
const directories: string[] = []

afterEach(() => {
  closeDatabase()
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('handleHealth', () => {
  it('returns 200 when the database answers', () => {
    const directory = mkdtempSync(join(tmpdir(), 'bookmark-health-'))
    directories.push(directory)
    bootApplication({
      secretKey: 'test-secret',
      databasePath: join(directory, 'bookmark.db'),
      migrationsFolder,
    })

    expect(handleHealth(getDatabase())).toEqual({
      statusCode: 200,
      body: { status: 'ok', database: 'ok' },
    })
  })

  it('returns 503 when the database is closed or missing', () => {
    const directory = mkdtempSync(join(tmpdir(), 'bookmark-health-'))
    directories.push(directory)
    bootApplication({
      secretKey: 'test-secret',
      databasePath: join(directory, 'bookmark.db'),
      migrationsFolder,
    })
    const database = getDatabase()
    database.$client.close()

    expect(pingDatabase(database)).toBe('error')
    expect(handleHealth(database)).toEqual({
      statusCode: 503,
      body: { status: 'error', database: 'error' },
    })
    expect(handleHealth(undefined)).toEqual({
      statusCode: 503,
      body: { status: 'error', database: 'error' },
    })
  })
})
