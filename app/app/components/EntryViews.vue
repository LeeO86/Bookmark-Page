<script setup lang="ts">
import type { PortalEntry } from '../types/portal'
import type { ViewMode } from '#shared/theme'
import { apiFetch } from '../utils/api'

const portal = usePortal()
const emit = defineEmits<{ edit: [entry: PortalEntry]; history: [entry: PortalEntry] }>()
const dragging = ref<PortalEntry | null>(null)

const shown = computed<ViewMode>(() => portal.viewMode.value)

function toggle(key: string) {
  portal.collapsed.value = portal.collapsed.value.includes(key)
    ? portal.collapsed.value.filter((item) => item !== key)
    : [...portal.collapsed.value, key]
}

async function onDrop(target: PortalEntry) {
  const source = dragging.value
  dragging.value = null
  if (!source || source.id === target.id || !portal.editMode.value) {
    return
  }
  const rows = portal.visibleEntries.value
  const from = rows.findIndex((entry) => entry.id === source.id)
  const to = rows.findIndex((entry) => entry.id === target.id)
  if (from < 0 || to < 0) {
    return
  }
  const next = [...rows]
  const [moved] = next.splice(from, 1)
  if (!moved) {
    return
  }
  next.splice(to, 0, moved)
  await Promise.all(
    next.map((entry, index) =>
      apiFetch(`/api/v1/entries/${entry.id}`, { method: 'PATCH', body: { sort: index } }),
    ),
  )
  await portal.reloadEntries()
}
</script>

<template>
  <div class="space-y-8">
    <div
      v-if="portal.loading.value && !portal.ready.value"
      :class="
        shown === 'list'
          ? 'space-y-2'
          : shown === 'cards'
            ? 'grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4'
            : 'grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-4'
      "
    >
      <USkeleton
        v-for="index in 8"
        :key="index"
        :class="
          shown === 'list'
            ? 'h-9 rounded-md'
            : shown === 'cards'
              ? 'h-36 rounded-2xl'
              : 'h-40 rounded-2xl'
        "
      />
    </div>
    <div v-else-if="portal.entries.value.length === 0" class="py-16 text-center text-muted">
      <p v-if="portal.loadError.value">The portal could not be loaded.</p>
      <p v-else-if="portal.queryText.value">No devices match this search.</p>
      <p v-else-if="!portal.allVisible.value && portal.globalFilters.value.length === 0">
        You do not have access to any devices.
      </p>
      <p v-else>No devices yet.</p>
    </div>
    <div v-else class="space-y-8">
      <section v-for="group in portal.groups.value" :key="group.key">
        <button
          v-if="portal.groupBy.value"
          type="button"
          class="section-heading mb-3 flex w-full items-center gap-2 text-highlighted"
          :aria-expanded="!portal.collapsed.value.includes(group.key)"
          @click="toggle(group.key)"
        >
          <span class="text-muted">{{
            portal.collapsed.value.includes(group.key) ? '▸' : '▾'
          }}</span>
          <span class="min-w-0 flex-1 truncate text-left">{{ group.label }}</span>
          <span class="text-xs font-normal text-muted">{{ group.entries.length }}</span>
        </button>
        <div v-show="!portal.groupBy.value || !portal.collapsed.value.includes(group.key)">
          <EntryList
            v-if="shown === 'list'"
            :entries="group.entries"
            @edit="emit('edit', $event)"
            @history="emit('history', $event)"
            @drag="dragging = $event"
            @drop="onDrop"
          />
          <EntryCards
            v-else-if="shown === 'cards'"
            :entries="group.entries"
            @edit="emit('edit', $event)"
            @history="emit('history', $event)"
            @drag="dragging = $event"
            @drop="onDrop"
          />
          <EntryTiles
            v-else
            :entries="group.entries"
            @edit="emit('edit', $event)"
            @history="emit('history', $event)"
            @drag="dragging = $event"
            @drop="onDrop"
          />
        </div>
      </section>
    </div>
  </div>
</template>
