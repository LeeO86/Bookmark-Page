<script setup lang="ts">
import { queryHasTerm, toggleQueryTerm } from '#shared/query-chips'
import type { PortalFilter } from '../types/portal'
import { apiFetch } from '../utils/api'
import { tagCounts } from '../utils/view'

defineProps<{ collapsed: boolean }>()
const emit = defineEmits<{ navigate: [] }>()
const portal = usePortal()
const collapsedGroups = ref<string[]>([])
const saveOpen = ref(false)
const saveName = ref('')
const saveGlobal = ref(false)
const savePublic = ref(false)
const menuFilter = ref<PortalFilter | null>(null)
const renameOpen = ref(false)
const renameName = ref('')
const message = ref('')

const counts = computed(() => tagCounts(portal.entries.value))
const stateTags = computed(() => {
  let online = 0
  let offline = 0
  let unknown = 0
  for (const entry of portal.entries.value) {
    if (entry.status === 'up') online += 1
    else if (entry.status === 'down') offline += 1
    else if (entry.status === 'unknown') unknown += 1
  }
  return [
    { token: 'state:online', title: 'Online', count: online, mark: 'status-up' },
    { token: 'state:offline', title: 'Offline', count: offline, mark: 'status-down' },
    { token: 'state:unknown', title: 'Unknown', count: unknown, mark: 'status-unknown' },
  ].filter((tag) => tag.count > 0 || selected(tag.token))
})
const sections = computed(() => {
  const namespaces = [...portal.namespaces.value]
    .filter((namespace) => namespace.showInSidebar)
    .sort((left, right) => left.sort - right.sort || left.label.localeCompare(right.label))
  return namespaces
    .map((namespace) => ({
      id: namespace.id,
      label: namespace.label,
      colour: namespace.colour,
      tags: portal.tags.value
        .filter((tag) => tag.namespace === namespace.name)
        .map((tag) => ({
          token: tag.label,
          title: tag.displayLabel || tag.value,
          count: counts.value.get(tag.label) ?? 0,
        }))
        .filter((tag) => tag.count > 0 || selected(tag.token))
        .sort((left, right) => left.title.localeCompare(right.title)),
    }))
    .filter((section) => section.tags.length > 0)
})

function selected(token: string): boolean {
  return queryHasTerm(portal.queryText.value, token)
}

async function addTag(event: MouseEvent, token: string) {
  const mode = event.altKey ? 'not' : event.shiftKey ? 'or' : 'and'
  await portal.setQuery(toggleQueryTerm(portal.queryText.value, token, mode))
}

function choose(id: string) {
  void portal.setTab(id)
  emit('navigate')
}

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
    emit('navigate')
  } catch (error) {
    message.value = error instanceof Error ? error.message : 'Could not save the view'
  }
}

function openMenu(filter: PortalFilter) {
  menuFilter.value = filter
  renameName.value = filter.name
  renameOpen.value = true
}

async function renameTab() {
  const filter = menuFilter.value
  if (!filter) return
  await apiFetch(`/api/v1/filters/${filter.id}`, {
    method: 'PATCH',
    body: { name: renameName.value },
  })
  renameOpen.value = false
  await portal.load()
}

async function saveViewDefault() {
  if (!menuFilter.value) return
  await apiFetch(`/api/v1/filters/${menuFilter.value.id}`, {
    method: 'PATCH',
    body: { viewMode: portal.viewMode.value, groupBy: portal.groupBy.value },
  })
  renameOpen.value = false
  await portal.load()
}

async function deleteTab(filter: PortalFilter) {
  await apiFetch(`/api/v1/filters/${filter.id}`, { method: 'DELETE', body: {} })
  if (portal.activeTab.value === filter.id) await portal.setTab('all')
  renameOpen.value = false
  await portal.load()
}

async function moveView(filter: PortalFilter, direction: -1 | 1) {
  const peers =
    filter.ownerUserId === null ? portal.globalFilters.value : portal.personalFilters.value
  const index = peers.findIndex((item) => item.id === filter.id)
  const neighbor = peers[index + direction]
  if (!neighbor || !canEdit(filter) || !canEdit(neighbor)) return
  const next = [...peers]
  next[index] = neighbor
  next[index + direction] = filter
  for (const [sort, item] of next.entries())
    await apiFetch(`/api/v1/filters/${item.id}`, { method: 'PATCH', body: { sort } })
  await portal.load()
}

function canEdit(filter: PortalFilter): boolean {
  return portal.actor.value.role === 'admin' || filter.ownerUserId === portal.actor.value.userId
}

