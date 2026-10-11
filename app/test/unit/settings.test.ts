import { describe, expect, it } from 'vitest'
import { decodeSecretKey } from '../../server/db/keys'
import { readSettings } from '../../server/db/settings'
import { testSecretKey } from '../secret'

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

describe('decodeSecretKey', () => {
  it('accepts standard Base64 that decodes to 32 bytes', () => {
    expect(decodeSecretKey(testSecretKey)).toHaveLength(32)
  })

  it('rejects a missing, blank, or wrongly sized key', () => {
    expect(() => decodeSecretKey(undefined)).toThrow('BOOKMARK_SECRET_KEY is required')
    expect(() => decodeSecretKey('')).toThrow('BOOKMARK_SECRET_KEY is required')
    expect(() => decodeSecretKey('   ')).toThrow('BOOKMARK_SECRET_KEY is required')
    expect(() => decodeSecretKey('not-base64')).toThrow('standard Base64')
    expect(() => decodeSecretKey('YQ==')).toThrow('standard Base64')
  })
})
