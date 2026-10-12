<script setup lang="ts">
import type { CommandPaletteGroup } from '@nuxt/ui'
import type { PortalEntry } from '../types/portal'
import { apiFetch } from '../utils/api'
import { primaryLink } from '../utils/links'

const open = defineModel<boolean>('open', { default: false })
const portal = usePortal()
const emit = defineEmits<{ edit: [entry: PortalEntry] }>()
const toast = useToast()

const groups = computed<CommandPaletteGroup[]>(() => [
  {
    id: 'entries',
    label: 'Entries',
    items: portal.entries.value.map((entry) => ({
      id: entry.id,
      label: entry.name,
      description: entry.host || entry.description,
      icon: 'i-lucide-bookmark',
      onSelect: () => {
        const href = primaryLink(entry)?.url
        if (href) {
          window.open(href, '_blank', 'noopener,noreferrer')
        }
        open.value = false
      },
    })),
  },
  {
    id: 'links',
    label: 'Links',
    items: portal.entries.value.flatMap((entry) =>
      entry.links
        .filter((link) => link.url)
        .map((link) => ({
          id: `${entry.id}:${link.id}`,
          label: `${entry.name}: ${link.label}`,
          icon: 'i-lucide-external-link',
          onSelect: () => {
            if (link.url) {
              window.open(link.url, '_blank', 'noopener,noreferrer')
            }
            open.value = false
          },
        })),
    ),
  },
  {
    id: 'actions',
    label: 'Actions',
    items: portal.entries.value.flatMap((entry) =>
      entry.actions.map((action) => ({
        id: `${entry.id}:${action.name}`,
        label: `${action.name} on ${entry.name}`,
        icon: 'i-lucide-play',
        onSelect: () => {
          void runAction(entry, action.name, action.confirm || action.inputs.length > 0)
        },
      })),
    ),
  },
  {
    id: 'views',
    label: 'View',
    items: [
      { id: 'view-list', label: 'List', onSelect: () => chooseView('list') },
      { id: 'view-cards', label: 'Cards', onSelect: () => chooseView('cards') },
      { id: 'view-tiles', label: 'Tiles', onSelect: () => chooseView('tiles') },
    ],
  },
  {
    id: 'tabs',
    label: 'Tabs',
    items: [
      ...(portal.allVisible.value
        ? [{ id: 'tab-all', label: 'All', onSelect: () => chooseTab('all') }]
        : []),
      ...portal.filters.value.map((filter) => ({
        id: filter.id,
        label: filter.name,
        onSelect: () => chooseTab(filter.id),
      })),
    ],
  },
])

function chooseView(mode: 'list' | 'cards' | 'tiles') {
  void portal.setView(mode)
  open.value = false
}

function chooseTab(id: string) {
  void portal.setTab(id)
  open.value = false
}

async function runAction(entry: PortalEntry, name: string, needsEditor: boolean) {
  open.value = false
  if (needsEditor) {
    emit('edit', entry)
    return
  }
  try {
    const result = await apiFetch<{ ok: boolean; message: string }>(
      `/api/v1/entries/${entry.id}/actions/${encodeURIComponent(name)}/execute`,
      { method: 'POST', body: { confirmed: true, inputs: {} } },
    )
    toast.add({
      title: result.ok ? `${name} finished` : `${name} failed`,
      description: result.message,
      color: result.ok ? 'success' : 'error',
    })
  } catch (error) {
    toast.add({
      title: `${name} failed`,
      description: error instanceof Error ? error.message : 'Request failed',
      color: 'error',
    })
  }
}
</script>

<template>
  <UModal v-model:open="open" title="Jump to" description="Entries, links, actions, and views">
    <template #body>
      <UCommandPalette :groups="groups" placeholder="Search devices, links, and actions" />
    </template>
  </UModal>
</template>
