import { eq } from 'drizzle-orm'
import type { Role } from '../../shared/roles'
import { getDatabase } from '../db/client'
import { entries } from '../db/schema'
import { faviconSources } from '../icons/sources'
import { parseHttpUrl } from '../http/limited'
import { resolveLinkUrl } from '../services/placeholders'

export function imageCheckTarget(
  check: { entryId: string; host: string | null; requestSpec: unknown },
  role: Role = 'admin',
): string | null {
  const entry = getDatabase().select().from(entries).where(eq(entries.id, check.entryId)).get()
  if (!entry) return null
  const spec = check.requestSpec as { urlTemplate?: string } | null
  if (!spec?.urlTemplate) return faviconSources(entry.id, role)[0]?.browserUrl ?? null
  const privateKeys = new Set(
    [...spec.urlTemplate.matchAll(/\{\{\s*field\.([A-Za-z0-9_]+)\s*\}\}/g)].map(
      (match) => match[1]!,
    ),
  )
  const value = resolveLinkUrl(
    spec.urlTemplate,
    { host: check.host || entry.host, name: entry.name, fields: {} },
    privateKeys,
  ).url
  if (!value) return null
  try {
    return parseHttpUrl(value).href
  } catch {
    return null
  }
}
