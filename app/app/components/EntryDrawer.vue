<script setup lang="ts">
import { z } from 'zod'
import type { ActionPrompt, HistoryRow, PortalEntry } from '../types/portal'
import { ApiError, apiFetch } from '../utils/api'
import { isPathLocked } from '../utils/view'

const props = defineProps<{
  open: boolean
  entry: PortalEntry | null
  creating: boolean
  showHistory?: boolean
}>()
const emit = defineEmits<{ close: []; saved: [entry: PortalEntry] }>()
const portal = usePortal()

const entryFormSchema = z.object({
  name: z.string().trim().min(1).max(200),
  host: z.string().max(500),
  description: z.string().max(4000),
})
const editorState = computed(() => ({
  name: name.value,
  host: host.value,
  description: description.value,
}))

const linkTypes = ['web', 'api', 'ssh', 'vnc', 'rdp', 'telnet', 'other'] as const
const checkKinds = ['icmp', 'tcp', 'http'] as const
const roles = ['anonymous', 'viewer', 'editor', 'admin'] as const

interface DraftLink {
  label: string
  urlTemplate: string
  type: (typeof linkTypes)[number]
  isPrimary: boolean
  iconRef: string | null
}
interface DraftField {
  key: string
  label: string
  type: 'text' | 'url' | 'number' | 'secret'
  value: string
  masked: boolean
  dirty: boolean
  present: boolean
}
interface DraftCheck {
  name: string
  kind: (typeof checkKinds)[number]
  executor: 'server' | 'client'
  intervalSeconds: number
  timeoutMs: number
  tlsVerify: boolean
  host: string
  port: string
  linkLabel: string
  method: string
  urlTemplate: string
}
interface DraftAction {
  name: string
  confirm: boolean
  minRole: (typeof roles)[number]
  method: string
  urlTemplate: string
  inputs: ActionPrompt[]
}

const iconPreview = computed(() => {
  if (!iconRef.value) {
    return props.entry?.iconUrl ?? null
  }
  if (iconRef.value.startsWith('lucide:')) {
    return `/api/icons/lucide/${encodeURIComponent(iconRef.value.slice('lucide:'.length))}`
  }
  if (iconRef.value.startsWith('upload:')) {
    return `/api/icons/upload/${encodeURIComponent(iconRef.value.slice('upload:'.length))}`
  }
  return null
})
const iconRef = ref<string | null>(null)
const iconQuery = ref('')
const iconChoices = ref<Array<{ ref: string; name: string; url: string }>>([])
const name = ref('')
const description = ref('')
const host = ref('')
const sort = ref(0)
const tags = ref<string[]>([])
const tagDraft = ref('')
const links = ref<DraftLink[]>([])
const fields = ref<DraftField[]>([])
const checks = ref<DraftCheck[]>([])
const actions = ref<DraftAction[]>([])
const history = ref<HistoryRow[]>([])
const formError = ref('')
const actionEpoch = ref(0)
const confirmOpen = ref(false)
const confirmWarnings = ref<string[]>([])
const dragIndex = ref<number | null>(null)

const locked = (path: string) =>
  props.entry ? isPathLocked(props.entry.editMode, props.entry.managedFields, path) : false
const editable = computed(
  () => portal.canWrite.value && (props.creating || props.entry?.editMode !== 'locked'),
)
const canDelete = computed(
  () =>
    !props.creating &&
    props.entry &&
    (props.entry.editMode === null || props.entry.editMode === 'free'),
)
const tagSuggestions = computed(() => portal.tags.value.map((tag) => tag.label))

watch(
  () => [props.open, props.entry?.id, props.creating, props.showHistory] as const,
  () => {
    if (!props.open) {
      return
    }
    formError.value = ''
    confirmOpen.value = false
    if (props.creating || !props.entry) {
      blank()
      history.value = []
      return
    }
    fill(props.entry)
    void loadHistory(props.entry.id)
    if (props.showHistory) {
      void nextTick(() => {
        document.getElementById('entry-history')?.scrollIntoView({ block: 'start' })
      })
    }
  },
)

function blank() {
  iconRef.value = null
  name.value = ''
  description.value = ''
  host.value = ''
  sort.value = 0
  tags.value = []
  links.value = []
  checks.value = []
  actions.value = []
  fields.value = portal.fields.value.map((field) => ({
    key: field.key,
    label: field.label,
    type: field.type,
    value: '',
    masked: field.type === 'secret',
    dirty: false,
    present: false,
  }))
}

