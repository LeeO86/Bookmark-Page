export interface PortalActor {
  role: 'anonymous' | 'viewer' | 'editor' | 'admin'
  label: string
  kind: string
  userId: string | null
}

export interface PortalSettings {
  siteTitle: string
  siteClaim: string
  accentColour: string
  accentPreset: 'red' | 'yellow' | 'pink' | 'green' | 'cyan' | 'blue' | 'grey' | 'custom'
  neutralPalette: 'slate' | 'gray' | 'zinc' | 'neutral' | 'stone'
  defaultColourMode: 'system' | 'light' | 'dark'
  faviconColour: string
  allTabPublic: boolean
  hasLogo: boolean
  hasTabFavicon: boolean
  clientChecksAnonymous: boolean
  auditRetentionDays?: number
  faviconTlsVerify?: boolean
  faviconRefreshDays?: number
  defaultScopeEditMode?: 'locked' | 'field_ownership' | 'free'
}

export interface AuthOptions {
  localLoginEnabled: boolean
  oidcEnabled: boolean
}

export interface PortalTag {
  id: string
  namespace: string | null
  value: string
  label: string
}

export interface PortalNamespace {
  id: string
  name: string
  label: string
  colour: string
  sort: number
  showInSidebar: boolean
}

export interface PortalFilter {
  id: string
  name: string
  query: string
  ownerUserId: string | null
  columns: string[]
  groupBy: string | null
  sort: number
  icon: string | null
  isPublic: boolean
  viewMode: 'list' | 'cards' | 'tiles'
}

export interface PortalField {
  id: string
  key: string
  label: string
  type: 'text' | 'url' | 'number' | 'secret'
  minRoleToView: 'anonymous' | 'viewer' | 'editor' | 'admin'
  searchable: boolean
  showAsColumnDefault: boolean
  sort: number
}

export interface PortalLink {
  id: string
  label: string
  urlTemplate: string
  type: string
  isPrimary: boolean
  sort: number
  iconRef: string | null
  url: string | null
  urlError: string | null
  iconUrl: string | null
}

export interface PortalEntryField {
  key: string
  label: string
  type: 'text' | 'url' | 'number' | 'secret'
  value: string | null
  masked: boolean
}

export interface PortalCheck {
  id: string
  name: string
  kind: 'icmp' | 'tcp' | 'http'
  executor: 'server' | 'client'
  intervalSeconds: number
  timeoutMs: number
  tlsVerify: boolean
  host: string | null
  port: number | null
  linkId: string | null
  requestSpec: { method?: string; urlTemplate?: string } | null
  state: 'up' | 'down' | 'unknown' | null
  latencyMs: number | null
  statusMessage: string
  checkedAt: string | null
  reportedBy: string | null
}

export interface PortalAction {
  id: string
  name: string
  icon: string | null
  requestSpec: { method: string; urlTemplate: string }
  inputs: ActionPrompt[]
  confirm: boolean
  minRole: string
}

export interface ActionPrompt {
  name: string
  label: string
  type: 'text' | 'password' | 'number'
  defaultValue: string | null
  required: boolean
}

export interface RunnableAction {
  source: 'entry' | 'template'
  name: string
  icon: string | null
  confirm: boolean
  minRole: string
  method: string
  inputs: ActionPrompt[]
}

export interface ActionResult {
  ok: boolean
  status: number
  latencyMs: number
  message: string
  body: string
}

export interface PortalEntry {
  id: string
  name: string
  description: string
  host: string | null
  iconRef: string | null
  iconUrl: string | null
  sort: number
  source: string | null
  scope: string | null
  externalKey: string | null
  editMode: 'locked' | 'field_ownership' | 'free' | null
  managedFields: string[]
  tags: Array<{ namespace: string | null; value: string; label: string }>
  links: PortalLink[]
  fields: PortalEntryField[]
  checks: PortalCheck[]
  status: 'up' | 'down' | 'unknown' | null
  actions: PortalAction[]
  createdAt: string
  updatedAt: string
}

export interface HistoryRow {
  id: string
  action: string
  actorLabel: string
  actorType: string
  createdAt: string
  diff: Record<string, unknown>
  restorable: boolean
}

export type SortKey = 'manual' | 'name' | 'status' | 'description' | `field:${string}`
