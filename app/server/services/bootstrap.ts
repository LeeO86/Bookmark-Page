import { installRuntimeEnv } from '../config/env'
import { getDatabase } from '../db/client'
import { newId, now } from '../db/ids'
import { users } from '../db/schema'
import { hashPassword, minimumPasswordLength } from '../auth/passwords'
import { purgeAudit, writeAudit } from './audit'
import { seedSettings } from './settings'

export async function bootstrap(): Promise<void> {
  const env = installRuntimeEnv(process.env)
  if (env.trustedHeaderEnabled && env.trustedProxies.length === 0) {
    console.warn(
      'Trusted header authentication is enabled without AUTH_TRUSTED_PROXIES. Headers will be ignored.',
    )
  }
  if (Boolean(env.adminUsername) !== Boolean(env.adminPassword)) {
    throw new Error('ADMIN_USERNAME and ADMIN_PASSWORD must be set together')
  }
  seedSettings(getDatabase(), env.auditRetentionDays)
  await ensureBootstrapAdmin(env.adminUsername, env.adminPassword)
  purgeAudit()
}

async function ensureBootstrapAdmin(
  username: string | undefined,
  password: string | undefined,
): Promise<void> {
  if (!username || !password) {
    return
  }
  if (getDatabase().select().from(users).all().length > 0) {
    return
  }
  if (password.length < minimumPasswordLength) {
    throw new Error(`ADMIN_PASSWORD must be at least ${minimumPasswordLength} characters`)
  }
  const timestamp = now()
  const id = newId()
  const passwordHash = await hashPassword(password)
  getDatabase()
    .insert(users)
    .values({
      id,
      username,
      email: null,
      passwordHash,
      role: 'admin',
      breakGlass: true,
      authSource: 'local',
      oidcIssuer: null,
      oidcSubject: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy: null,
      updatedBy: null,
    })
    .run()
  writeAudit(
    { kind: 'system', userId: null, tokenId: null, label: 'system' },
    'user.bootstrap',
    'user',
    id,
    { username },
  )
}
