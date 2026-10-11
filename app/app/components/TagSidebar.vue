<script setup lang="ts">
import { appendQueryTerm } from '#shared/query-chips'
import { tagCounts } from '../utils/view'

const portal = usePortal()
const collapsed = ref<string[]>([])

const counts = computed(() => tagCounts(portal.entries.value))
const sections = computed(() => {
  const namespaces = [...portal.namespaces.value].sort(
    (left, right) => left.sort - right.sort || left.label.localeCompare(right.label),
  )
  const shown = namespaces.filter((namespace) => namespace.showInSidebar)
  const groups = shown.map((namespace) => ({
    id: namespace.id,
    label: namespace.label,
    colour: namespace.colour,
    tags: portal.tags.value
      .filter((tag) => tag.namespace === namespace.name)
      .map((tag) => ({ label: tag.label, count: counts.value.get(tag.label) ?? 0 }))
      .filter((tag) => tag.count > 0)
      .sort((left, right) => left.label.localeCompare(right.label)),
  }))
  const plain = portal.tags.value
    .filter((tag) => tag.namespace === null)
    .map((tag) => ({ label: tag.label, count: counts.value.get(tag.label) ?? 0 }))
    .filter((tag) => tag.count > 0)
    .sort((left, right) => left.label.localeCompare(right.label))
  if (plain.length > 0) {
    groups.push({ id: 'plain', label: 'Tags', colour: '#64748b', tags: plain })
  }
  return groups.filter((group) => group.tags.length > 0)
})

function toggle(id: string) {
  collapsed.value = collapsed.value.includes(id)
    ? collapsed.value.filter((item) => item !== id)
    : [...collapsed.value, id]
}

async function addTag(event: MouseEvent, label: string) {
  const mode = event.altKey ? 'not' : event.shiftKey ? 'or' : 'and'
  await portal.setQuery(appendQueryTerm(portal.queryText.value, label, mode))
}
</script>

<template>
  <aside
    v-show="portal.sidebarOpen.value"
    class="w-56 shrink-0 overflow-auto border-r border-slate-200 p-2 text-sm dark:border-slate-700"
  >
    <div class="mb-2 flex items-center justify-between">
      <h2 class="text-xs font-semibold tracking-wide text-slate-500 uppercase">Tags</h2>
      <button
        type="button"
        class="text-xs text-slate-500"
        @click="portal.sidebarOpen.value = false"
      >
        Hide
      </button>
    </div>
    <p v-if="sections.length === 0" class="text-xs text-slate-500">No tags in this view.</p>
    <section v-for="section in sections" :key="section.id" class="mb-3">
      <button
        type="button"
        class="flex w-full items-center gap-2 text-left font-medium"
        @click="toggle(section.id)"
      >
        <span class="inline-block size-2 rounded-full" :style="{ background: section.colour }" />
        {{ section.label }}
      </button>
      <ul v-show="!collapsed.includes(section.id)" class="mt-1 space-y-0.5 pl-4">
        <li v-for="tag in section.tags" :key="tag.label">
          <button
            type="button"
            class="flex w-full items-center justify-between rounded px-1 py-0.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800"
            :title="`${tag.label}. Click to add, Shift for OR, Alt for NOT`"
            @click="addTag($event, tag.label)"
          >
            <span class="truncate">{{ tag.label }}</span>
            <span class="text-xs text-slate-500">{{ tag.count }}</span>
          </button>
        </li>
      </ul>
    </section>
  </aside>
</template>
