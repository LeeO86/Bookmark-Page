<script setup lang="ts">
import { settingsPatchSchema } from '#shared/contracts'
import { accentPresets, plainTagColour, type AccentPreset } from '#shared/theme'
import type { PortalField, PortalNamespace, PortalSettings } from '../../types/portal'
import { apiFetch } from '../../utils/api'

interface AdminSettings extends PortalSettings {
  auditRetentionDays: number
  defaultScopeEditMode: 'locked' | 'field_ownership' | 'free'
  faviconTlsVerify: boolean
  faviconRefreshDays: number
}
interface AdminUser {
  id: string
  username: string
  email: string | null
  role: 'viewer' | 'editor' | 'admin'
  breakGlass: boolean
  authSource: string
}
interface AdminToken {
  id: string
  name: string
  scopes: string[]
  userId: string
}
interface ActionTemplateRow {
  id: string
  name: string
  query: string
  method: string
  urlTemplate: string
  confirm: boolean
  minRole: string
}
interface AdminScope {
  id: string
  name: string
  editMode: 'locked' | 'field_ownership' | 'free'
}
interface AuthStatus {
  localLoginEnabled: boolean
  oidcEnabled: boolean
  oidcDiscoveryUrl: string | null
  oidcRoleClaim: string
  trustedHeaderEnabled: boolean
  trustedProxyCount: number
  userHeader: string
  emailHeader: string | null
  groupsHeader: string | null
}

const props = defineProps<{ section: string }>()
const section = computed(() => props.section)
const portal = usePortal()
const toast = useToast()
const message = ref('')
const error = ref('')
const settings = ref<AdminSettings | null>(null)
const users = ref<AdminUser[]>([])
const namespaces = ref<PortalNamespace[]>([])
const fields = ref<PortalField[]>([])
const tokens = ref<AdminToken[]>([])
const scopes = ref<AdminScope[]>([])
const status = ref<AuthStatus | null>(null)
const issuedToken = ref('')
const auditRows = ref<
  Array<{
    id: string
    action: string
    actorLabel: string
    actorType: string
    targetType: string
    createdAt: string
  }>
>([])
const presets = [
  ...Object.entries(accentPresets).map(([value, preset]) => ({
    label: preset.label,
    value: value as AccentPreset,
  })),
  { label: 'Custom', value: 'custom' as const },
]

const userForm = reactive({
  username: '',
  email: '',
  password: '',
  role: 'viewer' as AdminUser['role'],
  breakGlass: false,
})
const fieldForm = reactive({
  key: '',
  label: '',
  type: 'text' as PortalField['type'],
  minRoleToView: 'viewer' as PortalField['minRoleToView'],
  searchable: false,
  showAsColumnDefault: false,
  sort: 0,
})
const namespaceForm = reactive({
  name: '',
  label: '',
  colour: plainTagColour,
  sort: 0,
  showInSidebar: true,
})
const tokenForm = reactive({ name: '', scopes: ['read'] as string[] })
const scopeForm = reactive({ name: '', editMode: 'field_ownership' as AdminScope['editMode'] })
const templates = ref<ActionTemplateRow[]>([])
const iconQuery = ref('')
const templateForm = reactive({
  name: '',
  query: '',
  method: 'POST',
  urlTemplate: 'https://{{host}}/',
  confirm: true,
  minRole: 'editor' as 'viewer' | 'editor' | 'admin',
})
const iconResults = ref<Array<{ ref: string; name: string; kind: string; url: string }>>([])
const iconName = ref('')

onMounted(async () => {
  await portal.load()
  if (portal.actor.value.role !== 'admin') {
    return
  }
  await refresh()
  if (section.value === 'audit') {
    await loadAudit()
  }
})

