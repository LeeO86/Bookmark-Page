<script setup lang="ts">
import type { PortalLink } from '../types/portal'
import { copyableLink, linkIcon } from '../utils/links'

defineProps<{ links: PortalLink[] }>()
const toast = useToast()

async function copy(url: string, label: string) {
  await navigator.clipboard.writeText(url)
  toast.add({ title: `${label} copied`, color: 'success' })
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-1">
    <span v-for="link in links" :key="link.id" class="inline-flex items-center">
      <a
        v-if="link.url"
        :href="link.url"
        target="_blank"
        rel="noopener noreferrer"
        :title="link.label"
        class="inline-flex items-center rounded border px-1 py-0.5"
        :class="
          link.isPrimary ? 'border-primary bg-primary/10' : 'border-default hover:bg-elevated'
        "
        @click.stop
      >
        <img :src="linkIcon(link)" alt="" class="size-4 object-contain" />
        <span class="sr-only">{{ link.label }}</span>
      </a>
      <span v-else class="px-1 text-xs text-muted" :title="link.urlError ?? 'Unresolved link'">
        {{ link.label }}
      </span>
      <UButton
        v-if="link.url && copyableLink(link)"
        type="button"
        size="xs"
        color="neutral"
        variant="ghost"
        icon="i-lucide-copy"
        :aria-label="`Copy ${link.label}`"
        @click.stop="copy(link.url, link.label)"
      />
    </span>
  </div>
</template>
