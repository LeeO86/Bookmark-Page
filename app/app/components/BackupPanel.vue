<script setup lang="ts">
import { ApiError, apiFetch } from '../utils/api'

const includeSecrets = ref(false)
const passphrase = ref('')
const restorePassphrase = ref('')
const mode = ref<'merge' | 'replace'>('merge')
const dryRun = ref(true)
const fileName = ref('')
const archive = ref('')
const message = ref('')
const error = ref('')
const preview = ref<{
  entriesCreated: number
  entriesUpdated: number
  entriesUnchanged: number
  entriesDeleted: number
  warnings: string[]
} | null>(null)

async function download() {
  error.value = ''
  message.value = ''
  try {
    const body = await apiFetch<{ filename: string; archive: string }>('/api/v1/backup', {
      method: 'POST',
      body: {
        includeSecrets: includeSecrets.value,
        passphrase: includeSecrets.value ? passphrase.value : undefined,
      },
    })
    const binary = atob(body.archive)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index)
    }
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }))
    const link = document.createElement('a')
    link.href = url
    link.download = body.filename
    link.click()
    URL.revokeObjectURL(url)
    message.value = 'Backup downloaded.'
  } catch (caught) {
    error.value = caught instanceof ApiError ? caught.message : 'Backup failed'
  }
}

async function onFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  preview.value = null
  if (!file) {
    archive.value = ''
    fileName.value = ''
    return
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  const chunk = 0x8000
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
  }
  archive.value = btoa(binary)
  fileName.value = file.name
}

async function restore() {
  error.value = ''
  message.value = ''
  try {
    preview.value = await apiFetch('/api/v1/restore', {
      method: 'POST',
      body: {
        mode: mode.value,
        dryRun: dryRun.value,
        passphrase: restorePassphrase.value || undefined,
        archive: archive.value,
      },
    })
    message.value = dryRun.value ? 'Preview only. Nothing was written.' : 'Restore finished.'
  } catch (caught) {
    error.value = caught instanceof ApiError ? caught.message : 'Restore failed'
  }
}
</script>

<template>
  <section class="space-y-4">
    <h1 class="text-lg font-semibold">Backup and restore</h1>
    <form class="space-y-2" @submit.prevent="download">
      <label class="flex items-center gap-2 text-sm">
        <input v-model="includeSecrets" type="checkbox" />
        Include secret field values
      </label>
      <label v-if="includeSecrets" class="block text-sm">
        Passphrase
        <input
          v-model="passphrase"
          type="password"
          minlength="8"
          required
          autocomplete="new-password"
          class="mt-1 block w-full rounded border px-2 py-1 dark:bg-slate-900"
        />
      </label>
      <button type="submit" class="rounded bg-teal-700 px-3 py-1 text-sm text-white">
        Download backup
      </button>
    </form>
    <form
      class="space-y-2 border-t border-slate-200 pt-3 dark:border-slate-700"
      @submit.prevent="restore"
    >
      <label class="block text-sm">
        Backup file
        <input
          type="file"
          accept=".zip,application/zip"
          required
          class="mt-1 block text-sm"
          @change="onFile"
        />
      </label>
      <p v-if="fileName" class="text-xs text-slate-500">{{ fileName }}</p>
      <label class="block text-sm">
        Mode
        <select v-model="mode" class="mt-1 block rounded border px-2 py-1 dark:bg-slate-900">
          <option value="merge">Merge</option>
          <option value="replace">Replace</option>
        </select>
      </label>
      <label class="flex items-center gap-2 text-sm">
        <input v-model="dryRun" type="checkbox" />
        Preview only
      </label>
      <label class="block text-sm">
        Passphrase, if the backup contains secrets
        <input
          v-model="restorePassphrase"
          type="password"
          autocomplete="current-password"
          class="mt-1 block w-full rounded border px-2 py-1 dark:bg-slate-900"
        />
      </label>
      <button
        type="submit"
        class="rounded bg-teal-700 px-3 py-1 text-sm text-white"
        :disabled="archive.length === 0"
      >
        {{ dryRun ? 'Preview restore' : 'Restore' }}
      </button>
      <p v-if="mode === 'replace'" class="text-xs text-slate-500">
        Replace removes the current data and writes the backup. Sign in again if your account id
        changes.
      </p>
    </form>
    <div v-if="preview" class="text-sm">
      <p>
        Created {{ preview.entriesCreated }}, updated {{ preview.entriesUpdated }}, unchanged
        {{ preview.entriesUnchanged }}, deleted {{ preview.entriesDeleted }}.
      </p>
      <ul v-if="preview.warnings.length > 0" class="list-disc pl-5">
        <li v-for="warning in preview.warnings" :key="warning">{{ warning }}</li>
      </ul>
    </div>
    <p v-if="message" class="text-sm text-teal-800 dark:text-teal-200">{{ message }}</p>
    <p v-if="error" class="text-sm text-red-700">{{ error }}</p>
  </section>
</template>
