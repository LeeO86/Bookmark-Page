import { getRequestHeader, getRequestIP, getSession } from 'nuxt/server'
import type { RequestEvent } from 'nuxt/schema'
import { sessionConfig, type AppSession } from './session'
import { eq } from 'drizzle-orm'
import { getRuntimeEnv, mapClaimToRole } from '../config/env'
import { getDatabase } from '../db/client'
import { newId, now } from '../db/ids'
import { apiTokens, users } from '../db/schema'
import { unauthorized } from '../http/errors'
import { hashToken } from '../services/catalog'
import { anonymousActor, type Actor } from './permissions'
import { ipInCidrs, normalizeIp } from './proxy'

export async function resolveActor(event: RequestEvent): Promise<Actor> {
  const bearer = bearerToken(getRequestHeader(event, 'authorization'))
  if (bearer) {
    return actorFromToken(bearer)
  }
  const headerActor = actorFromTrustedHeader(event)
  if (headerActor) {
    return headerActor
  }
  const session = await getSession<AppSession>(event, sessionConfig())
  if (!session.data.userId) {
    return anonymousActor
  }
  const user = getDatabase().select().from(users).where(eq(users.id, session.data.userId)).get()
  if (!user) {
    return anonymousActor
  }
  return {
    role: user.role,
    userId: user.id,
    tokenId: null,
    tokenScopes: [],
    kind: 'user',
    label: user.username,
  }
}

export function peerIp(event: RequestEvent): string {
  const address = getRequestIP(event)
  return address ? normalizeIp(address) : 'unknown'
}

function actorFromToken(token: string): Actor {
  const row = getDatabase()
    .select()
    .from(apiTokens)
    .where(eq(apiTokens.tokenHash, hashToken(token)))
    .get()
  if (!row) {
    throw unauthorized('Invalid API token')
  }
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
    throw unauthorized('API token has expired')
  }
  const user = getDatabase().select().from(users).where(eq(users.id, row.userId)).get()
  if (!user) {
    throw unauthorized('Invalid API token')
  }
  const timestamp = now()
  getDatabase()
    .update(apiTokens)
    .set({ lastUsedAt: timestamp, updatedAt: timestamp })
    .where(eq(apiTokens.id, row.id))
    .run()
  return {
    role: user.role,
    userId: user.id,
    tokenId: row.id,
    tokenScopes: row.scopes,
    kind: 'token',
    label: `${user.username}:${row.name}`,
  }
}

function actorFromTrustedHeader(event: RequestEvent): Actor | null {
  const env = getRuntimeEnv()
  if (!env.trustedHeaderEnabled) {
    return null
  }
  const peer = getRequestIP(event)
  if (!peer || !ipInCidrs(peer, env.trustedProxies)) {
    return null
  }
  const username = getRequestHeader(event, env.userHeader)?.trim()
  if (!username) {
    return null
  }
  const groups = env.groupsHeader
    ? (getRequestHeader(event, env.groupsHeader) ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    : []
  const role = mapClaimToRole(groups, env.groupRoleMapping)
  const email = env.emailHeader ? (getRequestHeader(event, env.emailHeader)?.trim() ?? null) : null
  const existing = getDatabase().select().from(users).where(eq(users.username, username)).get()
  if (existing && existing.authSource !== 'header') {
    return null
  }
  const timestamp = now()
  let userId = existing?.id
  if (!existing) {
    userId = newId()
    getDatabase()
      .insert(users)
      .values({
        id: userId,
        username,
        email,
        passwordHash: null,
        role,
        breakGlass: false,
        authSource: 'header',
        oidcIssuer: null,
        oidcSubject: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        createdBy: null,
        updatedBy: null,
      })
      .run()
  } else if (existing.role !== role || existing.email !== email) {
    getDatabase()
      .update(users)
      .set({ role, email, updatedAt: timestamp })
      .where(eq(users.id, existing.id))
      .run()
  }
  return {
    role,
    userId: userId ?? null,
    tokenId: null,
    tokenScopes: [],
    kind: 'user',
    label: username,
  }
}

function bearerToken(header: string | undefined): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec(header ?? '')
  return match?.[1] ?? null
}
