<script setup lang="ts">
import type { PortalEntry, SortKey } from '../types/portal'

const portal = usePortal()
const emit = defineEmits<{ open: [entry: PortalEntry] }>()
const scroller = ref<HTMLElement | null>(null)
const scrollTop = ref(0)

const namespaceOptions = computed(() => [
  { label: 'No grouping', value: '' },
  ...[...portal.namespaces.value]
    .sort((left, right) => left.sort - right.sort)
    .map((namespace) => ({ label: namespace.label, value: namespace.name })),
])

watch(
  () => portal.entries.value,
  async () => {
    await nextTick()
    if (scroller.value) {
      scroller.value.scrollTop = scrollTop.value
    }
  },
)

watch(
  () => portal.selectedId.value,
  async () => {
    await nextTick()
    scroller.value?.querySelector('[data-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  },
)

function onScroll() {
  scrollTop.value = scroller.value?.scrollTop ?? 0
}

function statusLabel(status: PortalEntry['status']): string {
  if (status === 'up') {
    return 'Up'
  }
  if (status === 'down') {
    return 'Down'
  }
  if (status === 'unknown') {
    return 'Unknown'
  }
  return 'No checks'
}

function statusClass(status: PortalEntry['status']): string {
  if (status === 'up') {
    return 'bg-emerald-500'
  }
  if (status === 'down') {
    return 'bg-red-500'
  }
  if (status === 'unknown') {
    return 'bg-amber-400'
  }
  return 'bg-slate-300'
}

function letter(name: string): string {
  return (name.trim().charAt(0) || '?').toUpperCase()
}

function fieldValue(entry: PortalEntry, key: string): string {
  return entry.fields.find((field) => field.key === key)?.value ?? ''
}

function sortMark(key: SortKey): string {
  if (portal.sortKey.value !== key) {
    return ''
  }
  return portal.sortDirection.value === 'asc' ? ' ↑' : ' ↓'
}

function toggleGroup(key: string) {
  portal.collapsed.value = portal.collapsed.value.includes(key)
    ? portal.collapsed.value.filter((item) => item !== key)
    : [...portal.collapsed.value, key]
}

function setGroup(value: string) {
  portal.groupBy.value = value || null
  portal.collapsed.value = []
}

function collapseAll() {
  portal.collapsed.value = portal.groups.value.map((group) => group.key)
}

function expandAll() {
  portal.collapsed.value = []
}
</script>

<template>
  <div class="flex min-w-0 flex-1 flex-col">
    <div
      class="flex flex-wrap items-center gap-2 border-b border-slate-200 px-2 py-1 text-sm dark:border-slate-700"
    >
      <button
        v-if="!portal.sidebarOpen.value"
        type="button"
        class="rounded px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800"
        @click="portal.sidebarOpen.value = true"
      >
        Tags
      </button>
      <label class="flex items-center gap-1">
        Group
        <select
          class="rounded border border-slate-300 bg-white px-1 py-0.5 dark:border-slate-600 dark:bg-slate-900"
          :value="portal.groupBy.value ?? ''"
          @change="setGroup(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="option in namespaceOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </label>
      <button
        type="button"
        class="rounded px-2 py-0.5 hover:bg-slate-100 dark:hover:bg-slate-800"
        @click="portal.toggleSort('manual')"
      >
        Manual order{{ sortMark('manual') }}
      </button>
      <template v-if="portal.groupBy.value">
        <button
          type="button"
          class="rounded px-2 py-0.5 hover:bg-slate-100 dark:hover:bg-slate-800"
          @click="expandAll"
        >
          Expand all
        </button>
        <button
          type="button"
          class="rounded px-2 py-0.5 hover:bg-slate-100 dark:hover:bg-slate-800"
          @click="collapseAll"
        >
          Collapse all
        </button>
      </template>
      <span class="ml-auto text-xs text-slate-500">{{ portal.entries.value.length }} entries</span>
    </div>
    <div ref="scroller" class="min-h-0 flex-1 overflow-auto" @scroll="onScroll">
      <table class="w-full border-collapse text-left text-sm">
        <thead class="sticky top-0 z-10 bg-white text-xs text-slate-500 dark:bg-slate-950">
          <tr>
            <th class="w-8 px-2 py-1" />
            <th class="px-2 py-1">
              <button type="button" @click="portal.toggleSort('name')">
                Name{{ sortMark('name') }}
              </button>
            </th>
            <th class="px-2 py-1">Links</th>
            <th class="px-2 py-1">
              <button type="button" @click="portal.toggleSort('status')">
                Status{{ sortMark('status') }}
              </button>
            </th>
            <th class="px-2 py-1">
              <button type="button" @click="portal.toggleSort('description')">
                Description{{ sortMark('description') }}
              </button>
            </th>
            <th v-for="column in portal.columns.value" :key="column.key" class="px-2 py-1">
              <button type="button" @click="portal.toggleSort(`field:${column.key}`)">
                {{ column.label }}{{ sortMark(`field:${column.key}`) }}
              </button>
            </th>
            <th class="px-2 py-1">Tags</th>
          </tr>
        </thead>
        <tbody>
          <template
            v-for="group in portal.groupBy.value
              ? portal.groups.value
              : [{ key: 'all', label: '', entries: portal.visibleEntries.value }]"
            :key="group.key"
          >
            <tr v-if="portal.groupBy.value" class="bg-slate-50 dark:bg-slate-900">
              <td :colspan="6 + portal.columns.value.length" class="px-2 py-1">
                <button type="button" class="font-medium" @click="toggleGroup(group.key)">
                  {{ portal.collapsed.value.includes(group.key) ? '▸' : '▾' }}
                  {{ group.label }}
                  <span class="text-xs text-slate-500">({{ group.entries.length }})</span>
                </button>
              </td>
            </tr>
            <template v-if="!portal.groupBy.value || !portal.collapsed.value.includes(group.key)">
              <tr
                v-for="entry in group.entries"
                :key="`${group.key}-${entry.id}`"
                data-testid="entry-row"
                :data-entry-name="entry.name"
                :data-selected="portal.selectedId.value === entry.id"
                class="border-t border-slate-100 dark:border-slate-800"
                :class="
                  portal.selectedId.value === entry.id ? 'bg-teal-50 dark:bg-teal-950/40' : ''
                "
                @click="portal.selectedId.value = entry.id"
              >
                <td class="px-2 py-1">
                  <span
                    class="inline-flex size-6 items-center justify-center rounded text-xs font-semibold text-white"
                    :style="{ background: 'var(--portal-accent)' }"
                    :title="entry.name"
                  >
                    {{ letter(entry.name) }}
                  </span>
                </td>
                <td class="px-2 py-1">
                  <button
                    type="button"
                    class="font-medium hover:underline"
                    @click.stop="emit('open', entry)"
                  >
                    {{ entry.name }}
                  </button>
                  <div v-if="entry.host" class="text-xs text-slate-500">{{ entry.host }}</div>
                </td>
                <td class="px-2 py-1" @click.stop>
                  <span class="flex flex-wrap gap-1">
                    <a
                      v-for="link in entry.links"
                      :key="link.id"
                      :href="link.url ?? undefined"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="rounded border border-slate-300 px-1.5 py-0.5 text-xs hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
                      :class="link.url ? '' : 'pointer-events-none opacity-50'"
                      :title="link.urlError ?? link.urlTemplate"
                      :aria-disabled="link.url ? undefined : 'true'"
                    >
                      {{ link.label }}
                    </a>
                  </span>
                </td>
                <td class="px-2 py-1">
                  <span
                    class="inline-block size-2.5 rounded-full"
                    :class="statusClass(entry.status)"
                    :title="statusLabel(entry.status)"
                  />
                </td>
                <td class="max-w-xs truncate px-2 py-1 text-slate-600 dark:text-slate-300">
                  {{ entry.description }}
                </td>
                <td
                  v-for="column in portal.columns.value"
                  :key="column.key"
                  class="max-w-40 truncate px-2 py-1"
                >
                  {{ fieldValue(entry, column.key) }}
                </td>
                <td class="px-2 py-1">
                  <span class="flex flex-wrap gap-1">
                    <span
                      v-for="tag in entry.tags"
                      :key="tag.label"
                      class="rounded px-1.5 py-0.5 text-xs text-white"
                      :style="{
                        background:
                          portal.namespaces.value.find(
                            (namespace) => namespace.name === tag.namespace,
                          )?.colour ?? '#64748b',
                      }"
                    >
                      {{ tag.label }}
                    </span>
                  </span>
                </td>
              </tr>
            </template>
          </template>
        </tbody>
      </table>
      <p
        v-if="!portal.loading.value && portal.entries.value.length === 0"
        class="p-6 text-sm text-slate-500"
      >
        No entries match this view.
      </p>
    </div>
  </div>
</template>
