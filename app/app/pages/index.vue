<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { isColourMode } from '#shared/theme'
import type { PortalEntry } from '../types/portal'
import { apiFetch } from '../utils/api'
import { version } from '../../package.json'
import { primaryLink } from '../utils/links'

const portal = usePortal()
const clientChecks = useClientChecks()
const colorMode = useColorMode()
const toast = useToast()
const drawerOpen = ref(false)
const creating = ref(false)
const editing = ref<PortalEntry | null>(null)
const commandOpen = ref(false)
const historyOnly = ref(false)
const narrow = ref(false)
const navDrawer = ref(false)
let ignoreColour = true

function initials(label: string): string {
  return (label.trim().charAt(0) || '?').toUpperCase()
}

watch([portal.queryText, portal.tabParam], () => {
  if (!portal.ready.value) {
    return
  }
  void portal.reloadEntries()
})

watch(
  () => portal.loadError.value,
  (message) => {
    if (message) {
      toast.add({ title: 'Could not load the portal', description: message, color: 'error' })
    }
  },
)

onMounted(() => {
  ignoreColour = false
  const media = window.matchMedia('(max-width: 767px)')
  const updateNarrow = () => {
    narrow.value = media.matches
    if (!media.matches) {
      navDrawer.value = false
    }
  }
  updateNarrow()
  media.addEventListener('change', updateNarrow)
  void portal.load()
  portal.listen()
  clientChecks.start()
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  clientChecks.stop()
  window.removeEventListener('keydown', onKeydown)
})

function openEntry(entry: PortalEntry, history = false) {
  historyOnly.value = history && !portal.editMode.value
  creating.value = false
  editing.value = entry
  drawerOpen.value = true
  portal.selectedId.value = entry.id
}

function openNew() {
  historyOnly.value = false
  creating.value = true
  editing.value = null
  drawerOpen.value = true
}

function onSaved(entry: PortalEntry) {
  creating.value = false
  editing.value = entry
  toast.add({ title: 'Entry saved', color: 'success' })
  void portal.reloadEntries()
  void portal.refreshTags()
}

const menuItems = computed<DropdownMenuItem[][]>(() => {
  const items: DropdownMenuItem[][] = [
    [
      {
        label: 'Light',
        type: 'checkbox' as const,
        checked: colorMode.value === 'light',
        onSelect: () => {
          colorMode.preference = 'light'
        },
      },
      {
        label: 'Dark',
        type: 'checkbox' as const,
        checked: colorMode.value === 'dark',
        onSelect: () => {
          colorMode.preference = 'dark'
        },
      },
      {
        label: 'System',
        type: 'checkbox' as const,
        checked: colorMode.value === 'system',
        onSelect: () => {
          colorMode.preference = 'system'
        },
      },
    ],
  ]
  if (portal.canWrite.value) {
    items.push([
      {
        label: portal.editMode.value ? 'Leave edit mode' : 'Edit mode',
        icon: 'i-lucide-pencil',
        onSelect: () => portal.setEditMode(!portal.editMode.value),
      },
    ])
  }
  if (portal.canAdmin.value) {
    items.push([{ label: 'Admin', icon: 'i-lucide-settings', to: '/admin' }])
  }
  if (portal.actor.value.role !== 'anonymous') {
    items.push([{ label: 'Sign out', icon: 'i-lucide-log-out', onSelect: () => portal.logout() }])
  }
  return items
})

const groupItems = computed(() => {
  const namespaces = [...portal.namespaces.value]
    .filter((namespace) => namespace.showInSidebar)
    .sort((left, right) => left.sort - right.sort || left.label.localeCompare(right.label))
  return [
    [
      {
        label: 'No grouping',
        onSelect: () => {
          void portal.setGroup(null)
        },
      },
      ...namespaces.map((namespace) => ({
        label: namespace.label,
        onSelect: () => {
          void portal.setGroup(namespace.name)
        },
      })),
      {
        label: 'State',
        onSelect: () => {
          void portal.setGroup('state')
        },
      },
    ],
    [
      {
        label: 'Expand all',
        onSelect: () => portal.setGroupsOpen(true),
      },
      {
        label: 'Collapse all',
        onSelect: () => portal.setGroupsOpen(false),
      },
    ],
  ]
})

