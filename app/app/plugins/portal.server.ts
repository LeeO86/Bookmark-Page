import type { InitialPortal, PortalActor, PortalSettings } from '../types/portal'

export default defineNuxtPlugin(() => {
  const context = useRequestEvent()?.context
  const branding = context?.bookmarkBranding as
    { settings: PortalSettings; actor: PortalActor } | undefined
  if (branding) {
    useState<PortalSettings | null>('portal-settings', () => null).value = branding.settings
    useState<PortalActor | null>('portal-actor', () => null).value = branding.actor
  }
  // The request context carries the same redacted JSON view models as the API.
  const initial = context?.bookmarkPortal as InitialPortal | undefined
  if (!initial) return
  useState('portal-auth', () => initial.authOptions).value = initial.authOptions
  useState('portal-filters', () => initial.filters).value = initial.filters
  useState('portal-all-count', () => 0).value = initial.allCount
  useState('portal-tags', () => initial.tags).value = initial.tags
  useState('portal-namespaces', () => initial.namespaces).value = initial.namespaces
  useState('portal-fields', () => initial.fields).value = initial.fields
  useState('portal-entries', () => initial.entries).value = initial.entries
  useState<string | null>('portal-selected', () => null).value = initial.entries[0]?.id ?? null
  useState<string | null>('portal-query-error', () => null).value = initial.queryError
  useState<string | null>('portal-group', () => null).value = initial.groupBy
  useState('bp-view-modes', () => initial.preferences.viewModes).value =
    initial.preferences.viewModes
  useState('portal-facets', () => false).value = initial.preferences.facetsOpen
  useState('portal-sidebar-collapsed', () => false).value = initial.preferences.sidebarCollapsed
  useState('portal-group-modes', () => initial.preferences.groupModes).value =
    initial.preferences.groupModes
  useState('portal-tile-size', () => initial.preferences.tileSize).value =
    initial.preferences.tileSize
  useState('portal-ready', () => false).value = true
  useState('portal-initial-ready', () => false).value = true
})
