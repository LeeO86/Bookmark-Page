import { z } from 'zod'

export const linkTypes = ['web', 'api', 'ssh', 'vnc', 'rdp', 'telnet', 'other'] as const
export const fieldTypes = ['text', 'url', 'number', 'secret'] as const
export const checkKinds = ['icmp', 'tcp', 'http'] as const
export const checkExecutors = ['server', 'client'] as const
export const editModes = ['locked', 'field_ownership', 'free'] as const
export const tokenScopes = ['read', 'write', 'admin'] as const

export const requestSpecSchema = z.object({
  method: z.string().trim().min(1).max(20),
  urlTemplate: z.string().min(1).max(4000),
  headers: z.record(z.string(), z.string()).default({}),
  bodyTemplate: z.string().max(20000).nullable().default(null),
  tlsVerify: z.boolean().default(false),
  timeoutMs: z.number().int().positive().max(120_000).default(5000),
  expectation: z
    .object({
      status: z.array(z.string().min(1)).min(1).default(['2xx']),
      bodyContains: z.string().max(2000).nullable().default(null),
      bodyRegex: z.string().max(2000).nullable().default(null),
      jsonPath: z.string().max(500).nullable().default(null),
      equals: z.string().max(2000).nullable().default(null),
    })
    .default({
      status: ['2xx'],
      bodyContains: null,
      bodyRegex: null,
      jsonPath: null,
      equals: null,
    }),
})

export const linkInputSchema = z.object({
  label: z.string().trim().min(1).max(200),
  urlTemplate: z.string().min(1).max(4000),
  type: z.enum(linkTypes),
  isPrimary: z.boolean(),
  sort: z.number().int().default(0),
  iconRef: z.string().max(200).nullable().default(null),
})

export const fieldValueInputSchema = z.object({
  key: z.string().trim().min(1).max(64),
  value: z.string().max(20000),
})

export const checkInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  kind: z.enum(checkKinds),
  executor: z.enum(checkExecutors).default('server'),
  intervalSeconds: z.number().int().positive().max(86_400).default(60),
  timeoutMs: z.number().int().positive().max(120_000).default(5000),
  tlsVerify: z.boolean().default(false),
  host: z.string().trim().max(255).nullable().optional(),
  port: z.number().int().min(1).max(65_535).nullable().optional(),
  linkLabel: z.string().trim().min(1).max(200).nullable().optional(),
  requestSpec: requestSpecSchema.nullable().optional(),
})

export const actionInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  icon: z.string().max(200).nullable().optional(),
  requestSpec: requestSpecSchema,
  confirm: z.boolean().optional(),
  minRole: z.enum(['anonymous', 'viewer', 'editor', 'admin']).default('editor'),
})

export const entryWriteSchema = z.object({
  name: z.string().trim().min(1).max(300),
  description: z.string().max(20_000).default(''),
  host: z.string().trim().max(255).nullable().optional(),
  iconRef: z.string().max(200).nullable().optional(),
  sort: z.number().int().default(0),
  tags: z.array(z.string().trim().min(1).max(200)).default([]),
  links: z.array(linkInputSchema).default([]),
  fields: z.array(fieldValueInputSchema).default([]),
  checks: z.array(checkInputSchema).default([]),
  actions: z.array(actionInputSchema).default([]),
  confirmDuplicates: z.boolean().optional().default(false),
})

export const entryPatchSchema = z.object({
  name: z.string().trim().min(1).max(300).optional(),
  description: z.string().max(20_000).optional(),
  host: z.string().trim().max(255).nullable().optional(),
  iconRef: z.string().max(200).nullable().optional(),
  sort: z.number().int().optional(),
  tags: z.array(z.string().trim().min(1).max(200)).optional(),
  links: z.array(linkInputSchema).optional(),
  fields: z.array(fieldValueInputSchema).optional(),
  checks: z.array(checkInputSchema).optional(),
  actions: z.array(actionInputSchema).optional(),
  confirmDuplicates: z.boolean().optional(),
})

export const syncEntrySchema = z.object({
  externalKey: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(300),
  description: z.string().max(20_000).optional(),
  host: z.string().trim().max(255).nullable().optional(),
  iconRef: z.string().max(200).nullable().optional(),
  sort: z.number().int().optional(),
  tags: z.array(z.string().trim().min(1).max(200)).optional(),
  links: z.array(linkInputSchema).optional(),
  fields: z.array(fieldValueInputSchema).optional(),
  checks: z.array(checkInputSchema).optional(),
  actions: z.array(actionInputSchema).optional(),
})

