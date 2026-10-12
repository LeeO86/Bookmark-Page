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

function secondaries(entry: PortalEntry) {
  const primary = primaryLink(entry)
  return entry.links.filter((link) => link.url && link.id !== primary?.id)
}
</script>

<template>
  <div
    class="grid gap-4"
    :class="
      portal.tileSize.value === 'large'
        ? 'grid-cols-[repeat(auto-fill,minmax(180px,1fr))]'
        : 'grid-cols-[repeat(auto-fill,minmax(140px,1fr))]'
    "
  >
    <article
      v-for="entry in entries"
      :key="entry.id"
      class="group relative flex min-h-40 flex-col items-center rounded-2xl border border-default bg-default px-3 py-4 text-center shadow-sm"
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
      <span class="relative">
        <EntryIcon
          :name="entry.name"
          :icon-ref="entry.iconRef"
          :src="entry.iconUrl"
          :status="entry.status"
          :size="portal.tileSize.value === 'large' ? 'large' : 'tile'"
        />
      </span>
      <p class="tile-name relative mt-3 line-clamp-2 text-highlighted">{{ entry.name }}</p>
      <div v-if="secondaries(entry).length" class="relative z-10 mt-auto flex gap-1 pt-3">
        <a
          v-for="link in secondaries(entry)"
          :key="link.id"
          :href="link.url ?? undefined"
          target="_blank"
          rel="noopener noreferrer"
          :title="link.label"
          class="rounded-md p-1 text-default hover:bg-elevated"
          @click.stop
        >
          <LinkGlyph :link="link" />
          <span class="sr-only">{{ link.label }}</span>
        </a>
      </div>
      <EntryMenu
        class="absolute top-2 right-2 z-10 focus-within:opacity-100"
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
    </article>
  </div>
</template>
