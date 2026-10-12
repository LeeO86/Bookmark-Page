<script setup lang="ts">
import type { PortalFilter } from '../types/portal'
import { apiFetch } from '../utils/api'

const portal = usePortal()
const saveOpen = ref(false)
const saveName = ref('')
const saveGlobal = ref(false)
const savePublic = ref(false)
const renameOpen = ref(false)
const renameName = ref('')
const menuFilter = ref<PortalFilter | null>(null)
const message = ref('')

function openSave() {
  saveName.value = ''
  saveGlobal.value = false
  savePublic.value = false
  message.value = ''
  saveOpen.value = true
}

async function saveTab() {
  message.value = ''
  try {
    const created = await apiFetch<PortalFilter>('/api/v1/filters', {
      method: 'POST',
      body: {
        name: saveName.value,
        query: portal.queryText.value,
        columns: portal.columns.value.map((field) => field.key),
        groupBy: portal.groupBy.value,
        viewMode: portal.viewMode.value,
        sort: portal.filters.value.length,
        isPublic: saveGlobal.value && savePublic.value,
        global: saveGlobal.value,
      },
    })
    saveOpen.value = false
    await portal.load()
    await portal.setTab(created.id)
  } catch (error) {
    message.value = error instanceof Error ? error.message : 'Could not save the tab'
  }
}

function openMenu(filter: PortalFilter) {
  menuFilter.value = filter
  renameName.value = filter.name
  renameOpen.value = true
}

async function renameTab() {
  const filter = menuFilter.value
  if (!filter) {
    return
  }
  await apiFetch(`/api/v1/filters/${filter.id}`, {
    method: 'PATCH',
    body: { name: renameName.value },
  })
  renameOpen.value = false
  await portal.load()
}

async function saveViewDefault() {
  if (!menuFilter.value) {
    return
  }
  message.value = ''
  try {
    await apiFetch(`/api/v1/filters/${menuFilter.value.id}`, {
      method: 'PATCH',
      body: { viewMode: portal.viewMode.value },
    })
    renameOpen.value = false
    await portal.load()
  } catch (error) {
    message.value = error instanceof Error ? error.message : 'Could not save the view'
  }
}

async function deleteTab(filter: PortalFilter) {
  await apiFetch(`/api/v1/filters/${filter.id}`, { method: 'DELETE', body: {} })
  if (portal.activeTab.value === filter.id) {
    await portal.setTab('all')
  }
  await portal.load()
}

async function moveTab(filter: PortalFilter, direction: -1 | 1) {
  const list =
    filter.ownerUserId === null
      ? [...portal.globalFilters.value]
      : [...portal.personalFilters.value]
  const index = list.findIndex((item) => item.id === filter.id)
  const neighbor = list[index + direction]
  if (index < 0 || !neighbor) {
    return
  }
  const next = [...list]
  next.splice(index, 1)
  next.splice(index + direction, 0, filter)
  await Promise.all(
    next.map((item, sort) =>
      apiFetch(`/api/v1/filters/${item.id}`, { method: 'PATCH', body: { sort } }),
    ),
  )
  await portal.load()
}

function canEdit(filter: PortalFilter): boolean {
  return portal.actor.value.role === 'admin' || filter.ownerUserId === portal.actor.value.userId
}
</script>

<template>
  <nav class="flex items-center gap-2 overflow-x-auto" aria-label="Filters">
    <button
      v-if="portal.allVisible.value"
      type="button"
      class="shrink-0 rounded-full px-3 py-1 text-sm"
      :class="portal.activeTab.value === 'all' ? 'bg-primary text-inverted' : 'hover:bg-elevated'"
      @click="portal.setTab('all')"
    >
      All
    </button>
    <div
      v-for="filter in portal.globalFilters.value"
      :key="filter.id"
      class="flex shrink-0 items-center"
    >
      <button
        type="button"
        class="rounded-full px-3 py-1 text-sm"
        :class="
          portal.activeTab.value === filter.id ? 'bg-primary text-inverted' : 'hover:bg-elevated'
        "
        @click="portal.setTab(filter.id)"
      >
        {{ filter.name }}
      </button>
      <button
        v-if="canEdit(filter)"
        type="button"
        class="px-1 text-xs text-muted"
        :aria-label="`Edit ${filter.name}`"
        @click="openMenu(filter)"
      >
        …
      </button>
    </div>
    <div
      v-for="filter in portal.personalFilters.value"
      :key="filter.id"
      class="flex shrink-0 items-center"
    >
      <button
        type="button"
        class="rounded-full border border-dashed border-default px-3 py-1 text-sm"
        :class="portal.activeTab.value === filter.id ? 'bg-primary text-inverted' : ''"
        @click="portal.setTab(filter.id)"
      >
        {{ filter.name }}
      </button>
      <button
        v-if="canEdit(filter)"
        type="button"
        class="px-1 text-xs text-muted"
        :aria-label="`Edit ${filter.name}`"
        @click="openMenu(filter)"
      >
        …
      </button>
    </div>
    <button
      v-if="portal.actor.value.role !== 'anonymous'"
      type="button"
      class="shrink-0 rounded px-2 py-1 text-sm text-toned hover:bg-elevated"
      @click="openSave"
    >
      + Save as tab
    </button>

    <UModal v-model:open="saveOpen" title="Save query as a tab">
      <template #body>
        <form class="space-y-3" @submit.prevent="saveTab">
          <UFormField label="Name">
            <UInput v-model="saveName" required class="w-full" />
          </UFormField>
          <label v-if="portal.canAdmin.value" class="flex items-center gap-2 text-sm">
            <input v-model="saveGlobal" type="checkbox" />
            Global tab
          </label>
          <label v-if="portal.canAdmin.value && saveGlobal" class="flex items-center gap-2 text-sm">
            <input v-model="savePublic" type="checkbox" />
            Visible to anonymous visitors
          </label>
          <p v-if="message" class="text-sm text-error">{{ message }}</p>
          <UButton type="submit" size="sm">Save tab</UButton>
        </form>
      </template>
    </UModal>

    <UModal v-model:open="renameOpen" :title="menuFilter ? menuFilter.name : 'Tab'">
      <template #body>
        <form v-if="menuFilter" class="space-y-3" @submit.prevent="renameTab">
          <UFormField label="Name">
            <UInput v-model="renameName" required class="w-full" />
          </UFormField>
          <div class="flex flex-wrap gap-2">
            <UButton type="submit" size="sm">Rename</UButton>
            <UButton
              type="button"
              size="sm"
              color="neutral"
              variant="outline"
              @click="saveViewDefault"
            >
              Use current view
            </UButton>
            <UButton
              type="button"
              size="sm"
              color="neutral"
              variant="outline"
              @click="moveTab(menuFilter, -1)"
            >
              Move left
            </UButton>
            <UButton
              type="button"
              size="sm"
              color="neutral"
              variant="outline"
              @click="moveTab(menuFilter, 1)"
            >
              Move right
            </UButton>
            <UButton
              type="button"
              size="sm"
              color="error"
              variant="soft"
              @click="deleteTab(menuFilter)"
            >
              Delete
            </UButton>
          </div>
        </form>
      </template>
    </UModal>
  </nav>
</template>