export const syncBodySchema = z.object({
  entries: z.array(syncEntrySchema),
  purge: z.boolean().default(false),
  dryRun: z.boolean().default(false),
})

export const loginSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(500),
})

export const userWriteSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9._@+-]+$/),
  email: z.string().trim().email().nullable().optional(),
  password: z.string().min(8).max(500).optional(),
  role: z.enum(['viewer', 'editor', 'admin']),
  breakGlass: z.boolean().default(false),
})

export const tokenWriteSchema = z.object({
  name: z.string().trim().min(1).max(200),
  userId: z.string().min(1).optional(),
  scopes: z.array(z.enum(tokenScopes)).min(1),
  expiresAt: z.string().datetime().nullable().optional(),
})

export const namespaceWriteSchema = z.object({
  name: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_-]{0,63}$/),
  label: z.string().trim().min(1).max(200),
  colour: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default('#64748b'),
  sort: z.number().int().default(0),
  showInSidebar: z.boolean().default(true),
})

export const tagWriteSchema = z.object({
  namespace: z.string().trim().min(1).max(64).nullable().default(null),
  value: z.string().trim().min(1).max(200),
})

export const fieldDefinitionSchema = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]{0,63}$/),
  label: z.string().trim().min(1).max(200),
  type: z.enum(fieldTypes),
  minRoleToView: z.enum(['anonymous', 'viewer', 'editor', 'admin']),
  searchable: z.boolean().default(false),
  showAsColumnDefault: z.boolean().default(false),
  sort: z.number().int().default(0),
})

export const filterWriteSchema = z.object({
  name: z.string().trim().min(1).max(200),
  query: z.string().max(4000).default(''),
  columns: z.array(z.string().min(1)).default([]),
  groupBy: z.string().max(64).nullable().optional(),
  sort: z.number().int().default(0),
  icon: z.string().max(200).nullable().optional(),
  isPublic: z.boolean().default(false),
  global: z.boolean().default(false),
})

export const checkReportSchema = z.object({
  leaseId: z.string().min(1),
  state: z.enum(['up', 'down', 'unknown']),
  latencyMs: z.number().int().min(0).max(120_000).nullable().optional(),
  message: z.string().max(500).default(''),
})

export const iconWriteSchema = z.object({
  name: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  contentType: z.enum(['image/svg+xml', 'image/png', 'image/webp']),
  data: z.string().min(1).max(400_000),
})

export const scopeWriteSchema = z.object({
  name: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_-]{0,63}$/),
  editMode: z.enum(editModes).optional(),
})

export const filterPatchSchema = filterWriteSchema.omit({ global: true }).partial()

export const userPatchSchema = z.object({
  email: z.string().trim().email().nullable().optional(),
  password: z.string().min(8).max(500).optional(),
  role: z.enum(['viewer', 'editor', 'admin']).optional(),
  breakGlass: z.boolean().optional(),
})

export const logoWriteSchema = z.object({
  contentType: z.enum(['image/png', 'image/webp']),
  data: z.string().min(1).max(800_000),
})

export const settingsPatchSchema = z.object({
  siteTitle: z.string().trim().min(1).max(200).optional(),
  siteClaim: z.string().max(500).optional(),
  accentColour: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  faviconColour: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  allTabPublic: z.boolean().optional(),
  auditRetentionDays: z.number().int().min(0).max(36_500).optional(),
  defaultScopeEditMode: z.enum(editModes).optional(),
  faviconTlsVerify: z.boolean().optional(),
  faviconRefreshDays: z.number().int().min(1).max(365).optional(),
  clientChecksAnonymous: z.boolean().optional(),
})

export type EntryWrite = z.infer<typeof entryWriteSchema>
export type EntryPatch = z.infer<typeof entryPatchSchema>
export type SyncEntry = z.infer<typeof syncEntrySchema>
export type LinkInput = z.infer<typeof linkInputSchema>
export type FieldValueInput = z.infer<typeof fieldValueInputSchema>
export type CheckInput = z.infer<typeof checkInputSchema>
export type ActionInput = z.infer<typeof actionInputSchema>
export type RequestSpec = z.infer<typeof requestSpecSchema>
export type EditMode = (typeof editModes)[number]