watch(
  () => colorMode.preference,
  (value) => {
    if (ignoreColour || !isColourMode(value) || !portal.actor.value.userId) {
      return
    }
    document.cookie = `bp-color-mode=${value}; Path=/; SameSite=Lax`
    void apiFetch('/api/v1/preferences', { method: 'PATCH', body: { colourMode: value } })
  },
)

function onKeydown(event: KeyboardEvent) {
  const target = event.target
  const typing =
    target instanceof HTMLElement &&
    (target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.isContentEditable)
  const queryFocused = target instanceof HTMLElement && target.dataset.testid === 'query-input'
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    commandOpen.value = true
    return
  }
  if (event.key === '/' && !typing) {
    event.preventDefault()
    document.querySelector<HTMLInputElement>('[data-testid="query-input"]')?.focus()
    return
  }
  if (event.shiftKey && event.key.toLowerCase() === 'e' && !typing && portal.canWrite.value) {
    event.preventDefault()
    portal.setEditMode(!portal.editMode.value)
    return
  }
  if (
    event.key === 'Escape' &&
    !drawerOpen.value &&
    !commandOpen.value &&
    (!typing || queryFocused)
  ) {
    event.preventDefault()
    void portal.setQuery('')
    return
  }
  if (event.key === 'e' && !event.shiftKey && !typing && portal.editMode.value) {
    const entry = portal.visibleEntries.value.find((item) => item.id === portal.selectedId.value)
    if (entry) {
      event.preventDefault()
      openEntry(entry)
    }
    return
  }
  const arrows = ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight']
  if (arrows.includes(event.key) && (!typing || queryFocused)) {
    if (queryFocused && portal.suggestionsOpen.value) {
      return
    }
    event.preventDefault()
    const step = portal.viewMode.value === 'list' ? 1 : portal.columnCount.value
    portal.moveSelection(event.key === 'ArrowDown' || event.key === 'ArrowRight' ? step : -step)
    return
  }
  if (
    event.key === 'Enter' &&
    target instanceof HTMLElement &&
    target.closest('a, button, summary, [role="button"]')
  ) {
    return
  }
  if (event.key === 'Enter' && !event.shiftKey && (!typing || queryFocused)) {
    if (queryFocused && portal.suggestionsOpen.value) {
      return
    }
    const entry = portal.visibleEntries.value.find((item) => item.id === portal.selectedId.value)
    const link = entry ? primaryLink(entry) : null
    if (link?.url) {
      event.preventDefault()
      window.open(link.url, '_blank', 'noopener,noreferrer')
    }
  }
}
</script>

