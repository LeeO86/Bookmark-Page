import { z } from 'zod'
import {
  actionExecuteSchema,
  actionInputSchema,
  checkInputSchema,
  linkInputSchema,
  actionTemplateSchema,
  checkReportSchema,
  checkLeaseSchema,
  faviconWriteSchema,
  iconWriteSchema,
  preferencesPatchSchema,
  syncEntrySchema,
  tagWriteSchema,
  tagPatchSchema,
  entryPatchSchema,
  entryWriteSchema,
  fieldDefinitionSchema,
  filterPatchSchema,
  filterWriteSchema,
  loginSchema,
  logoWriteSchema,
  namespaceWriteSchema,
  requestSpecSchema,
  scopeWriteSchema,
  settingsPatchSchema,
  syncBodySchema,
  tokenWriteSchema,
  userPatchSchema,
  userWriteSchema,
} from '../shared/contracts'

import {
  backupRequestSchema,
  restoreRequestSchema,
  csvPreviewSchema,
  csvImportSchema,
  restorePreviewSchema,
  csvImportResultSchema,
} from '../shared/backup'

const paths: Record<string, Record<string, { summary: string }>> = {
  '/api/v1/auth/login': { post: { summary: 'Log in with a local account' } },
  '/api/v1/auth/logout': { post: { summary: 'Clear the session cookie' } },
  '/api/v1/auth/session': { get: { summary: 'Return the current actor' } },
  '/api/v1/auth/options': { get: { summary: 'Return the enabled sign-in methods' } },
  '/api/v1/auth/status': { get: { summary: 'Return auth configuration without secrets' } },
  '/api/v1/auth/oidc/start': { get: { summary: 'Start an OIDC authorization code flow' } },
  '/api/v1/auth/oidc/callback': { get: { summary: 'Finish the OIDC authorization code flow' } },
  '/api/v1/entries': {
    get: { summary: 'List visible entries' },
    post: { summary: 'Create an entry' },
  },
  '/api/v1/entries/{id}': {
    get: { summary: 'Read an entry' },
    patch: { summary: 'Update an entry' },
    delete: { summary: 'Delete an entry' },
  },
  '/api/v1/entries/{id}/fields/{key}/reveal': {
    post: { summary: 'Reveal a secret field and audit it' },
  },
  '/api/v1/entries/{id}/links/{linkId}/reveal': {
    post: { summary: 'Reveal a permitted link and audit it' },
  },
  '/api/v1/entries/{id}/history': { get: { summary: 'Read an entry change history' } },
  '/api/v1/entries/{id}/history/{auditId}/restore': {
    post: { summary: 'Restore an entry version from the audit log' },
  },
  '/api/v1/entries/{id}/favicon': { post: { summary: 'Refetch favicons for an entry' } },
  '/api/v1/checks/lease': { post: { summary: 'Lease due browser checks' } },
  '/api/v1/checks/{id}/report': { post: { summary: 'Report a browser check result' } },
  '/api/v1/entries/{id}/actions': { get: { summary: 'List actions that can run on an entry' } },
  '/api/v1/entries/{id}/actions/{name}/execute': {
    post: { summary: 'Run an action on the server' },
  },
  '/api/v1/action-templates': {
    get: { summary: 'List action templates' },
    post: { summary: 'Create an action template' },
  },
  '/api/v1/action-templates/{id}': { delete: { summary: 'Delete an action template' } },
  '/api/v1/events': { get: { summary: 'Subscribe to entry and status changes' } },
  '/api/v1/logo': { get: { summary: 'Read the site logo' } },
  '/api/v1/favicon': { get: { summary: 'Read the browser-tab icon' } },
  '/api/v1/preferences': {
    get: { summary: 'Read the signed-in user theme preferences' },
    patch: { summary: 'Save colour mode and per-tab view modes' },
  },
  '/api/v1/namespaces': {
    get: { summary: 'List tag namespaces' },
    post: { summary: 'Create a tag namespace' },
  },
  '/api/v1/namespaces/{id}': {
    patch: { summary: 'Update a tag namespace' },
    delete: { summary: 'Delete a tag namespace' },
  },
  '/api/v1/tags': { get: { summary: 'List tags' }, post: { summary: 'Create a tag' } },
  '/api/v1/tags/{id}': {
    patch: { summary: 'Update a tag display label' },
    delete: { summary: 'Delete a tag' },
  },
  '/api/v1/filters': {
    get: { summary: 'List visible filters' },
    post: { summary: 'Create a filter' },
  },
  '/api/v1/filters/{id}': {
    patch: { summary: 'Update a filter' },
    delete: { summary: 'Delete a filter' },
  },
  '/api/v1/fields': {
    get: { summary: 'List field definitions' },
    post: { summary: 'Create a field definition' },
  },
  '/api/v1/fields/{id}': {
    patch: { summary: 'Update a field definition' },
    delete: { summary: 'Delete a field definition' },
  },
  '/api/v1/icons': {
    get: { summary: 'Search Lucide icons and uploads' },
    post: { summary: 'Upload a sanitised icon' },
  },
  '/api/v1/icons/{id}': { delete: { summary: 'Delete icon metadata' } },
  '/api/v1/users': { get: { summary: 'List users' }, post: { summary: 'Create a local user' } },
  '/api/v1/users/{id}': {
    patch: { summary: 'Update a user' },
    delete: { summary: 'Delete a user' },
  },
  '/api/v1/tokens': {
    get: { summary: 'List API tokens' },
    post: { summary: 'Create an API token' },
  },
  '/api/v1/tokens/{id}': { delete: { summary: 'Delete an API token' } },
  '/api/v1/scopes': {
    get: { summary: 'List Ansible scopes' },
    post: { summary: 'Create an Ansible scope' },
  },
  '/api/v1/scopes/{id}': { patch: { summary: 'Change a scope edit mode' } },
  '/api/v1/scopes/{scope}/entries/{externalKey}': {
    put: { summary: 'Upsert an entry by external key' },
    delete: { summary: 'Delete one entry owned by an Ansible scope' },
  },
  '/api/v1/scopes/{scope}/sync': { post: { summary: 'Declarative scope sync' } },
  '/api/v1/settings': { get: { summary: 'Read settings' }, patch: { summary: 'Update settings' } },
  '/api/v1/settings/logo': {
    post: { summary: 'Upload a PNG, JPEG, WebP or sanitized SVG logo' },
    delete: { summary: 'Remove the logo' },
  },
  '/api/v1/settings/favicon': {
    post: { summary: 'Upload a PNG or WebP browser-tab icon' },
    delete: { summary: 'Remove the browser-tab icon' },
  },
  '/api/v1/audit': { get: { summary: 'Read the audit log' } },
  '/api/v1/backup': { post: { summary: 'Download a backup archive' } },
  '/api/v1/restore': { post: { summary: 'Restore a backup archive' } },
  '/api/v1/import/csv/preview': { post: { summary: 'Preview a CSV header' } },
  '/api/v1/import/csv': { post: { summary: 'Import entries from CSV' } },
  '/api/v1/openapi.json': { get: { summary: 'OpenAPI document' } },
}

