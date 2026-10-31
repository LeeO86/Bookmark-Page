import { describe, expect, it, vi } from 'vitest'
import type { PortalEntry, PortalField, PortalLink } from '../../app/types/portal'
import { primaryLink, statusTooltip } from '../../app/utils/links'
import { visibleFieldColumns } from '../../app/utils/view'

describe('portal view helpers', () => {
  it('renders the same check timestamps in server and browser time zones', () => {
    const checkedAt = '2026-10-31T12:34:56.000Z'
    const entry = {
      name: 'Device',
      status: 'down',
      checks: [
        {
          name: 'Port',
          state: 'down',
          checkedAt,
          reportedBy: 'server',
          latencyMs: 4,
          statusMessage: 'Offline',
        },
      ],
    } as PortalEntry
    try {
      vi.stubEnv('TZ', 'UTC')
      const server = statusTooltip(entry)
      vi.stubEnv('TZ', 'Pacific/Honolulu')
      expect(statusTooltip(entry)).toBe(server)
      expect(server).toContain(checkedAt)
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('shows secret fields the caller can already see', () => {
    const secret = field('password', 'secret')
    const note = field('note', 'text')
    expect(
      visibleFieldColumns(['password', 'note'], [note, secret]).map((item) => item.key),
    ).toEqual(['password', 'note'])
    expect(visibleFieldColumns([], [note, secret]).map((item) => item.key)).toEqual([
      'note',
      'password',
    ])
  })

  it('uses only the resolved primary link', () => {
    const entry = {
      links: [
        link('ssh', false, 'ssh://10.0.0.8'),
        link('web', true, null),
        link('web', false, 'https://10.0.0.8'),
      ],
    } as PortalEntry
    expect(primaryLink(entry)).toBeNull()
    entry.links[1] = link('web', true, 'https://10.0.0.8/admin')
    expect(primaryLink(entry)?.url).toBe('https://10.0.0.8/admin')
  })
})

function field(key: string, type: PortalField['type']): PortalField {
  return {
    id: key,
    key,
    label: key,
    type,
    minRoleToView: 'viewer',
    searchable: false,
    showAsColumnDefault: true,
    sort: 0,
  }
}

function link(type: string, isPrimary: boolean, url: string | null): PortalLink {
  return {
    id: `${type}-${String(isPrimary)}`,
    label: type,
    urlTemplate: url ?? '',
    type,
    isPrimary,
    sort: 0,
    iconRef: null,
    url,
    urlError: url ? null : 'unresolved',
    iconUrl: null,
  }
}
