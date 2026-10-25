import { isStoredRole, type StoredRole } from '../../shared/roles'

export interface RuntimeEnv {
  adminUsername: string | undefined
  adminPassword: string | undefined
  localLoginEnabled: boolean
  oidcDiscoveryUrl: string | undefined
  oidcClientId: string | undefined
  oidcClientSecret: string | undefined
  oidcRedirectUri: string | undefined
  oidcRoleClaim: string
  oidcRoleMapping: Record<string, StoredRole>
  trustedHeaderEnabled: boolean
  trustedProxies: string[]
  userHeader: string
  emailHeader: string | undefined
  groupsHeader: string | undefined
  groupRoleMapping: Record<string, StoredRole>
  auditRetentionDays: number
}

let current: RuntimeEnv | undefined

export function parseRuntimeEnv(env: NodeJS.ProcessEnv): RuntimeEnv {
  return {
    adminUsername: blankToUndefined(env.ADMIN_USERNAME),
    adminPassword: blankToUndefined(env.ADMIN_PASSWORD),
    localLoginEnabled: parseBoolean(env.LOCAL_LOGIN_ENABLED, true, 'LOCAL_LOGIN_ENABLED'),
    oidcDiscoveryUrl: blankToUndefined(env.OIDC_DISCOVERY_URL),
    oidcClientId: blankToUndefined(env.OIDC_CLIENT_ID),
    oidcClientSecret: blankToUndefined(env.OIDC_CLIENT_SECRET),
    oidcRedirectUri: blankToUndefined(env.OIDC_REDIRECT_URI),
    oidcRoleClaim: blankToUndefined(env.OIDC_ROLE_CLAIM) ?? 'roles',
    oidcRoleMapping: parseRoleMap(env.OIDC_ROLE_MAPPING, 'OIDC_ROLE_MAPPING'),
    trustedHeaderEnabled: parseBoolean(
      env.AUTH_TRUSTED_HEADER_ENABLED,
      false,
      'AUTH_TRUSTED_HEADER_ENABLED',
    ),
    trustedProxies: splitList(env.AUTH_TRUSTED_PROXIES),
    userHeader: blankToUndefined(env.AUTH_USER_HEADER) ?? 'Remote-User',
    emailHeader: blankToUndefined(env.AUTH_EMAIL_HEADER),
    groupsHeader: blankToUndefined(env.AUTH_GROUPS_HEADER),
    groupRoleMapping: parseRoleMap(env.AUTH_GROUP_ROLE_MAPPING, 'AUTH_GROUP_ROLE_MAPPING'),
    auditRetentionDays: parseDays(env.AUDIT_RETENTION_DAYS),
  }
}

export function installRuntimeEnv(env: NodeJS.ProcessEnv): RuntimeEnv {
  current = parseRuntimeEnv(env)
  return current
}

export function getRuntimeEnv(): RuntimeEnv {
  if (!current) {
    throw new Error('Runtime environment is not initialised')
  }
  return current
}

export function mapClaimToRole(claim: unknown, mapping: Record<string, StoredRole>): StoredRole {
  const values = Array.isArray(claim) ? claim : claim === undefined || claim === null ? [] : [claim]
  const matched: StoredRole[] = []
  for (const value of values) {
    if (typeof value !== 'string') {
      continue
    }
    const role = mapping[value]
    if (role) {
      matched.push(role)
    }
  }
  if (matched.length === 0) {
    return 'viewer'
  }
  return matched.reduce((best, role) => (rank(role) > rank(best) ? role : best))
}

function rank(role: StoredRole): number {
  if (role === 'admin') {
    return 3
  }
  if (role === 'editor') {
    return 2
  }
  return 1
}

function parseRoleMap(raw: string | undefined, name: string): Record<string, StoredRole> {
  if (raw === undefined || raw.trim() === '') {
    return {}
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`${name} must be a JSON object`)
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${name} must be a JSON object`)
  }
  const result: Record<string, StoredRole> = {}
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== 'string' || !isStoredRole(value)) {
      throw new Error(`${name} contains an invalid role`)
    }
    result[key] = value
  }
  return result
}

function parseBoolean(raw: string | undefined, fallback: boolean, name: string): boolean {
  if (raw === undefined || raw.trim() === '') {
    return fallback
  }
  if (raw === 'true') {
    return true
  }
  if (raw === 'false') {
    return false
  }
  throw new Error(`${name} must be true or false`)
}

function parseDays(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') {
    return 365
  }
  if (!/^\d+$/.test(raw) || Number(raw) > 36500) {
    throw new Error('AUDIT_RETENTION_DAYS must be an integer from 0 to 36500')
  }
  return Number(raw)
}

function splitList(raw: string | undefined): string[] {
  if (raw === undefined || raw.trim() === '') {
    return []
  }
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

function blankToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}
