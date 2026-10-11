<script setup lang="ts">
const props = defineProps<{ name: string; src: string | null }>()
const failed = ref(false)

watch(
  () => props.src,
  () => {
    failed.value = false
  },
)

const letter = computed(() => (props.name.trim().charAt(0) || '?').toUpperCase())
const colour = computed(() => {
  let hash = 0
  for (const char of props.name) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  }
  return `hsl(${hash % 360} 45% 38%)`
})
</script>

<template>
  <img
    v-if="src && !failed"
    :src="src"
    alt=""
    class="size-6 rounded object-contain"
    @error="failed = true"
  />
  <span
    v-else
    class="inline-flex size-6 items-center justify-center rounded text-xs font-semibold text-white"
    :style="{ background: colour }"
    :title="name"
  >
    {{ letter }}
  </span>
</template>
