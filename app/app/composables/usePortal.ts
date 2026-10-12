import { combineQueries, queryChips } from '#shared/query-chips'
import { isTileSize, isViewMode, type TileSize, type ViewMode } from '#shared/theme'
import type {
  AuthOptions,
  PortalActor,
  PortalEntry,
  PortalField,
  PortalFilter,
  PortalNamespace,
  PortalSettings,
  PortalTag,
  SortKey,
} from '../types/portal'
import { ApiError, apiFetch } from '../utils/api'
import { groupEntries, sortEntries, visibleFieldColumns } from '../utils/view'

const anonymousActor: PortalActor = {
  role: 'anonymous',
  label: 'anonymous',
  kind: 'anonymous',
  userId: null,
}

export function usePortal() {
  const route = useRoute()
  const router = useRouter()
  const settings = useState<PortalSettings | null>('portal-settings', () => null)
  const actor = useState<PortalActor>('portal-actor', () => anonymousActor)
  const authOptions = useState<AuthOptions>('portal-auth', () => ({
    localLoginEnabled: true,
    oidcEnabled: false,
  }))
  const entries = useState<PortalEntry[]>('portal-entries', () => [])
  const filters = useState<PortalFilter[]>('portal-filters', () => [])
  const tags = useState<PortalTag[]>('portal-tags', () => [])
  const namespaces = useState<PortalNamespace[]>('portal-namespaces', () => [])
  const fields = useState<PortalField[]>('portal-fields', () => [])
  const selectedId = useState<string | null>('portal-selected', () => null)
  const sortKey = useState<SortKey>('portal-sort-key', () => 'manual')
  const sortDirection = useState<'asc' | 'desc'>('portal-sort-dir', () => 'asc')
  const groupBy = useState<string | null>('portal-group', () => null)
  const collapsed = useState<string[]>('portal-collapsed', () => [])
  const sidebarOpen = useState('portal-sidebar', () => true)
  const loginOpen = useState('portal-login', () => false)
  const suggestionsOpen = useState('portal-suggest', () => false)
  const ready = useState('portal-ready', () => false)
  const loading = useState('portal-loading', () => false)
  const loadError = useState<string | null>('portal-error', () => null)
  const queryError = useState<string | null>('portal-query-error', () => null)
  const logoVersion = useState('portal-logo-version', () => 0)
  const queryOverride = useState<string | null>('portal-query-override', () => null)
  const viewOverrides = useState<Record<string, ViewMode>>('bp-view-modes', () => ({}))
  const columnCount = useState('portal-column-count', () => 1)
  const density = useState<'comfortable' | 'compact'>('portal-density', () => 'compact')
  const facetsOpen = useState('portal-facets', () => false)
  const tileSize = useState<TileSize>('portal-tile-size', () => 'regular')
  const editMode = useState('portal-edit-mode', () => false)

  const routeQuery = computed(() => (typeof route.query.q === 'string' ? route.query.q : ''))
  const queryText = computed(() => queryOverride.value ?? routeQuery.value)
  const tabParam = computed(() => (typeof route.query.tab === 'string' ? route.query.tab : ''))
  const routeView = computed(() => (typeof route.query.view === 'string' ? route.query.view : ''))

  watch(routeQuery, (value) => {
    if (queryOverride.value === value) {
      queryOverride.value = null
    }
  })
  const allVisible = computed(
    () => actor.value.role !== 'anonymous' || settings.value?.allTabPublic === true,
  )
  const globalFilters = computed(() =>
    filters.value
      .filter((filter) => filter.ownerUserId === null)
      .sort((left, right) => left.sort - right.sort),
  )
  const personalFilters = computed(() =>
    filters.value
      .filter((filter) => filter.ownerUserId !== null)
      .sort((left, right) => left.sort - right.sort || left.name.localeCompare(right.name)),
  )
  const activeFilter = computed(
    () => filters.value.find((filter) => filter.id === tabParam.value) ?? null,
  )
  const activeTab = computed(() => {
    if (activeFilter.value) {
      return activeFilter.value.id
    }
    return 'all'
  })
  const sortedEntries = computed(() =>
    sortEntries(entries.value, sortKey.value, sortDirection.value),
  )
  const groups = computed(() => groupEntries(sortedEntries.value, groupBy.value))
  const visibleEntries = computed(() => {
    if (!groupBy.value) {
      return sortedEntries.value
    }
    return groups.value.flatMap((group) =>
      collapsed.value.includes(group.key) ? [] : group.entries,
    )
  })
  const columns = computed(() =>
    visibleFieldColumns(activeFilter.value?.columns ?? [], fields.value),
  )
  const viewMode = computed<ViewMode>(() => {
    if (isViewMode(routeView.value)) {
      return routeView.value
    }
    return viewOverrides.value[activeTab.value] ?? activeFilter.value?.viewMode ?? 'tiles'
  })
  const canWrite = computed(() => actor.value.role === 'editor' || actor.value.role === 'admin')
  const canAdmin = computed(() => actor.value.role === 'admin')

  function queryState(query: string, tab: string, view?: string) {
    const current = isViewMode(routeView.value) ? routeView.value : undefined
    const mode = view ?? current
    return {
      q: query || undefined,
      tab: tab && tab !== 'all' ? tab : undefined,
      view: mode,
    }
  }

  async function setQuery(value: string) {
    queryOverride.value = value
    await router.replace({ query: queryState(value, tabParam.value) })
  }

  async function setTab(id: string) {
    const filter = filters.value.find((item) => item.id === id)
    groupBy.value = filter?.groupBy ?? null
    collapsed.value = []
    await router.replace({ query: queryState(queryText.value, id) })
  }

  async function load() {
    loading.value = true
    loadError.value = null
    try {
      const [
        settingsBody,
        sessionBody,
        optionsBody,
        filterBody,
        tagBody,
        namespaceBody,
        fieldBody,
      ] = await Promise.all([
        apiFetch<PortalSettings>('/api/v1/settings'),
        apiFetch<{ actor: PortalActor }>('/api/v1/auth/session'),
        apiFetch<AuthOptions>('/api/v1/auth/options'),
        apiFetch<{ filters: PortalFilter[] }>('/api/v1/filters'),
        apiFetch<{ tags: PortalTag[] }>('/api/v1/tags'),
        apiFetch<{ namespaces: PortalNamespace[] }>('/api/v1/namespaces'),
        apiFetch<{ fields: PortalField[] }>('/api/v1/fields'),
      ])
      settings.value = settingsBody
      actor.value = sessionBody.actor
      authOptions.value = optionsBody
      filters.value = filterBody.filters
      tags.value = tagBody.tags
      namespaces.value = namespaceBody.namespaces
      fields.value = fieldBody.fields
      if (sessionBody.actor.userId) {
        const preferences = await apiFetch<{
          viewModes: Record<string, ViewMode>
          facetsOpen: boolean
          tileSize: TileSize
        }>('/api/v1/preferences')
        viewOverrides.value = { ...viewOverrides.value, ...preferences.viewModes }
        facetsOpen.value = preferences.facetsOpen
        if (isTileSize(preferences.tileSize)) {
          tileSize.value = preferences.tileSize
        }
      } else if (import.meta.client) {
        facetsOpen.value = document.cookie.includes('bp-facets=1')
      }
      if (
        import.meta.client &&
        sessionStorage.getItem('bp-edit-mode') === '1' &&
        (sessionBody.actor.role === 'editor' || sessionBody.actor.role === 'admin')
      ) {
        editMode.value = true
      }
      await ensureTab()
      await reloadEntries()
      ready.value = true
    } catch (error) {
      loadError.value = error instanceof Error ? error.message : 'Could not load the portal'
    } finally {
      loading.value = false
    }
  }

  async function reloadEntries() {
    const parsed = queryChips(queryText.value)
    if (parsed.error) {
      queryError.value = parsed.error.message
      return
    }
    queryError.value = null
    const filter = filters.value.find((item) => item.id === tabParam.value)
    const combined = combineQueries(filter?.query ?? '', queryText.value)
    try {
      const body = await apiFetch<{ entries: PortalEntry[] }>(
        `/api/v1/entries?q=${encodeURIComponent(combined)}`,
      )
      entries.value = body.entries
      if (!selectedId.value || !body.entries.some((entry) => entry.id === selectedId.value)) {
        selectedId.value = body.entries[0]?.id ?? null
      }
    } catch (error) {
      queryError.value = error instanceof ApiError ? error.message : 'Could not load entries'
    }
  }

  async function refreshTags() {
    const body = await apiFetch<{ tags: PortalTag[] }>('/api/v1/tags')
    tags.value = body.tags
  }

  async function ensureTab() {
    const current = tabParam.value
    if (current && filters.value.some((filter) => filter.id === current)) {
      return
    }
    if (!current && allVisible.value) {
      return
    }
    if (allVisible.value && current === 'all') {
      return
    }
    const fallback = allVisible.value ? 'all' : (globalFilters.value[0]?.id ?? 'all')
    if (fallback !== 'all' || current) {
      await router.replace({ query: queryState(queryText.value, fallback) })
    }
  }

  async function setFacetsOpen(open: boolean) {
    facetsOpen.value = open
    document.cookie = `bp-facets=${open ? '1' : '0'}; Path=/; SameSite=Lax`
    if (actor.value.userId) {
      await apiFetch('/api/v1/preferences', { method: 'PATCH', body: { facetsOpen: open } })
    }
  }

  async function setTileSize(size: TileSize) {
    tileSize.value = size
    if (actor.value.userId) {
      await apiFetch('/api/v1/preferences', { method: 'PATCH', body: { tileSize: size } })
    }
  }

  function setEditMode(enabled: boolean) {
    editMode.value = enabled ? canWrite.value : false
    if (import.meta.client) {
      sessionStorage.setItem('bp-edit-mode', editMode.value ? '1' : '0')
    }
  }

  async function setView(mode: ViewMode) {
    viewOverrides.value = { ...viewOverrides.value, [activeTab.value]: mode }
    await router.replace({ query: queryState(queryText.value, tabParam.value, mode) })
    await persistViewModes()
  }

  async function persistViewModes() {
    writeThemeCookie(viewOverrides.value)
    if (!actor.value.userId) {
      return
    }
    await apiFetch('/api/v1/preferences', {
      method: 'PATCH',
      body: { viewModes: viewOverrides.value },
    })
  }

  function moveSelection(delta: number) {
    const rows = visibleEntries.value
    if (rows.length === 0) {
      selectedId.value = null
      return
    }
    const index = rows.findIndex((entry) => entry.id === selectedId.value)
    const nextIndex = Math.max(0, Math.min(rows.length - 1, (index < 0 ? 0 : index) + delta))
    selectedId.value = rows[nextIndex]?.id ?? null
  }

  function toggleSort(key: SortKey) {
    if (sortKey.value === key) {
      sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
      return
    }
    sortKey.value = key
    sortDirection.value = 'asc'
  }

  function listen() {
    if (!import.meta.client || liveSource) {
      return
    }
    liveSource = new EventSource('/api/v1/events')
    const refresh = () => {
      void reloadEntries()
      void refreshTags()
    }
    liveSource.addEventListener('entries', refresh)
    liveSource.addEventListener('status', refresh)
  }

  async function login(username: string, password: string) {
    await apiFetch('/api/v1/auth/login', { method: 'POST', body: { username, password } })
    loginOpen.value = false
    ready.value = false
    await load()
  }

  async function logout() {
    await apiFetch('/api/v1/auth/logout', { method: 'POST', body: {} })
    selectedId.value = null
    ready.value = false
    await load()
  }

  return {
    settings,
    actor,
    authOptions,
    entries,
    filters,
    tags,
    namespaces,
    fields,
    selectedId,
    sortKey,
    sortDirection,
    groupBy,
    collapsed,
    sidebarOpen,
    loginOpen,
    suggestionsOpen,
    ready,
    loading,
    loadError,
    queryError,
    logoVersion,
    queryText,
    tabParam,
    allVisible,
    globalFilters,
    personalFilters,
    activeFilter,
    activeTab,
    groups,
    sortedEntries,
    visibleEntries,
    columns,
    viewMode,
    columnCount,
    density,
    facetsOpen,
    tileSize,
    editMode,
    canWrite,
    canAdmin,
    setQuery,
    setTab,
    load,
    reloadEntries,
    refreshTags,
    setFacetsOpen,
    setTileSize,
    setEditMode,
    setView,
    moveSelection,
    toggleSort,
    listen,
    login,
    logout,
  }
}

let liveSource: EventSource | null = null

function writeThemeCookie(modes: Record<string, ViewMode>) {
  if (!import.meta.client) {
    return
  }
  const payload = encodeURIComponent(JSON.stringify({ viewModes: modes }))
  document.cookie = `bp-theme=${payload}; Path=/; SameSite=Lax`
}
