<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { PortalEntry } from '../types/portal'
import { primaryLink } from '../utils/links'

const props = defineProps<{ entry: PortalEntry }>()
const emit = defineEmits<{ edit: [] }>()
const toast = useToast()
const href = computed(() => primaryLink(props.entry)?.url ?? null)

const items = computed<DropdownMenuItem[][]>(() => [
  [
    { label: 'Edit', icon: 'i-lucide-pencil', onSelect: () => emit('edit') },
    {
      label: 'Open primary link',
      icon: 'i-lucide-external-link',
      disabled: !href.value,
      onSelect: () => {
        if (href.value) {
          window.open(href.value, '_blank', 'noopener,noreferrer')
        }
      },
    },
    {
      label: 'Copy primary link',
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
  ],
])
</script>

<template>
  <div class="inline-flex items-center" @click.stop>
    <UButton
      type="button"
      size="xs"
      color="neutral"
      variant="ghost"
      icon="i-lucide-pencil"
      aria-label="Edit entry"
      data-testid="edit-entry"
      @click="emit('edit')"
    />
    <UDropdownMenu :items="items">
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
