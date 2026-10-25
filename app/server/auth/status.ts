import { getRuntimeEnv } from '../config/env'

export function authStatus() {
  const env = getRuntimeEnv()
  const oidcEnabled = Boolean(
    env.oidcDiscoveryUrl && env.oidcClientId && env.oidcClientSecret && env.oidcRedirectUri,
  )
  return {
    localLoginEnabled: env.localLoginEnabled,
    oidcEnabled,
    oidcDiscoveryUrl: env.oidcDiscoveryUrl ?? null,
    oidcRoleClaim: env.oidcRoleClaim,
    trustedHeaderEnabled: env.trustedHeaderEnabled,
    trustedProxyCount: env.trustedProxies.length,
    userHeader: env.userHeader,
    emailHeader: env.emailHeader ?? null,
    groupsHeader: env.groupsHeader ?? null,
  }
}

export function authOptions() {
  const status = authStatus()
  return {
    localLoginEnabled: status.localLoginEnabled,
    oidcEnabled: status.oidcEnabled,
  }
}
