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

function shownFields(entry: PortalEntry) {
  return portal.columns.value.filter((field) => {
    const value = fieldOf(entry, field.key)
    if (!value) return false
    if (value.type === 'secret') return true
    return Boolean(value.value)
  })
}
</script>

<template>
  <div class="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
    <article
      v-for="entry in entries"
      :key="entry.id"
      :data-entry-id="entry.id"
      class="portal-card group relative flex flex-col gap-3 rounded-xl border border-default p-4"
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
        :title="statusTooltip(entry)"
        data-testid="entry-link"
      />
      <div class="relative flex items-start gap-3">
        <button
          v-if="portal.editMode.value"
          type="button"
          class="relative z-10 cursor-grab text-muted"
          aria-label="Drag to reorder"
          draggable="true"
          @click.stop
          @dragstart="$emit('drag', entry)"
        >
          ⋮⋮
        </button>
        <EntryIcon
          :name="entry.name"
          :icon-ref="entry.iconRef"
          :src="entry.iconUrl"
          :status="entry.status"
          size="card"
        />
        <div class="min-w-0 flex-1">
          <p class="card-title line-clamp-2 text-highlighted" :title="entry.name">
            {{ entry.name }}
          </p>
          <p v-if="entry.host" class="truncate font-mono text-xs text-muted">{{ entry.host }}</p>
        </div>
        <EntryMenu
          v-show="portal.editMode.value || menu.menuId.value === entry.id"
          class="relative z-10"
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
      <dl v-if="shownFields(entry).length" class="relative z-10 space-y-1 text-xs">
        <div v-for="field in shownFields(entry)" :key="field.key" class="flex gap-2">
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
      <div class="relative z-10 mt-auto">
        <LinkButtons :links="entry.links.filter((link) => !link.isPrimary)" labelled />
      </div>
      <div class="relative flex flex-wrap items-center gap-1">
        <EntryTags :tags="entry.tags.slice(0, 3)" />
        <span v-if="entry.tags.length > 3" class="text-xs text-muted"
          >+{{ entry.tags.length - 3 }}</span
        >
      </div>
    </article>
  </div>
</template>
