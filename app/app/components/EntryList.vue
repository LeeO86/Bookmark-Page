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
const activation = useEntryActivation()

function href(entry: PortalEntry): string | null {
  return primaryLink(entry)?.url ?? null
}

function fieldOf(entry: PortalEntry, key: string) {
  return entry.fields.find((field) => field.key === key)
}

function mark(key: string): string {
  if (portal.sortKey.value !== key) {
    return ''
  }
  return portal.sortDirection.value === 'asc' ? ' ↑' : ' ↓'
}
</script>

<template>
  <div class="overflow-x-auto rounded-xl border border-default bg-default shadow-sm">
    <table class="w-full border-collapse text-sm">
      <thead class="sticky top-0 bg-default text-left text-xs font-medium text-muted">
        <tr :class="portal.density.value === 'compact' ? 'h-8' : 'h-9'">
          <th class="px-2 font-medium">
            <button type="button" @click="portal.toggleSort('name')">Name{{ mark('name') }}</button>
          </th>
          <th class="px-2 font-medium">Links</th>
          <th class="px-2 font-medium">
            <button type="button" @click="portal.toggleSort('description')">
              Description{{ mark('description') }}
            </button>
          </th>
          <th v-for="field in portal.columns.value" :key="field.key" class="px-2 font-medium">
            <button type="button" @click="portal.toggleSort(`field:${field.key}`)">
              {{ field.label }}{{ mark(`field:${field.key}`) }}
            </button>
          </th>
          <th class="px-2 font-medium">Tags</th>
          <th class="w-16 px-2" />
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="entry in entries"
          :key="entry.id"
          class="group border-t border-default whitespace-nowrap"
          :data-entry-id="entry.id"
          :class="[portal.density.value === 'compact' ? 'h-8' : 'h-9']"
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
          <td class="px-2">
            <a
              v-if="href(entry)"
              :href="href(entry) ?? undefined"
              target="_blank"
              rel="noopener noreferrer"
              class="flex items-center gap-2"
              data-testid="entry-link"
              :title="statusTooltip(entry)"
              @click="activation.primaryClick"
            >
              <EntryIcon
                :name="entry.name"
                :icon-ref="entry.iconRef"
                :src="entry.iconUrl"
                :status="entry.status"
                size="list"
              />
              <span class="min-w-0 truncate">
                <span class="font-medium text-highlighted">{{ entry.name }}</span>
                <span v-if="entry.host" class="ml-2 font-mono text-xs text-muted">{{
                  entry.host
                }}</span>
              </span>
            </a>
            <span v-else class="flex items-center gap-2">
              <EntryIcon
                :name="entry.name"
                :icon-ref="entry.iconRef"
                :src="entry.iconUrl"
                :status="entry.status"
                size="list"
              />
              <span class="truncate font-medium">{{ entry.name }}</span>
            </span>
          </td>
          <td class="px-2"><LinkButtons :entry-id="entry.id" :links="entry.links" /></td>
          <td class="max-w-xs truncate px-2 text-toned">{{ entry.description }}</td>
          <td v-for="field in portal.columns.value" :key="field.key" class="px-2">
            <SecretValue
              v-if="fieldOf(entry, field.key)?.type === 'secret'"
              :entry-id="entry.id"
              :field-key="field.key"
            />
            <span v-else>{{ fieldOf(entry, field.key)?.value }}</span>
          </td>
          <td class="max-w-64 px-2">
            <EntryTags :tags="entry.tags" :limit="22" nowrap />
          </td>
          <td class="px-2">
            <EntryMenu
              class="focus-within:opacity-100"
              :class="
                portal.editMode.value
                  ? 'opacity-100'
                  : 'opacity-0 transition group-hover:opacity-100'
              "
              :entry="entry"
              :editing="portal.editMode.value"
              :open="menu.menuId.value === entry.id"
              @update:open="menu.onOpen(entry.id, $event)"
              @edit="$emit('edit', entry)"
              @history="$emit('history', entry)"
            />
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
