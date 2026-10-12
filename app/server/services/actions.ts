import { and, eq, isNull } from 'drizzle-orm'
import type { ActionPrompt, RequestSpec } from '../../shared/contracts'
import { parseQuery } from '../../shared/query'
import { roleAtLeast, type Role } from '../../shared/roles'
import type { Actor } from '../auth/permissions'
import { consumeRateLimit } from '../auth/rate-limit'
import { expectationMet } from '../checks/expect'
import { getDatabase, transaction } from '../db/client'
import { decryptSecret } from '../db/crypto'
import { newId, now } from '../db/ids'
import { compileQuery, visibilitySql } from '../db/query-sql'
import {
  actionTemplates,
  actions,
  entries,
  fieldDefinitions,
  fieldValues,
  filters,
} from '../db/schema'
import { limitedRequest } from '../http/limited'
import { badRequest, confirmAction, forbidden, notFound, tooManyRequests } from '../http/errors'
import { recordActionExecution } from '../metrics'
import { writeAudit } from './audit'
import { entryVisible } from './entries'
import { PlaceholderError, redactSecretValues, resolvePlaceholders } from './placeholders'
import { allTabPublic } from './settings'

export interface RunnableAction {
  source: 'entry' | 'template'
  name: string
  icon: string | null
  confirm: boolean
  minRole: Role
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

const bodyLimit = 4096

export function listRunnableActions(actor: Actor, entryId: string): RunnableAction[] {
  const db = getDatabase()
  if (!entryVisible(actor.role, entryId, db)) {
    throw notFound('Entry not found')
  }
  const stored = db
    .select()
    .from(actions)
    .where(eq(actions.entryId, entryId))
    .all()
    .filter((action) => roleAtLeast(actor.role, action.minRole))
    .map((action) => toRunnable('entry', action))
  const templates = db
    .select()
    .from(actionTemplates)
    .all()
    .filter((template) => roleAtLeast(actor.role, template.minRole))
    .filter((template) => templateMatches(actor.role, entryId, template.query))
    .filter((template) => !stored.some((action) => action.name === template.name))
    .map((template) => toRunnable('template', template))
  return [...stored, ...templates]
}

export async function executeNamedAction(
  actor: Actor,
  entryId: string,
  actionName: string,
  input: { confirmed: boolean; inputs: Record<string, string> },
): Promise<ActionResult> {
  const db = getDatabase()
  if (!entryVisible(actor.role, entryId, db)) {
    throw notFound('Entry not found')
  }
  const runnable = listRunnableActions(actor, entryId).find((action) => action.name === actionName)
  if (!runnable) {
    throw notFound('Action not found')
  }
  assertCanRun(actor, runnable.minRole)
  const spec = loadSpec(entryId, runnable)
  if (runnable.confirm && !input.confirmed) {
    throw confirmAction(runnable.name, spec.method)
  }
  const limit = numberEnv('ACTION_RATE_LIMIT', 30)
  const windowMs = numberEnv('ACTION_RATE_WINDOW_MS', 15 * 60 * 1000)
  if (
    !consumeRateLimit(`action:${actor.userId ?? actor.tokenId ?? actor.label}`, limit, windowMs)
  ) {
    throw tooManyRequests('Too many action executions')
  }
  const entry = db.select().from(entries).where(eq(entries.id, entryId)).get()
  if (!entry) {
    throw notFound('Entry not found')
  }
  const loaded = fieldContext(entryId)
  const provided = collectInputs(runnable.inputs, input.inputs)
  const context = {
    host: entry.host,
    name: entry.name,
    fields: loaded.values,
    inputs: provided,
  }
  let url = ''
  let status = 0
  let latencyMs = 0
  let ok: boolean
  let message: string
  let responseBody = ''
  try {
    url = resolvePlaceholders(spec.urlTemplate, context)
    const headers: Record<string, string> = {}
    for (const [header, value] of Object.entries(spec.headers)) {
      if (header.trim()) {
        headers[header] = resolvePlaceholders(value, context)
      }
    }
    const body = spec.bodyTemplate ? resolvePlaceholders(spec.bodyTemplate, context) : null
    const started = Date.now()
    const response = await limitedRequest(url, {
      method: spec.method,
      headers,
      body,
      timeoutMs: spec.timeoutMs,
      maxBytes: 65_536,
      maxRedirects: 3,
      tlsVerify: spec.tlsVerify,
    })
    latencyMs = Date.now() - started
    status = response.status
    responseBody = response.body.toString('utf8')
    const verdict = expectationMet(status, responseBody, spec.expectation)
    ok = verdict.ok
    message = verdict.message
  } catch (error) {
    ok = false
    message =
      error instanceof PlaceholderError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'Action failed'
  }
  recordActionExecution()
  const secrets = [...loaded.secrets, ...passwordInputs(runnable.inputs, provided)]
  writeAudit(actor, 'action.execute', 'action', entryId, {
    name: runnable.name,
    method: spec.method,
    url: redactSecretValues(url, secrets),
    status,
    ok,
    latencyMs,
  })
  return {
    ok,
    status,
    latencyMs,
    message,
    body: redactSecretValues(responseBody, secrets).slice(0, bodyLimit),
  }
}

function toRunnable(
  source: 'entry' | 'template',
  row: {
    name: string
    icon: string | null
    confirm: boolean
    minRole: Role
    requestSpec: Record<string, unknown>
    inputs: ActionPrompt[] | null
  },
): RunnableAction {
  const method = row.requestSpec.method
  return {
    source,
    name: row.name,
    icon: row.icon,
    confirm: row.confirm,
    minRole: row.minRole,
    method: typeof method === 'string' ? method : 'GET',
    inputs: Array.isArray(row.inputs) ? row.inputs : [],
  }
}

function loadSpec(entryId: string, runnable: RunnableAction): RequestSpec {
  const db = getDatabase()
  const row =
    runnable.source === 'entry'
      ? db
          .select()
          .from(actions)
          .where(and(eq(actions.entryId, entryId), eq(actions.name, runnable.name)))
          .get()
      : db.select().from(actionTemplates).where(eq(actionTemplates.name, runnable.name)).get()
  if (!row) {
    throw notFound('Action not found')
  }
  return row.requestSpec as unknown as RequestSpec
}

function templateMatches(role: Role, entryId: string, query: string): boolean {
  const parsed = parseQuery(query)
  if (!parsed.ok) {
    return false
  }
  const db = getDatabase()
  const where = and(
    eq(entries.id, entryId),
    visibilitySql(role, publicFilterAsts(), allTabPublic(db)),
    compileQuery(parsed.ast, role),
  )
  return db.select({ id: entries.id }).from(entries).where(where).get() !== undefined
}

function publicFilterAsts() {
  return getDatabase()
    .select()
    .from(filters)
    .where(and(eq(filters.isPublic, true), isNull(filters.ownerUserId)))
    .all()
    .flatMap((filter) => {
      const parsed = parseQuery(filter.query)
      return parsed.ok ? [parsed.ast] : []
    })
}

function fieldContext(entryId: string): { values: Record<string, string>; secrets: string[] } {
  const db = getDatabase()
  const definitions = new Map(
    db
      .select()
      .from(fieldDefinitions)
      .all()
      .map((field) => [field.id, field]),
  )
  const values: Record<string, string> = {}
  const secrets: string[] = []
  for (const value of db.select().from(fieldValues).where(eq(fieldValues.entryId, entryId)).all()) {
    const definition = definitions.get(value.fieldId)
    if (!definition) {
      continue
    }
    if (definition.type === 'secret' && value.valueSecret) {
      const plain = decryptSecret(value.valueSecret)
      values[definition.key] = plain
      secrets.push(plain)
    } else if (value.valueText != null) {
      values[definition.key] = value.valueText
    }
  }
  return { values, secrets }
}

function collectInputs(
  prompts: ActionPrompt[],
  provided: Record<string, string>,
): Record<string, string> {
  const values: Record<string, string> = {}
  for (const prompt of prompts) {
    const raw = provided[prompt.name]
    const value = raw === undefined || raw === '' ? (prompt.defaultValue ?? '') : raw
    if (prompt.required && value === '') {
      throw badRequest(`Input ${prompt.label} is required`)
    }
    if (prompt.type === 'number' && value !== '' && !Number.isFinite(Number(value))) {
      throw badRequest(`Input ${prompt.label} must be a number`)
    }
    values[prompt.name] = value
  }
  return values
}

function passwordInputs(prompts: ActionPrompt[], values: Record<string, string>): string[] {
  return prompts
    .filter((prompt) => prompt.type === 'password')
    .map((prompt) => values[prompt.name] ?? '')
    .filter((value) => value.length > 0)
}

function assertCanRun(actor: Actor, minRole: Role): void {
  if (!roleAtLeast(actor.role, minRole)) {
    throw forbidden()
  }
  if (!actor.tokenId) {
    return
  }
  const allowed = minRole === 'admin' ? ['admin'] : ['write', 'admin']
  if (!actor.tokenScopes.some((scope) => allowed.includes(scope))) {
    throw forbidden('Token scope does not allow this request')
  }
}

function numberEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) {
    return fallback
  }
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : fallback
}

