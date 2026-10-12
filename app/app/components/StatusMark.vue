<script setup lang="ts">
import type { PortalEntry } from '../types/portal'

const props = defineProps<{ status: PortalEntry['status']; checks: PortalEntry['checks'] }>()

const label = computed(() => {
  if (props.status === 'up') {
    return 'Online'
  }
  if (props.status === 'down') {
    return 'Offline'
  }
  if (props.status === 'unknown') {
    return 'Status unknown'
  }
  return 'No checks'
})

const title = computed(() => {
  if (props.checks.length === 0) {
    return 'No checks'
  }
  return props.checks
    .map((check) => {
      const when = check.checkedAt ? new Date(check.checkedAt).toLocaleString() : 'not checked'
      const latency = check.latencyMs == null ? '' : ` ${check.latencyMs} ms`
      const who = check.reportedBy ? ` by ${check.reportedBy}` : ''
      return `${check.name}: ${check.state ?? 'unknown'}${latency}${who} at ${when}. ${check.statusMessage}`
    })
    .join('\n')
})

const markClass = computed(() => {
  if (props.status === 'up') {
    return 'status-up'
  }
  if (props.status === 'down') {
    return 'status-down'
  }
  if (props.status === 'unknown') {
    return 'status-unknown'
  }
  return ''
})
</script>

<template>
  <UTooltip :text="title">
    <span class="inline-flex items-center gap-1">
      <span
        class="status-mark inline-block size-2.5 rounded-full"
        :class="markClass"
        data-testid="status-mark"
      />
      <span class="sr-only">{{ label }}</span>
    </span>
  </UTooltip>
</template>
