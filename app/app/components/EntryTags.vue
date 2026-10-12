<script setup lang="ts">
import { contrastingForeground, plainTagColour } from '#shared/theme'
import type { PortalEntry } from '../types/portal'

defineProps<{ tags: PortalEntry['tags']; nowrap?: boolean }>()
const portal = usePortal()

function colour(namespace: string | null): string | undefined {
  if (!namespace) {
    return undefined
  }
  return portal.namespaces.value.find((item) => item.name === namespace)?.colour
}
</script>

<template>
  <div class="flex gap-1" :class="nowrap ? 'flex-nowrap overflow-hidden' : 'flex-wrap'">
    <UBadge
      v-for="tag in tags"
      :key="tag.label"
      color="neutral"
      variant="subtle"
      :title="tag.label"
      :style="
        colour(tag.namespace)
          ? {
              background: colour(tag.namespace),
              color: contrastingForeground(colour(tag.namespace) ?? plainTagColour),
            }
          : undefined
      "
    >
      {{ tag.label }}
    </UBadge>
  </div>
</template>
