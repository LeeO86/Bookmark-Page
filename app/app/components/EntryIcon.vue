<script setup lang="ts">
import { contrastingForeground, letterColour } from '#shared/theme'
import type { PortalEntry } from '../types/portal'

const props = withDefaults(
  defineProps<{
    name: string
    iconRef?: string | null
    src?: string | null
    status?: PortalEntry['status']
    size?: 'tile' | 'large' | 'card' | 'list' | 'mini'
  }>(),
  {
    iconRef: null,
    src: null,
    status: null,
    size: 'card',
  },
)

const lucide = computed(() =>
  props.iconRef?.startsWith('lucide:') ? props.iconRef.slice('lucide:'.length) : null,
)
const failed = ref(false)
const box = computed(() => {
  if (props.size === 'large') {
    return 'size-20'
  }
  if (props.size === 'tile') {
    return 'size-16'
  }
  if (props.size === 'card') {
    return 'size-12'
  }
  if (props.size === 'mini') {
    return 'size-4'
  }
  return 'size-6'
})
const letter = computed(() => (props.name.trim().charAt(0) || '?').toUpperCase())
const letterFill = computed(() => letterColour(props.name))
const maskStyle = computed(() => {
  if (!lucide.value) {
    return undefined
  }
  const url = `url(/api/icons/lucide/${encodeURIComponent(lucide.value)})`
  return {
    maskImage: url,
    WebkitMaskImage: url,
    maskRepeat: 'no-repeat',
    WebkitMaskRepeat: 'no-repeat',
    maskPosition: 'center',
    WebkitMaskPosition: 'center',
    maskSize: 'contain',
    WebkitMaskSize: 'contain',
  }
})
</script>

<template>
  <span class="relative inline-flex shrink-0 items-center justify-center" :class="box">
    <span
      v-if="lucide"
      class="size-full bg-current"
      :class="status === 'down' ? 'opacity-50 grayscale' : ''"
      :style="maskStyle"
    />
    <span
      v-else-if="src && !failed"
      class="icon-plate flex size-full items-center justify-center rounded-xl p-1 shadow-sm"
    >
      <img
        :src="src"
        alt=""
        class="size-full object-contain"
        :class="status === 'down' ? 'opacity-60 grayscale' : ''"
        @error="failed = true"
      />
    </span>
    <span
      v-else
      class="flex size-full items-center justify-center rounded-xl text-sm font-semibold"
      :class="status === 'down' ? 'opacity-60 grayscale' : ''"
      :style="{ background: letterFill, color: contrastingForeground(letterFill) }"
    >
      {{ letter }}
    </span>
    <span
      v-if="status === 'down'"
      class="status-mark status-down absolute -top-0.5 -right-0.5 size-2.5 rounded-full"
    />
    <span
      v-else-if="status === 'unknown'"
      class="status-mark status-unknown absolute -top-0.5 -right-0.5 size-2.5 rounded-full"
    />
  </span>
</template>