function fill(entry: PortalEntry) {
  iconRef.value = entry.iconRef
  name.value = entry.name
  description.value = entry.description
  host.value = entry.host ?? ''
  sort.value = entry.sort
  tags.value = entry.tags.map((tag) => tag.label)
  links.value = [...entry.links]
    .sort((left, right) => left.sort - right.sort)
    .map((link) => ({
      label: link.label,
      urlTemplate: link.urlTemplate,
      type: linkTypes.includes(link.type as (typeof linkTypes)[number])
        ? (link.type as (typeof linkTypes)[number])
        : 'web',
      isPrimary: link.isPrimary,
      iconRef: link.iconRef,
    }))
  fields.value = portal.fields.value.map((field) => {
    const current = entry.fields.find((item) => item.key === field.key)
    return {
      key: field.key,
      label: field.label,
      type: field.type,
      value: current?.value ?? '',
      masked: current?.masked ?? field.type === 'secret',
      dirty: false,
      present: Boolean(current),
    }
  })
  checks.value = entry.checks.map((check) => ({
    name: check.name,
    kind: check.kind,
    executor: check.executor,
    intervalSeconds: check.intervalSeconds,
    timeoutMs: check.timeoutMs,
    tlsVerify: check.tlsVerify,
    host: check.host ?? '',
    port: check.port === null ? '' : String(check.port),
    linkLabel: entry.links.find((link) => link.id === check.linkId)?.label ?? '',
    method: check.requestSpec?.method ?? 'GET',
    urlTemplate: check.requestSpec?.urlTemplate ?? '',
  }))
  actions.value = entry.actions.map((action) => ({
    name: action.name,
    confirm: action.confirm,
    minRole: roles.includes(action.minRole as (typeof roles)[number])
      ? (action.minRole as (typeof roles)[number])
      : 'editor',
    method: action.requestSpec.method,
    urlTemplate: action.requestSpec.urlTemplate,
    inputs: action.inputs ?? [],
  }))
}

async function searchIcons() {
  const body = await apiFetch<{ icons: Array<{ ref: string; name: string; url: string }> }>(
    `/api/v1/icons?q=${encodeURIComponent(iconQuery.value)}`,
  )
  iconChoices.value = body.icons
}

async function refetchFavicon() {
  if (!props.entry) {
    return
  }
  await apiFetch(`/api/v1/entries/${props.entry.id}/favicon`, { method: 'POST', body: {} })
  formError.value = 'Favicon refetch started'
}

function addTag() {
  const value = tagDraft.value.trim()
  if (!value || tags.value.includes(value)) {
    tagDraft.value = ''
    return
  }
  tags.value = [...tags.value, value]
  tagDraft.value = ''
}

function removeTag(label: string) {
  if (locked(`tags:${label}`)) {
    return
  }
  tags.value = tags.value.filter((tag) => tag !== label)
}

function addLink() {
  links.value = [
    ...links.value,
    {
      label: 'Link',
      urlTemplate: 'https://',
      type: 'web',
      isPrimary: links.value.length === 0,
      iconRef: null,
    },
  ]
}

function makePrimary(index: number) {
  links.value = links.value.map((link, linkIndex) => ({ ...link, isPrimary: linkIndex === index }))
}

function moveLink(index: number, direction: -1 | 1) {
  const next = index + direction
  const current = links.value[index]
  const neighbor = links.value[next]
  if (
    !current ||
    !neighbor ||
    locked(`links:${current.label}`) ||
    locked(`links:${neighbor.label}`)
  ) {
    return
  }
  const copy = [...links.value]
  copy[index] = neighbor
  copy[next] = current
  links.value = copy
}

function onDrop(index: number) {
  const from = dragIndex.value
  dragIndex.value = null
  if (from === null || from === index) {
    return
  }
  const moving = links.value[from]
  if (!moving || locked(`links:${moving.label}`)) {
    return
  }
  const copy = [...links.value]
  const [item] = copy.splice(from, 1)
  if (!item) {
    return
  }
  copy.splice(index, 0, item)
  links.value = copy
}

