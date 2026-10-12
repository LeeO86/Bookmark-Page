import { z } from 'zod'
import {
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
  '/api/v1/namespaces': {
    get: { summary: 'List tag namespaces' },
    post: { summary: 'Create a tag namespace' },
  },
  '/api/v1/namespaces/{id}': {
    patch: { summary: 'Update a tag namespace' },
    delete: { summary: 'Delete a tag namespace' },
  },
  '/api/v1/tags': { get: { summary: 'List tags' }, post: { summary: 'Create a tag' } },
  '/api/v1/tags/{id}': { delete: { summary: 'Delete a tag' } },
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
    post: { summary: 'Upload a PNG or WebP logo' },
    delete: { summary: 'Remove the logo' },
  },
  '/api/v1/audit': { get: { summary: 'Read the audit log' } },
  '/api/v1/openapi.json': { get: { summary: 'OpenAPI document' } },
}

export function openApiDocument(): Record<string, unknown> {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Bookmark-Page',
      version: '2.0.0',
    },
    paths,
    components: {
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