export function listActionTemplates() {
  return getDatabase().select().from(actionTemplates).all().map(presentTemplate)
}

export function createActionTemplate(
  actor: Actor,
  input: {
    name: string
    icon?: string | null
    query: string
    requestSpec: RequestSpec
    inputs: ActionPrompt[]
    confirm?: boolean
    minRole: Role
  },
) {
  const parsed = parseQuery(input.query)
  if (!parsed.ok) {
    throw badRequest(parsed.message, 'invalid_query')
  }
  return transaction((db) => {
    if (db.select().from(actionTemplates).where(eq(actionTemplates.name, input.name)).get()) {
      throw badRequest('An action template with this name already exists')
    }
    const timestamp = now()
    const id = newId()
    const method = input.requestSpec.method.toUpperCase()
    db.insert(actionTemplates)
      .values({
        id,
        name: input.name,
        icon: input.icon ?? null,
        query: input.query,
        requestSpec: { ...input.requestSpec, method },
        inputs: input.inputs,
        confirm: input.confirm ?? method !== 'GET',
        minRole: input.minRole,
        createdAt: timestamp,
        updatedAt: timestamp,
        createdBy: actor.userId,
        updatedBy: actor.userId,
      })
      .run()
    writeAudit(actor, 'action_template.create', 'action_template', id, { name: input.name }, db)
    const created = db.select().from(actionTemplates).where(eq(actionTemplates.id, id)).get()
    if (!created) {
      throw notFound('Action template not found')
    }
    return presentTemplate(created)
  })
}

export function deleteActionTemplate(actor: Actor, id: string): void {
  transaction((db) => {
    const current = db.select().from(actionTemplates).where(eq(actionTemplates.id, id)).get()
    if (!current) {
      throw notFound('Action template not found')
    }
    db.delete(actionTemplates).where(eq(actionTemplates.id, id)).run()
    writeAudit(actor, 'action_template.delete', 'action_template', id, { name: current.name }, db)
  })
}

function presentTemplate(row: typeof actionTemplates.$inferSelect) {
  const spec = row.requestSpec as Partial<RequestSpec>
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    query: row.query,
    method: typeof spec.method === 'string' ? spec.method : 'GET',
    urlTemplate: typeof spec.urlTemplate === 'string' ? spec.urlTemplate : '',
    confirm: row.confirm,
    minRole: row.minRole,
    inputs: row.inputs ?? [],
  }
}