function addCheck() {
  checks.value = [
    ...checks.value,
    {
      name: 'Ping',
      kind: 'icmp',
      executor: 'server',
      intervalSeconds: 60,
      timeoutMs: 5000,
      tlsVerify: false,
      host: '',
      port: '',
      linkLabel: '',
      method: 'GET',
      urlTemplate: 'https://{{host}}/',
    },
  ]
}

function addAction() {
  actions.value = [
    ...actions.value,
    {
      name: 'Request',
      confirm: true,
      minRole: 'editor',
      method: 'POST',
      urlTemplate: 'https://{{host}}/',
      inputs: [],
    },
  ]
}

function requestSpec(method: string, urlTemplate: string, tlsVerify: boolean, timeoutMs: number) {
  return {
    method,
    urlTemplate,
    headers: {},
    bodyTemplate: null,
    tlsVerify,
    timeoutMs,
    expectation: {
      status: ['2xx'],
      bodyContains: null,
      bodyRegex: null,
      jsonPath: null,
      equals: null,
    },
  }
}

function buildBody(confirmDuplicates: boolean) {
  return {
    name: name.value,
    description: description.value,
    iconRef: iconRef.value,
    host: host.value,
    sort: Number(sort.value) || 0,
    tags: tags.value,
    links: links.value.map((link, index) => ({ ...link, sort: index, iconRef: link.iconRef })),
    fields: fields.value.flatMap((field) => {
      if (field.type === 'secret') {
        return field.dirty ? [{ key: field.key, value: field.value }] : []
      }
      if (!field.value && !field.present) {
        return []
      }
      return [{ key: field.key, value: field.value }]
    }),
    checks: checks.value.map((check) => ({
      name: check.name,
      kind: check.kind,
      executor: check.executor,
      intervalSeconds: check.intervalSeconds,
      timeoutMs: check.timeoutMs,
      tlsVerify: check.tlsVerify,
      host: check.host || null,
      port: check.port ? Number(check.port) : null,
      linkLabel: check.linkLabel || null,
      requestSpec:
        check.kind === 'http'
          ? requestSpec(check.method, check.urlTemplate, check.tlsVerify, check.timeoutMs)
          : null,
    })),
    actions: actions.value.map((action) => ({
      name: action.name,
      confirm: action.confirm,
      minRole: action.minRole,
      icon: null,
      inputs: action.inputs,
      requestSpec: requestSpec(action.method, action.urlTemplate, false, 5000),
    })),
    confirmDuplicates,
  }
}

async function save(confirmDuplicates = false) {
  formError.value = ''
  if (links.value.length > 0 && links.value.filter((link) => link.isPrimary).length !== 1) {
    formError.value = 'Choose one primary link'
    return
  }
  try {
    const result = props.creating
      ? await apiFetch<{ entry: PortalEntry }>('/api/v1/entries', {
          method: 'POST',
          body: buildBody(confirmDuplicates),
        })
      : await apiFetch<{ entry: PortalEntry }>(`/api/v1/entries/${props.entry?.id}`, {
          method: 'PATCH',
          body: buildBody(confirmDuplicates),
        })
    confirmOpen.value = false
    actionEpoch.value += 1
    emit('saved', result.entry)
    if (!props.creating && props.entry) {
      void loadHistory(props.entry.id)
    }
  } catch (error) {
    if (error instanceof ApiError && error.code === 'confirm_duplicate') {
      confirmWarnings.value = warningMessages(error.details.warnings)
      confirmOpen.value = true
      return
    }
    formError.value = error instanceof Error ? error.message : 'Could not save'
  }
}

async function removeEntry() {
  if (!props.entry) {
    return
  }
  await apiFetch(`/api/v1/entries/${props.entry.id}`, { method: 'DELETE', body: {} })
  emit('close')
  emit('saved', props.entry)
}

async function reveal(field: DraftField) {
  if (!props.entry) {
    return
  }
  const body = await apiFetch<{ value: string }>(
    `/api/v1/entries/${props.entry.id}/fields/${encodeURIComponent(field.key)}/reveal`,
    { method: 'POST', body: {} },
  )
  field.value = body.value
  field.masked = false
}

async function copyValue(value: string) {
  await navigator.clipboard.writeText(value)
}

async function loadHistory(id: string) {
  const body = await apiFetch<{ history: HistoryRow[] }>(`/api/v1/entries/${id}/history`)
  history.value = body.history
}

