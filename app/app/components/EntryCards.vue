<script setup lang="ts">
import type { PortalEntry } from '../types/portal'

const props = defineProps<{ dense: boolean }>()
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
watch(
  () => portal.visibleEntries.value.length,
  async () => {
    await nextTick()
    measure()
  },
)

function fieldOf(entry: PortalEntry, key: string) {
  return entry.fields.find((field) => field.key === key)
}
</script>

<template>
  <div class="min-h-0 flex-1 overflow-auto p-3">
    <section v-for="group in portal.groups.value" :key="group.key" class="mb-4">
      <button
        v-if="portal.groupBy.value"
        type="button"
        class="mb-2 flex items-center gap-2 text-sm font-medium"
        :aria-expanded="!portal.collapsed.value.includes(group.key)"
        @click="
          portal.collapsed.value = portal.collapsed.value.includes(group.key)
            ? portal.collapsed.value.filter((item) => item !== group.key)
            : [...portal.collapsed.value, group.key]
        "
      >
        {{ group.label }}
        <span class="text-xs text-muted">({{ group.entries.length }})</span>
      </button>
      <div
        v-show="!portal.groupBy.value || !portal.collapsed.value.includes(group.key)"
        ref="grid"
        class="grid gap-3"
        :class="
          props.dense
            ? 'grid-cols-[repeat(auto-fill,minmax(14rem,1fr))]'
            : 'grid-cols-[repeat(auto-fill,minmax(18rem,1fr))]'
        "
      >
        <article
          v-for="entry in group.entries"
          :key="entry.id"
          class="rounded-md border border-default bg-elevated p-3"
          :class="[
            portal.selectedId.value === entry.id ? 'ring-2 ring-primary' : '',
            entry.status === 'down' ? 'bg-error/10' : '',
            props.dense ? 'space-y-1' : 'space-y-2',
          ]"
          :data-selected="portal.selectedId.value === entry.id"
          @click="portal.selectedId.value = entry.id"
        >
          <div class="flex items-start gap-2">
            <EntryTitle :entry="entry">
              <EntryIcon :name="entry.name" :src="entry.iconUrl" />
            </EntryTitle>
            <div class="min-w-0 flex-1">
              <EntryTitle :entry="entry" tabbable class="block" />
              <p v-if="entry.host" class="truncate text-xs text-muted">{{ entry.host }}</p>
            </div>
            <StatusMark :status="entry.status" :checks="entry.checks" />
            <EntryMenu :entry="entry" @edit="emit('edit', entry)" />
          </div>
          <EntryTitle
            v-if="entry.description"
            :entry="entry"
            class="block text-sm font-normal text-toned"
          >
            {{ entry.description }}
          </EntryTitle>
          <LinkButtons :links="entry.links" />
          <dl v-if="portal.columns.value.length > 0" class="space-y-1 text-xs">
            <div v-for="field in portal.columns.value" :key="field.key" class="flex gap-2">
              <dt class="text-muted">{{ field.label }}</dt>
              <dd>
                <SecretValue
                  v-if="fieldOf(entry, field.key)?.type === 'secret'"
                  :entry-id="entry.id"
                  :field-key="field.key"
                />
                <span v-else>{{ fieldOf(entry, field.key)?.value }}</span>
              </dd>
            </div>
          </dl>
          <EntryTags :tags="entry.tags" />
        </article>
      </div>
    </section>
  </div>
</template>