<template>
  <div class="portal-page flex min-h-dvh flex-col">
    <a href="#devices" class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2">
      Skip to devices
    </a>
    <header class="portal-banner flex items-center justify-between gap-4 px-4 py-4 md:px-6">
      <div class="flex min-w-0 items-center gap-4">
        <img
          v-if="portal.settings.value?.hasLogo"
          :src="`/api/v1/logo?v=${portal.logoVersion.value}`"
          alt=""
          class="size-12 rounded-xl object-cover md:size-[4.5rem]"
        />
        <div class="min-w-0">
          <h1 class="page-title text-highlighted">
            {{ portal.settings.value?.siteTitle || 'Bookmark-Page' }}
          </h1>
          <p v-if="portal.settings.value?.siteClaim" class="mt-1 text-base text-muted">
            {{ portal.settings.value.siteClaim }}
          </p>
        </div>
      </div>
      <UDropdownMenu
        v-if="portal.actor.value.role !== 'anonymous'"
        :items="menuItems"
        :ui="{ content: 'bg-default shadow-lg ring ring-default' }"
      >
        <UButton color="neutral" variant="ghost" size="lg" :aria-label="portal.actor.value.label">
          <span
            class="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-inverted"
          >
            {{ initials(portal.actor.value.label) }}
          </span>
          <span class="sr-only">{{ portal.actor.value.label }}</span>
        </UButton>
      </UDropdownMenu>
      <UButton
        v-else-if="
          portal.authOptions.value.localLoginEnabled || portal.authOptions.value.oidcEnabled
        "
        data-testid="login-button"
        color="neutral"
        variant="outline"
        @click="portal.loginOpen.value = true"
      >
        Sign in
      </UButton>
    </header>

    <div class="flex min-h-0 flex-1">
      <PortalSidebar
        class="portal-sidebar sticky top-0 hidden h-dvh shrink-0 md:flex"
        :class="portal.sidebarCollapsed.value ? 'w-16' : 'w-60'"
        :collapsed="portal.sidebarCollapsed.value"
      />
      <div class="min-w-0 flex-1">
        <div
          class="portal-toolbar sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-default px-4 py-3 md:px-6"
        >
          <UButton
            class="md:hidden"
            color="neutral"
            variant="ghost"
            icon="i-lucide-panel-left"
            :aria-label="navDrawer ? 'Close sidebar' : 'Open sidebar'"
            @click="navDrawer = !navDrawer"
          />
          <QueryBar class="min-w-48 flex-1" @command="commandOpen = true" />
          <div class="flex items-center rounded-lg border border-default p-0.5">
            <UButton
              v-for="mode in ['cards', 'tiles', 'list'] as const"
              :key="mode"
              size="sm"
              color="neutral"
              :variant="portal.viewMode.value === mode ? 'soft' : 'ghost'"
              :icon="
                mode === 'cards'
                  ? 'i-lucide-layout-grid'
                  : mode === 'tiles'
                    ? 'i-lucide-grid-2x2'
                    : 'i-lucide-list'
              "
              :aria-label="mode"
              :aria-pressed="portal.viewMode.value === mode"
              :data-testid="`view-${mode}`"
              @click="portal.setView(mode)"
            />
          </div>
          <UButton
            v-if="portal.viewMode.value === 'tiles'"
            size="sm"
            color="neutral"
            variant="ghost"
            :icon="portal.tileSize.value === 'large' ? 'i-lucide-shrink' : 'i-lucide-expand'"
            :aria-label="portal.tileSize.value === 'large' ? 'Regular tiles' : 'Large tiles'"
            @click="portal.setTileSize(portal.tileSize.value === 'large' ? 'regular' : 'large')"
          />
          <UDropdownMenu
            :items="groupItems"
            :ui="{ content: 'bg-default shadow-lg ring ring-default' }"
          >
            <UButton
              color="neutral"
              variant="outline"
              size="sm"
              trailing-icon="i-lucide-chevron-down"
            >
              Group
            </UButton>
          </UDropdownMenu>
          <UButton v-if="portal.editMode.value" size="sm" data-testid="new-entry" @click="openNew">
            New entry
          </UButton>
        </div>

        <p
          v-if="portal.editMode.value"
          class="mx-4 mt-4 rounded-lg bg-primary/15 px-3 py-2 text-sm text-accent md:mx-6"
          data-testid="edit-banner"
        >
          Edit mode is on. Shift+E leaves it. Clicks on a device still open its link.
        </p>

        <main id="devices" class="px-4 py-4 md:px-6">
          <EntryViews @edit="openEntry($event)" @history="openEntry($event, true)" />
        </main>
        <footer class="px-4 py-6 text-right text-xs text-muted md:px-6">
          Bookmark-Page v{{ version }}
        </footer>
      </div>
    </div>

    <div v-if="narrow && navDrawer" class="fixed inset-0 z-40 md:hidden">
      <button
        class="absolute inset-0 bg-inverted/40"
        aria-label="Close sidebar"
        @click="navDrawer = false"
      />
      <PortalSidebar
        class="portal-sidebar absolute inset-y-0 left-0 w-72 shadow-xl"
        :collapsed="false"
        @navigate="navDrawer = false"
      />
    </div>

    <EntryDrawer
      :open="drawerOpen"
      :creating="creating"
      :entry="editing"
      :show-history="historyOnly"
      @close="drawerOpen = false"
      @saved="onSaved"
    />
    <LoginDialog />
    <PortalCommand v-model:open="commandOpen" @edit="openEntry" />
  </div>
</template>
