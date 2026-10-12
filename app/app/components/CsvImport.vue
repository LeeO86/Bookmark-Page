<script setup lang="ts">
import { ApiError, apiFetch } from '../utils/api'
import type { PortalField } from '../types/portal'

const props = defineProps<{ fields: PortalField[] }>()
const csv = ref('')
const headers = ref<string[]>([])
const sample = ref<string[][]>([])
const nameColumn = ref('')
const hostColumn = ref('')
const descriptionColumn = ref('')
const linkColumn = ref('')
const tagsColumn = ref('')
const fieldColumns = reactive<Record<string, string>>({})
const confirmDuplicates = ref(false)
const message = ref('')
const error = ref('')
const result = ref<{ created: number; warnings: string[]; needsConfirmation: boolean } | null>(null)

async function onFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  error.value = ''
  result.value = null
  headers.value = []
  if (!file) {
    csv.value = ''
    return
  }
  csv.value = await file.text()
  const preview = await apiFetch<{ headers: string[]; rows: string[][] }>(
    '/api/v1/import/csv/preview',
    {
      method: 'POST',
      body: { csv: csv.value },
    },
  )
  headers.value = preview.headers
  sample.value = preview.rows
  nameColumn.value = preview.headers[0] ?? ''
}

function mapping() {
  const fields: Record<string, string> = {}
  for (const field of props.fields) {
    const column = fieldColumns[field.key]
    if (column) {
      fields[field.key] = column
    }
  }
  return {
    name: nameColumn.value,
    host: hostColumn.value || undefined,
    description: descriptionColumn.value || undefined,
    link: linkColumn.value || undefined,
    tags: tagsColumn.value || undefined,
    fields,
  }
}

async function run(dryRun: boolean) {
  error.value = ''
  message.value = ''
  try {
    result.value = await apiFetch('/api/v1/import/csv', {
      method: 'POST',
      body: {
        csv: csv.value,
        dryRun,
        confirmDuplicates: confirmDuplicates.value,
        mapping: mapping(),
      },
    })
    message.value = dryRun
      ? 'Preview only. Nothing was written.'
      : `Imported ${result.value?.created ?? 0} entries.`
  } catch (caught) {
    error.value = caught instanceof ApiError ? caught.message : 'Import failed'
  }
}
</script>

<template>
  <section class="space-y-3">
    <h1 class="text-lg font-semibold">CSV import</h1>
    <label class="block text-sm">
      CSV file
      <input type="file" accept=".csv,text/csv" class="mt-1 block text-sm" @change="onFile" />
    </label>
    <form v-if="headers.length > 0" class="grid gap-2 md:grid-cols-2" @submit.prevent="run(true)">
      <label class="text-sm">
        Name
        <select
          v-model="nameColumn"
          required
          class="mt-1 block w-full rounded border px-2 py-1 dark:bg-slate-900"
        >
          <option v-for="header in headers" :key="header" :value="header">{{ header }}</option>
        </select>
      </label>
      <label class="text-sm">
        Host
        <select
          v-model="hostColumn"
          class="mt-1 block w-full rounded border px-2 py-1 dark:bg-slate-900"
        >
          <option value="">None</option>
          <option v-for="header in headers" :key="header" :value="header">{{ header }}</option>
        </select>
      </label>
      <label class="text-sm">
        Description
        <select
          v-model="descriptionColumn"
          class="mt-1 block w-full rounded border px-2 py-1 dark:bg-slate-900"
        >
          <option value="">None</option>
          <option v-for="header in headers" :key="header" :value="header">{{ header }}</option>
        </select>
      </label>
      <label class="text-sm">
        Primary link
        <select
          v-model="linkColumn"
          class="mt-1 block w-full rounded border px-2 py-1 dark:bg-slate-900"
        >
          <option value="">None</option>
          <option v-for="header in headers" :key="header" :value="header">{{ header }}</option>
        </select>
      </label>
      <label class="text-sm">
        Tags
        <select
          v-model="tagsColumn"
          class="mt-1 block w-full rounded border px-2 py-1 dark:bg-slate-900"
        >
          <option value="">None</option>
          <option v-for="header in headers" :key="header" :value="header">{{ header }}</option>
        </select>
      </label>
      <label v-for="field in fields" :key="field.key" class="text-sm">
        {{ field.label }}
        <select
          v-model="fieldColumns[field.key]"
          class="mt-1 block w-full rounded border px-2 py-1 dark:bg-slate-900"
        >
          <option value="">None</option>
          <option v-for="header in headers" :key="header" :value="header">{{ header }}</option>
        </select>
      </label>
      <div class="flex flex-wrap gap-2 md:col-span-2">
        <button type="submit" class="rounded bg-teal-700 px-3 py-1 text-sm text-white">
          Preview import
        </button>
        <button type="button" class="rounded border px-3 py-1 text-sm" @click="run(false)">
          Import
        </button>
      </div>
    </form>
    <table v-if="sample.length > 0" class="w-full text-left text-xs">
      <caption class="sr-only">
        First CSV rows
      </caption>
      <thead>
        <tr>
          <th v-for="header in headers" :key="header" class="border-b px-1 py-1">{{ header }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, index) in sample" :key="index">
          <td v-for="(value, cell) in row" :key="cell" class="border-b px-1 py-1">{{ value }}</td>
        </tr>
      </tbody>
    </table>
    <div v-if="result" class="text-sm">
      <p v-if="!result.needsConfirmation">{{ result.created }} entries.</p>
      <ul v-if="result.warnings.length > 0" class="list-disc pl-5">
        <li v-for="warning in result.warnings" :key="warning">{{ warning }}</li>
      </ul>
      <label v-if="result.needsConfirmation" class="mt-2 flex items-center gap-2">
        <input v-model="confirmDuplicates" type="checkbox" />
        Import these rows even though a name or host already exists
      </label>
    </div>
    <p v-if="message" class="text-sm text-teal-800 dark:text-teal-200">{{ message }}</p>
    <p v-if="error" class="text-sm text-red-700">{{ error }}</p>
  </section>
</template>
