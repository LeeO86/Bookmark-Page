import { eq } from 'drizzle-orm'
import { getDatabase } from '../db/client'
import { newId, now } from '../db/ids'
import { faviconCache } from '../db/schema'
import { limitedRequest, parseHttpUrl } from '../http/limited'
import { faviconRefreshDays, faviconTlsVerify } from '../services/settings'
import { iconCandidates, manifestHref, manifestIcons, pickIcon } from './discover'
import { sanitizeSvg } from './sanitize'

const maxBytes = () => numberEnv('FAVICON_MAX_BYTES', 512 * 1024)
const timeoutMs = () => numberEnv('FAVICON_TIMEOUT_MS', 5000)

const inflight = new Set<string>()

export function faviconFetchEnabled(): boolean {
  return process.env.BOOKMARK_FAVICON_FETCH !== '0'
}

export function queueFavicon(url: string | null, force = false): void {
  if (!faviconFetchEnabled() || !url) {
    return
  }
  let origin: string
  try {
    origin = parseHttpUrl(url).origin
  } catch {
    return
  }
  if (inflight.has(origin)) {
    return
  }
  if (!force && fresh(origin)) {
    return
  }
  inflight.add(origin)
  void storeFavicon(origin, url)
    .catch((error: unknown) => {
      rememberFailure(origin, error instanceof Error ? error.message : 'Favicon fetch failed')
    })
    .finally(() => {
      inflight.delete(origin)
    })
}

export async function refreshStaleFavicons(): Promise<void> {
  if (!faviconFetchEnabled()) {
    return
  }
  const cutoff = Date.now() - faviconRefreshDays() * 24 * 60 * 60 * 1000
  const rows = getDatabase().select().from(faviconCache).all()
  for (const row of rows) {
    if (row.fetchedAt && row.fetchedAt.getTime() > cutoff) {
      continue
    }
    queueFavicon(row.origin, true)
  }
}

export async function fetchFaviconBytes(
  pageUrl: string,
  tlsVerify = faviconTlsVerify(),
): Promise<{ mediaType: string; bytes: Buffer }> {
  const page = await limitedRequest(pageUrl, {
    timeoutMs: timeoutMs(),
    maxBytes: maxBytes(),
    maxRedirects: 3,
    tlsVerify,
  })
  const type = headerValue(page.headers['content-type'])
  if (type.startsWith('image/')) {
    return normalizeImage(type, page.body)
  }
  const html = page.body.toString('utf8')
  let candidates = iconCandidates(html, page.finalUrl)
  let chosen = pickIcon(candidates)
  if (!chosen) {
    const manifest = manifestHref(candidates)
    if (manifest) {
      const document = await limitedRequest(manifest, {
        timeoutMs: timeoutMs(),
        maxBytes: maxBytes(),
        maxRedirects: 3,
        tlsVerify,
      })
      try {
        candidates = manifestIcons(JSON.parse(document.body.toString('utf8')) as unknown, manifest)
        chosen = pickIcon(candidates)
      } catch {
        chosen = null
      }
    }
  }
  const iconUrl = chosen?.href ?? new URL('/favicon.ico', page.finalUrl).toString()
  const icon = await limitedRequest(iconUrl, {
    timeoutMs: timeoutMs(),
    maxBytes: maxBytes(),
    maxRedirects: 3,
    tlsVerify,
  })
  if (icon.status < 200 || icon.status >= 300) {
    throw new Error(`Favicon request returned ${icon.status}`)
  }
  return normalizeImage(headerValue(icon.headers['content-type']), icon.body, chosen?.svg === true)
}

async function storeFavicon(origin: string, pageUrl: string): Promise<void> {
  try {
    const image = await fetchFaviconBytes(pageUrl)
    const timestamp = now()
    getDatabase()
      .insert(faviconCache)
      .values({
        id: newId(),
        origin,
        status: 'ok',
        mediaType: image.mediaType,
        byteSize: image.bytes.length,
        error: null,
        fetchedAt: timestamp,
        data: image.bytes,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .onConflictDoUpdate({
        target: faviconCache.origin,
        set: {
          status: 'ok',
          mediaType: image.mediaType,
          byteSize: image.bytes.length,
          error: null,
          fetchedAt: timestamp,
          data: image.bytes,
          updatedAt: timestamp,
        },
      })
      .run()
  } catch (error) {
    rememberFailure(origin, error instanceof Error ? error.message : 'Favicon fetch failed')
  }
}

function rememberFailure(origin: string, message: string): void {
  const timestamp = now()
  getDatabase()
    .insert(faviconCache)
    .values({
      id: newId(),
      origin,
      status: 'error',
      mediaType: null,
      byteSize: null,
      error: message.slice(0, 500),
      fetchedAt: timestamp,
      data: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoUpdate({
      target: faviconCache.origin,
      set: {
        status: 'error',
        error: message.slice(0, 500),
        fetchedAt: timestamp,
        updatedAt: timestamp,
      },
    })
    .run()
}

function fresh(origin: string): boolean {
  const row = getDatabase().select().from(faviconCache).where(eq(faviconCache.origin, origin)).get()
  if (!row?.fetchedAt || row.status !== 'ok') {
    return false
  }
  return Date.now() - row.fetchedAt.getTime() < faviconRefreshDays() * 24 * 60 * 60 * 1000
}

function normalizeImage(
  contentType: string,
  bytes: Buffer,
  svgHint = false,
): { mediaType: string; bytes: Buffer } {
  const type = contentType.split(';')[0]?.trim().toLowerCase() ?? ''
  const svg =
    svgHint || type.includes('svg') || bytes.subarray(0, 80).toString('utf8').includes('<svg')
  if (svg) {
    const clean = Buffer.from(sanitizeSvg(bytes.toString('utf8')), 'utf8')
    return { mediaType: 'image/svg+xml', bytes: clean }
  }
  if (type === 'image/png' || isPng(bytes)) {
    return { mediaType: 'image/png', bytes }
  }
  if (type === 'image/webp' || isWebp(bytes)) {
    return { mediaType: 'image/webp', bytes }
  }
  if (type === 'image/jpeg' || isJpeg(bytes)) {
    return { mediaType: 'image/jpeg', bytes }
  }
  if (type === 'image/gif' || isGif(bytes)) {
    return { mediaType: 'image/gif', bytes }
  }
  if (type.includes('icon') || isIco(bytes)) {
    return { mediaType: 'image/x-icon', bytes }
  }
  throw new Error('Favicon is not a supported image')
}

function headerValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
}

function numberEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) {
    return fallback
  }
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function isPng(bytes: Buffer): boolean {
  return (
    bytes.length > 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  )
}

function isWebp(bytes: Buffer): boolean {
  return (
    bytes.length > 12 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  )
}

function isJpeg(bytes: Buffer): boolean {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8
}

function isGif(bytes: Buffer): boolean {
  return bytes.length > 6 && bytes.subarray(0, 3).toString('ascii') === 'GIF'
}

function isIco(bytes: Buffer): boolean {
  return bytes.length > 4 && bytes[0] === 0 && bytes[1] === 0 && (bytes[2] === 1 || bytes[2] === 2)
}
