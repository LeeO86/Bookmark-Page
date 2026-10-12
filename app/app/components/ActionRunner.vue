<script setup lang="ts">
import type { ActionResult, RunnableAction } from '../types/portal'
import { ApiError, apiFetch } from '../utils/api'

const props = defineProps<{ entryId: string }>()
const actions = ref<RunnableAction[]>([])
const active = ref<RunnableAction | null>(null)
const values = ref<Record<string, string>>({})
const result = ref<ActionResult | null>(null)
const error = ref('')
const running = ref(false)

watch(
  () => props.entryId,
  () => {
    void load()
  },
  { immediate: true },
)

async function load() {
  const body = await apiFetch<{ actions: RunnableAction[] }>(
    `/api/v1/entries/${props.entryId}/actions`,
  )
  actions.value = body.actions
}

function open(action: RunnableAction) {
  active.value = action
  result.value = null
  error.value = ''
  const next: Record<string, string> = {}
  for (const input of action.inputs) {
    next[input.name] = input.defaultValue ?? ''
  }
  values.value = next
  if (!action.confirm && action.inputs.length === 0) {
    void execute(true)
  }
}

async function execute(confirmed: boolean) {
  const action = active.value
  if (!action) {
    return
  }
  running.value = true
  error.value = ''
  try {
    result.value = await apiFetch<ActionResult>(
      `/api/v1/entries/${props.entryId}/actions/${encodeURIComponent(action.name)}/execute`,
      { method: 'POST', body: { confirmed, inputs: values.value } },
    )
  } catch (caught) {
    if (caught instanceof ApiError && caught.code === 'confirm_action') {
      return
    }
    error.value = caught instanceof Error ? caught.message : 'Action failed'
  } finally {
    running.value = false
  }
}
</script>

<template>
  <div v-if="actions.length > 0" class="mb-2 space-y-1">
    <button
      v-for="action in actions"
      :key="`${action.source}-${action.name}`"
      type="button"
      class="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
      @click="open(action)"
    >
      Run {{ action.name }}
      <span v-if="action.source === 'template'" class="text-slate-500">template</span>
    </button>
  </div>

  <UModal
    :open="active !== null"
    :title="active ? `Run ${active.name}` : 'Run action'"
    @update:open="
      (value: boolean) => {
        if (!value) active = null
      }
    "
  >
    <template #body>
      <form v-if="active" class="space-y-3" @submit.prevent="execute(true)">
        <p v-if="active.confirm" class="text-sm">
          {{ active.method }} will be sent by the server. Confirm to run {{ active.name }}.
        </p>
        <label v-for="input in active.inputs" :key="input.name" class="block text-sm">
          {{ input.label }}
          <UInput
            v-model="values[input.name]"
            class="mt-1 w-full"
            :type="input.type === 'password' ? 'password' : 'text'"
            :required="input.required"
          />
        </label>
        <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
        <div
          v-if="result"
          class="rounded p-2 text-sm"
          :class="result.ok ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-900'"
        >
          <p>
            {{ result.ok ? 'Expectation met' : 'Expectation not met' }} · HTTP {{ result.status }} ·
            {{ result.latencyMs }} ms
          </p>
          <p>{{ result.message }}</p>
          <pre v-if="result.body" class="mt-2 max-h-40 overflow-auto text-xs">{{
            result.body
          }}</pre>
        </div>
        <div class="flex gap-2">
          <UButton type="submit" size="sm" :loading="running">Run</UButton>
          <UButton type="button" size="sm" color="neutral" variant="outline" @click="active = null"
            >Close</UButton
          >
        </div>
      </form>
    </template>
  </UModal>
</template>
