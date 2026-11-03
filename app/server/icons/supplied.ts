import { eq } from 'drizzle-orm'
import { requireWrite, type Actor } from '../auth/permissions'
import { getDatabase } from '../db/client'
import { faviconCache } from '../db/schema'
import { newId, now } from '../db/ids'
import { badRequest } from '../http/errors'
import { writeAudit } from '../services/audit'
import { publishLive } from '../services/live'
import { normalizeImage, queueFavicon } from './favicon'
import { contentHash } from './refs'
import { faviconSources } from './sources'

export function suppliedImage(contentType: string, data: string) {
  if (!/^image\/(svg\+xml|png|webp|jpeg|gif|x-icon|vnd\.microsoft\.icon)$/.test(contentType))
    throw badRequest('Unsupported favicon media type')
  const encoded = data.replace(/\s/g, '')
  const bytes = Buffer.from(encoded, 'base64')
  if (!bytes.length || bytes.toString('base64') !== encoded)
    throw badRequest('Favicon must be standard Base64')
  try {
    return normalizeImage(contentType, bytes)
  } catch (error) {
    throw badRequest(error instanceof Error ? error.message : 'Invalid favicon')
  }
}

export function previewEntryFavicon(
  actor: Actor,
  entryId: string,
  input: { contentType: string; data: string },
) {
  requireWrite(actor)
  const slot = faviconSources(entryId, actor.role)[0]?.slot
  if (!slot)
    throw badRequest('The entry needs a resolved HTTP(S) primary link or an explicit favicon URL')
  const image = suppliedImage(input.contentType, input.data)
  const current = getDatabase()
    .select()
    .from(faviconCache)
    .where(eq(faviconCache.origin, slot.key))
    .get()
  return {
    slot,
    image,
    contentHash: contentHash(image.bytes),
    currentHash: current?.data ? contentHash(current.data) : null,
    currentSource: current?.imageSource ?? null,
    current,
  }
}

export function supplyEntryFavicon(
  actor: Actor,
  entryId: string,
  input: { contentType: string; data: string },
) {
  const result = previewEntryFavicon(actor, entryId, input)
  const changed = result.contentHash !== result.currentHash || result.currentSource !== 'supplied'
  if (changed) {
    const timestamp = now()
    const values = {
      sourceUrl: result.slot.url,
      direct: result.slot.direct,
      imageSource: 'supplied' as const,
      suppliedBy: actor.label,
      suppliedAt: timestamp,
      status: 'ok',
      mediaType: result.image.mediaType,
      byteSize: result.image.bytes.length,
      data: result.image.bytes,
      error: null,
      failureCount: 0,
      failureKind: null,
      retryPaused: false,
      updatedAt: timestamp,
    }
    getDatabase()
      .insert(faviconCache)
      .values({ id: newId(), origin: result.slot.key, ...values, createdAt: timestamp })
      .onConflictDoUpdate({ target: faviconCache.origin, set: values })
      .run()
    writeAudit(actor, 'entry.favicon.supply', 'entry', entryId, {
      contentHash: result.contentHash,
      mediaType: result.image.mediaType,
      byteSize: result.image.bytes.length,
    })
    publishLive({ type: 'entries' })
  }
  return {
    changed,
    contentHash: result.contentHash,
    mediaType: result.image.mediaType,
    source: 'supplied',
  }
}

export function removeSuppliedFavicon(actor: Actor, entryId: string) {
  requireWrite(actor)
  const slot = faviconSources(entryId, actor.role)[0]?.slot
  const row = slot
    ? getDatabase().select().from(faviconCache).where(eq(faviconCache.origin, slot.key)).get()
    : null
  const changed = row?.imageSource === 'supplied'
  if (changed && row && slot) {
    getDatabase().delete(faviconCache).where(eq(faviconCache.id, row.id)).run()
    writeAudit(actor, 'entry.favicon.remove-supplied', 'entry', entryId, {})
    publishLive({ type: 'entries' })
    queueFavicon(slot.url, true, slot.direct)
  }
  return { changed }
}
