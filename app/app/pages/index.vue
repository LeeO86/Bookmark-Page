<script setup lang="ts">
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

watch(
  () => portal.queryError.value,
  (message) => {
    if (message) {
      toast.add({ title: 'Query', description: message, color: 'warning' })
    }
  },
)

watch(
  () => colorMode.preference,
  (value) => {
    if (ignoreColour || !isColourMode(value)) {
      return
    }
    document.cookie = `bp-color-mode=${value}; Path=/; SameSite=Lax`
    if (portal.actor.value.userId) {
      void apiFetch('/api/v1/preferences', { method: 'PATCH', body: { colourMode: value } })
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

function openEntry(entry: PortalEntry) {
  creating.value = false
  editing.value = entry
  drawerOpen.value = true
  portal.selectedId.value = entry.id
}

function openNew() {
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
  if (event.key === 'e' && !typing && !drawerOpen.value) {
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
    const step = portal.columnCount.value
    if (event.key === 'ArrowDown') {
      portal.moveSelection(step)
    } else if (event.key === 'ArrowUp') {
      portal.moveSelection(-step)
    } else if (event.key === 'ArrowRight') {
      portal.moveSelection(1)
    } else {
      portal.moveSelection(-1)
    }
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
  <UDashboardGroup class="h-dvh">
    <a
      href="#entries"
      class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-default focus:px-2 focus:py-1"
    >
      Skip to devices
    </a>
    <UDashboardSidebar
      id="tags"
      collapsible
      resizable
      :default-size="18"
      :min-size="12"
      :max-size="32"
    >
      <template #header="{ collapsed }">
        <span v-if="!collapsed" class="text-xs font-semibold tracking-wide text-muted uppercase">
          Tags
        </span>
      </template>
      <TagSidebar />
    </UDashboardSidebar>
    <UDashboardPanel id="portal">
      <UDashboardNavbar :title="portal.settings.value?.siteTitle ?? 'Bookmark-Page'">
        <template #leading>
          <img
            v-if="portal.settings.value?.hasLogo"
            :src="`/api/v1/logo?v=${portal.logoVersion.value}`"
            alt=""
            class="h-8 w-8 object-contain"
          />
        </template>
        <template #right>
          <p
            v-if="portal.settings.value?.siteClaim"
            class="hidden truncate text-xs text-muted md:block"
          >
            {{ portal.settings.value.siteClaim }}
          </p>
          <UButton
            size="sm"
            color="neutral"
            variant="ghost"
            icon="i-lucide-search"
            @click="commandOpen = true"
          >
            Search
          </UButton>
          <UColorModeButton />
          <UButton v-if="portal.canWrite.value" size="sm" data-testid="new-entry" @click="openNew">
            New entry
          </UButton>
          <NuxtLink v-if="portal.canAdmin.value" to="/admin" class="text-sm text-accent"
            >Admin</NuxtLink
          >
          <UButton
            v-if="
              portal.actor.value.role === 'anonymous' &&
              (portal.authOptions.value.localLoginEnabled || portal.authOptions.value.oidcEnabled)
            "
            size="sm"
            color="neutral"
            variant="outline"
            data-testid="login-button"
            @click="portal.loginOpen.value = true"
          >
            Sign in
          </UButton>
          <UButton
            v-else-if="portal.actor.value.role !== 'anonymous'"
            size="sm"
            color="neutral"
            variant="ghost"
            @click="portal.logout()"
          >
            {{ portal.actor.value.label }}
          </UButton>
        </template>
      </UDashboardNavbar>
      <div class="border-b border-default px-3 py-2">
        <QueryBar />
      </div>
      <TabBar />
      <main id="entries" class="flex min-h-0 flex-1 flex-col">
        <EntryViews @edit="openEntry" />
      </main>
    </UDashboardPanel>
    <EntryDrawer
      :open="drawerOpen"
      :creating="creating"
      :entry="editing"
      @close="drawerOpen = false"
      @saved="onSaved"
    />
    <LoginDialog />
    <PortalCommand v-model:open="commandOpen" @edit="openEntry" />
  </UDashboardGroup>
</template>
