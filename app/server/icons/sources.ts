import { parseHttpUrl } from '../http/limited'
import { eq } from 'drizzle-orm'
import { faviconCacheKey, resolveFaviconUrl } from '../../shared/favicon'
import { roleAtLeast, type Role } from '../../shared/roles'
import { getDatabase } from '../db/client'
import { entries, links, fieldDefinitions, fieldValues } from '../db/schema'
import { resolveLinkUrl } from '../services/placeholders'

export interface FaviconSource {
  key: string
  url: string
  direct: boolean
}

/** Resolve configured sources without ever decrypting secret or hidden field values. */
export function faviconSources(entryId?: string, role: Role = 'admin') {
  const db = getDatabase()
  const rows = entryId
    ? db.select().from(entries).where(eq(entries.id, entryId)).all()
    : db.select().from(entries).all()
  const linkRows = db
    .select()
    .from(links)
    .all()
    .sort((a, b) => a.sort - b.sort)
  const definitions = new Map(
    db
      .select()
      .from(fieldDefinitions)
      .all()
      .map((field) => [field.id, field]),
  )
  const values = db.select().from(fieldValues).all()
  return rows.map((entry) => {
    const fields: Record<string, string> = {}
    const privateKeys = new Set<string>()
    for (const field of definitions.values()) {
      if (field.type === 'secret' || !roleAtLeast(role, field.minRoleToView))
        privateKeys.add(field.key)
    }
    for (const value of values.filter((field) => field.entryId === entry.id)) {
      const definition = definitions.get(value.fieldId)
      if (definition && !privateKeys.has(definition.key) && value.valueText !== null)
        fields[definition.key] = value.valueText
    }
    const ownLinks = linkRows.filter((link) => link.entryId === entry.id)
    const primary = ownLinks.find((link) => link.isPrimary) ?? ownLinks[0]
    const resolved = (template: string) => {
      const result = resolveLinkUrl(
        template,
        { host: entry.host, name: entry.name, fields },
        privateKeys,
      ).url
      if (!result || !/^https?:\/\//i.test(result)) return null
      try {
        return parseHttpUrl(result).href
      } catch {
        return null
      }
    }
    const source = (url: string, direct: boolean): FaviconSource => ({
      key: faviconCacheKey(url, direct),
      url,
      direct,
    })
    const primaryUrl = primary ? resolved(primary.urlTemplate) : null
    let slot: FaviconSource | null = null
    if (entry.faviconUrl) {
      try {
        slot = source(resolveFaviconUrl(entry.faviconUrl, primaryUrl, entry.host), true)
      } catch {
        /* An unresolved source has no cache slot. */
      }
    } else if (primaryUrl) slot = source(primaryUrl, false)
    const requests = slot ? [slot] : []
    for (const link of ownLinks) {
      if (link === primary) continue
      const url = resolved(link.urlTemplate)
      if (url) requests.push(source(url, false))
    }
    const browserUrl =
      slot && /^https?:\/\//i.test(slot.url)
        ? slot.direct
          ? slot.url
          : new URL('/favicon.ico', slot.url).href
        : null
    return { entryId: entry.id, slot, requests, browserUrl }
  })
}
