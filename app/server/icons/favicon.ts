import { imageAccept } from '../../shared/image-accept'
import { faviconSources } from './sources'
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
const htmlHeadMaxBytes = 256 * 1024

interface FaviconJob {
  key: string
  url: string
  direct: boolean
  priority: 'foreground' | 'background'
}
const running = new Set<string>()
const pending = new Map<string, FaviconJob>()

export function faviconFetchEnabled(): boolean {
  return process.env.BOOKMARK_FAVICON_FETCH !== '0'
}

export function queueFavicon(
  url: string | null,
  force = false,
  direct = false,
  priority: FaviconJob['priority'] = 'foreground',
): void {
  if (!faviconFetchEnabled() || !url) return
  let key: string
  try {
    key = faviconCacheKey(direct && /^data:/i.test(url) ? url : parseHttpUrl(url).href, direct)
  } catch {
    return
  }
  const queued = pending.get(key)
  if (queued) {
    if (priority === 'foreground') Object.assign(queued, { priority, url, direct })
    return
  }
  if (running.has(key) || (!force && fresh(key))) return
  pending.set(key, { key, url, direct, priority })
  drain()
}

function drain(): void {
  while (running.size < 4 && pending.size) {
    const jobs = [...pending.values()]
    const job = jobs.find((item) => item.priority === 'foreground') ?? jobs[0]!
    pending.delete(job.key)
    running.add(job.key)
    void storeFavicon(job.key, job.url, job.direct)
      .finally(() => {
        running.delete(job.key)
        publishLive({ type: 'entries' })
        drain()
      })
      .catch(() => {
        /* The worker records failures in the cache. */
      })
  }
}

/** Failed discoveries remain retryable after restarts and never wait a full week. */
export function faviconRetryMs(failureCount: number): number {
  return [5 * 60_000, 60 * 60_000, 6 * 60 * 60_000][Math.min(2, Math.max(0, failureCount - 1))]!
}

export async function refreshStaleFavicons(): Promise<void> {
  if (!faviconFetchEnabled()) return
  const referenced = new Set(
    faviconSources().flatMap((entry) => entry.requests.map((item) => item.key)),
  )
  for (const row of getDatabase()
    .select({
      origin: faviconCache.origin,
      sourceUrl: faviconCache.sourceUrl,
      direct: faviconCache.direct,
      imageSource: faviconCache.imageSource,
      retryPaused: faviconCache.retryPaused,
    })
    .from(faviconCache)
    .all()) {
    if (
      referenced.has(row.origin) &&
      row.imageSource !== 'supplied' &&
      !row.retryPaused &&
      !fresh(row.origin)
    )
      queueFavicon(row.sourceUrl ?? row.origin, false, row.direct, 'background')
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
  const request = (url: string, htmlHead = false, image = !htmlHead) =>
    limitedRequest(url, {
      headers: {
        accept: image ? imageAccept : 'text/html,application/xhtml+xml,image/*,*/*;q=0.8',
      },
      timeoutMs: timeoutMs(),
      maxBytes: maxBytes(),
      ...(htmlHead ? { htmlHeadMaxBytes } : {}),
      maxRedirects: 3,
      tlsVerify,
    })
  let baseUrl = pageUrl
  let candidates: ReturnType<typeof iconCandidates> = []
  let manifest: string | null = null
  let lastError: unknown = new Error('No favicon candidates')
  try {
    const page = await request(pageUrl, !direct)
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
      const document = await request(manifest, false, false)
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
    const existing = getDatabase()
      .select()
      .from(faviconCache)
      .where(eq(faviconCache.origin, origin))
      .get()
    if (existing?.imageSource === 'supplied') {
      getDatabase()
        .update(faviconCache)
        .set({
          status: 'ok',
          error: null,
          failureCount: 0,
          retryPaused: false,
          failureKind: null,
          fetchedAt: timestamp,
        })
        .where(eq(faviconCache.id, existing.id))
        .run()
      return
    }
    getDatabase()
      .insert(faviconCache)
      .values({
        id: newId(),
        origin,
        sourceUrl: pageUrl,
        direct,
        status: 'ok',
        failureCount: 0,
        retryPaused: false,
        failureKind: null,
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
          retryPaused: false,
          failureKind: null,
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
      permanentFailure(error),
    )
  }
}

function rememberFailure(
  origin: string,
  sourceUrl: string,
  direct: boolean,
  message: string,
  permanent: boolean,
): void {
  const timestamp = now()
  const previous = getDatabase()
    .select()
    .from(faviconCache)
    .where(eq(faviconCache.origin, origin))
    .get()
  // A queued/in-flight request may finish after supply; retain the pinned successful image.
  if (previous?.imageSource === 'supplied') {
    getDatabase()
      .update(faviconCache)
      .set({
        status: 'ok',
        error: null,
        failureCount: 0,
        failureKind: null,
        retryPaused: false,
        fetchedAt: timestamp,
      })
      .where(eq(faviconCache.id, previous.id))
      .run()
    return
  }
  const failureKind = permanent ? 'permanent' : 'temporary'
  const failureCount =
    previous?.failureKind === failureKind && previous.sourceUrl === sourceUrl
      ? previous.failureCount + 1
      : 1
  const retryPaused = permanent && previous?.failureKind === 'permanent' && failureCount >= 3
  getDatabase()
    .insert(faviconCache)
    .values({
      id: newId(),
      origin,
      sourceUrl,
      direct,
      status: 'error',
      failureCount,
      failureKind,
      retryPaused,
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
        failureKind,
        retryPaused,
        error: message.slice(0, 500),
        fetchedAt: timestamp,
        updatedAt: timestamp,
      },
    })
    .run()
}

function fresh(origin: string): boolean {
  const row = getDatabase()
    .select({
      imageSource: faviconCache.imageSource,
      retryPaused: faviconCache.retryPaused,
      fetchedAt: faviconCache.fetchedAt,
      status: faviconCache.status,
      failureCount: faviconCache.failureCount,
    })
    .from(faviconCache)
    .where(eq(faviconCache.origin, origin))
    .get()
  if (row?.imageSource === 'supplied' || row?.retryPaused) return true
  if (!row?.fetchedAt) return false
  const interval =
    row.status === 'error'
      ? faviconRetryMs(row.failureCount)
      : faviconRefreshDays() * 24 * 60 * 60 * 1000
  return Date.now() - row.fetchedAt.getTime() < interval
}

export function normalizeImage(
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

function permanentFailure(error: unknown): boolean {
  return (
    error instanceof Error &&
    (/returned (404|410)\b/.test(error.message) || ('code' in error && error.code === 'ENOTFOUND'))
  )
}
