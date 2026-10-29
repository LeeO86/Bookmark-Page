import type { PortalEntry, PortalLink } from '../types/portal'

function statusSummary(entry: PortalEntry): string {
  if (entry.status === 'down') {
    const when = entry.checks.find((check) => check.state === 'down')?.checkedAt
    if (!when) {
      return 'Offline'
    }
    return `Offline since ${new Date(when).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  }
  if (entry.status === 'unknown') {
    return 'Status unknown'
  }
  if (entry.status === 'up') {
    return 'Online'
  }
  return entry.name
}

export function statusTooltip(entry: PortalEntry): string {
  const details = entry.checks.map((check) =>
    [
      check.name,
      check.checkedAt ? new Date(check.checkedAt).toLocaleString() : 'Not checked',
      check.reportedBy,
      check.latencyMs === null ? null : `${check.latencyMs} ms`,
      check.statusMessage,
    ]
      .filter(Boolean)
      .join(' · '),
  )
  return [statusSummary(entry), ...details].join('\n')
}

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
