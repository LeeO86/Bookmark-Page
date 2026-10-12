import type { PortalEntry, PortalLink } from '../types/portal'

const typeIcons: Record<string, string> = {
  web: 'globe',
  api: 'braces',
  ssh: 'terminal',
  vnc: 'monitor',
  rdp: 'app-window',
  telnet: 'square-terminal',
  other: 'link',
}

export function primaryLink(entry: PortalEntry): PortalLink | null {
  return entry.links.find((link) => link.isPrimary && link.url) ?? null
}

export function copyableLink(link: PortalLink): boolean {
  return Boolean(link.url) && link.type !== 'web' && link.type !== 'api'
}

export function linkIcon(link: PortalLink): string {
  if (link.iconUrl) {
    return link.iconUrl
  }
  const name = typeIcons[link.type] ?? 'link'
  return `/api/icons/lucide/${name}`
}
