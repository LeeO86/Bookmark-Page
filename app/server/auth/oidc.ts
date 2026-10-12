import {
  authorizationCodeGrant,
  buildAuthorizationUrl,
  calculatePKCECodeChallenge,
  discovery,
  randomPKCECodeVerifier,
  randomState,
  type Configuration,
} from 'openid-client'
import { and, eq } from 'drizzle-orm'
import { mapClaimToRole, type RuntimeEnv } from '../config/env'
import { getDatabase } from '../db/client'
import { newId, now } from '../db/ids'
import { users } from '../db/schema'
import { badRequest } from '../http/errors'

let cached: { issuer: string; clientId: string; config: Configuration } | undefined

export async function oidcConfig(env: RuntimeEnv): Promise<Configuration> {
  if (!env.oidcDiscoveryUrl || !env.oidcClientId || !env.oidcRedirectUri) {
    throw badRequest('OIDC is not configured', 'oidc_disabled')
  }
  if (cached?.issuer === env.oidcDiscoveryUrl && cached.clientId === env.oidcClientId) {
    return cached.config
  }
  const config = await discovery(
    new URL(env.oidcDiscoveryUrl),
    env.oidcClientId,
    env.oidcClientSecret,
  )
  cached = { issuer: env.oidcDiscoveryUrl, clientId: env.oidcClientId, config }
  return config
}

export async function authorizationRedirect(
  env: RuntimeEnv,
  verifier: string,
  state: string,
): Promise<string> {
  const config = await oidcConfig(env)
  const challenge = await calculatePKCECodeChallenge(verifier)
  return buildAuthorizationUrl(config, {
    redirect_uri: env.oidcRedirectUri ?? '',
    scope: 'openid profile email',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    response_type: 'code',
  }).href
}

export function newOidcTransaction(): { verifier: string; state: string } {
  return { verifier: randomPKCECodeVerifier(), state: randomState() }
}

export async function completeOidcLogin(
  env: RuntimeEnv,
  currentUrl: URL,
  verifier: string,
  state: string,
): Promise<string> {
  const config = await oidcConfig(env)
  const tokens = await authorizationCodeGrant(config, currentUrl, {
    pkceCodeVerifier: verifier,
    expectedState: state,
  })
  // openid-client types the claim set too narrowly to index by a configured claim name.
  const claims = (tokens.claims() ?? {}) as Record<string, unknown>
  const subject = stringClaim(claims.sub)
  if (!subject) {
    throw badRequest('OIDC response did not include a subject')
  }
  const issuer = env.oidcDiscoveryUrl ?? ''
  const email = stringClaim(claims.email)
  const role = mapClaimToRole(claims[env.oidcRoleClaim], env.oidcRoleMapping)
  const preferred =
    stringClaim(claims.preferred_username) ?? email ?? `oidc-${subject.slice(0, 12)}`
  return upsertOidcUser(issuer, subject, preferred, email, role)
}

function upsertOidcUser(
  issuer: string,
  subject: string,
  preferred: string,
  email: string | undefined,
  role: 'viewer' | 'editor' | 'admin',
): string {
  const db = getDatabase()
  const existing = db
    .select()
    .from(users)
    .where(and(eq(users.oidcIssuer, issuer), eq(users.oidcSubject, subject)))
    .get()
  const timestamp = now()
  if (existing) {
    db.update(users)
      .set({ role, email: email ?? existing.email, updatedAt: timestamp })
      .where(eq(users.id, existing.id))
      .run()
    return existing.id
  }
  const id = newId()
  db.insert(users)
    .values({
      id,
      username: uniqueUsername(db, sanitizeUsername(preferred)),
      email: email ?? null,
      passwordHash: null,
      role,
      breakGlass: false,
      authSource: 'oidc',
      oidcIssuer: issuer,
      oidcSubject: subject,
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy: null,
      updatedBy: null,
    })
    .run()
  return id
}

function uniqueUsername(db: ReturnType<typeof getDatabase>, base: string): string {
  let candidate = base
  let suffix = 2
  while (db.select().from(users).where(eq(users.username, candidate)).get()) {
    candidate = `${base}-${suffix}`
    suffix += 1
  }
  return candidate
}

function sanitizeUsername(value: string): string {
  const cleaned = value
    .trim()
    .replace(/[^A-Za-z0-9._@+-]/g, '')
    .slice(0, 64)
  return cleaned.length > 0 ? cleaned : 'oidc-user'
}

function stringClaim(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}
