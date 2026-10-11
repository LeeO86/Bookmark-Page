import {
  blob,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'

const createdAt = integer('created_at', { mode: 'timestamp_ms' }).notNull()
const updatedAt = integer('updated_at', { mode: 'timestamp_ms' }).notNull()

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    username: text('username').notNull().unique(),
    email: text('email'),
    passwordHash: text('password_hash'),
    role: text('role', { enum: ['viewer', 'editor', 'admin'] }).notNull(),
    breakGlass: integer('break_glass', { mode: 'boolean' }).notNull().default(false),
    authSource: text('auth_source', { enum: ['local', 'oidc', 'header'] }).notNull(),
    oidcIssuer: text('oidc_issuer'),
    oidcSubject: text('oidc_subject'),
    createdAt,
    updatedAt,
    createdBy: text('created_by'),
    updatedBy: text('updated_by'),
  },
  (table) => [uniqueIndex('users_oidc_identity').on(table.oidcIssuer, table.oidcSubject)],
)

export const apiTokens = sqliteTable('api_tokens', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  scopes: text('scopes', { mode: 'json' }).$type<Array<'read' | 'write' | 'admin'>>().notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
  lastUsedAt: integer('last_used_at', { mode: 'timestamp_ms' }),
  createdAt,
  updatedAt,
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
})

export const tagNamespaces = sqliteTable('tag_namespaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  label: text('label').notNull(),
  colour: text('colour').notNull(),
  sort: integer('sort').notNull().default(0),
  showInSidebar: integer('show_in_sidebar', { mode: 'boolean' }).notNull().default(true),
  createdAt,
  updatedAt,
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
})

export const tags = sqliteTable(
  'tags',
  {
    id: text('id').primaryKey(),
    namespaceName: text('namespace_name').notNull().default(''),
    value: text('value').notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [uniqueIndex('tags_namespace_value').on(table.namespaceName, table.value)],
)

export const entries = sqliteTable(
  'entries',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    host: text('host'),
    iconRef: text('icon_ref'),
    sort: integer('sort').notNull().default(0),
    source: text('source'),
    externalKey: text('external_key'),
    managedFields: text('managed_fields', { mode: 'json' }).$type<string[]>().notNull(),
    createdAt,
    updatedAt,
    createdBy: text('created_by'),
    updatedBy: text('updated_by'),
  },
  (table) => [
    uniqueIndex('entries_source_external_key').on(table.source, table.externalKey),
    index('entries_name').on(table.name),
    index('entries_host').on(table.host),
  ],
)

export const entryTags = sqliteTable(
  'entry_tags',
  {
    entryId: text('entry_id')
      .notNull()
      .references(() => entries.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
    createdAt,
    updatedAt,
  },
  (table) => [
    primaryKey({ columns: [table.entryId, table.tagId] }),
    index('entry_tags_tag').on(table.tagId),
  ],
)

export const links = sqliteTable(
  'links',
  {
    id: text('id').primaryKey(),
    entryId: text('entry_id')
      .notNull()
      .references(() => entries.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    urlTemplate: text('url_template').notNull(),
    type: text('type', { enum: ['web', 'api', 'ssh', 'vnc', 'rdp', 'telnet', 'other'] }).notNull(),
    isPrimary: integer('is_primary', { mode: 'boolean' }).notNull().default(false),
    sort: integer('sort').notNull().default(0),
    iconRef: text('icon_ref'),
    createdAt,
    updatedAt,
    createdBy: text('created_by'),
    updatedBy: text('updated_by'),
  },
  (table) => [index('links_entry').on(table.entryId)],
)

export const fieldDefinitions = sqliteTable('field_definitions', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  label: text('label').notNull(),
  type: text('type', { enum: ['text', 'url', 'number', 'secret'] }).notNull(),
  minRoleToView: text('min_role_to_view', {
    enum: ['anonymous', 'viewer', 'editor', 'admin'],
  }).notNull(),
  searchable: integer('searchable', { mode: 'boolean' }).notNull().default(false),
  showAsColumnDefault: integer('show_as_column_default', { mode: 'boolean' })
    .notNull()
    .default(false),
  sort: integer('sort').notNull().default(0),
  createdAt,
  updatedAt,
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
})

export const fieldValues = sqliteTable(
  'field_values',
  {
    id: text('id').primaryKey(),
    entryId: text('entry_id')
      .notNull()
      .references(() => entries.id, { onDelete: 'cascade' }),
    fieldId: text('field_id')
      .notNull()
      .references(() => fieldDefinitions.id, { onDelete: 'cascade' }),
    valueText: text('value_text'),
    valueSecret: text('value_secret'),
    createdAt,
    updatedAt,
    createdBy: text('created_by'),
    updatedBy: text('updated_by'),
  },
  (table) => [uniqueIndex('field_values_entry_field').on(table.entryId, table.fieldId)],
)

export const filters = sqliteTable('filters', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  query: text('query').notNull().default(''),
  ownerUserId: text('owner_user_id').references(() => users.id, { onDelete: 'cascade' }),
  columns: text('columns', { mode: 'json' }).$type<string[]>().notNull(),
  groupBy: text('group_by'),
  sort: integer('sort').notNull().default(0),
  icon: text('icon'),
  isPublic: integer('is_public', { mode: 'boolean' }).notNull().default(false),
  createdAt,
  updatedAt,
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
})

