import { createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { Actor } from '../auth/permissions'
import { getDatabase } from '../db/client'
import { entries, faviconCache, icons, links } from '../db/schema'
import { badRequest } from '../http/errors'
import { entryVisible, listEntries } from '../services/entries'
import { readLucideSvg, searchLucide } from './lucide'
import { sanitizeSvg } from './sanitize'

const uploadLimit = 256 * 1024

export function prepareUpload(contentType: string, dataBase64: string): Buffer {
  if (
    contentType !== 'image/svg+xml' &&
    contentType !== 'image/png' &&
    contentType !== 'image/webp'
  ) {
    throw badRequest('Icon must be an SVG, PNG, or WebP image')
  }
  const normalized = dataBase64.replace(/\s/g, '')
  const bytes = Buffer.from(normalized, 'base64')
  if (bytes.length === 0 || bytes.length > uploadLimit || bytes.toString('base64') !== normalized) {
    throw badRequest('Icon must be standard Base64 up to 256 KB')
  }
  if (contentType === 'image/svg+xml') {
    try {
      return Buffer.from(sanitizeSvg(bytes.toString('utf8')), 'utf8')
    } catch (error) {
      throw badRequest(error instanceof Error ? error.message : 'SVG could not be sanitised')
    }
  }
  if (contentType === 'image/png' && !isPng(bytes)) {
    throw badRequest('Icon content is not a PNG image')
  }
  if (contentType === 'image/webp' && !isWebp(bytes)) {
    throw badRequest('Icon content is not a WebP image')
  }
  return bytes
}

export function searchIcons(
  query: string,
): Array<{ ref: string; name: string; kind: string; url: string }> {
  const needle = query.trim().toLowerCase()
  const uploads = getDatabase()
    .select()
    .from(icons)
    .all()
    .filter(
      (icon) => icon.kind === 'upload' && (!needle || icon.name.toLowerCase().includes(needle)),
    )
    .map((icon) => ({
      ref: `upload:${icon.id}`,
      name: icon.name,
      kind: 'upload',
      url: `/api/icons/upload/${icon.id}`,
    }))
  const library = searchLucide(needle).map((name) => ({
    ref: `lucide:${name}`,
    name,
    kind: 'lucide',
    url: `/api/icons/lucide/${encodeURIComponent(name)}`,
  }))
  return [...uploads, ...library].slice(0, 60)
}

export function readPublicIcon(
  actor: Actor,
  kind: string,
  name: string,
): { bytes: Buffer; mediaType: string } | null {
  if (kind === 'lucide') {
    const svg = readLucideSvg(name)
    return svg ? { bytes: Buffer.from(svg, 'utf8'), mediaType: 'image/svg+xml' } : null
  }
  if (kind === 'upload') {
    const icon = getDatabase().select().from(icons).where(eq(icons.id, name)).get()
    if (!icon?.data || !icon.mediaType || !uploadVisible(actor, icon.id)) {
      return null
    }
    return { bytes: icon.data, mediaType: icon.mediaType }
  }
  if (kind === 'favicon') {
    const row = getDatabase().select().from(faviconCache).where(eq(faviconCache.id, name)).get()
    if (!row?.data || row.status !== 'ok' || !row.mediaType || !faviconVisible(actor, row.id)) {
      return null
    }
    return { bytes: row.data, mediaType: row.mediaType }
  }
  return null
}

export function iconEtag(bytes: Buffer): string {
  return `"${createHash('sha256').update(bytes).digest('hex')}"`
}

function uploadVisible(actor: Actor, id: string): boolean {
  if (actor.role !== 'anonymous') {
    return true
  }
  const ref = `upload:${id}`
  const db = getDatabase()
  const referenced = new Set<string>()
  for (const entry of db.select().from(entries).all()) {
    if (entry.iconRef === ref) {
      referenced.add(entry.id)
    }
  }
  for (const link of db.select().from(links).all()) {
    if (link.iconRef === ref) {
      referenced.add(link.entryId)
    }
  }
  for (const entryId of referenced) {
    if (entryVisible(actor.role, entryId, db)) {
      return true
    }
  }
  return false
}

function faviconVisible(actor: Actor, id: string): boolean {
  if (actor.role !== 'anonymous') {
    return true
  }
  const url = `/api/icons/favicon/${id}`
  return listEntries(actor, '').entries.some(
    (entry) => entry.iconUrl === url || entry.links.some((link) => link.iconUrl === url),
  )
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