export function openApiDocument(): Record<string, unknown> {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Bookmark-Page',
      version: '2.0.0',
    },
    paths: documentedPaths(),
    security: [{ sessionCookie: [] }, { bearerToken: [] }],
    components: {
      securitySchemes: {
        sessionCookie: { type: 'apiKey', in: 'cookie', name: 'nuxt-session' },
        bearerToken: {
          type: 'http',
          scheme: 'bearer',
          description: 'API token with read, write or admin scope. The user role also applies.',
        },
      },
      schemas: {
        Login: jsonSchema(loginSchema),
        EntryWrite: jsonSchema(entryWriteSchema),
        EntryPatch: jsonSchema(entryPatchSchema),
        RequestSpec: jsonSchema(requestSpecSchema),
        UserWrite: jsonSchema(userWriteSchema),
        TokenWrite: jsonSchema(tokenWriteSchema),
        NamespaceWrite: jsonSchema(namespaceWriteSchema),
        FieldDefinition: jsonSchema(fieldDefinitionSchema),
        FilterWrite: jsonSchema(filterWriteSchema),
        FilterPatch: jsonSchema(filterPatchSchema),
        UserPatch: jsonSchema(userPatchSchema),
        LogoWrite: jsonSchema(logoWriteSchema),
        ScopeWrite: jsonSchema(scopeWriteSchema),
        SettingsPatch: jsonSchema(settingsPatchSchema),
        SyncBody: jsonSchema(syncBodySchema),
      },
    },
  }
}

