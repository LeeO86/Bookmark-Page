<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { isColourMode } from '#shared/theme'
import type { PortalEntry } from '../types/portal'
import { apiFetch } from '../utils/api'
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
let ignoreColour = true

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

function openAddLink() {
  const entry =
    portal.visibleEntries.value.find((item) => item.id === portal.selectedId.value) ??
    portal.visibleEntries.value[0]
  if (!entry) {
    return
  }
  openEntry(entry)
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
  <div class="flex min-h-dvh flex-col px-4 py-6 md:px-6">
    <a href="#devices" class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2">
      Skip to devices
    </a>
    <header class="flex w-full items-start justify-between gap-4">
      <div class="flex min-w-0 items-center gap-4">
        <img
          v-if="portal.settings.value?.hasLogo"
          :src="`/api/v1/logo?v=${portal.logoVersion.value}`"
          alt=""
          class="size-14 object-contain"
        />
        <div class="min-w-0">
          <h1 class="page-title truncate text-highlighted">
            {{ portal.settings.value?.siteTitle || 'Bookmark-Page' }}
          </h1>
          <p v-if="portal.settings.value?.siteClaim" class="mt-1 truncate text-base text-muted">
            {{ portal.settings.value.siteClaim }}
          </p>
        </div>
      </div>
      <UDropdownMenu v-if="portal.actor.value.role !== 'anonymous'" :items="menuItems">
        <UButton color="neutral" variant="ghost" icon="i-lucide-circle-user" size="lg">
          {{ portal.actor.value.label }}
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

    <div class="mx-auto mt-8 w-full max-w-3xl">
      <div class="flex items-start gap-2">
        <QueryBar class="flex-1" @command="commandOpen = true" />
        <UButton
          color="neutral"
          :variant="portal.facetsOpen.value ? 'soft' : 'outline'"
          data-testid="filters"
          :aria-pressed="portal.facetsOpen.value"
          @click="portal.setFacetsOpen(!portal.facetsOpen.value)"
        >
          Filters
        </UButton>
      </div>
      <TabBar class="mt-4" />
      <div class="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <UButton
          v-for="mode in ['tiles', 'cards', 'list'] as const"
          :key="mode"
          size="xs"
          :color="portal.viewMode.value === mode ? 'primary' : 'neutral'"
          :variant="portal.viewMode.value === mode ? 'soft' : 'ghost'"
          :data-testid="`view-${mode}`"
          @click="portal.setView(mode)"
        >
          {{ mode }}
        </UButton>
        <UButton
          v-if="portal.viewMode.value === 'tiles'"
          size="xs"
          color="neutral"
          variant="ghost"
          @click="portal.setTileSize(portal.tileSize.value === 'large' ? 'regular' : 'large')"
        >
          {{ portal.tileSize.value === 'large' ? 'Large tiles' : 'Regular tiles' }}
        </UButton>
        <UButton v-if="portal.editMode.value" size="xs" data-testid="new-entry" @click="openNew">
          New entry
        </UButton>
        <UButton
          v-if="portal.editMode.value"
          size="xs"
          color="neutral"
          variant="outline"
          @click="openAddLink"
        >
          Add link
        </UButton>
      </div>
    </div>

    <p
      v-if="portal.editMode.value"
      class="mt-4 w-full rounded-lg bg-primary/15 px-3 py-2 text-sm text-accent"
      data-testid="edit-banner"
    >
      Edit mode is on. Shift+E leaves it. Clicks on a device still open its link.
    </p>

    <main id="devices" class="mt-8 w-full flex-1">
      <EntryViews @edit="openEntry($event)" @history="openEntry($event, true)" />
    </main>

    <footer class="mx-auto mt-10 text-xs text-muted">Bookmark-Page 2.0.0</footer>

    <USlideover
      :open="portal.facetsOpen.value"
      title="Filters"
      description="Click a facet to add it. Shift adds OR. Alt adds NOT."
      @update:open="portal.setFacetsOpen"
    >
      <template #body>
        <TagSidebar />
      </template>
    </USlideover>
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
