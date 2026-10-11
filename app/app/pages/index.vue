<script setup lang="ts">
import type { PortalEntry } from '../types/portal'

const portal = usePortal()
const clientChecks = useClientChecks()
const drawerOpen = ref(false)
const creating = ref(false)
const editing = ref<PortalEntry | null>(null)

watch([portal.queryText, portal.tabParam], () => {
  if (!portal.ready.value) {
    return
  }
  void portal.reloadEntries()
})

onMounted(() => {
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
  if (event.key === '/' && !typing) {
    event.preventDefault()
    document.querySelector<HTMLInputElement>('[data-testid="query-input"]')?.focus()
    return
  }
  if (event.key === 'Escape' && !drawerOpen.value && (!typing || queryFocused)) {
    event.preventDefault()
    void portal.setQuery('')
    return
  }
  if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && (!typing || queryFocused)) {
    if (queryFocused && portal.suggestionsOpen.value) {
      return
    }
    event.preventDefault()
    portal.moveSelection(event.key === 'ArrowDown' ? 1 : -1)
    return
  }
  if (event.key === 'Enter' && !event.shiftKey && (!typing || queryFocused)) {
    if (queryFocused && portal.suggestionsOpen.value) {
      return
    }
    const entry = portal.visibleEntries.value.find((item) => item.id === portal.selectedId.value)
    const link =
      entry?.links.find((item) => item.isPrimary && item.url) ??
      entry?.links.find((item) => item.url)
    if (link?.url) {
      event.preventDefault()
      window.open(link.url, '_blank', 'noopener,noreferrer')
    }
  }
}

const accent = computed(() => portal.settings.value?.accentColour ?? '#0f766e')
</script>

<template>
  <div class="flex h-dvh flex-col" :style="{ '--portal-accent': accent }">
    <header
      class="flex items-center gap-3 border-b-2 px-3 py-2"
      :style="{ borderColor: 'var(--portal-accent)' }"
    >
      <img
        v-if="portal.settings.value?.hasLogo"
        :src="`/api/v1/logo?v=${portal.logoVersion.value}`"
        alt=""
        class="h-8 w-8 object-contain"
      />
      <div class="min-w-0">
        <h1 class="truncate text-base font-semibold">
          {{ portal.settings.value?.siteTitle ?? 'Bookmark-Page' }}
        </h1>
        <p v-if="portal.settings.value?.siteClaim" class="truncate text-xs text-slate-500">
          {{ portal.settings.value.siteClaim }}
        </p>
      </div>
      <QueryBar />
      <UColorModeButton />
      <UButton v-if="portal.canWrite.value" size="sm" data-testid="new-entry" @click="openNew"
        >New entry</UButton
      >
      <NuxtLink v-if="portal.canAdmin.value" to="/admin" class="text-sm underline">Admin</NuxtLink>
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
    </header>
    <p v-if="portal.loadError.value" class="bg-red-50 px-3 py-1 text-sm text-red-700">
      {{ portal.loadError.value }}
    </p>
    <p v-if="portal.queryError.value" class="bg-amber-50 px-3 py-1 text-sm text-amber-800">
      {{ portal.queryError.value }}
    </p>
    <TabBar />
    <div class="flex min-h-0 flex-1">
      <TagSidebar />
      <EntryTable @open="openEntry" />
    </div>
    <EntryDrawer
      :open="drawerOpen"
      :creating="creating"
      :entry="editing"
      @close="drawerOpen = false"
      @saved="onSaved"
    />
    <LoginDialog />
  </div>
</template>