const requestSchemas: Record<string, z.ZodType> = {
  'POST /api/v1/auth/login': loginSchema,
  'POST /api/v1/entries': entryWriteSchema,
  'PATCH /api/v1/entries/{id}': entryPatchSchema,
  'POST /api/v1/entries/{id}/actions/{name}/execute': actionExecuteSchema,
  'POST /api/v1/action-templates': actionTemplateSchema,
  'POST /api/v1/namespaces': namespaceWriteSchema,
  'PATCH /api/v1/namespaces/{id}': namespaceWriteSchema.partial(),
  'POST /api/v1/tags': tagWriteSchema,
  'PATCH /api/v1/tags/{id}': tagPatchSchema,
  'POST /api/v1/filters': filterWriteSchema,
  'PATCH /api/v1/filters/{id}': filterPatchSchema,
  'POST /api/v1/fields': fieldDefinitionSchema,
  'PATCH /api/v1/fields/{id}': fieldDefinitionSchema.partial(),
  'POST /api/v1/icons': iconWriteSchema,
  'POST /api/v1/users': userWriteSchema,
  'PATCH /api/v1/users/{id}': userPatchSchema,
  'POST /api/v1/tokens': tokenWriteSchema,
  'POST /api/v1/scopes': scopeWriteSchema,
  'PATCH /api/v1/scopes/{id}': scopeWriteSchema.partial(),
  'PUT /api/v1/scopes/{scope}/entries/{externalKey}': syncEntrySchema.omit({ externalKey: true }),
  'POST /api/v1/scopes/{scope}/sync': syncBodySchema,
  'POST /api/v1/checks/lease': checkLeaseSchema,
  'POST /api/v1/checks/{id}/report': checkReportSchema,
  'PATCH /api/v1/preferences': preferencesPatchSchema,
  'PATCH /api/v1/settings': settingsPatchSchema,
  'POST /api/v1/settings/logo': logoWriteSchema,
  'POST /api/v1/settings/favicon': faviconWriteSchema,
  'POST /api/v1/backup': backupRequestSchema,
  'POST /api/v1/restore': restoreRequestSchema,
  'POST /api/v1/import/csv/preview': csvPreviewSchema,
  'POST /api/v1/import/csv': csvImportSchema,
}

function documentedPaths() {
  const error = jsonSchema(
    z.object({ error: z.object({ code: z.string(), message: z.string() }).passthrough() }),
  )
  const output: Record<string, Record<string, unknown>> = {}
  for (const [path, methods] of Object.entries(paths)) {
    const operations: Record<string, unknown> = {}
    output[path] = operations
    for (const [method, operation] of Object.entries(methods)) {
      const parameters: Array<Record<string, unknown>> = [...path.matchAll(/\{([^}]+)\}/g)].map(
        (match) => ({
          name: match[1],
          in: 'path',
          required: true,
          schema: { type: 'string', minLength: 1 },
        }),
      )
      if (method === 'get' && ['/api/v1/entries', '/api/v1/icons'].includes(path))
        parameters.push({
          name: 'q',
          in: 'query',
          schema: { type: 'string' },
          description: path.endsWith('entries') ? 'Boolean entry query' : 'Icon name search',
        })
      const request = requestSchemas[`${method.toUpperCase()} ${path}`]
      const created =
        method === 'post' &&
        [
          '/api/v1/entries',
          '/api/v1/filters',
          '/api/v1/fields',
          '/api/v1/namespaces',
          '/api/v1/tags',
          '/api/v1/icons',
          '/api/v1/users',
          '/api/v1/tokens',
          '/api/v1/scopes',
          '/api/v1/action-templates',
        ].includes(path)
      const publicRead =
        method === 'get' &&
        ![
          '/api/v1/users',
          '/api/v1/tokens',
          '/api/v1/scopes',
          '/api/v1/icons',
          '/api/v1/audit',
          '/api/v1/action-templates',
          '/api/v1/auth/status',
        ].includes(path)
      const response = responseSchema(path, method)
      const success = path.includes('/oidc/')
        ? {
            '302': {
              description: 'OIDC redirect',
              headers: { Location: { schema: { type: 'string' } } },
            },
          }
        : {
            [created ? '201' : '200']: {
              description: operation.summary,
              content: {
                [path === '/api/v1/events'
                  ? 'text/event-stream'
                  : ['/api/v1/logo', '/api/v1/favicon'].includes(path)
                    ? 'image/*'
                    : 'application/json']: { schema: response },
              },
            },
          }
      operations[method] = {
        ...operation,
        parameters,
        security:
          publicRead || path === '/api/v1/auth/login'
            ? [{}, { sessionCookie: [] }, { bearerToken: [] }]
            : [{ sessionCookie: [] }, { bearerToken: [] }],
        ...(request
          ? {
              requestBody: {
                required: true,
                content: { 'application/json': { schema: jsonSchema(request) } },
              },
            }
          : {}),
        responses: {
          ...success,
          ...Object.fromEntries(
            ['400', '401', '403', '404', '409', '429', '500'].map((status) => [
              status,
              {
                description:
                  'Validation, authentication, authorization, conflict, rate limit or server error',
                content: { 'application/json': { schema: error } },
              },
            ]),
          ),
        },
      }
    }
  }
  return output
}