export const icons = sqliteTable('icons', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  kind: text('kind').notNull().default('reference'),
  mediaType: text('media_type'),
  data: blob('data', { mode: 'buffer' }),
  createdAt,
  updatedAt,
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
})

export const faviconCache = sqliteTable('favicon_cache', {
  id: text('id').primaryKey(),
  origin: text('origin').notNull().unique(),
  status: text('status').notNull().default('empty'),
  mediaType: text('media_type'),
  byteSize: integer('byte_size'),
  error: text('error'),
  fetchedAt: integer('fetched_at', { mode: 'timestamp_ms' }),
  data: blob('data', { mode: 'buffer' }),
  createdAt,
  updatedAt,
})

export const checks = sqliteTable(
  'checks',
  {
    id: text('id').primaryKey(),
    entryId: text('entry_id')
      .notNull()
      .references(() => entries.id, { onDelete: 'cascade' }),
    linkId: text('link_id').references(() => links.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    kind: text('kind', { enum: ['icmp', 'tcp', 'http'] }).notNull(),
    executor: text('executor', { enum: ['server', 'client'] }).notNull(),
    intervalSeconds: integer('interval_seconds').notNull().default(60),
    timeoutMs: integer('timeout_ms').notNull().default(5000),
    tlsVerify: integer('tls_verify', { mode: 'boolean' }).notNull().default(false),
    host: text('host'),
    port: integer('port'),
    requestSpec: text('request_spec', { mode: 'json' }).$type<Record<string, unknown> | null>(),
    createdAt,
    updatedAt,
    createdBy: text('created_by'),
    updatedBy: text('updated_by'),
  },
  (table) => [index('checks_entry').on(table.entryId)],
)

export const checkStatus = sqliteTable('check_status', {
  checkId: text('check_id')
    .primaryKey()
    .references(() => checks.id, { onDelete: 'cascade' }),
  state: text('state', { enum: ['up', 'down', 'unknown'] }).notNull(),
  latencyMs: integer('latency_ms'),
  message: text('message').notNull().default(''),
  checkedAt: integer('checked_at', { mode: 'timestamp_ms' }),
  reportedBy: text('reported_by'),
  createdAt,
  updatedAt,
})

export const actions = sqliteTable(
  'actions',
  {
    id: text('id').primaryKey(),
    entryId: text('entry_id')
      .notNull()
      .references(() => entries.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    icon: text('icon'),
    requestSpec: text('request_spec', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
    confirm: integer('confirm', { mode: 'boolean' }).notNull().default(true),
    minRole: text('min_role', { enum: ['anonymous', 'viewer', 'editor', 'admin'] }).notNull(),
    createdAt,
    updatedAt,
    createdBy: text('created_by'),
    updatedBy: text('updated_by'),
  },
  (table) => [index('actions_entry').on(table.entryId)],
)

export const actionTemplates = sqliteTable('action_templates', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  icon: text('icon'),
  requestSpec: text('request_spec', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  query: text('query').notNull().default(''),
  confirm: integer('confirm', { mode: 'boolean' }).notNull().default(true),
  minRole: text('min_role', { enum: ['anonymous', 'viewer', 'editor', 'admin'] }).notNull(),
  createdAt,
  updatedAt,
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
})

export const auditLog = sqliteTable(
  'audit_log',
  {
    id: text('id').primaryKey(),
    actorId: text('actor_id'),
    actorType: text('actor_type', { enum: ['user', 'token', 'system'] }).notNull(),
    actorLabel: text('actor_label').notNull(),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id'),
    diff: text('diff', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [index('audit_log_created').on(table.createdAt)],
)

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).$type<unknown>().notNull(),
  createdAt,
  updatedAt,
  updatedBy: text('updated_by'),
})

export const ansibleScopes = sqliteTable('ansible_scopes', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  editMode: text('edit_mode', { enum: ['locked', 'field_ownership', 'free'] }).notNull(),
  createdAt,
  updatedAt,
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
})
