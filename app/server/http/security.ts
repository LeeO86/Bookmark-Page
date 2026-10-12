import { createHash } from 'node:crypto'

export const contentSecurityPolicy =
  "default-src 'self'; img-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'"

const iconPolicy = "default-src 'none'"

const developmentPolicy =
  "default-src 'self'; img-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'"

export function securityHeaders(pathname: string, development = false): Record<string, string> {
  const headers: Record<string, string> = {
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'x-frame-options': 'DENY',
    'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  }
  if (!pathname.startsWith('/api/icons')) {
    headers['content-security-policy'] = development ? developmentPolicy : contentSecurityPolicy
  } else {
    headers['content-security-policy'] = iconPolicy
  }
  return headers
}

export function inlineScriptHashes(html: string): string[] {
  const hashes: string[] = []
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = match[1] ?? ''
    if (/\bsrc\s*=/i.test(attrs) || /type\s*=\s*["']application\/(?:ld\+)?json["']/i.test(attrs)) {
      continue
    }
    const body = match[2] ?? ''
    if (body.length === 0) {
      continue
    }
    const digest = createHash('sha256').update(body, 'utf8').digest('base64')
    hashes.push(`'sha256-${digest}'`)
  }
  return hashes
}

export function contentSecurityPolicyFor(html: string, development = false): string {
  const policy = development ? developmentPolicy : contentSecurityPolicy
  const hashes = inlineScriptHashes(html)
  if (development || hashes.length === 0) {
    return policy
  }
  return policy.replace("script-src 'self'", `script-src 'self' ${hashes.join(' ')}`)
}