const idSchema = z.string()
const textOrNull = z.string().nullable()
const roleSchema = z.enum(['anonymous', 'viewer', 'editor', 'admin'])
const tagResponseSchema = z.object({
  id: idSchema.optional(),
  namespace: textOrNull,
  value: z.string(),
  label: z.string(),
  displayLabel: textOrNull,
})
const entryResponseSchema = z.object({
  id: idSchema,
  name: z.string(),
  description: z.string(),
  host: textOrNull,
  iconRef: textOrNull,
  iconUrl: textOrNull,
  sort: z.number(),
  source: textOrNull,
  scope: textOrNull,
  externalKey: textOrNull,
  editMode: z.enum(['locked', 'field_ownership', 'free']).nullable(),
  managedFields: z.array(z.string()),
  tags: z.array(tagResponseSchema),
  links: z.array(
    linkInputSchema.extend({
      id: idSchema,
      url: textOrNull,
      urlError: textOrNull,
      iconUrl: textOrNull,
      requiresReveal: z.boolean(),
    }),
  ),
  fields: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      type: z.enum(['text', 'url', 'number', 'secret']),
      value: textOrNull,
      masked: z.boolean(),
    }),
  ),
  checks: z.array(
    checkInputSchema.extend({
      id: idSchema,
      linkId: textOrNull,
      state: z.enum(['up', 'down', 'unknown']).nullable(),
      latencyMs: z.number().nullable(),
      statusMessage: z.string(),
      checkedAt: textOrNull,
      reportedBy: textOrNull,
    }),
  ),
  actions: z.array(actionInputSchema.extend({ id: idSchema })),
  createdAt: z.string(),
  updatedAt: z.string(),
  createdBy: textOrNull,
  updatedBy: textOrNull,
})
const userResponseSchema = userWriteSchema
  .omit({ password: true })
  .extend({ id: idSchema, email: textOrNull, authSource: z.enum(['local', 'oidc', 'header']) })
const tokenResponseSchema = tokenWriteSchema.extend({
  id: idSchema,
  userId: idSchema,
  expiresAt: textOrNull,
  lastUsedAt: textOrNull,
})
const resourceSchemas: Record<string, z.ZodType> = {
  '/api/v1/entries': entryResponseSchema,
  '/api/v1/filters': filterWriteSchema
    .omit({ global: true })
    .extend({ id: idSchema, ownerUserId: textOrNull, count: z.number().optional() }),
  '/api/v1/fields': fieldDefinitionSchema.extend({ id: idSchema }),
  '/api/v1/namespaces': namespaceWriteSchema.extend({ id: idSchema }),
  '/api/v1/tags': tagResponseSchema,
  '/api/v1/users': userResponseSchema,
  '/api/v1/tokens': tokenResponseSchema,
  '/api/v1/scopes': scopeWriteSchema.extend({ id: idSchema }),
  '/api/v1/action-templates': actionTemplateSchema.extend({ id: idSchema }),
}

