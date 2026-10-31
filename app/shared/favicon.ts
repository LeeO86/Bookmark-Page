/** Resolve an explicit image URL or a path relative to the primary HTTP(S) link. */
export function resolveFaviconUrl(
  value: string,
  primaryUrl: string | null,
  host: string | null = null,
): string {
  const template = value.trim()
  if (/\{\{\s*host\s*\}\}/.test(template) && !host) {
    throw new Error('The favicon URL needs an entry host')
  }
  const expanded = template.replace(/\{\{\s*host\s*\}\}/g, host ?? '')
  if (/[{}\\]/.test(expanded) || [...expanded].some((char) => char.codePointAt(0)! <= 32)) {
    throw new Error('Use an HTTP(S) favicon URL or path; only {{host}} is supported')
  }
  let url: URL
  try {
    url = primaryUrl ? new URL(expanded, primaryUrl) : new URL(expanded)
  } catch {
    throw new Error('A relative favicon path needs a primary HTTP(S) link')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only HTTP(S) favicon URLs are allowed')
  }
  if (url.username || url.password) {
    throw new Error('Favicon URLs must not contain credentials')
  }
  url.hash = ''
  return url.href
}

export function faviconCacheKey(url: string, direct = false): string {
  const parsed = new URL(url)
  parsed.hash = ''
  return direct ? `url:${parsed.href}` : parsed.origin
}