async function refresh() {
  error.value = ''
  const [
    settingsBody,
    userBody,
    namespaceBody,
    fieldBody,
    tokenBody,
    scopeBody,
    statusBody,
    templateBody,
  ] = await Promise.all([
    apiFetch<AdminSettings>('/api/v1/settings'),
    apiFetch<{ users: AdminUser[] }>('/api/v1/users'),
    apiFetch<{ namespaces: PortalNamespace[] }>('/api/v1/namespaces'),
    apiFetch<{ fields: PortalField[] }>('/api/v1/fields'),
    apiFetch<{ tokens: AdminToken[] }>('/api/v1/tokens'),
    apiFetch<{ scopes: AdminScope[] }>('/api/v1/scopes'),
    apiFetch<AuthStatus>('/api/v1/auth/status'),
    apiFetch<{ templates: ActionTemplateRow[] }>('/api/v1/action-templates'),
  ])
  settings.value = settingsBody
  users.value = userBody.users
  namespaces.value = namespaceBody.namespaces
  fields.value = fieldBody.fields
  tokens.value = tokenBody.tokens
  scopes.value = scopeBody.scopes
  status.value = statusBody
  templates.value = templateBody.templates
}

async function run(action: () => Promise<void>, success: string) {
  error.value = ''
  message.value = ''
  try {
    await action()
    message.value = success
    toast.add({ title: success, color: 'success' })
    await refresh()
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Request failed'
    toast.add({ title: error.value, color: 'error' })
  }
}

async function saveSettings() {
  if (!settings.value) {
    return
  }
  await run(async () => {
    settings.value = await apiFetch<AdminSettings>('/api/v1/settings', {
      method: 'PATCH',
      body: {
        siteTitle: settings.value?.siteTitle,
        siteClaim: settings.value?.siteClaim,
        accentColour: settings.value?.accentColour,
        accentPreset: settings.value?.accentPreset,
        neutralPalette: settings.value?.neutralPalette,
        defaultColourMode: settings.value?.defaultColourMode,
        faviconColour: settings.value?.accentColour,
        allTabPublic: settings.value?.allTabPublic,
        auditRetentionDays: Number(settings.value?.auditRetentionDays),
        defaultScopeEditMode: settings.value?.defaultScopeEditMode,
        faviconTlsVerify: settings.value?.faviconTlsVerify,
        faviconRefreshDays: Number(settings.value?.faviconRefreshDays),
        clientChecksAnonymous: settings.value?.clientChecksAnonymous,
      },
    })
    if (portal.settings.value) {
      portal.settings.value = { ...portal.settings.value, ...settings.value }
    }
  }, 'Settings saved')
}

async function uploadLogo(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) {
    return
  }
  const data = await file.arrayBuffer()
  const bytes = new Uint8Array(data)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  await run(async () => {
    await apiFetch('/api/v1/settings/logo', {
      method: 'POST',
      body: { contentType: file.type, data: btoa(binary) },
    })
    portal.logoVersion.value += 1
  }, 'Logo saved')
}

async function clearLogo() {
  await run(async () => {
    await apiFetch('/api/v1/settings/logo', { method: 'DELETE', body: {} })
    portal.logoVersion.value += 1
  }, 'Logo removed')
}

const pendingIcon = ref<File | null>(null)

function uploadIconFile(event: Event) {
  pendingIcon.value = (event.target as HTMLInputElement).files?.[0] ?? null
  if (pendingIcon.value && iconName.value) {
    void uploadIcon()
  }
}

async function searchIconLibrary() {
  const body = await apiFetch<{
    icons: Array<{ ref: string; name: string; kind: string; url: string }>
  }>(`/api/v1/icons?q=${encodeURIComponent(iconQuery.value)}`)
  iconResults.value = body.icons
  message.value = 'Icons loaded'
  error.value = ''
}

