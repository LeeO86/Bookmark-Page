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
    class="inline-flex size-6 items-center justify-center rounded bg-primary text-xs font-semibold text-inverted"
    :title="name"
  >
    {{ letter }}
  </span>
</template>
