<script setup lang="ts">
import type { RequestSpec } from '#shared/contracts'
const model = defineModel<RequestSpec>({ required: true })
defineProps<{ disabled?: boolean }>()
const headerName = ref('')
const headerValue = ref('')
const status = computed({
  get: () => model.value.expectation.status.join(', '),
  set: (value) => {
    model.value.expectation.status = value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  },
})
function addHeader() {
  const name = headerName.value.trim()
  if (!name) return
  model.value.headers = { ...model.value.headers, [name]: headerValue.value }
  headerName.value = ''
  headerValue.value = ''
}
function removeHeader(name: string) {
  model.value.headers = Object.fromEntries(
    Object.entries(model.value.headers).filter(([key]) => key !== name),
  )
}
</script>
<template>
  <details class="rounded border border-default p-2 text-sm">
    <summary>HTTP request options</summary>
    <fieldset :disabled="disabled" class="mt-2 space-y-2">
      <div v-for="(value, name) in model.headers" :key="name" class="flex gap-2 items-center">
        <span class="font-mono">{{ name }}</span
        ><input
          v-model="model.headers[name]"
          :aria-label="`${name} header value`"
          class="min-w-0 flex-1 border rounded p-1"
        /><button
          type="button"
          :aria-label="`Remove ${name} header`"
          @click="removeHeader(String(name))"
        >
          Remove
        </button>
      </div>
      <div class="flex gap-1">
        <input
          v-model="headerName"
          placeholder="Header name"
          aria-label="Header name"
          class="min-w-0 w-1/3 rounded border p-1"
        /><input
          v-model="headerValue"
          placeholder="Header value template"
          aria-label="Header value template"
          class="min-w-0 flex-1 rounded border p-1"
        /><button type="button" @click="addHeader">Add header</button>
      </div>
      <label class="block"
        >Body template<textarea
          v-model="model.bodyTemplate"
          class="block w-full rounded border p-1"
        />
      </label>
      <label class="flex gap-2"
        >Timeout (ms)<input
          v-model.number="model.timeoutMs"
          type="number"
          min="1"
          max="120000"
          class="rounded border p-1"
      /></label>
      <label class="flex gap-2"
        ><input v-model="model.tlsVerify" type="checkbox" />Verify TLS certificate</label
      >
      <label class="block"
        >Expected status codes or ranges<input
          v-model="status"
          placeholder="200, 204, 2xx"
          class="block w-full rounded border p-1"
      /></label>
      <label class="block"
        >Body contains<input
          v-model="model.expectation.bodyContains"
          class="block w-full rounded border p-1"
      /></label>
      <label class="block"
        >Body regular expression<input
          v-model="model.expectation.bodyRegex"
          class="block w-full rounded border p-1"
      /></label>
      <label class="block"
        >JSON path<input
          v-model="model.expectation.jsonPath"
          class="block w-full rounded border p-1"
      /></label>
      <label class="block"
        >Expected JSON value<input
          v-model="model.expectation.equals"
          class="block w-full rounded border p-1"
      /></label>
    </fieldset>
  </details>
</template>
