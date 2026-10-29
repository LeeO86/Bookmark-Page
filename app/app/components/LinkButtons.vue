<script setup lang="ts">
import type { PortalLink } from '../types/portal'
import { apiFetch } from '../utils/api'
import { copyableLink } from '../utils/links'

const props = defineProps<{ links: PortalLink[]; labelled?: boolean; entryId?: string }>()
const ordered = computed(() =>
  [...props.links].sort((left, right) => Number(right.isPrimary) - Number(left.isPrimary)),
)
const toast = useToast()
const revealed = ref<Record<string, string>>({})
const portal = usePortal()
const urlOf = (link: PortalLink) => revealed.value[link.id] ?? link.url
async function reveal(link: PortalLink) {
  try {
    const result = await apiFetch<{ url: string }>(
      `/api/v1/entries/${props.entryId}/links/${link.id}/reveal`,
      { method: 'POST', body: {} },
    )
    revealed.value = { ...revealed.value, [link.id]: result.url }
  } catch (error) {
    toast.add({
      title: 'Could not reveal link',
      description: error instanceof Error ? error.message : 'Request failed',
      color: 'error',
    })
  }
}

async function copy(url: string, label: string) {
  await navigator.clipboard.writeText(url)
  toast.add({ title: `${label} copied`, color: 'success' })
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-1">
    <span v-for="link in ordered" :key="link.id" class="inline-flex items-center">
      <a
        v-if="urlOf(link)"
        :href="urlOf(link) ?? undefined"
        target="_blank"
        rel="noopener noreferrer"
        :title="link.label"
        class="inline-flex items-center rounded border px-1 py-0.5"
        :class="
          link.isPrimary ? 'border-primary bg-primary/10' : 'border-default hover:bg-elevated'
        "
        @click.stop
      >
        <LinkGlyph :link="link" />
        <span :class="labelled ? 'px-1 text-xs' : 'sr-only'">{{ link.label }}</span>
      </a>
      <UButton
        v-else-if="entryId && link.requiresReveal && portal.actor.value.role !== 'anonymous'"
        size="xs"
        variant="soft"
        :aria-label="`Reveal ${link.label}`"
        @click.stop="reveal(link)"
        >Reveal {{ link.label }}</UButton
      >
      <span v-else class="px-1 text-xs text-muted" :title="link.urlError ?? 'Unresolved link'">
        {{ link.label }}
      </span>
      <UButton
        v-if="urlOf(link) && copyableLink({ ...link, url: urlOf(link) })"
        type="button"
        size="xs"
        color="neutral"
        variant="ghost"
        icon="i-lucide-copy"
        :aria-label="`Copy ${link.label}`"
        @click.stop="copy(urlOf(link)!, link.label)"
      />
    </span>
  </div>
</template>
