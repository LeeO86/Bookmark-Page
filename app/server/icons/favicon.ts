import { decodeDataImage } from '../../shared/data-image'
import { publishLive } from '../services/live'
import { eq } from 'drizzle-orm'
import { faviconCacheKey } from '../../shared/favicon'
import { getDatabase } from '../db/client'
import { newId, now } from '../db/ids'
import { faviconCache } from '../db/schema'
import { limitedRequest, parseHttpUrl } from '../http/limited'
import { faviconRefreshDays, faviconTlsVerify } from '../services/settings'
import { iconCandidates, manifestHref, manifestIcons, orderedIcons } from './discover'
import { sanitizeSvg } from './sanitize'

const maxBytes = () => numberEnv('FAVICON_MAX_BYTES', 512 * 1024)
const timeoutMs = () => numberEnv('FAVICON_TIMEOUT_MS', 5000)

const inflight = new Set<string>()
const pending: Array<() => Promise<void>> = []
let active = 0

export function faviconFetchEnabled(): boolean {
  return process.env.BOOKMARK_FAVICON_FETCH !== '0'
}

export function queueFavicon(url: string | null, force = false, direct = false): void {
  if (!faviconFetchEnabled() || !url) {
    return
  }
  let origin: string
  try {
    origin = faviconCacheKey(direct && /^data:/i.test(url) ? url : parseHttpUrl(url).href, direct)
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
  pending.push(async () => {
    try {
      await storeFavicon(origin, url, direct)
    } finally {
      inflight.delete(origin)
      publishLive({ type: 'entries' })
    }
  })
  drain()
}

function drain(): void {
  while (active < 4 && pending.length) {
    const task = pending.shift()!
    active += 1
    void task()
      .catch(() => {
        /* Failures are persisted by storeFavicon. */
      })
      .finally(() => {
        active -= 1
        drain()
      })
  }
}

/** Failed discoveries remain retryable after restarts and never wait a full week. */
export function faviconRetryMs(failureCount: number): number {
  return [5 * 60_000, 60 * 60_000, 6 * 60 * 60_000][Math.min(2, Math.max(0, failureCount - 1))]!
}

export async function refreshStaleFavicons(): Promise<void> {
  if (!faviconFetchEnabled()) return
  for (const row of getDatabase().select().from(faviconCache).all()) {
    if (!fresh(row.origin)) queueFavicon(row.sourceUrl ?? row.origin, false, row.direct)
  }
}

export async function fetchFaviconBytes(
  pageUrl: string,
  tlsVerify = faviconTlsVerify(),
  direct = false,
): Promise<{ mediaType: string; bytes: Buffer }> {
  if (direct && /^data:/i.test(pageUrl)) {
    const image = decodeDataImage(pageUrl, maxBytes())
    return normalizeImage(image.mediaType, Buffer.from(image.bytes))
  }
  const request = (url: string) =>
    limitedRequest(url, {
      timeoutMs: timeoutMs(),
      maxBytes: maxBytes(),
      maxRedirects: 3,
      tlsVerify,
    })
  let baseUrl = pageUrl
  let candidates: ReturnType<typeof iconCandidates> = []
  let manifest: string | null = null
  let lastError: unknown = new Error('No favicon candidates')
  try {
    const page = await request(pageUrl)
    baseUrl = page.finalUrl
    const type = headerValue(page.headers['content-type'])
    if (page.status < 200 || page.status >= 300)
      throw new Error(`Page request returned ${page.status}`)
    if (direct || type.startsWith('image/')) return normalizeImage(type, page.body)
    candidates = iconCandidates(page.body.toString('utf8'), baseUrl, maxBytes())
    manifest = manifestHref(candidates)
  } catch (error) {
    if (direct) throw error
    lastError = error
  }
  const tryCandidates = async (items: typeof candidates) => {
    for (const candidate of orderedIcons(items).slice(0, 32)) {
      try {
        if (/^data:/i.test(candidate.href)) {
          const image = decodeDataImage(candidate.href, maxBytes())
          return normalizeImage(image.mediaType, Buffer.from(image.bytes))
        }
        const icon = await request(candidate.href)
        if (icon.status < 200 || icon.status >= 300)
          throw new Error(`Favicon request returned ${icon.status}`)
        return normalizeImage(headerValue(icon.headers['content-type']), icon.body, candidate.svg)
      } catch (error) {
        lastError = error
      }
    }
    return null
  }
  const linked = await tryCandidates(candidates)
  if (linked) return linked
  if (manifest) {
    try {
      const document = await request(manifest)
      if (document.status < 200 || document.status >= 300)
        throw new Error(`Manifest request returned ${document.status}`)
      const image = await tryCandidates(
        manifestIcons(
          JSON.parse(document.body.toString('utf8')) as unknown,
          document.finalUrl,
          maxBytes(),
        ),
      )
      if (image) return image
    } catch (error) {
      lastError = error
    }
  }
  const fallback = await tryCandidates([
    {
      href: new URL('/favicon.ico', baseUrl).href,
      rel: 'icon',
      size: 16,
      svg: false,
      manifest: false,
    },
  ])
  if (fallback) return fallback
  throw lastError
}

async function storeFavicon(origin: string, pageUrl: string, direct: boolean): Promise<void> {
  try {
    const image = await fetchFaviconBytes(pageUrl, faviconTlsVerify(), direct)
    const timestamp = now()
    getDatabase()
      .insert(faviconCache)
      .values({
        id: newId(),
        origin,
        sourceUrl: pageUrl,
        direct,
        status: 'ok',
        failureCount: 0,
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
          sourceUrl: pageUrl,
          direct,
          status: 'ok',
          failureCount: 0,
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
    rememberFailure(
      origin,
      pageUrl,
      direct,
      error instanceof Error ? error.message : 'Favicon fetch failed',
    )
  }
}

function rememberFailure(
  origin: string,
  sourceUrl: string,
  direct: boolean,
  message: string,
): void {
  const timestamp = now()
  const previous = getDatabase()
    .select()
    .from(faviconCache)
    .where(eq(faviconCache.origin, origin))
    .get()
  const failureCount = (previous?.failureCount ?? 0) + 1
  getDatabase()
    .insert(faviconCache)
    .values({
      id: newId(),
      origin,
      sourceUrl,
      direct,
      status: 'error',
      failureCount,
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
        sourceUrl,
        direct,
        status: 'error',
        failureCount,
        error: message.slice(0, 500),
        fetchedAt: timestamp,
        updatedAt: timestamp,
      },
    })
    .run()
}

function fresh(origin: string): boolean {
  const row = getDatabase().select().from(faviconCache).where(eq(faviconCache.origin, origin)).get()
  if (!row?.fetchedAt) return false
  const interval =
    row.status === 'error'
      ? faviconRetryMs(row.failureCount)
      : faviconRefreshDays() * 24 * 60 * 60 * 1000
  return Date.now() - row.fetchedAt.getTime() < interval
}

function normalizeImage(
  contentType: string,
  bytes: Buffer,
  svgHint = false,
): { mediaType: string; bytes: Buffer } {
  const type = contentType.split(';')[0]?.trim().toLowerCase() ?? ''
  if (!bytes.length || bytes.length > maxBytes()) throw new Error('Favicon exceeds the size limit')
  const svg =
    svgHint || type.includes('svg') || bytes.subarray(0, 80).toString('utf8').includes('<svg')
  if (svg) {
    const clean = Buffer.from(sanitizeSvg(bytes.toString('utf8')), 'utf8')
    if (clean.length > maxBytes()) throw new Error('Favicon exceeds the size limit')
    return { mediaType: 'image/svg+xml', bytes: clean }
  }
  if (isPng(bytes)) {
    return { mediaType: 'image/png', bytes }
  }
  if (isWebp(bytes)) {
    return { mediaType: 'image/webp', bytes }
  }
  if (isJpeg(bytes)) {
    return { mediaType: 'image/jpeg', bytes }
  }
  if (isGif(bytes)) {
    return { mediaType: 'image/gif', bytes }
  }
  if (isIco(bytes)) {
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
