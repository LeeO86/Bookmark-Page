<script setup lang="ts">
import { apiFetch } from '../utils/api'

const props = defineProps<{ entryId: string; fieldKey: string }>()
const shown = ref<string | null>(null)
const toast = useToast()

async function reveal(): Promise<string> {
  const body = await apiFetch<{ value: string }>(
    `/api/v1/entries/${props.entryId}/fields/${encodeURIComponent(props.fieldKey)}/reveal`,
    { method: 'POST', body: {} },
  )
  shown.value = body.value
  return body.value
}

async function copy() {
  const value = await reveal()
  await navigator.clipboard.writeText(value)
  toast.add({ title: 'Secret copied', color: 'success' })
}
</script>

<template>
  <span class="inline-flex items-center gap-0.5">
    <span class="font-mono text-xs">{{ shown ?? '••••••••' }}</span>
    <UButton
      type="button"
      size="xs"
      color="neutral"
      variant="ghost"
      icon="i-lucide-eye"
      aria-label="Reveal secret"
      @click.stop="reveal()"
    />
    <UButton
      type="button"
      size="xs"
      color="neutral"
      variant="ghost"
      icon="i-lucide-copy"
      aria-label="Copy secret"
      @click.stop="copy()"
    />
  </span>
</template>
