<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { PortalEntry } from '../types/portal'

interface TableRow {
  id: string
  kind: 'group' | 'entry'
  entry: PortalEntry | null
  label: string
  count: number
  groupKey: string
}

const portal = usePortal()
const emit = defineEmits<{ edit: [entry: PortalEntry] }>()

const rows = computed<TableRow[]>(() => {
  if (!portal.groupBy.value) {
    return portal.sortedEntries.value.map((entry) => entryRow(entry))
  }
  return portal.groups.value.flatMap((group) => {
    const header: TableRow = {
      id: `group:${group.key}`,
      kind: 'group',
      entry: null,
      label: group.label,
      count: group.entries.length,
      groupKey: group.key,
    }
    if (portal.collapsed.value.includes(group.key)) {
      return [header]
    }
    return [header, ...group.entries.map((entry) => entryRow(entry))]
  })
})

const columns = computed<TableColumn<TableRow>[]>(() => [
  { id: 'icon', header: '' },
  { id: 'name', header: 'Name' },
  { id: 'links', header: 'Links' },
  { id: 'status', header: 'Status' },
  { id: 'description', header: 'Description' },
  ...portal.columns.value.map((field) => ({ id: `field:${field.key}`, header: field.label })),
  { id: 'tags', header: 'Tags' },
  { id: 'actions', header: '' },
])

function entryRow(entry: PortalEntry): TableRow {
  return {
    id: entry.id,
    kind: 'entry',
    entry,
    label: entry.name,
    count: 0,
    groupKey: '',
  }
}

function fieldOf(entry: PortalEntry, key: string) {
  return entry.fields.find((field) => field.key === key)
}

function toggleGroup(key: string) {
  portal.collapsed.value = portal.collapsed.value.includes(key)
    ? portal.collapsed.value.filter((item) => item !== key)
    : [...portal.collapsed.value, key]
}

function onSelect(_event: Event, row: { original: TableRow }) {
  if (row.original.entry) {
    portal.selectedId.value = row.original.entry.id
  }
}
</script>

<template>
  <UTable
    :data="rows"
    :columns="columns"
    sticky="header"
    :virtualize="{ estimateSize: 44, overscan: 12 }"
    class="h-full"
    :meta="{
      class: {
        tr: (row: { original: TableRow }) =>
          row.original.entry && portal.selectedId.value === row.original.entry.id
            ? 'bg-primary/10'
            : row.original.kind === 'group'
              ? 'bg-muted'
              : row.original.entry?.status === 'down'
                ? 'bg-error/10'
                : '',
      },
    }"
    @select="onSelect"
  >
    <template #icon-cell="{ row }">
      <EntryTitle v-if="row.original.entry" :entry="row.original.entry">
        <EntryIcon :name="row.original.entry.name" :src="row.original.entry.iconUrl" />
      </EntryTitle>
    </template>
    <template #name-header>
      <button type="button" class="font-medium" @click="portal.toggleSort('name')">Name</button>
    </template>
    <template #name-cell="{ row }">
      <button
        v-if="row.original.kind === 'group'"
        type="button"
        class="font-medium"
        :aria-expanded="!portal.collapsed.value.includes(row.original.groupKey)"
        @click="toggleGroup(row.original.groupKey)"
      >
        {{ row.original.label }}
        <span class="text-xs text-muted">({{ row.original.count }})</span>
      </button>
      <template v-else-if="row.original.entry">
        <EntryTitle :entry="row.original.entry" tabbable>
          {{ row.original.entry.name }}
        </EntryTitle>
        <div v-if="row.original.entry.host" class="text-xs text-muted">
          {{ row.original.entry.host }}
        </div>
      </template>
    </template>
    <template #links-cell="{ row }">
      <LinkButtons v-if="row.original.entry" :links="row.original.entry.links" />
    </template>
    <template #status-header>
      <button type="button" class="font-medium" @click="portal.toggleSort('status')">Status</button>
    </template>
    <template #status-cell="{ row }">
      <StatusMark
        v-if="row.original.entry"
        :status="row.original.entry.status"
        :checks="row.original.entry.checks"
      />
    </template>
    <template #description-cell="{ row }">
      <EntryTitle
        v-if="row.original.entry?.description"
        :entry="row.original.entry"
        class="block max-w-xs truncate text-sm font-normal text-toned"
      >
        {{ row.original.entry.description }}
      </EntryTitle>
    </template>
    <template
      v-for="field in portal.columns.value"
      :key="field.key"
      #[`field:${field.key}-cell`]="{ row }"
    >
      <SecretValue
        v-if="row.original.entry && fieldOf(row.original.entry, field.key)?.type === 'secret'"
        :entry-id="row.original.entry.id"
        :field-key="field.key"
      />
      <span v-else-if="row.original.entry">{{
        fieldOf(row.original.entry, field.key)?.value
      }}</span>
    </template>
    <template #tags-cell="{ row }">
      <div v-if="row.original.entry" class="flex max-w-xs flex-wrap gap-1">
        <UBadge
          v-for="tag in row.original.entry.tags"
          :key="tag.label"
          :style="{
            background: portal.namespaces.value.find((item) => item.name === tag.namespace)?.colour,
          }"
          class="text-inverted"
        >
          {{ tag.label }}
        </UBadge>
      </div>
    </template>
    <template #actions-cell="{ row }">
      <EntryMenu
        v-if="row.original.entry"
        :entry="row.original.entry"
        @edit="emit('edit', row.original.entry)"
      />
    </template>
  </UTable>
</template>
