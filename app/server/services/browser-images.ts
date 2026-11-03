import type { Actor } from '../auth/permissions'
import { getDatabase } from '../db/client'
import { checks } from '../db/schema'
import { imageCheckTarget } from '../checks/image-target'
import { listEntries } from './entries'

/** Only visible, configured image targets may enter a personalised document's CSP. */
export function browserImageOrigins(actor: Actor): string[] {
  const visible = listEntries(actor, '').entries
  const ids = new Set(visible.map((entry) => entry.id))
  const urls = visible.flatMap((entry) => (entry.browserIconUrl ? [entry.browserIconUrl] : []))
  for (const check of getDatabase().select().from(checks).all()) {
    if (check.kind === 'image' && check.executor === 'client' && ids.has(check.entryId)) {
      const url = imageCheckTarget(check, actor.role)
      if (url) urls.push(url)
    }
  }
  const origins = new Set<string>()
  for (const value of urls) {
    const url = new URL(value)
    origins.add(url.origin)
    // Some browsers upgrade HTTP images. Permit the corresponding HTTPS origin too.
    if (url.protocol === 'http:') {
      url.protocol = 'https:'
      origins.add(url.origin)
    }
  }
  return [...origins].sort()
}
