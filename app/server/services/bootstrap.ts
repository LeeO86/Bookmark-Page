import { installRuntimeEnv } from '../config/env'
import { getDatabase } from '../db/client'
import { newId, now } from '../db/ids'
import { eq } from 'drizzle-orm'
import { hashToken } from './catalog'
import { apiTokens, users } from '../db/schema'
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
  reconcileBootstrapToken(env.adminApiToken, env.adminUsername)
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

/** Reconcile only the token explicitly marked as environment-managed. */
export function reconcileBootstrapToken(secret: string | undefined, username?: string): void {
  const db = getDatabase()
  const previous = db.select().from(apiTokens).where(eq(apiTokens.managedBy, 'bootstrap')).get()
  const system = { kind: 'system' as const, userId: null, tokenId: null, label: 'system' }
  if (!secret) {
    if (previous) {
      db.delete(apiTokens).where(eq(apiTokens.id, previous.id)).run()
      writeAudit(system, 'token.bootstrap.remove', 'token', previous.id, {})
    }
    return
  }
  const owner = db
    .select()
    .from(users)
    .all()
    .find(
      (user) => user.role === 'admin' && (username ? user.username === username : user.breakGlass),
    )
  if (!owner)
    throw new Error(
      'ADMIN_API_TOKEN needs an existing admin selected by ADMIN_USERNAME or a break-glass admin',
    )
  const tokenHash = hashToken(secret)
  if (previous?.tokenHash === tokenHash && previous.userId === owner.id) return
  const timestamp = now()
  const id = previous?.id ?? newId()
  const values = {
    userId: owner.id,
    name: 'bootstrap',
    tokenHash,
    scopes: ['admin'] as Array<'admin'>,
    expiresAt: null,
    managedBy: 'bootstrap',
    lastUsedAt: null,
    updatedAt: timestamp,
    updatedBy: null,
  }
  if (previous) db.update(apiTokens).set(values).where(eq(apiTokens.id, id)).run()
  else
    db.insert(apiTokens)
      .values({ id, ...values, createdAt: timestamp, createdBy: null })
      .run()
  writeAudit(
    system,
    previous ? 'token.bootstrap.replace' : 'token.bootstrap.create',
    'token',
    id,
    {},
  )
}
