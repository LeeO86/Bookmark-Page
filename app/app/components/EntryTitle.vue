<script setup lang="ts">
import type { PortalEntry } from '../types/portal'
import { primaryLink } from '../utils/links'

const props = defineProps<{
  entry: PortalEntry
  tabbable?: boolean
}>()

const href = computed(() => primaryLink(props.entry)?.url ?? null)
</script>

<template>
  <a
    v-if="href"
    :href="href"
    target="_blank"
    rel="noopener noreferrer"
    class="truncate font-medium text-highlighted hover:text-accent"
    :tabindex="tabbable ? 0 : -1"
    :aria-hidden="tabbable ? undefined : true"
    data-testid="entry-link"
    @click.stop
  >
    <slot>{{ entry.name }}</slot>
  </a>
  <span v-else class="truncate font-medium text-highlighted"
    ><slot>{{ entry.name }}</slot></span
  >
</template>
