<script setup lang="ts">
defineProps<{
  label: string
  accept: string
  required?: boolean
  testId?: string
}>()
const emit = defineEmits<{ change: [event: Event] }>()
const input = ref<HTMLInputElement | null>(null)
const id = useId()
const fileName = ref('')

function onChange(event: Event) {
  fileName.value = (event.target as HTMLInputElement).files?.[0]?.name ?? ''
  emit('change', event)
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <input
      :id="id"
      ref="input"
      type="file"
      :accept="accept"
      :required="required"
      :aria-label="label"
      :data-testid="testId"
      hidden
      @change="onChange"
    />
    <UButton
      type="button"
      size="sm"
      color="neutral"
      variant="outline"
      icon="i-lucide-folder-open"
      :aria-controls="id"
      @click="input?.click()"
    >
      {{ label }}
    </UButton>
    <span class="min-w-0 break-all text-xs text-muted" aria-live="polite">
      {{ fileName || 'No file selected' }}
    </span>
  </div>
</template>