function responseSchema(path: string, method: string): Record<string, unknown> {
  if (path === '/api/v1/events' || ['/api/v1/logo', '/api/v1/favicon'].includes(path))
    return { type: 'string', format: 'binary' }
  if (path.endsWith('/reveal'))
    return jsonSchema(
      path.includes('/links/')
        ? z.object({ url: z.string() })
        : z.object({ key: z.string(), value: z.string() }),
    )
  if (method === 'delete' || path.endsWith('/logout') || path.endsWith('/report'))
    return jsonSchema(z.object({ ok: z.literal(true) }))
  if (path === '/api/v1/restore') return jsonSchema(restorePreviewSchema)
  if (path === '/api/v1/import/csv') return jsonSchema(csvImportResultSchema)
  if (path === '/api/v1/backup')
    return jsonSchema(
      z.object({ filename: z.string(), archive: z.string().describe('Base64 ZIP archive') }),
    )
  if (path.endsWith('/execute'))
    return jsonSchema(
      z.object({
        ok: z.boolean(),
        status: z.number(),
        latencyMs: z.number(),
        message: z.string(),
        body: z.string().max(4096),
      }),
    )
  if (path === '/api/v1/tokens' && method === 'post')
    return jsonSchema(tokenResponseSchema.extend({ token: z.string() }))
  if (path === '/api/v1/icons')
    return jsonSchema(
      method === 'get'
        ? z.object({
            icons: z.array(
              z.object({ ref: z.string(), name: z.string(), kind: z.string(), url: z.string() }),
            ),
          })
        : z.object({ id: idSchema, name: z.string(), kind: z.string(), mediaType: textOrNull }),
    )
  if (path.endsWith('/actions'))
    return jsonSchema(
      z.object({
        actions: z.array(
          z.object({
            source: z.enum(['entry', 'template']),
            name: z.string(),
            icon: textOrNull,
            confirm: z.boolean(),
            minRole: roleSchema,
            method: z.string(),
            inputs: actionInputSchema.shape.inputs,
          }),
        ),
      }),
    )
  if (
    (path === '/api/v1/entries' && method === 'post') ||
    (path === '/api/v1/entries/{id}' && method === 'patch')
  )
    return jsonSchema(
      z.object({
        entry: entryResponseSchema,
        warnings: z.array(
          z.object({ kind: z.string(), entryId: z.string(), message: z.string() }).partial(),
        ),
      }),
    )
  for (const [collection, schema] of Object.entries(resourceSchemas)) {
    if (path === collection) {
      if (method !== 'get') return jsonSchema(schema)
      const key = collection.split('/').at(-1)!.replace('action-templates', 'templates')
      return jsonSchema(
        z.object({
          [key]: z.array(schema),
          ...(key === 'filters' ? { allCount: z.number() } : {}),
        }),
      )
    }
    if (path === collection + '/{id}') return jsonSchema(schema)
  }
  if (path.endsWith('/sync'))
    return jsonSchema(
      z.object(
        Object.fromEntries(
          ['created', 'updated', 'deleted', 'unchanged'].map((key) => [
            key,
            z.array(z.object({ externalKey: z.string(), name: z.string() })),
          ]),
        ),
      ),
    )
  if (path.endsWith('/history'))
    return jsonSchema(
      z.object({
        history: z.array(
          z.object({
            id: idSchema,
            action: z.string(),
            actorLabel: z.string(),
            actorType: z.string(),
            createdAt: z.string(),
            diff: z.record(z.string(), z.unknown()),
            restorable: z.boolean(),
          }),
        ),
      }),
    )
  if (path === '/api/v1/entries/{id}/favicon' && method === 'post')
    return jsonSchema(z.object({ queued: z.number() }))
  if (path.includes('/history/') && path.endsWith('/restore'))
    return jsonSchema(entryResponseSchema)
  if (path === '/api/v1/auth/login')
    return jsonSchema(
      z.object({ user: z.object({ id: idSchema, username: z.string(), role: roleSchema }) }),
    )
  if (path === '/api/v1/auth/session')
    return jsonSchema(
      z.object({
        actor: z.object({
          role: roleSchema,
          label: z.string(),
          kind: z.string(),
          userId: textOrNull,
        }),
      }),
    )
  if (path === '/api/v1/auth/options')
    return jsonSchema(z.object({ localLoginEnabled: z.boolean(), oidcEnabled: z.boolean() }))
  if (path === '/api/v1/auth/status')
    return jsonSchema(
      z.object({
        localLoginEnabled: z.boolean(),
        oidcEnabled: z.boolean(),
        oidcDiscoveryUrl: textOrNull,
        oidcRoleClaim: z.string(),
        trustedHeaderEnabled: z.boolean(),
        trustedProxyCount: z.number(),
        userHeader: z.string(),
        emailHeader: textOrNull,
        groupsHeader: textOrNull,
      }),
    )
  if (path.includes('/oidc/'))
    return { type: 'string', description: 'Redirect response; see Location header.' }
  if (path === '/api/v1/settings' || path.startsWith('/api/v1/settings/'))
    return jsonSchema(
      settingsPatchSchema.extend({ hasLogo: z.boolean(), hasTabFavicon: z.boolean() }),
    )
  if (path === '/api/v1/preferences') return jsonSchema(preferencesPatchSchema)
  if (path === '/api/v1/import/csv/preview')
    return jsonSchema(
      z.object({ headers: z.array(z.string()), rows: z.array(z.array(z.string())) }),
    )
  if (path === '/api/v1/checks/lease')
    return jsonSchema(
      z.object({
        checks: z.array(
          z.object({
            id: idSchema,
            leaseId: idSchema,
            name: z.string(),
            kind: z.enum(['icmp', 'tcp', 'http']),
            url: textOrNull,
            timeoutMs: z.number(),
            note: textOrNull,
          }),
        ),
      }),
    )
  if (path === '/api/v1/audit')
    return jsonSchema(
      z.array(
        z.object({
          id: idSchema,
          actorId: textOrNull,
          actorType: z.string(),
          actorLabel: z.string(),
          action: z.string(),
          targetType: z.string(),
          targetId: textOrNull,
          diff: z.record(z.string(), z.unknown()),
          createdAt: z.string(),
        }),
      ),
    )
  if (path.includes('/scopes/') && method === 'put')
    return jsonSchema(
      z.object({ status: z.enum(['created', 'updated', 'unchanged']), externalKey: z.string() }),
    )
  if (path === '/api/v1/openapi.json')
    return {
      type: 'object',
      description: 'OpenAPI 3.1 document',
      required: ['openapi', 'info', 'paths'],
      properties: {
        openapi: { type: 'string' },
        info: { type: 'object' },
        paths: { type: 'object' },
      },
      additionalProperties: true,
    }
  throw new Error(`Missing OpenAPI response contract for ${method} ${path}`)
}

export function openApiHtml(): string {
  const rows = Object.entries(paths).flatMap(([path, methods]) =>
    Object.entries(methods).map(
      ([method, operation]) =>
        `<tr><td>${escapeHtml(method.toUpperCase())}</td><td><code>${escapeHtml(path)}</code></td><td>${escapeHtml(operation.summary)}</td></tr>`,
    ),
  )
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Bookmark-Page API</title>
  <style>
    body { font-family: sans-serif; margin: 2rem; line-height: 1.4; }
    table { border-collapse: collapse; width: 100%; }
    td, th { border-bottom: 1px solid #ccc; text-align: left; padding: 0.4rem; }
    code { font-family: ui-monospace, monospace; }
  </style>
</head>
<body>
  <h1>Bookmark-Page API</h1>
  <p>Machine-readable document: <a href="/api/v1/openapi.json">/api/v1/openapi.json</a></p>
  <table>
    <thead><tr><th>Method</th><th>Path</th><th>Summary</th></tr></thead>
    <tbody>${rows.join('')}</tbody>
  </table>
</body>
</html>`
}

function jsonSchema(schema: z.ZodType): Record<string, unknown> {
  return z.toJSONSchema(schema) as Record<string, unknown>
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}