async function uploadIcon() {
  const file = pendingIcon.value
  if (!file) {
    error.value = 'Choose an SVG, PNG, or WebP file'
    return
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  await run(async () => {
    await apiFetch('/api/v1/icons', {
      method: 'POST',
      body: { name: iconName.value, contentType: file.type, data: btoa(binary) },
    })
    iconName.value = ''
    pendingIcon.value = null
  }, 'Icon uploaded')
}

function choosePreset(value: string) {
  if (!settings.value) {
    return
  }
  const preset = value as AccentPreset
  settings.value.accentPreset = preset
  if (preset !== 'custom') {
    settings.value.accentColour = accentPresets[preset].seed
  }
}

async function uploadTabFavicon(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) {
    return
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  await run(async () => {
    await apiFetch('/api/v1/settings/favicon', {
      method: 'POST',
      body: { contentType: file.type, data: btoa(binary) },
    })
  }, 'Tab icon saved')
}

watch(section, () => {
  if (section.value === 'audit') {
    void loadAudit()
  }
})

async function loadAudit() {
  const body = await apiFetch<{ entries: typeof auditRows.value }>('/api/v1/audit')
  auditRows.value = body.entries
}

function toggleScope(scope: string) {
  tokenForm.scopes = tokenForm.scopes.includes(scope)
    ? tokenForm.scopes.filter((item) => item !== scope)
    : [...tokenForm.scopes, scope]
}
</script>

<template>
  <div class="space-y-4 p-4 text-sm">
    <div v-if="portal.actor.value.role !== 'admin'">
      <p>Admin access is required.</p>
      <NuxtLink to="/" class="text-accent">Back to the portal</NuxtLink>
    </div>
    <template v-else>
      <nav aria-label="Admin pages" class="flex flex-wrap gap-2">
        <NuxtLink to="/admin/backup" class="text-accent">Backup</NuxtLink>
        <NuxtLink to="/admin/csv" class="text-accent">CSV import</NuxtLink>
        <NuxtLink to="/admin/audit" class="text-accent">Audit log</NuxtLink>
      </nav>
      <main class="min-w-0 flex-1 space-y-4">
        <p v-if="message" class="text-success">{{ message }}</p>
        <p v-if="error" class="text-error">{{ error }}</p>

        <UForm
          v-if="section === 'settings' && settings"
          :schema="settingsPatchSchema"
          :state="settings"
          class="space-y-3"
          @submit="saveSettings"
        >
          <h1 class="text-lg font-semibold">Settings</h1>
          <UFormField label="Title"
            ><UInput v-model="settings.siteTitle" class="w-full"
          /></UFormField>
          <UFormField label="Claim"
            ><UInput v-model="settings.siteClaim" class="w-full"
          /></UFormField>
          <UFormField label="Theme">
            <USelect
              :model-value="settings.accentPreset"
              :items="presets"
              class="w-48"
              @update:model-value="choosePreset(String($event))"
            />
          </UFormField>
          <label class="block">
            Accent
            <input
              v-model="settings.accentColour"
              type="color"
              @input="settings.accentPreset = 'custom'"
            />
          </label>
          <UFormField label="Neutral palette">
            <USelect
              v-model="settings.neutralPalette"
              :items="['slate', 'gray', 'zinc', 'neutral', 'stone']"
              class="w-48"
            />
          </UFormField>
          <UFormField label="Default colour mode">
            <USelect
              v-model="settings.defaultColourMode"
              :items="['system', 'light', 'dark']"
              class="w-48"
            />
          </UFormField>
          <label class="flex items-center gap-2">
            <input v-model="settings.allTabPublic" type="checkbox" />
            All tab is visible to anonymous visitors
          </label>
          <label class="flex items-center gap-2">
            <input v-model="settings.faviconTlsVerify" type="checkbox" />
            Verify TLS certificates when fetching favicons
          </label>
          <UFormField label="Favicon refresh days">
            <UInput v-model.number="settings.faviconRefreshDays" type="number" class="w-40" />
          </UFormField>
          <label class="flex items-center gap-2">
            <input v-model="settings.clientChecksAnonymous" type="checkbox" />
            Allow anonymous visitors to run browser checks
          </label>
          <UFormField label="Audit retention days">
            <UInput v-model.number="settings.auditRetentionDays" type="number" class="w-40" />
          </UFormField>
          <UFormField label="Default scope edit mode">
            <select
              v-model="settings.defaultScopeEditMode"
              class="rounded border px-2 py-1 bg-default"
            >
              <option value="locked">locked</option>
              <option value="field_ownership">field_ownership</option>
              <option value="free">free</option>
            </select>
          </UFormField>
          <div>
            <label class="block"
              >Browser tab icon (PNG or WebP). Leave empty to use the accent glyph.</label
            >
            <input type="file" accept="image/png,image/webp" @change="uploadTabFavicon" />
            <UButton
              type="button"
              class="mt-2"
              size="sm"
              color="neutral"
              variant="outline"
              @click="
                run(async () => {
                  await apiFetch('/api/v1/settings/favicon', { method: 'DELETE', body: {} })
                }, 'Tab icon removed')
              "
            >
              Use accent glyph
            </UButton>
          </div>
          <div>
            <label class="block">Logo (PNG or WebP, up to 512 KB)</label>
            <input
              type="file"
              accept="image/png,image/webp"
              data-testid="logo-file"
              @change="uploadLogo"
            />
            <UButton
              type="button"
              class="mt-2"
              size="sm"
              color="neutral"
              variant="outline"
              @click="clearLogo"
              >Remove logo</UButton
            >
          </div>
          <UButton type="submit">Save settings</UButton>
        </UForm>

        <section v-else-if="section === 'users'" class="space-y-3">
          <h1 class="text-lg font-semibold">Users and roles</h1>
          <form
            class="grid gap-2 md:grid-cols-2"
            @submit.prevent="
              run(async () => {
                await apiFetch('/api/v1/users', {
                  method: 'POST',
                  body: { ...userForm, email: userForm.email || null },
                })
                userForm.username = ''
                userForm.password = ''
              }, 'User created')
            "
          >
            <UInput v-model="userForm.username" placeholder="Username" required />
            <UInput v-model="userForm.email" placeholder="Email" />
            <UInput v-model="userForm.password" type="password" placeholder="Password" required />
            <select v-model="userForm.role" class="rounded border px-2 py-1 bg-default">
              <option value="viewer">viewer</option>
              <option value="editor">editor</option>
              <option value="admin">admin</option>
            </select>
            <label class="flex items-center gap-2"
              ><input v-model="userForm.breakGlass" type="checkbox" /> Break-glass</label
            >
            <UButton type="submit" size="sm">Create user</UButton>
          </form>
          <div
            v-for="user in users"
            :key="user.id"
            class="flex flex-wrap items-center gap-2 border-t py-2"
          >
            <span class="font-medium">{{ user.username }}</span>
            <span class="text-xs text-muted">{{ user.authSource }}</span>
            <select
              :value="user.role"
              class="rounded border px-2 py-1 bg-default"
              @change="
                run(async () => {
                  await apiFetch(`/api/v1/users/${user.id}`, {
                    method: 'PATCH',
                    body: { role: ($event.target as HTMLSelectElement).value },
                  })
                }, 'Role updated')
              "
            >
              <option value="viewer">viewer</option>
              <option value="editor">editor</option>
              <option value="admin">admin</option>
            </select>
            <UButton
              type="button"
              size="xs"
              color="error"
              variant="soft"
              @click="
                run(async () => {
                  await apiFetch(`/api/v1/users/${user.id}`, { method: 'DELETE', body: {} })
                }, 'User deleted')
              "
            >
              Delete
            </UButton>
          </div>
        </section>

        <section v-else-if="section === 'auth' && status" class="space-y-2">
          <h1 class="text-lg font-semibold">Auth status</h1>
          <p>Local login: {{ status.localLoginEnabled ? 'enabled' : 'disabled' }}</p>
          <p>OpenID Connect: {{ status.oidcEnabled ? 'configured' : 'not configured' }}</p>
          <p v-if="status.oidcDiscoveryUrl">Discovery URL: {{ status.oidcDiscoveryUrl }}</p>
          <p>Role claim: {{ status.oidcRoleClaim }}</p>
          <p>Trusted header: {{ status.trustedHeaderEnabled ? 'enabled' : 'disabled' }}</p>
          <p>Trusted proxies: {{ status.trustedProxyCount }}</p>
          <p>User header: {{ status.userHeader }}</p>
          <p v-if="status.emailHeader">Email header: {{ status.emailHeader }}</p>
          <p v-if="status.groupsHeader">Groups header: {{ status.groupsHeader }}</p>
          <p class="text-xs text-muted">Secrets are not shown.</p>
        </section>

        <section v-else-if="section === 'fields'" class="space-y-3">
          <h1 class="text-lg font-semibold">Field definitions</h1>
          <form
            class="grid gap-2 md:grid-cols-2"
            @submit.prevent="
              run(async () => {
                await apiFetch('/api/v1/fields', { method: 'POST', body: fieldForm })
              }, 'Field created')
            "
          >
            <UInput v-model="fieldForm.key" placeholder="key" required />
            <UInput v-model="fieldForm.label" placeholder="Label" required />
            <select v-model="fieldForm.type" class="rounded border px-2 py-1 bg-default">
              <option value="text">text</option>
              <option value="url">url</option>
              <option value="number">number</option>
              <option value="secret">secret</option>
            </select>
            <select v-model="fieldForm.minRoleToView" class="rounded border px-2 py-1 bg-default">
              <option value="anonymous">anonymous</option>
              <option value="viewer">viewer</option>
              <option value="editor">editor</option>
              <option value="admin">admin</option>
            </select>
            <label class="flex items-center gap-2"
              ><input v-model="fieldForm.searchable" type="checkbox" /> Searchable</label
            >
            <label class="flex items-center gap-2"
              ><input v-model="fieldForm.showAsColumnDefault" type="checkbox" /> Default
              column</label
            >
            <UButton type="submit" size="sm">Create field</UButton>
          </form>
          <div
            v-for="field in fields"
            :key="field.id"
            class="flex items-center justify-between border-t py-2"
          >
            <span
              >{{ field.label }} <code>{{ field.key }}</code> · {{ field.type }}</span
            >
            <UButton
              type="button"
              size="xs"
              color="error"
              variant="soft"
              @click="
                run(async () => {
                  await apiFetch(`/api/v1/fields/${field.id}`, { method: 'DELETE', body: {} })
                }, 'Field deleted')
              "
            >
              Delete
            </UButton>
          </div>
        </section>

        <section v-else-if="section === 'namespaces'" class="space-y-3">
          <h1 class="text-lg font-semibold">Tag namespaces</h1>
          <form
            class="grid gap-2 md:grid-cols-2"
            @submit.prevent="
              run(async () => {
                await apiFetch('/api/v1/namespaces', { method: 'POST', body: namespaceForm })
              }, 'Namespace created')
            "
          >
            <UInput v-model="namespaceForm.name" placeholder="name" required />
            <UInput v-model="namespaceForm.label" placeholder="Label" required />
            <input v-model="namespaceForm.colour" type="color" />
            <label class="flex items-center gap-2"
              ><input v-model="namespaceForm.showInSidebar" type="checkbox" /> Show in
              sidebar</label
            >
            <UButton type="submit" size="sm">Create namespace</UButton>
          </form>
          <div
            v-for="namespace in namespaces"
            :key="namespace.id"
            class="flex flex-wrap items-center gap-2 border-t py-2"
          >
            <span
              class="inline-block size-3 rounded-full"
              :style="{ background: namespace.colour }"
            />
            <span>{{ namespace.label }} ({{ namespace.name }})</span>
            <UButton
              type="button"
              size="xs"
              color="neutral"
              variant="outline"
              @click="
                run(async () => {
                  await apiFetch(`/api/v1/namespaces/${namespace.id}`, {
                    method: 'PATCH',
                    body: { showInSidebar: !namespace.showInSidebar },
                  })
                }, 'Namespace updated')
              "
            >
              {{ namespace.showInSidebar ? 'Hide' : 'Show' }}
            </UButton>
            <UButton
              type="button"
              size="xs"
              color="error"
              variant="soft"
              @click="
                run(async () => {
                  await apiFetch(`/api/v1/namespaces/${namespace.id}`, {
                    method: 'DELETE',
                    body: {},
                  })
                }, 'Namespace deleted')
              "
            >
              Delete
            </UButton>
          </div>
        </section>

        <section v-else-if="section === 'tokens'" class="space-y-3">
          <h1 class="text-lg font-semibold">API tokens</h1>
          <form
            class="space-y-2"
            @submit.prevent="
              run(async () => {
                const created = await apiFetch<{ token: string }>('/api/v1/tokens', {
                  method: 'POST',
                  body: tokenForm,
                })
                issuedToken = created.token
                tokenForm.name = ''
              }, 'Token created')
            "
          >
            <UInput v-model="tokenForm.name" placeholder="Name" required />
            <label
              v-for="scope in ['read', 'write', 'admin']"
              :key="scope"
              class="mr-3 inline-flex items-center gap-1"
            >
              <input
                :checked="tokenForm.scopes.includes(scope)"
                type="checkbox"
                @change="toggleScope(scope)"
              />
              {{ scope }}
            </label>
            <UButton type="submit" size="sm">Create token</UButton>
          </form>
          <p v-if="issuedToken" class="rounded bg-warning/10 p-2 break-all">
            Copy this token now. It will not be shown again: {{ issuedToken }}
          </p>
          <div
            v-for="token in tokens"
            :key="token.id"
            class="flex items-center justify-between border-t py-2"
          >
            <span>{{ token.name }} · {{ token.scopes.join(', ') }}</span>
            <UButton
              type="button"
              size="xs"
              color="error"
              variant="soft"
              @click="
                run(async () => {
                  await apiFetch(`/api/v1/tokens/${token.id}`, { method: 'DELETE', body: {} })
                }, 'Token deleted')
              "
            >
              Delete
            </UButton>
          </div>
        </section>

        <section v-else-if="section === 'actions'" class="space-y-3">
          <h1 class="text-lg font-semibold">Action templates</h1>
          <p class="text-xs text-muted">
            A template appears on every entry that matches its query. Running it makes this server
            call that URL.
          </p>
          <form
            class="grid gap-2 md:grid-cols-2"
            @submit.prevent="
              run(async () => {
                await apiFetch('/api/v1/action-templates', {
                  method: 'POST',
                  body: {
                    name: templateForm.name,
                    query: templateForm.query,
                    confirm: templateForm.confirm,
                    minRole: templateForm.minRole,
                    requestSpec: {
                      method: templateForm.method,
                      urlTemplate: templateForm.urlTemplate,
                      headers: {},
                      bodyTemplate: null,
                      tlsVerify: false,
                      timeoutMs: 5000,
                      expectation: {
                        status: ['2xx'],
                        bodyContains: null,
                        bodyRegex: null,
                        jsonPath: null,
                        equals: null,
                      },
                    },
                  },
                })
                templateForm.name = ''
              }, 'Template created')
            "
          >
            <UInput v-model="templateForm.name" placeholder="Name" required />
            <UInput v-model="templateForm.query" placeholder="Query, for example type:audio" />
            <UInput v-model="templateForm.method" placeholder="Method" required />
            <UInput v-model="templateForm.urlTemplate" placeholder="URL template" required />
            <label class="flex items-center gap-2"
              ><input v-model="templateForm.confirm" type="checkbox" /> Confirm before
              running</label
            >
            <UButton type="submit" size="sm">Create template</UButton>
          </form>
          <div
            v-for="template in templates"
            :key="template.id"
            class="flex items-center justify-between border-t py-2"
          >
            <span
              >{{ template.name }} · {{ template.method }} ·
              {{ template.query || 'all entries' }}</span
            >
            <UButton
              type="button"
              size="xs"
              color="error"
              variant="soft"
              @click="
                run(async () => {
                  await apiFetch(`/api/v1/action-templates/${template.id}`, {
                    method: 'DELETE',
                    body: {},
                  })
                }, 'Template deleted')
              "
            >
              Delete
            </UButton>
          </div>
        </section>

        <section v-else-if="section === 'icons'" class="space-y-3">
          <h1 class="text-lg font-semibold">Icon library</h1>
          <p class="text-xs text-muted">
            Lucide names match the old Feather icon names. Uploaded SVGs are sanitised.
          </p>
          <div class="flex gap-2">
            <UInput v-model="iconQuery" placeholder="Search" class="flex-1" />
            <UButton type="button" size="sm" @click="searchIconLibrary">Search</UButton>
          </div>
          <form class="flex flex-wrap items-center gap-2" @submit.prevent="uploadIcon">
            <UInput v-model="iconName" placeholder="name" required />
            <input
              type="file"
              accept="image/svg+xml,image/png,image/webp"
              data-testid="icon-file"
              @change="uploadIconFile"
            />
          </form>
          <div class="flex flex-wrap gap-2">
            <div
              v-for="icon in iconResults"
              :key="icon.ref"
              class="flex items-center gap-1 rounded border px-2 py-1"
            >
              <img :src="icon.url" alt="" class="size-5" />
              <span>{{ icon.name }}</span>
              <button
                v-if="icon.kind === 'upload'"
                type="button"
                class="text-xs text-error"
                @click="
                  run(async () => {
                    await apiFetch(`/api/v1/icons/${icon.ref.slice('upload:'.length)}`, {
                      method: 'DELETE',
                      body: {},
                    })
                  }, 'Icon deleted')
                "
              >
                Delete
              </button>
            </div>
          </div>
        </section>

        <section v-else-if="section === 'scopes'" class="space-y-3">
          <h1 class="text-lg font-semibold">Ansible scopes</h1>
          <form
            class="flex flex-wrap gap-2"
            @submit.prevent="
              run(async () => {
                await apiFetch('/api/v1/scopes', { method: 'POST', body: scopeForm })
                scopeForm.name = ''
              }, 'Scope created')
            "
          >
            <UInput v-model="scopeForm.name" placeholder="name" required />
            <select v-model="scopeForm.editMode" class="rounded border px-2 py-1 bg-default">
              <option value="locked">locked</option>
              <option value="field_ownership">field_ownership</option>
              <option value="free">free</option>
            </select>
            <UButton type="submit" size="sm">Create scope</UButton>
          </form>
          <div
            v-for="scope in scopes"
            :key="scope.id"
            class="flex items-center gap-2 border-t py-2"
          >
            <span class="font-medium">{{ scope.name }}</span>
            <select
              :value="scope.editMode"
              class="rounded border px-2 py-1 bg-default"
              @change="
                run(async () => {
                  await apiFetch(`/api/v1/scopes/${scope.id}`, {
                    method: 'PATCH',
                    body: { editMode: ($event.target as HTMLSelectElement).value },
                  })
                }, 'Edit mode updated')
              "
            >
              <option value="locked">locked</option>
              <option value="field_ownership">field_ownership</option>
              <option value="free">free</option>
            </select>
          </div>
        </section>

        <section v-else-if="section === 'audit'" class="space-y-3">
          <h1 class="text-lg font-semibold">Audit log</h1>
          <p class="text-xs text-muted">Secret values are redacted.</p>
          <div v-for="row in auditRows" :key="row.id" class="border-t border-default py-2">
            <p>
              <time>{{ new Date(row.createdAt).toLocaleString() }}</time>
              · {{ row.actorLabel }} ({{ row.actorType }})
            </p>
            <p class="text-muted">{{ row.action }} · {{ row.targetType }}</p>
          </div>
          <p v-if="auditRows.length === 0" class="text-muted">No audit entries.</p>
        </section>

        <BackupPanel v-else-if="section === 'backup'" />
        <CsvImport v-else-if="section === 'csv'" :fields="fields" />
      </main>
    </template>
  </div>
</template>
