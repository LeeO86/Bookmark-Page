<script setup lang="ts">
import type { PortalEntry } from '../types/portal'

const props = defineProps<{ tags: PortalEntry['tags']; limit?: number; nowrap?: boolean }>()
const portal = usePortal()

const visible = computed(() => {
  const budget = props.limit ?? 36
  const picked: PortalEntry['tags'] = []
  let used = 0
  for (const tag of props.tags) {
    const text = display(tag)
    if (picked.length > 0 && used + text.length > budget) {
      break
    }
    picked.push(tag)
    used += text.length + 2
  }
  return picked
})
const extra = computed(() => props.tags.length - visible.value.length)

function display(tag: PortalEntry['tags'][number]): string {
  return tag.displayLabel || tag.value
}

function colour(namespace: string | null): string | undefined {
  if (!namespace) return undefined
  return portal.namespaces.value.find((item) => item.name === namespace)?.colour
}
</script>

<template>
  <div class="flex items-center gap-1" :class="nowrap ? 'flex-nowrap' : 'flex-wrap'">
    <UBadge
      v-for="tag in visible"
      :key="tag.label"
      color="neutral"
      variant="subtle"
      :title="tag.label"
    >
      <span
        v-if="colour(tag.namespace)"
        class="mr-1 inline-block size-1.5 rounded-full"
        :style="{ background: colour(tag.namespace) }"
      />
      {{ display(tag) }}
    </UBadge>
    <span v-if="extra > 0" class="text-xs text-muted">+{{ extra }}</span>
  </div>
</template>