async function restore(row: HistoryRow) {
  if (!props.entry) {
    return
  }
  const restored = await apiFetch<PortalEntry>(
    `/api/v1/entries/${props.entry.id}/history/${row.id}/restore`,
    { method: 'POST', body: {} },
  )
  fill(restored)
  emit('saved', restored)
  await loadHistory(props.entry.id)
}

function warningMessages(warnings: unknown): string[] {
  if (!Array.isArray(warnings)) {
    return ['Another entry already uses this name or host.']
  }
  return warnings.map((warning) => {
    if (warning && typeof warning === 'object' && 'message' in warning) {
      return String(warning.message)
    }
    return 'Another entry already uses this name or host.'
  })
}

function diffText(diff: Record<string, unknown>): string {
  const copy = { ...diff }
  delete copy.snapshot
  return JSON.stringify(copy, null, 2)
}
</script>

<template>
  <USlideover
    :open="open"
    :title="creating ? 'New entry' : (entry?.name ?? 'Entry')"
    :description="
      showHistory ? 'Changes to this device.' : 'Edit the bookmark, its links, and its history.'
    "
    :ui="{ content: 'max-w-xl' }"
    @update:open="
      (value: boolean) => {
        if (!value) emit('close')
      }
    "
  >
    <template #body>
      <div class="space-y-4 text-sm">
        <p v-if="entry?.editMode === 'locked'" class="rounded bg-warning/10 px-2 py-1 text-warning">
          This entry is locked by its Ansible scope. Managed attributes cannot be changed here.
        </p>
        <p
          v-else-if="entry?.editMode === 'field_ownership'"
          class="rounded bg-warning/10 px-2 py-1 text-warning"
        >
          Ansible owns the highlighted attributes. Those fields stay read-only; everything else can
          be edited.
        </p>
        <p v-if="entry?.scope" class="text-xs text-muted">
          Managed by scope {{ entry.scope
          }}<span v-if="entry.externalKey"> · {{ entry.externalKey }}</span>
        </p>
        <div>
          <h3 class="mb-1 font-medium">Icon</h3>
          <div class="mb-2 flex items-center gap-2">
            <EntryIcon :name="name || 'Entry'" :src="iconPreview" />
            <button
              type="button"
              class="text-xs underline"
              :disabled="locked('iconRef')"
              @click="iconRef = null"
            >
              Letter or favicon
            </button>
            <button v-if="entry" type="button" class="text-xs underline" @click="refetchFavicon">
              Refetch favicon
            </button>
          </div>
          <div class="flex gap-1">
            <UInput
              v-model="iconQuery"
              class="flex-1"
              placeholder="Search icons"
              :disabled="locked('iconRef')"
            />
            <UButton type="button" size="sm" color="neutral" variant="outline" @click="searchIcons"
              >Search</UButton
            >
          </div>
          <div class="mt-2 flex flex-wrap gap-1">
            <button
              v-for="choice in iconChoices"
              :key="choice.ref"
              type="button"
              class="rounded border border-default p-1"
              :title="choice.name"
              @click="iconRef = choice.ref"
            >
              <img :src="choice.url" alt="" class="size-5" />
            </button>
          </div>
        </div>

        <UForm
          id="entry-editor"
          :schema="entryFormSchema"
          :state="editorState"
          @submit="save(false)"
        >
          <UFormField name="name" label="Name">
            <UInput
              v-model="name"
              :disabled="locked('name')"
              class="w-full"
              data-testid="entry-name"
            />
          </UFormField>
          <UFormField name="host" label="Host">
            <UInput
              v-model="host"
              :disabled="locked('host')"
              class="w-full"
              data-testid="entry-host"
            />
          </UFormField>
          <UFormField name="description" label="Description">
            <UTextarea
              v-model="description"
              :disabled="locked('description')"
              :rows="3"
              class="w-full"
            />
          </UFormField>
        </UForm>
        <UFormField label="Manual sort">
          <UInput v-model.number="sort" type="number" :disabled="locked('sort')" class="w-full" />
        </UFormField>

        <div>
          <h3 class="mb-1 font-medium">Tags</h3>
          <div class="mb-1 flex flex-wrap gap-1">
            <span
              v-for="tag in tags"
              :key="tag"
              class="inline-flex items-center gap-1 rounded bg-accented px-2 py-0.5"
            >
              {{ tag }}
              <button
                v-if="!locked(`tags:${tag}`)"
                type="button"
                :aria-label="`Remove ${tag}`"
                @click="removeTag(tag)"
              >
                ×
              </button>
            </span>
          </div>
          <div class="flex gap-1">
            <input
              v-model="tagDraft"
              list="tag-suggestions"
              class="w-full rounded border border-default px-2 py-1 bg-default"
              placeholder="namespace:value"
              @keydown.enter.prevent="addTag"
            />
            <datalist id="tag-suggestions">
              <option v-for="suggestion in tagSuggestions" :key="suggestion" :value="suggestion" />
            </datalist>
            <UButton type="button" size="sm" color="neutral" variant="outline" @click="addTag"
              >Add</UButton
            >
          </div>
        </div>

        <div>
          <div class="mb-1 flex items-center justify-between">
            <h3 class="font-medium">Links</h3>
            <UButton
              type="button"
              size="xs"
              color="neutral"
              variant="outline"
              :disabled="!editable"
              @click="addLink"
              >Add link</UButton
            >
          </div>
          <div
            v-for="(link, index) in links"
            :key="index"
            class="mb-2 space-y-1 rounded border border-default p-2"
            draggable="true"
            @dragstart="dragIndex = index"
            @dragover.prevent
            @drop.prevent="onDrop(index)"
          >
            <div class="flex gap-1">
              <UInput
                v-model="link.label"
                :disabled="locked(`links:${link.label}`)"
                class="flex-1"
                placeholder="Label"
              />
              <select
                v-model="link.type"
                class="rounded border border-default px-1 bg-default"
                :disabled="locked(`links:${link.label}`)"
              >
                <option v-for="type in linkTypes" :key="type" :value="type">{{ type }}</option>
              </select>
            </div>
            <UInput
              v-model="link.urlTemplate"
              :disabled="locked(`links:${link.label}`)"
              class="w-full"
              placeholder="URL template"
            />
            <div class="flex gap-2">
              <label class="flex items-center gap-1">
                <input
                  :checked="link.isPrimary"
                  type="radio"
                  name="primary-link"
                  :disabled="locked(`links:${link.label}`)"
                  @change="makePrimary(index)"
                />
                Primary
              </label>
              <button type="button" class="text-xs" @click="moveLink(index, -1)">Up</button>
              <button type="button" class="text-xs" @click="moveLink(index, 1)">Down</button>
              <button
                v-if="!locked(`links:${link.label}`)"
                type="button"
                class="text-xs text-error"
                @click="links.splice(index, 1)"
              >
                Remove
              </button>
            </div>
          </div>
        </div>

        <div>
          <h3 class="mb-1 font-medium">Fields</h3>
          <div v-for="field in fields" :key="field.key" class="mb-2">
            <label class="mb-0.5 block text-xs text-muted">{{ field.label }}</label>
            <div class="flex gap-1">
              <UInput
                v-model="field.value"
                :type="field.masked ? 'password' : 'text'"
                :disabled="locked(`fields:${field.key}`)"
                class="w-full"
                @input="field.dirty = true"
              />
              <UButton
                v-if="field.type === 'secret' && entry"
                type="button"
                size="xs"
                color="neutral"
                variant="outline"
                @click="reveal(field)"
                >Reveal</UButton
              >
              <UButton
                v-if="field.value"
                type="button"
                size="xs"
                color="neutral"
                variant="ghost"
                @click="copyValue(field.value)"
                >Copy</UButton
              >
            </div>
          </div>
        </div>

        <div>
          <div class="mb-1 flex items-center justify-between">
            <h3 class="font-medium">Checks</h3>
            <UButton
              type="button"
              size="xs"
              color="neutral"
              variant="outline"
              :disabled="!editable"
              @click="addCheck"
              >Add check</UButton
            >
          </div>
          <p class="mb-1 text-xs text-muted">
            Server checks run on a schedule. Browser checks only see whether a request starts: they
            cannot read status codes, an HTTPS page cannot probe http:// targets, and untrusted
            certificates make the result unreliable. ICMP needs CAP_NET_RAW on the server; otherwise
            those checks stay unknown.
          </p>
          <div
            v-for="(check, index) in checks"
            :key="index"
            class="mb-2 space-y-1 rounded border border-default p-2"
          >
            <div class="flex gap-1">
              <UInput
                v-model="check.name"
                :disabled="locked(`checks:${check.name}`)"
                class="flex-1"
              />
              <select v-model="check.kind" class="rounded border border-default px-1 bg-default">
                <option v-for="kind in checkKinds" :key="kind" :value="kind">{{ kind }}</option>
              </select>
            </div>
            <div class="flex gap-1">
              <UInput v-model="check.host" class="flex-1" placeholder="Host" />
              <UInput v-model="check.port" class="w-24" placeholder="Port" />
            </div>
            <div v-if="check.kind === 'http'" class="flex gap-1">
              <UInput v-model="check.method" class="w-24" />
              <UInput v-model="check.urlTemplate" class="flex-1" placeholder="URL template" />
            </div>
            <button
              v-if="!locked(`checks:${check.name}`)"
              type="button"
              class="text-xs text-error"
              @click="checks.splice(index, 1)"
            >
              Remove
            </button>
          </div>
        </div>

        <div>
          <div class="mb-1 flex items-center justify-between">
            <h3 class="font-medium">Actions</h3>
            <UButton
              type="button"
              size="xs"
              color="neutral"
              variant="outline"
              :disabled="!editable"
              @click="addAction"
              >Add action</UButton
            >
          </div>
          <p class="mb-1 text-xs text-muted">
            Actions run on the server. Creating or running one is limited to the action's role,
            which defaults to editor. The server calls the saved URL, including addresses on your
            network.
          </p>
          <ActionRunner v-if="entry" :entry-id="entry.id" :refresh="actionEpoch" />
          <div
            v-for="(action, index) in actions"
            :key="index"
            class="mb-2 space-y-1 rounded border border-default p-2"
          >
            <UInput
              v-model="action.name"
              :disabled="locked(`actions:${action.name}`)"
              class="w-full"
            />
            <div class="flex gap-1">
              <UInput v-model="action.method" class="w-24" />
              <UInput v-model="action.urlTemplate" class="flex-1" />
            </div>
            <label class="flex items-center gap-1">
              <input v-model="action.confirm" type="checkbox" />
              Ask before running
            </label>
            <button
              v-if="!locked(`actions:${action.name}`)"
              type="button"
              class="text-xs text-error"
              @click="actions.splice(index, 1)"
            >
              Remove
            </button>
          </div>
        </div>

        <div v-if="entry" id="entry-history">
          <h3 class="mb-1 font-medium">History</h3>
          <ul class="space-y-2">
            <li v-for="row in history" :key="row.id" class="rounded border border-default p-2">
              <div class="flex items-center justify-between gap-2">
                <span>{{ row.action }} · {{ row.actorLabel }}</span>
                <time class="text-xs text-muted">{{
                  new Date(row.createdAt).toLocaleString()
                }}</time>
              </div>
              <pre class="mt-1 overflow-auto text-xs">{{ diffText(row.diff) }}</pre>
              <UButton
                v-if="row.restorable && editable"
                type="button"
                size="xs"
                class="mt-1"
                color="neutral"
                variant="outline"
                @click="restore(row)"
              >
                Restore this version
              </UButton>
            </li>
          </ul>
        </div>
        <p v-if="formError" class="text-error">{{ formError }}</p>
      </div>
    </template>
    <template #footer>
      <div class="flex gap-2">
        <UButton
          v-if="editable && portal.canWrite.value"
          type="submit"
          form="entry-editor"
          data-testid="save-entry"
          >Save</UButton
        >
        <UButton
          v-if="canDelete && portal.canWrite.value"
          type="button"
          color="error"
          variant="soft"
          @click="removeEntry"
          >Delete</UButton
        >
      </div>
    </template>
  </USlideover>

  <UModal v-model:open="confirmOpen" title="Confirm duplicate">
    <template #body>
      <ul class="mb-3 list-disc pl-5 text-sm">
        <li v-for="warning in confirmWarnings" :key="warning">{{ warning }}</li>
      </ul>
      <div class="flex gap-2">
        <UButton type="button" data-testid="confirm-duplicate" @click="save(true)"
          >Save anyway</UButton
        >
        <UButton type="button" color="neutral" variant="outline" @click="confirmOpen = false"
          >Cancel</UButton
        >
      </div>
    </template>
  </UModal>
</template>
