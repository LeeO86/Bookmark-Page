<script setup lang="ts">
import type { PortalEntry } from '../types/portal'
import type { ViewMode } from '#shared/theme'

const portal = usePortal()
const emit = defineEmits<{ edit: [entry: PortalEntry] }>()
const narrow = ref(false)

const namespaceOptions = computed(() => [
  { label: 'No grouping', value: 'none' },
  ...[...portal.namespaces.value]
    .sort((left, right) => left.sort - right.sort)
    .map((namespace) => ({ label: namespace.label, value: namespace.name })),
])

const shown = computed<ViewMode>(() =>
  portal.viewMode.value === 'list' && narrow.value ? 'cards' : portal.viewMode.value,
)

onMounted(() => {
  const media = window.matchMedia('(max-width: 767px)')
  const update = () => {
    narrow.value = media.matches
  }
  update()
  media.addEventListener('change', update)
  onBeforeUnmount(() => media.removeEventListener('change', update))
})

watch(shown, (mode) => {
  portal.columnCount.value = mode === 'list' ? 1 : portal.columnCount.value
})

function setGroup(value: string) {
  portal.groupBy.value = value && value !== 'none' ? value : null
  portal.collapsed.value = []
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="flex flex-wrap items-center gap-2 border-b border-default px-2 py-1 text-sm">
      <UButton
        v-for="mode in ['list', 'cards', 'tiles'] as const"
        :key="mode"
        size="xs"
        :color="portal.viewMode.value === mode ? 'primary' : 'neutral'"
        :variant="portal.viewMode.value === mode ? 'solid' : 'ghost'"
        :data-testid="`view-${mode}`"
        @click="portal.setView(mode)"
      >
        {{ mode }}
      </UButton>
      <UButton
        v-if="shown === 'cards'"
        size="xs"
        color="neutral"
        variant="outline"
        @click="
          portal.density.value = portal.density.value === 'compact' ? 'comfortable' : 'compact'
        "
      >
        {{ portal.density.value === 'compact' ? 'Comfortable' : 'Compact' }}
      </UButton>
      <USelect
        :model-value="portal.groupBy.value || 'none'"
        :items="namespaceOptions"
        class="w-40"
        @update:model-value="setGroup(String($event ?? 'none'))"
      />
      <UButton size="xs" color="neutral" variant="ghost" @click="portal.collapsed.value = []">
        Expand
      </UButton>
      <UButton
        size="xs"
        color="neutral"
        variant="ghost"
        @click="portal.collapsed.value = portal.groups.value.map((group) => group.key)"
      >
        Collapse
      </UButton>
      <span class="ml-auto text-xs text-muted">{{ portal.entries.value.length }} entries</span>
    </div>
    <div v-if="portal.loading.value && !portal.ready.value" class="space-y-2 p-3">
      <USkeleton v-for="index in 6" :key="index" class="h-10 w-full" />
    </div>
    <div
      v-else-if="portal.visibleEntries.value.length === 0"
      class="flex flex-1 items-center justify-center p-8 text-sm text-muted"
    >
      <p v-if="portal.loadError.value">The portal could not be loaded.</p>
      <p v-else-if="portal.queryText.value">No entries match this query.</p>
      <p v-else-if="!portal.allVisible.value && portal.globalFilters.value.length === 0">
        You do not have access to any devices.
      </p>
      <p v-else>No entries yet.</p>
    </div>
    <EntryList v-else-if="shown === 'list'" class="min-h-0 flex-1" @edit="emit('edit', $event)" />
    <EntryCards
      v-else-if="shown === 'cards'"
      :dense="portal.density.value === 'compact'"
      @edit="emit('edit', $event)"
    />
    <EntryTiles v-else @edit="emit('edit', $event)" />
  </div>
</template>
