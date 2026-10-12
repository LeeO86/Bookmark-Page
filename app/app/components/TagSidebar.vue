<script setup lang="ts">
import { appendQueryTerm, queryChips } from '#shared/query-chips'
import { tagCounts } from '../utils/view'

const portal = usePortal()
const collapsed = ref<string[]>([])

const counts = computed(() => tagCounts(portal.entries.value))
const stateTags = computed(() => {
  let online = 0
  let offline = 0
  let unknown = 0
  for (const entry of portal.entries.value) {
    if (entry.status === 'up') {
      online += 1
    } else if (entry.status === 'down') {
      offline += 1
    } else if (entry.status === 'unknown') {
      unknown += 1
    }
  }
  return [
    { label: 'state:online', title: 'Online', count: online, mark: 'status-up' },
    { label: 'state:offline', title: 'Offline', count: offline, mark: 'status-down' },
    { label: 'state:unknown', title: 'Unknown', count: unknown, mark: 'status-unknown' },
  ].filter((tag) => tag.count > 0)
})
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
    groups.push({ id: 'plain', label: 'Tags', colour: '', tags: plain })
  }
  return groups.filter((group) => group.tags.length > 0)
})

function toggle(id: string) {
  collapsed.value = collapsed.value.includes(id)
    ? collapsed.value.filter((item) => item !== id)
    : [...collapsed.value, id]
}

function selected(label: string): boolean {
  return queryChips(portal.queryText.value).chips.some((chip) => {
    const term = chip.text.replace(/^(?:NOT\s+|-\s*)/i, '')
    return term.toLowerCase() === label.toLowerCase()
  })
}

async function addTag(event: MouseEvent, label: string) {
  const mode = event.altKey ? 'not' : event.shiftKey ? 'or' : 'and'
  await portal.setQuery(appendQueryTerm(portal.queryText.value, label, mode))
}
</script>

<template>
  <div class="text-sm">
    <p v-if="stateTags.length === 0 && sections.length === 0" class="text-xs text-muted">
      No tags in this view.
    </p>
    <section v-if="stateTags.length > 0" class="mb-3">
      <p class="flex items-center gap-2 font-medium">
        <span class="inline-block size-2 rounded-full bg-primary" />
        State
      </p>
      <ul class="mt-1 space-y-0.5 pl-4">
        <li v-for="tag in stateTags" :key="tag.label">
          <button
            type="button"
            class="flex w-full items-center justify-between rounded px-1 py-0.5 text-left hover:bg-elevated"
            :class="selected(tag.label) ? 'bg-primary/15 font-medium' : ''"
            :aria-pressed="selected(tag.label)"
            :title="`${tag.label}. Click to add, Shift for OR, Alt for NOT`"
            @click="addTag($event, tag.label)"
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
        class="flex w-full items-center gap-2 text-left font-medium"
        :aria-expanded="!collapsed.includes(section.id)"
        @click="toggle(section.id)"
      >
        <span
          class="inline-block size-2 rounded-full bg-primary"
          :style="section.colour ? { background: section.colour } : undefined"
        />
        {{ section.label }}
      </button>
      <ul v-show="!collapsed.includes(section.id)" class="mt-1 space-y-0.5 pl-4">
        <li v-for="tag in section.tags" :key="tag.label">
          <button
            type="button"
            class="flex w-full items-center justify-between rounded px-1 py-0.5 text-left hover:bg-elevated"
            :class="selected(tag.label) ? 'bg-primary/15 font-medium' : ''"
            :aria-pressed="selected(tag.label)"
            :title="`${tag.label}. Click to add, Shift for OR, Alt for NOT`"
            @click="addTag($event, tag.label)"
          >
            <span class="truncate">{{ tag.label }}</span>
            <span class="text-xs text-muted">{{ tag.count }}</span>
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>
