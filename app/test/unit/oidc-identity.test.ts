import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { afterEach, expect, it } from 'vitest'
import { anonymousActor } from '../../server/auth/permissions'
import { parseRuntimeEnv, installRuntimeEnv } from '../../server/config/env'
import { authOptions, authStatus } from '../../server/auth/status'
import { bootApplication } from '../../server/db/boot'
import { closeDatabase, getDatabase } from '../../server/db/client'
import { users } from '../../server/db/schema'
import { createBackup } from '../../server/backup/export'
import { restoreBackup } from '../../server/backup/restore'
import { testSecretKey } from '../secret'

let directory = ''
const admin = { ...anonymousActor, role: 'admin' as const, kind: 'user' as const }
afterEach(() => {
  closeDatabase()
  if (directory) rmSync(directory, { recursive: true, force: true })
  installRuntimeEnv(process.env)
})
it('keeps automatic sign-in off by default and exposes only the configured provider label publicly', () => {
  expect(parseRuntimeEnv({})).toMatchObject({
    oidcAutoLogin: false,
    oidcAutoLoginRetrySeconds: 3600,
    oidcProviderName: 'OpenID',
  })
  installRuntimeEnv({ OIDC_AUTO_LOGIN: 'true' })
  expect(authStatus().oidcAutoLogin).toBe(false)
  installRuntimeEnv({
    OIDC_AUTO_LOGIN: 'true',
    OIDC_DISCOVERY_URL: 'https://idp.example',
    OIDC_CLIENT_ID: 'fixture',
    OIDC_CLIENT_SECRET: 'fixture-only-secret',
    OIDC_REDIRECT_URI: 'https://portal.example/api/v1/auth/oidc/callback',
    OIDC_PROVIDER_NAME: 'Fixture ID',
  })
  expect(authStatus().oidcAutoLogin).toBe(true)
  expect(authOptions()).toEqual({
    localLoginEnabled: true,
    oidcEnabled: true,
    oidcProviderName: 'Fixture ID',
  })
})
it.each(['0', '-1', 'abc', '2592001'])('rejects invalid automatic retry duration %s', (value) => {
  expect(() => parseRuntimeEnv({ OIDC_AUTO_LOGIN_RETRY_SECONDS: value })).toThrow(
    'OIDC_AUTO_LOGIN_RETRY_SECONDS',
  )
})
it('rejects control characters in a provider name', () => {
  expect(() => parseRuntimeEnv({ OIDC_PROVIDER_NAME: 'Provider\nInjected' })).toThrow(
    'OIDC_PROVIDER_NAME',
  )
})
async function boot() {
  directory = mkdtempSync(join(tmpdir(), 'bp-oidc-backup-'))
  await bootApplication({
    secretKey: testSecretKey,
    databasePath: join(directory, 'bookmark.db'),
    migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)),
  })
  getDatabase()
    .insert(users)
    .values({
      id: 'identity-user',
      username: 'identity-user',
      displayName: 'Fixture Display Name',
      oidcRoleDiagnostics: {
        issuer: 'https://idp.example',
        subject: 'fixture-user',
        claim: 'roles',
        values: ['fixture-admin'],
        matched: true,
        truncated: false,
        ignoredNonStringValues: false,
        receivedAt: '2026-11-06T12:00:00.000Z',
      },
      role: 'admin',
      authSource: 'oidc',
      oidcIssuer: 'https://idp.example',
      oidcSubject: 'fixture-user',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .run()
}
it.each(['merge', 'replace'] as const)(
  'preserves the OIDC display name through %s backup restore',
  async (mode) => {
    await boot()
    const archive = createBackup(admin, false, undefined)
    getDatabase().update(users).set({ displayName: 'Changed after backup' }).run()
    restoreBackup(admin, archive, mode, false, undefined)
    expect(getDatabase().select().from(users).get()?.displayName).toBe('Fixture Display Name')
    expect(getDatabase().select().from(users).get()?.oidcRoleDiagnostics?.values).toEqual([
      'fixture-admin',
    ])
  },
)
it('restores a pre-display-name format-1 archive with a nullable fallback', async () => {
  await boot()
  const files = unzipSync(createBackup(admin, false, undefined))
  const document = JSON.parse(strFromU8(files['backup.json']!))
  for (const user of document.users) {
    delete user.displayName
    delete user.oidcRoleDiagnostics
  }
  files['backup.json'] = strToU8(JSON.stringify(document))
  restoreBackup(admin, zipSync(files), 'replace', false, undefined)
  expect(getDatabase().select().from(users).get()?.displayName).toBeNull()
  expect(getDatabase().select().from(users).get()?.oidcRoleDiagnostics).toBeNull()
})
