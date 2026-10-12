<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { PortalEntry } from '../types/portal'
import { primaryLink } from '../utils/links'

const props = defineProps<{ entry: PortalEntry; editing?: boolean }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ edit: []; history: [] }>()
const portal = usePortal()
const toast = useToast()
const href = computed(() => primaryLink(props.entry)?.url ?? null)

const items = computed<DropdownMenuItem[][]>(() => {
  const actions: DropdownMenuItem[] = []
  if (portal.canWrite.value) {
    actions.push({ label: 'Edit', icon: 'i-lucide-pencil', onSelect: () => emit('edit') })
  }
  actions.push(
    {
      label: 'Copy link',
      icon: 'i-lucide-copy',
      disabled: !href.value,
      onSelect: () => {
        if (!href.value) {
          return
        }
        void navigator.clipboard.writeText(href.value).then(() => {
          toast.add({ title: 'Link copied', color: 'success' })
        })
      },
    },
    {
      label: 'Open all links',
      icon: 'i-lucide-external-link',
      onSelect: () => {
        for (const link of props.entry.links) {
          if (link.url) {
            window.open(link.url, '_blank', 'noopener,noreferrer')
          }
        }
      },
    },
    { label: 'History', icon: 'i-lucide-history', onSelect: () => emit('history') },
  )
  return [actions]
})
</script>

<template>
  <div class="inline-flex items-center" @click.stop>
    <UButton
      v-if="editing && portal.canWrite.value"
      type="button"
      size="xs"
      color="neutral"
      variant="ghost"
      icon="i-lucide-pencil"
      aria-label="Edit entry"
      data-testid="edit-entry"
      @click="emit('edit')"
    />
    <UDropdownMenu v-model:open="open" :items="items">
      <UButton
        type="button"
        size="xs"
        color="neutral"
        variant="ghost"
        icon="i-lucide-ellipsis"
        aria-label="Entry actions"
      />
    </UDropdownMenu>
  </div>
</template>
