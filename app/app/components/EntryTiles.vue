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
</script>

<template>
  <div
    class="grid gap-4"
    :class="
      portal.tileSize.value === 'large'
        ? 'grid-cols-[repeat(auto-fill,minmax(168px,1fr))]'
        : 'grid-cols-[repeat(auto-fill,minmax(140px,1fr))]'
    "
  >
    <article
      v-for="entry in entries"
      :key="entry.id"
      :data-entry-id="entry.id"
      class="portal-card group relative flex min-h-36 flex-col items-center rounded-xl border border-default px-3 py-4 text-center"
      @click="portal.selectedId.value = entry.id"
      @click.capture="menu.pressClick"
      @contextmenu.prevent="menu.open(entry.id)"
      @pointerdown="menu.pressStart(entry.id, $event)"
      @pointerup="menu.pressEnd"
      @pointercancel="menu.pressEnd"
      @pointerleave="menu.pressEnd"
      @dragover.prevent
      @drop="$emit('drop', entry)"
    >
      <a
        v-if="href(entry)"
        :href="href(entry) ?? undefined"
        target="_blank"
        rel="noopener noreferrer"
        class="absolute inset-0 rounded-xl"
        :aria-label="entry.name"
        :title="entry.name"
        data-testid="entry-link"
      />
      <button
        v-if="portal.editMode.value"
        type="button"
        class="absolute top-2 left-2 z-10 cursor-grab text-muted"
        aria-label="Drag to reorder"
        draggable="true"
        @click.stop
        @dragstart="$emit('drag', entry)"
      >
        ⋮⋮
      </button>
      <span class="relative" :title="statusTooltip(entry)">
        <EntryIcon
          :name="entry.name"
          :icon-ref="entry.iconRef"
          :src="entry.iconUrl"
          :status="entry.status"
          :size="portal.tileSize.value === 'large' ? 'large' : 'tile'"
        />
      </span>
      <p class="tile-name relative mt-3 line-clamp-3 text-highlighted" :title="entry.name">
        {{ entry.name }}
      </p>
      <div class="relative z-10 mt-auto pt-3">
        <LinkButtons
          :entry-id="entry.id"
          :links="entry.links.filter((link) => !link.isPrimary || link.requiresReveal)"
        />
      </div>
      <EntryMenu
        v-show="portal.editMode.value || menu.menuId.value === entry.id"
        class="absolute top-2 right-2 z-10"
        :entry="entry"
        :editing="portal.editMode.value"
        :open="menu.menuId.value === entry.id"
        @update:open="menu.onOpen(entry.id, $event)"
        @edit="$emit('edit', entry)"
        @history="$emit('history', entry)"
      />
    </article>
  </div>
</template>