function toggleGroup(id: string) {
  collapsedGroups.value = collapsedGroups.value.includes(id)
    ? collapsedGroups.value.filter((item) => item !== id)
    : [...collapsedGroups.value, id]
}

function iconName(icon: string | null): string {
  if (!icon) {
    return 'bookmark'
  }
  return icon.startsWith('lucide:') ? icon.slice('lucide:'.length) : 'bookmark'
}

function mask(name: string) {
  const url = `url(/api/icons/lucide/${encodeURIComponent(name)})`
  return {
    maskImage: url,
    WebkitMaskImage: url,
    maskRepeat: 'no-repeat',
    WebkitMaskRepeat: 'no-repeat',
    maskPosition: 'center',
    WebkitMaskPosition: 'center',
    maskSize: 'contain',
    WebkitMaskSize: 'contain',
  }
}
</script>

<template>
  <nav
    class="flex h-full flex-col overflow-y-auto border-r border-default bg-default p-3 text-sm"
    aria-label="Views and filters"
  >
    <p v-if="!collapsed" class="px-2 pb-2 text-xs font-semibold tracking-wide text-muted">Views</p>
    <div class="space-y-1">
      <button
        v-if="portal.allVisible.value"
        type="button"
        class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left"
        :class="
          portal.activeTab.value === 'all' ? 'bg-primary/15 text-accent' : 'hover:bg-elevated'
        "
        :title="collapsed ? 'All' : undefined"
        @click="choose('all')"
      >
        <span class="inline-block size-4 shrink-0 bg-current" :style="mask('bookmark')" />
        <span v-if="!collapsed" class="min-w-0 flex-1 truncate">All</span>
        <span v-if="!collapsed" class="text-xs text-muted">{{ portal.allCount.value }}</span>
      </button>
      <div
        v-for="filter in portal.globalFilters.value"
        :key="filter.id"
        class="group flex items-center"
      >
        <button
          type="button"
          class="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left"
          :class="
            portal.activeTab.value === filter.id ? 'bg-primary/15 text-accent' : 'hover:bg-elevated'
          "
          :title="collapsed ? filter.name : undefined"
          @click="choose(filter.id)"
        >
          <span
            class="inline-block size-4 shrink-0 bg-current"
            :style="mask(iconName(filter.icon))"
          />
          <span v-if="!collapsed" class="min-w-0 flex-1 truncate">{{ filter.name }}</span>
          <span v-if="!collapsed" class="text-xs text-muted">{{ filter.count }}</span>
        </button>
        <button
          v-if="!collapsed && canEdit(filter)"
          type="button"
          class="rounded px-1 text-muted opacity-0 group-hover:opacity-100 focus:opacity-100"
          :aria-label="`Edit ${filter.name}`"
          @click="openMenu(filter)"
        >
          …
        </button>
      </div>
      <div
        v-for="filter in portal.personalFilters.value"
        :key="filter.id"
        class="group flex items-center"
      >
        <button
          type="button"
          class="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left"
          :class="
            portal.activeTab.value === filter.id ? 'bg-primary/15 text-accent' : 'hover:bg-elevated'
          "
          @click="choose(filter.id)"
        >
          <span class="inline-block size-4 shrink-0 bg-current" :style="mask('bookmark')" />
          <span v-if="!collapsed" class="min-w-0 flex-1 truncate">{{ filter.name }}</span>
          <span v-if="!collapsed" class="text-xs text-muted">{{ filter.count }}</span>
        </button>
        <button
          v-if="!collapsed && canEdit(filter)"
          type="button"
          class="rounded px-1 text-muted"
          :aria-label="`Edit ${filter.name}`"
          @click="openMenu(filter)"
        >
          …
        </button>
      </div>
      <button
        v-if="!collapsed && portal.actor.value.role !== 'anonymous'"
        type="button"
        class="w-full rounded-lg px-2 py-1.5 text-left text-toned hover:bg-elevated"
        @click="openSave"
      >
        + Save as view
      </button>
    </div>

    <div v-if="!collapsed" class="mt-6">
      <div class="flex items-center justify-between px-2 pb-2">
        <p class="text-xs font-semibold tracking-wide text-muted">Filters</p>
        <button
          v-if="portal.queryText.value"
          type="button"
          class="text-xs text-accent"
          @click="portal.setQuery('')"
        >
          Clear filters
        </button>
      </div>
      <section v-if="stateTags.length" class="mb-3">
        <button
          type="button"
          class="flex w-full items-center gap-2 px-2 py-1 text-left font-medium"
          @click="toggleGroup('state')"
        >
          <span>{{ collapsedGroups.includes('state') ? '▸' : '▾' }}</span>
          State
        </button>
        <ul v-show="!collapsedGroups.includes('state')" class="space-y-0.5">
          <li v-for="tag in stateTags" :key="tag.token">
            <button
              type="button"
              class="flex w-full items-center justify-between rounded-lg px-2 py-1 text-left hover:bg-elevated"
              :class="selected(tag.token) ? 'bg-primary/15 font-medium text-accent' : ''"
              :title="`${tag.token}. Click to add, Shift for OR, Alt for NOT`"
              @click="addTag($event, tag.token)"
            >
              <span class="flex min-w-0 items-center gap-2">
                <span class="status-mark size-2 rounded-full" :class="tag.mark" />
                <span class="truncate">{{ tag.title }}</span>
              </span>
              <span class="text-xs text-muted">{{ tag.count }}</span>
            </button>
          </li>
        </ul>
      </section>
      <section v-for="section in sections" :key="section.id" class="mb-3">
        <button
          type="button"
          class="flex w-full items-center gap-2 px-2 py-1 text-left font-medium"
          @click="toggleGroup(section.id)"
        >
          <span>{{ collapsedGroups.includes(section.id) ? '▸' : '▾' }}</span>
          <span class="inline-block size-2 rounded-full" :style="{ background: section.colour }" />
          {{ section.label }}
        </button>
        <ul v-show="!collapsedGroups.includes(section.id)" class="space-y-0.5">
          <li v-for="tag in section.tags" :key="tag.token">
            <button
              type="button"
              class="flex w-full items-center justify-between rounded-lg px-2 py-1 text-left hover:bg-elevated"
              :class="selected(tag.token) ? 'bg-primary/15 font-medium text-accent' : ''"
              :title="`${tag.token}. Click to add, Shift for OR, Alt for NOT`"
              @click="addTag($event, tag.token)"
            >
              <span class="flex min-w-0 items-center gap-2">
                <span
                  class="inline-block size-2 rounded-full"
                  :style="{ background: section.colour }"
                />
                <span class="truncate">{{ tag.title }}</span>
              </span>
              <span class="text-xs text-muted">{{ tag.count }}</span>
            </button>
          </li>
        </ul>
      </section>
    </div>

    <button
      type="button"
      class="mt-auto rounded-lg px-2 py-2 text-left text-xs text-muted hover:bg-elevated"
      @click="portal.setSidebarCollapsed(!collapsed)"
    >
      {{ collapsed ? '»' : 'Collapse sidebar' }}
    </button>

    <UModal v-model:open="saveOpen" title="Save query as a view">
      <template #body>
        <form class="space-y-3" @submit.prevent="saveTab">
          <UFormField label="Name"
            ><UInput v-model="saveName" required class="w-full"
          /></UFormField>
          <label v-if="portal.canAdmin.value" class="flex items-center gap-2 text-sm">
            <input v-model="saveGlobal" type="checkbox" /> Global view
          </label>
          <label v-if="portal.canAdmin.value && saveGlobal" class="flex items-center gap-2 text-sm">
            <input v-model="savePublic" type="checkbox" /> Visible to anonymous visitors
          </label>
          <p v-if="message" class="text-sm text-error">{{ message }}</p>
          <UButton type="submit" size="sm">Save view</UButton>
        </form>
      </template>
    </UModal>
    <UModal v-model:open="renameOpen" :title="menuFilter ? menuFilter.name : 'View'">
      <template #body>
        <form v-if="menuFilter" class="space-y-3" @submit.prevent="renameTab">
          <UFormField label="Name"
            ><UInput v-model="renameName" required class="w-full"
          /></UFormField>
          <div class="flex flex-wrap gap-2">
            <UButton type="submit" size="sm">Rename</UButton>
            <UButton
              type="button"
              size="sm"
              color="neutral"
              :disabled="
                (menuFilter.ownerUserId === null
                  ? portal.globalFilters.value
                  : portal.personalFilters.value
                ).findIndex((item) => item.id === menuFilter?.id) === 0
              "
              @click="moveView(menuFilter, -1)"
              >Move up</UButton
            >
            <UButton
              type="button"
              size="sm"
              color="neutral"
              :disabled="
                (menuFilter.ownerUserId === null
                  ? portal.globalFilters.value
                  : portal.personalFilters.value
                ).at(-1)?.id === menuFilter.id
              "
              @click="moveView(menuFilter, 1)"
              >Move down</UButton
            >
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
