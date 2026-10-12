<script setup lang="ts">
import type { PortalEntry } from '../types/portal'
import { primaryLink } from '../utils/links'

const portal = usePortal()
const emit = defineEmits<{ edit: [entry: PortalEntry] }>()
const grid = ref<HTMLElement | HTMLElement[] | null>(null)

function measure() {
  const element = Array.isArray(grid.value) ? grid.value[0] : grid.value
  if (!element) {
    portal.columnCount.value = 1
    return
  }
  const columns = getComputedStyle(element).gridTemplateColumns.split(' ').filter(Boolean)
  portal.columnCount.value = Math.max(1, columns.length)
}

onMounted(() => {
  measure()
  window.addEventListener('resize', measure)
})
onBeforeUnmount(() => window.removeEventListener('resize', measure))

function openPrimary(entry: PortalEntry) {
  const href = primaryLink(entry)?.url
  if (href) {
    window.open(href, '_blank', 'noopener,noreferrer')
  }
}
</script>

<template>
  <div class="min-h-0 flex-1 overflow-auto p-3">
    <section v-for="group in portal.groups.value" :key="group.key" class="mb-4">
      <button
        v-if="portal.groupBy.value"
        type="button"
        class="mb-2 text-sm font-medium"
        :aria-expanded="!portal.collapsed.value.includes(group.key)"
        @click="
          portal.collapsed.value = portal.collapsed.value.includes(group.key)
            ? portal.collapsed.value.filter((item) => item !== group.key)
            : [...portal.collapsed.value, group.key]
        "
      >
        {{ group.label }} ({{ group.entries.length }})
      </button>
      <div
        v-show="!portal.groupBy.value || !portal.collapsed.value.includes(group.key)"
        ref="grid"
        class="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-3"
      >
        <article
          v-for="entry in group.entries"
          :key="entry.id"
          class="flex flex-col items-center gap-2 rounded-md border border-default bg-elevated p-3 text-center"
          :class="[
            portal.selectedId.value === entry.id ? 'ring-2 ring-primary' : '',
            entry.status === 'down' ? 'bg-error/10' : '',
          ]"
          :data-selected="portal.selectedId.value === entry.id"
          @click="portal.selectedId.value = entry.id"
        >
          <EntryTitle
            :entry="entry"
            class="flex flex-col items-center gap-2"
            @click="openPrimary(entry)"
          >
            <EntryIcon :name="entry.name" :src="entry.iconUrl" class="size-12" />
          </EntryTitle>
          <EntryTitle :entry="entry" tabbable class="line-clamp-2 text-sm" />
          <StatusMark :status="entry.status" :checks="entry.checks" />
          <EntryMenu :entry="entry" @edit="emit('edit', entry)" />
        </article>
      </div>
    </section>
  </div>
</template>
