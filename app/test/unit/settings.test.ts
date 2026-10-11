import { describe, expect, it } from 'vitest'
import { assertSecretKey, readSettings } from '../../server/db/settings'

describe('readSettings', () => {
  it('defaults the database path and migrations folder', () => {
    expect(readSettings({}, '/srv/app')).toEqual({
      secretKey: undefined,
      databasePath: '/data/bookmark.db',
      migrationsFolder: '/srv/app/drizzle',
    })
  })

  it('ignores blank paths', () => {
    expect(
      readSettings(
        {
          DATABASE_PATH: '   ',
          MIGRATIONS_FOLDER: ' ',
          BOOKMARK_SECRET_KEY: 'present',
        },
        '/srv/app',
      ),
    ).toEqual({
      secretKey: 'present',
      databasePath: '/data/bookmark.db',
      migrationsFolder: '/srv/app/drizzle',
    })
  })

  it('uses configured paths', () => {
    expect(
      readSettings({
        DATABASE_PATH: '/tmp/custom.db',
        MIGRATIONS_FOLDER: '/migrations',
        BOOKMARK_SECRET_KEY: 'abc',
      }),
    ).toEqual({
      secretKey: 'abc',
      databasePath: '/tmp/custom.db',
      migrationsFolder: '/migrations',
    })
  })
})

describe('assertSecretKey', () => {
  it('accepts a non-empty key', () => {
    expect(() => assertSecretKey('test-secret')).not.toThrow()
  })

  it('rejects a missing or blank key', () => {
    expect(() => assertSecretKey(undefined)).toThrow('BOOKMARK_SECRET_KEY is required')
    expect(() => assertSecretKey('')).toThrow('BOOKMARK_SECRET_KEY is required')
    expect(() => assertSecretKey('   ')).toThrow('BOOKMARK_SECRET_KEY is required')
  })
})
