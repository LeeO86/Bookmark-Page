<script setup lang="ts">
import type { PortalLink } from '../types/portal'
import { linkIcon } from '../utils/links'

const props = defineProps<{ link: PortalLink }>()
const src = computed(() => linkIcon(props.link))
const masked = computed(() => src.value.startsWith('/api/icons/lucide/'))
const maskStyle = computed(() => ({
  maskImage: `url(${src.value})`,
  WebkitMaskImage: `url(${src.value})`,
  maskRepeat: 'no-repeat',
  WebkitMaskRepeat: 'no-repeat',
  maskPosition: 'center',
  WebkitMaskPosition: 'center',
  maskSize: 'contain',
  WebkitMaskSize: 'contain',
}))
</script>

<template>
  <span v-if="masked" class="inline-block size-4 shrink-0 bg-current" :style="maskStyle" />
  <span v-else class="icon-plate inline-flex size-4 shrink-0 items-center justify-center rounded">
    <img :src="src" alt="" class="size-3.5 object-contain" />
  </span>
</template>
