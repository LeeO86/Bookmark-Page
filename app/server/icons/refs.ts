import { createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { getDatabase } from '../db/client'
import { icons } from '../db/schema'
import { badRequest } from '../http/errors'

export const contentHash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')

export function uploadUrl(id: string, bytes: Buffer): string {
  return `/api/icons/upload/${encodeURIComponent(id)}?v=${contentHash(bytes)}`
}

export function resolveIconRef(ref: string | null | undefined): string | null | undefined {
  if (!ref?.startsWith('upload-name:')) return ref
  const icon = getDatabase()
    .select()
    .from(icons)
    .where(eq(icons.name, ref.slice(12)))
    .get()
  if (!icon || icon.kind !== 'upload') throw badRequest('Uploaded icon name was not found')
  return `upload:${icon.id}`
}

export function resolveInputIcons<
  T extends { iconRef?: string | null; links?: Array<{ iconRef: string | null }> },
>(input: T): T {
  return {
    ...input,
    ...(input.iconRef !== undefined ? { iconRef: resolveIconRef(input.iconRef) } : {}),
    ...(input.links
      ? {
          links: input.links.map((link) => ({
            ...link,
            iconRef: resolveIconRef(link.iconRef) ?? null,
          })),
        }
      : {}),
  }
}
