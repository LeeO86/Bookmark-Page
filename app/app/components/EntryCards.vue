<script setup lang="ts">
import type { PortalEntry } from '../types/portal'
import { primaryLink, statusTooltip } from '../utils/links'

defineProps<{ entries: PortalEntry[] }>()
defineEmits<{
  edit: [entry: PortalEntry]
  history: [entry: PortalEntry]
  drag: [entry: PortalEntry]
  drop: [entry: PortalEntry]
}>()
const portal = usePortal()
const menu = useEntryMenu()

function href(entry: PortalEntry): string | null {
  return primaryLink(entry)?.url ?? null
}

function fieldOf(entry: PortalEntry, key: string) {
  return entry.fields.find((field) => field.key === key)
}
</script>

<template>
  <div class="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
    <article
      v-for="entry in entries"
      :key="entry.id"
      class="group relative flex flex-col gap-3 rounded-2xl border border-default bg-default p-4 shadow-sm"
      :class="portal.selectedId.value === entry.id ? 'ring-2 ring-primary' : ''"
      :draggable="portal.editMode.value"
      @click="portal.selectedId.value = entry.id"
      @click.capture="menu.pressClick"
      @contextmenu.prevent="menu.open(entry.id)"
      @pointerdown="menu.pressStart(entry.id, $event)"
      @pointerup="menu.pressEnd"
      @pointercancel="menu.pressEnd"
      @pointerleave="menu.pressEnd"
      @dragstart="$emit('drag', entry)"
      @dragover.prevent
      @drop="$emit('drop', entry)"
    >
      <a
        v-if="href(entry)"
        :href="href(entry) ?? undefined"
        target="_blank"
        rel="noopener noreferrer"
        class="absolute inset-0 rounded-2xl"
        :aria-label="entry.name"
        :title="statusTooltip(entry)"
        data-testid="entry-link"
      />
      <div class="relative flex items-start gap-3">
        <EntryIcon
          :name="entry.name"
          :icon-ref="entry.iconRef"
          :src="entry.iconUrl"
          :status="entry.status"
          size="card"
        />
        <div class="min-w-0 flex-1">
          <p class="truncate text-base font-semibold text-highlighted">{{ entry.name }}</p>
          <p v-if="entry.host" class="truncate font-mono text-xs text-muted">{{ entry.host }}</p>
        </div>
        <EntryMenu
          class="relative z-10 focus-within:opacity-100"
          :class="
            portal.editMode.value ? 'opacity-100' : 'opacity-0 transition group-hover:opacity-100'
          "
          :entry="entry"
          :editing="portal.editMode.value"
          :open="menu.menuId.value === entry.id"
          @update:open="menu.onOpen(entry.id, $event)"
          @edit="$emit('edit', entry)"
          @history="$emit('history', entry)"
        />
      </div>
      <p v-if="entry.description" class="relative line-clamp-2 text-sm text-toned">
        {{ entry.description }}
      </p>
      <div class="relative z-10">
        <LinkButtons :links="entry.links" labelled />
      </div>
      <dl v-if="portal.columns.value.length" class="relative z-10 space-y-1 text-xs">
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
      <div class="relative flex flex-wrap items-center gap-1">
        <EntryTags :tags="entry.tags.slice(0, 3)" />
        <span v-if="entry.tags.length > 3" class="text-xs text-muted"
          >+{{ entry.tags.length - 3 }}</span
        >
      </div>
    </article>
  </div>
</template>
