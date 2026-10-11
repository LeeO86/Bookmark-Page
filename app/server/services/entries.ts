import { and, asc, eq, inArray, isNull, ne, sql } from 'drizzle-orm'
import {
  entryPatchSchema,
  type ActionInput,
  type CheckInput,
  type EditMode,
  type EntryPatch,
  type EntryWrite,
  type FieldValueInput,
  type LinkInput,
  type SyncEntry,
} from '../../shared/contracts'
import { parseQuery } from '../../shared/query'
import { roleAtLeast, type Role } from '../../shared/roles'
import type { Actor } from '../auth/permissions'
import { getDatabase, transaction, type Db } from '../db/client'
import { decryptSecret, encryptSecret } from '../db/crypto'
import { newId, now } from '../db/ids'
import { compileQuery, visibilitySql } from '../db/query-sql'
import {
  actions,
  ansibleScopes,
  auditLog,
  checks,
  checkStatus,
  entries,
  entryTags,
  fieldDefinitions,
  fieldValues,
  filters,
  links,
  tags,
  tagNamespaces,
} from '../db/schema'
import { badRequest, confirmDuplicate, forbidden, notFound } from '../http/errors'
import { publishLive } from './live'
import { writeAudit } from './audit'
import { assertKnownPlaceholders, resolveLinkUrl } from './placeholders'
import { allTabPublic } from './settings'

const namespaceColour = '#64748b'

interface TagRow {
  id: string
  namespaceName: string
  value: string
}

interface LoadedLink {
  id: string
  label: string
  urlTemplate: string
  type: LinkInput['type']
  isPrimary: boolean
  sort: number
  iconRef: string | null
}

interface LoadedField {
  key: string
  label: string
  type: 'text' | 'url' | 'number' | 'secret'
  minRoleToView: Role
  valueText: string | null
  valueSecret: string | null
}

interface LoadedCheck {
  id: string
  name: string
  kind: CheckInput['kind']
  executor: CheckInput['executor']
  intervalSeconds: number
  timeoutMs: number
  tlsVerify: boolean
  host: string | null
  port: number | null
  linkId: string | null
  requestSpec: Record<string, unknown> | null
  state: 'up' | 'down' | 'unknown' | null
  latencyMs: number | null
  statusMessage: string
  checkedAt: string | null
  reportedBy: string | null
}

interface LoadedAction {
  id: string
  name: string
  icon: string | null
  requestSpec: Record<string, unknown>
  confirm: boolean
  minRole: Role
}

interface LoadedEntry {
  id: string
  name: string
  description: string
  host: string | null
  iconRef: string | null
  sort: number
  source: string | null
  externalKey: string | null
  managedFields: string[]
  editMode: EditMode | null
  createdAt: Date
  updatedAt: Date
  createdBy: string | null
  updatedBy: string | null
  tags: TagRow[]
  links: LoadedLink[]
  fields: LoadedField[]
  checks: LoadedCheck[]
  actions: LoadedAction[]
}

export interface EntryWarning {
  code: 'duplicate_name' | 'duplicate_host'
  message: string
}

export function listEntries(actor: Actor, rawQuery: string) {
  const parsed = parseQuery(rawQuery)
  if (!parsed.ok) {
    throw badRequest(parsed.message, 'invalid_query')
  }
  const db = getDatabase()
  const where = sql`${visibilitySql(actor.role, publicFilters(db), allTabPublic(db))} and ${compileQuery(parsed.ast, actor.role)}`
  const rows = db
    .select()
    .from(entries)
    .where(where)
    .orderBy(asc(entries.sort), asc(entries.name))
    .all()
  return { entries: hydrate(db, rows).map((entry) => present(entry, actor.role)) }
}

export function getEntry(actor: Actor, id: string) {
  const db = getDatabase()
  assertVisible(db, actor.role, id)
  const row = db.select().from(entries).where(eq(entries.id, id)).get()
  if (!row) {
    throw notFound('Entry not found')
  }
  const [entry] = hydrate(db, [row])
  if (!entry) {
    throw notFound('Entry not found')
  }
  return present(entry, actor.role)
}

export function createEntry(actor: Actor, input: EntryWrite) {
  const existing = duplicateWarningsFor(getDatabase(), input.name, emptyToNull(input.host), null)
  if (existing.length > 0 && !input.confirmDuplicates) {
    throw confirmDuplicate(existing)
  }
  const result = transaction((db) => {
    const timestamp = now()
    const id = newId()
    validateChildren(db, input.links, input.fields, input.checks, input.actions)
    db.insert(entries)
      .values({
        id,
        name: input.name,
        description: input.description,
        host: emptyToNull(input.host),
        iconRef: emptyToNull(input.iconRef),
        sort: input.sort,
        source: null,
        externalKey: null,
        managedFields: [],
        createdAt: timestamp,
        updatedAt: timestamp,
        createdBy: actor.userId,
        updatedBy: actor.userId,
      })
      .run()
    replaceChildren(db, id, input, actor.userId, timestamp)
    const created = mustLoad(db, id)
    writeAudit(
      actor,
      'entry.create',
      'entry',
      id,
      { name: input.name, snapshot: entrySnapshot(created) },
      db,
    )
    return { entry: present(created, actor.role), warnings: existing }
  })
  publishLive({ type: 'entries' })
  return result
}

export function updateEntry(actor: Actor, id: string, patch: EntryPatch) {
  const currentPreview = mustLoad(getDatabase(), id)
  const nextName = patch.name ?? currentPreview.name
  const nextHost = patch.host !== undefined ? emptyToNull(patch.host) : currentPreview.host
  const warnings = duplicateWarningsFor(getDatabase(), nextName, nextHost, id)
  if (warnings.length > 0 && patch.confirmDuplicates !== true) {
    throw confirmDuplicate(warnings)
  }
  const result = transaction((db) => {
    const current = mustLoad(db, id)
    const effective = withKeptSecrets(current, patch)
    const paths = changedPaths(current, effective)
    assertMutable(current, paths, false)
    const timestamp = now()
    db.update(entries)
      .set({
        name: effective.name ?? current.name,
        description: effective.description ?? current.description,
        host: effective.host !== undefined ? emptyToNull(effective.host) : current.host,
        iconRef: effective.iconRef !== undefined ? emptyToNull(effective.iconRef) : current.iconRef,
        sort: effective.sort ?? current.sort,
        updatedAt: timestamp,
        updatedBy: actor.userId,
      })
      .where(eq(entries.id, id))
      .run()
    if (
      effective.links ||
      effective.tags ||
      effective.fields ||
      effective.checks ||
      effective.actions
    ) {
      validateChildren(
        db,
        effective.links ?? current.links.map(linkToInput),
        effective.fields ??
          current.fields.map((field) => ({
            key: field.key,
            value:
              field.type === 'secret'
                ? decryptSecret(field.valueSecret ?? '')
                : (field.valueText ?? ''),
          })),
        effective.checks ?? checksToInput(current),
        effective.actions ?? current.actions.map(actionToInput),
      )
    }
    if (effective.tags) {
      replaceTags(db, id, effective.tags, timestamp)
    }
    if (effective.links) {
      replaceLinks(db, id, effective.links, actor.userId, timestamp)
    }
    if (effective.fields) {
      replaceFields(db, id, effective.fields, actor.userId, timestamp)
    }
    if (effective.checks || effective.links) {
      const linkRows = effective.links ? effective.links : current.links.map(linkToInput)
      const checkRows = effective.checks ?? checksToInput(current)
      replaceChecks(db, id, checkRows, linkRows, actor.userId, timestamp)
    }
    if (effective.actions) {
      replaceActions(db, id, effective.actions, actor.userId, timestamp)
    }
    const updated = mustLoad(db, id)
    writeAudit(actor, 'entry.update', 'entry', id, { paths, snapshot: entrySnapshot(updated) }, db)
    return { entry: present(updated, actor.role), warnings }
  })
  publishLive({ type: 'entries' })
  return result
}

export function deleteEntry(actor: Actor, id: string): void {
  transaction((db) => {
    const current = mustLoad(db, id)
    assertMutable(current, ['entry'], true)
    db.delete(entries).where(eq(entries.id, id)).run()
    writeAudit(
      actor,
      'entry.delete',
      'entry',
      id,
      { name: current.name, snapshot: entrySnapshot(current) },
      db,
    )
  })
  publishLive({ type: 'entries' })
}

export function revealField(actor: Actor, entryId: string, key: string) {
  const db = getDatabase()
  assertVisible(db, actor.role, entryId)
  const entry = mustLoad(db, entryId)
  const field = entry.fields.find((item) => item.key === key)
  if (!field || !roleAtLeast(actor.role, field.minRoleToView)) {
    throw notFound('Field not found')
  }
  if (field.type !== 'secret' || !field.valueSecret) {
    throw badRequest('Field is not a secret')
  }
  writeAudit(actor, 'field.reveal', 'field', entryId, { key }, db)
  return { key, value: decryptSecret(field.valueSecret) }
}

export function listEntryHistory(actor: Actor, id: string) {
  const db = getDatabase()
  assertVisible(db, actor.role, id)
  return db
    .select()
    .from(auditLog)
    .all()
    .filter(
      (row) => row.targetId === id && (row.targetType === 'entry' || row.targetType === 'field'),
    )
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .map((row) => ({
      id: row.id,
      action: row.action,
      actorLabel: row.actorLabel,
      actorType: row.actorType,
      createdAt: row.createdAt.toISOString(),
      diff: row.diff,
      restorable: hasSnapshot(row.diff),
    }))
}

export function restoreEntry(actor: Actor, entryId: string, auditId: string) {
  const db = getDatabase()
  assertVisible(db, actor.role, entryId)
  const row = db.select().from(auditLog).where(eq(auditLog.id, auditId)).get()
  if (!row || row.targetId !== entryId || row.targetType !== 'entry' || !hasSnapshot(row.diff)) {
    throw badRequest('This version cannot be restored')
  }
  const snapshot = row.diff.snapshot as ReturnType<typeof entrySnapshot>
  const patch = entryPatchSchema.parse({
    name: snapshot.name,
    description: snapshot.description,
    host: snapshot.host,
    iconRef: snapshot.iconRef,
    sort: snapshot.sort,
    tags: snapshot.tags,
    links: snapshot.links,
    checks: snapshot.checks,
    actions: snapshot.actions,
    confirmDuplicates: true,
  })
  updateEntry(actor, entryId, patch)
  restorePlainFields(actor, entryId, snapshot.fields)
  return getEntry(actor, entryId)
}

function restorePlainFields(
  actor: Actor,
  entryId: string,
  fields: Array<{ key: string; value: string }>,
): void {
  const current = mustLoad(getDatabase(), entryId)
  const secrets = current.fields
    .filter((field) => field.type === 'secret')
    .map((field) => ({
      key: field.key,
      value: field.valueSecret ? decryptSecret(field.valueSecret) : '',
    }))
  updateEntry(actor, entryId, {
    fields: [...fields, ...secrets],
    confirmDuplicates: true,
  })
}

function hasSnapshot(diff: unknown): diff is { snapshot: ReturnType<typeof entrySnapshot> } {
  return Boolean(diff && typeof diff === 'object' && 'snapshot' in diff && diff.snapshot)
}

export function upsertManagedEntry(
  scope: string,
  input: SyncEntry,
  actor: Actor,
): 'created' | 'updated' | 'unchanged' {
  const db = getDatabase()
  const source = `ansible:${scope}`
  const existing = db
    .select()
    .from(entries)
    .where(and(eq(entries.source, source), eq(entries.externalKey, input.externalKey)))
    .get()
  if (!existing) {
    insertManaged(db, scope, input, actor)
    return 'created'
  }
  const before = mustLoad(db, existing.id)
  mergeManaged(db, before, input, actor)
  const after = mustLoad(db, existing.id)
  return sameEntry(before, after) ? 'unchanged' : 'updated'
}

export function deleteManagedEntries(
  scope: string,
  keep: ReadonlySet<string>,
  actor: Actor,
): Array<{ externalKey: string; name: string }> {
  const db = getDatabase()
  const source = `ansible:${scope}`
  const rows = db.select().from(entries).where(eq(entries.source, source)).all()
  const deleted: Array<{ externalKey: string; name: string }> = []
  for (const row of rows) {
    if (row.externalKey && keep.has(row.externalKey)) {
      continue
    }
    db.delete(entries).where(eq(entries.id, row.id)).run()
    writeAudit(actor, 'entry.delete', 'entry', row.id, { name: row.name, scope }, db)
    deleted.push({ externalKey: row.externalKey ?? row.id, name: row.name })
  }
  return deleted
}

export function entryVisible(role: Role, id: string, db: Db = getDatabase()): boolean {
  const where = sql`${entries.id} = ${id} and ${visibilitySql(role, publicFilters(db), allTabPublic(db))}`
  return Boolean(db.select({ id: entries.id }).from(entries).where(where).get())
}

function assertVisible(db: Db, role: Role, id: string): void {
  if (!entryVisible(role, id, db)) {
    throw notFound('Entry not found')
  }
}

function publicFilters(db: Db) {
  return db
    .select()
    .from(filters)
    .where(and(eq(filters.isPublic, true), isNull(filters.ownerUserId)))
    .all()
    .flatMap((filter) => {
      const parsed = parseQuery(filter.query)
      return parsed.ok ? [parsed.ast] : []
    })
}

function insertManaged(db: Db, scope: string, input: SyncEntry, actor: Actor): void {
  const timestamp = now()
  const id = newId()
  const paths = managedPaths(input)
  validateChildren(
    db,
    input.links ?? [],
    input.fields ?? [],
    input.checks ?? [],
    input.actions ?? [],
  )
  db.insert(entries)
    .values({
      id,
      name: input.name,
      description: input.description ?? '',
      host: emptyToNull(input.host),
      iconRef: emptyToNull(input.iconRef),
      sort: input.sort ?? 0,
      source: `ansible:${scope}`,
      externalKey: input.externalKey,
      managedFields: paths,
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy: actor.userId,
      updatedBy: actor.userId,
    })
    .run()
  replaceChildren(
    db,
    id,
    {
      tags: input.tags ?? [],
      links: input.links ?? [],
      fields: input.fields ?? [],
      checks: input.checks ?? [],
      actions: input.actions ?? [],
    },
    actor.userId,
    timestamp,
  )
  const created = mustLoad(db, id)
  writeAudit(
    actor,
    'entry.create',
    'entry',
    id,
    { name: input.name, scope, snapshot: entrySnapshot(created) },
    db,
  )
}

function mergeManaged(db: Db, current: LoadedEntry, input: SyncEntry, actor: Actor): void {
  const timestamp = now()
  const previous = new Set(current.managedFields)
  const next = new Set(managedPaths(input))
  db.update(entries)
    .set({
      name: input.name,
      description: input.description !== undefined ? input.description : current.description,
      host: input.host !== undefined ? emptyToNull(input.host) : current.host,
      iconRef: input.iconRef !== undefined ? emptyToNull(input.iconRef) : current.iconRef,
      sort: input.sort ?? current.sort,
      managedFields: [...next],
      updatedAt: timestamp,
      updatedBy: actor.userId,
    })
    .where(eq(entries.id, current.id))
    .run()
  if (input.tags) {
    mergeTags(db, current, input.tags, previous, timestamp)
  }
  if (input.links) {
    mergeLinks(db, current, input.links, previous, actor.userId, timestamp)
  }
  if (input.fields) {
    mergeFields(db, current, input.fields, previous, actor.userId, timestamp)
  }
  if (input.checks) {
    mergeChecks(
      db,
      current,
      input.checks,
      input.links ?? current.links.map(linkToInput),
      previous,
      actor.userId,
      timestamp,
    )
  }
  if (input.actions) {
    mergeActions(db, current, input.actions, previous, actor.userId, timestamp)
  }
  const synced = mustLoad(db, current.id)
  writeAudit(
    actor,
    'entry.sync',
    'entry',
    current.id,
    { paths: [...next], snapshot: entrySnapshot(synced) },
    db,
  )
}

function changedPaths(current: LoadedEntry, patch: EntryPatch): string[] {
  const paths: string[] = []
  if (patch.name !== undefined && patch.name !== current.name) {
    paths.push('name')
  }
  if (patch.description !== undefined && patch.description !== current.description) {
    paths.push('description')
  }
  if (patch.host !== undefined && emptyToNull(patch.host) !== current.host) {
    paths.push('host')
  }
  if (patch.iconRef !== undefined && emptyToNull(patch.iconRef) !== current.iconRef) {
    paths.push('iconRef')
  }
  if (patch.sort !== undefined && patch.sort !== current.sort) {
    paths.push('sort')
  }
  if (patch.tags) {
    const currentTags = new Set(current.tags.map((tag) => formatTag(tag.namespaceName, tag.value)))
    const nextTags = new Set(
      patch.tags.map((tag) => formatTag(...(Object.values(parseTag(tag)) as [string, string]))),
    )
    for (const tag of nextTags) {
      if (!currentTags.has(tag)) {
        paths.push(`tags:${tag}`)
      }
    }
    for (const tag of currentTags) {
      if (!nextTags.has(tag)) {
        paths.push(`tags:${tag}`)
      }
    }
  }
  if (patch.links) {
    paths.push(...linkChanges(current.links, patch.links))
  }
  if (patch.fields) {
    const currentFields = new Map(current.fields.map((field) => [field.key, fieldValue(field)]))
    const nextFields = new Map(patch.fields.map((field) => [field.key, field.value]))
    for (const [key, value] of nextFields) {
      if (currentFields.get(key) !== value) {
        paths.push(`fields:${key}`)
      }
    }
    for (const key of currentFields.keys()) {
      if (!nextFields.has(key)) {
        paths.push(`fields:${key}`)
      }
    }
  }
  if (patch.checks) {
    paths.push(
      ...namedChanges(
        current.checks.map((check) => check.name),
        patch.checks.map((check) => check.name),
        'checks',
      ),
    )
  }
  if (patch.actions) {
    paths.push(
      ...namedChanges(
        current.actions.map((action) => action.name),
        patch.actions.map((action) => action.name),
        'actions',
      ),
    )
  }
  return paths
}

function assertMutable(entry: LoadedEntry, paths: string[], deleting: boolean): void {
  if (!entry.editMode) {
    return
  }
  if (deleting && entry.editMode !== 'free') {
    throw forbidden('Managed entries can only be deleted by their Ansible scope')
  }
  if (entry.editMode === 'locked' && paths.length > 0) {
    throw forbidden('This entry is locked by its Ansible scope')
  }
  if (entry.editMode === 'field_ownership') {
    const blocked = paths.filter((path) => entry.managedFields.includes(path))
    if (blocked.length > 0) {
      throw forbidden(`Managed attributes cannot be changed: ${blocked.join(', ')}`)
    }
  }
}

function replaceChildren(
  db: Db,
  entryId: string,
  input: {
    tags: string[]
    links: LinkInput[]
    fields: FieldValueInput[]
    checks: CheckInput[]
    actions: ActionInput[]
  },
  actorId: string | null,
  timestamp: Date,
): void {
  replaceTags(db, entryId, input.tags, timestamp)
  replaceLinks(db, entryId, input.links, actorId, timestamp)
  replaceFields(db, entryId, input.fields, actorId, timestamp)
  replaceChecks(db, entryId, input.checks, input.links, actorId, timestamp)
  replaceActions(db, entryId, input.actions, actorId, timestamp)
}

function replaceTags(db: Db, entryId: string, values: string[], timestamp: Date): void {
  db.delete(entryTags).where(eq(entryTags.entryId, entryId)).run()
  for (const value of values) {
    const tag = ensureTag(db, parseTag(value), timestamp)
    db.insert(entryTags)
      .values({
        entryId,
        tagId: tag.id,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run()
  }
}

function replaceLinks(
  db: Db,
  entryId: string,
  values: LinkInput[],
  actorId: string | null,
  timestamp: Date,
): void {
  db.delete(links).where(eq(links.entryId, entryId)).run()
  for (const link of values) {
    db.insert(links)
      .values({
        id: newId(),
        entryId,
        label: link.label,
        urlTemplate: link.urlTemplate,
        type: link.type,
        isPrimary: link.isPrimary,
        sort: link.sort,
        iconRef: link.iconRef,
        createdAt: timestamp,
        updatedAt: timestamp,
        createdBy: actorId,
        updatedBy: actorId,
      })
      .run()
  }
}

function replaceFields(
  db: Db,
  entryId: string,
  values: FieldValueInput[],
  actorId: string | null,
  timestamp: Date,
): void {
  db.delete(fieldValues).where(eq(fieldValues.entryId, entryId)).run()
  for (const value of values) {
    const definition = definitionByKey(db, value.key)
    const stored = storeFieldValue(definition.type, value.value)
    db.insert(fieldValues)
      .values({
        id: newId(),
        entryId,
        fieldId: definition.id,
        valueText: stored.text,
        valueSecret: stored.secret,
        createdAt: timestamp,
        updatedAt: timestamp,
        createdBy: actorId,
        updatedBy: actorId,
      })
      .run()
  }
}

function replaceChecks(
  db: Db,
  entryId: string,
  values: CheckInput[],
  linkValues: LinkInput[],
  actorId: string | null,
  timestamp: Date,
): void {
  db.delete(checks).where(eq(checks.entryId, entryId)).run()
  insertChecks(db, entryId, values, linkValues, actorId, timestamp)
}

function insertChecks(
  db: Db,
  entryId: string,
  values: CheckInput[],
  linkValues: LinkInput[],
  actorId: string | null,
  timestamp: Date,
): void {
  const linkIds = new Map(
    db
      .select()
      .from(links)
      .where(eq(links.entryId, entryId))
      .all()
      .map((link) => [link.label, link.id]),
  )
  for (const check of values) {
    if (
      check.linkLabel &&
      !linkValues.some((link) => link.label === check.linkLabel) &&
      !linkIds.has(check.linkLabel)
    ) {
      throw badRequest(`Unknown link ${check.linkLabel}`)
    }
    db.insert(checks)
      .values({
        id: newId(),
        entryId,
        linkId: check.linkLabel ? (linkIds.get(check.linkLabel) ?? null) : null,
        name: check.name,
        kind: check.kind,
        executor: check.executor,
        intervalSeconds: check.intervalSeconds,
        timeoutMs: check.timeoutMs,
        tlsVerify: check.tlsVerify,
        host: emptyToNull(check.host),
        port: check.port ?? null,
        requestSpec: check.requestSpec ? normalizeRequest(check.requestSpec) : null,
        createdAt: timestamp,
        updatedAt: timestamp,
        createdBy: actorId,
        updatedBy: actorId,
      })
      .run()
  }
}

function replaceActions(
  db: Db,
  entryId: string,
  values: ActionInput[],
  actorId: string | null,
  timestamp: Date,
): void {
  db.delete(actions).where(eq(actions.entryId, entryId)).run()
  insertActions(db, entryId, values, actorId, timestamp)
}

function insertActions(
  db: Db,
  entryId: string,
  values: ActionInput[],
  actorId: string | null,
  timestamp: Date,
): void {
  for (const action of values) {
    const requestSpec = normalizeRequest(action.requestSpec)
    db.insert(actions)
      .values({
        id: newId(),
        entryId,
        name: action.name,
        icon: action.icon ?? null,
        requestSpec,
        confirm: action.confirm ?? requestSpec.method !== 'GET',
        minRole: action.minRole,
        createdAt: timestamp,
        updatedAt: timestamp,
        createdBy: actorId,
        updatedBy: actorId,
      })
      .run()
  }
}

function mergeTags(
  db: Db,
  entry: LoadedEntry,
  values: string[],
  previous: Set<string>,
  timestamp: Date,
): void {
  const desired = new Set(values.map((value) => formatTag(...pair(parseTag(value)))))
  for (const tag of entry.tags) {
    const formatted = formatTag(tag.namespaceName, tag.value)
    if (previous.has(`tags:${formatted}`) && !desired.has(formatted)) {
      db.delete(entryTags)
        .where(and(eq(entryTags.entryId, entry.id), eq(entryTags.tagId, tag.id)))
        .run()
    }
  }
  const remaining = new Set(
    mustLoad(db, entry.id).tags.map((tag) => formatTag(tag.namespaceName, tag.value)),
  )
  for (const value of desired) {
    if (!remaining.has(value)) {
      const tag = ensureTag(db, parseTag(value), timestamp)
      db.insert(entryTags)
        .values({
          entryId: entry.id,
          tagId: tag.id,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .run()
    }
  }
}

function mergeLinks(
  db: Db,
  entry: LoadedEntry,
  values: LinkInput[],
  previous: Set<string>,
  actorId: string | null,
  timestamp: Date,
): void {
  const desired = new Map(values.map((link) => [link.label, link]))
  for (const link of entry.links) {
    if (previous.has(`links:${link.label}`) && !desired.has(link.label)) {
      db.delete(links).where(eq(links.id, link.id)).run()
    }
  }
  for (const link of values) {
    const existing = entry.links.find((item) => item.label === link.label)
    if (!existing) {
      db.insert(links)
        .values({
          id: newId(),
          entryId: entry.id,
          label: link.label,
          urlTemplate: link.urlTemplate,
          type: link.type,
          isPrimary: link.isPrimary,
          sort: link.sort,
          iconRef: link.iconRef,
          createdAt: timestamp,
          updatedAt: timestamp,
          createdBy: actorId,
          updatedBy: actorId,
        })
        .run()
    } else if (previous.has(`links:${link.label}`)) {
      db.update(links)
        .set({
          urlTemplate: link.urlTemplate,
          type: link.type,
          isPrimary: link.isPrimary,
          sort: link.sort,
          iconRef: link.iconRef,
          updatedAt: timestamp,
          updatedBy: actorId,
        })
        .where(eq(links.id, existing.id))
        .run()
    }
  }
}

function mergeFields(
  db: Db,
  entry: LoadedEntry,
  values: FieldValueInput[],
  previous: Set<string>,
  actorId: string | null,
  timestamp: Date,
): void {
  const desired = new Map(values.map((field) => [field.key, field.value]))
  for (const field of entry.fields) {
    if (previous.has(`fields:${field.key}`) && !desired.has(field.key)) {
      const definition = definitionByKey(db, field.key)
      db.delete(fieldValues)
        .where(and(eq(fieldValues.entryId, entry.id), eq(fieldValues.fieldId, definition.id)))
        .run()
    }
  }
  for (const field of values) {
    const definition = definitionByKey(db, field.key)
    const stored = storeFieldValue(definition.type, field.value)
    const existing = entry.fields.find((item) => item.key === field.key)
    if (!existing) {
      db.insert(fieldValues)
        .values({
          id: newId(),
          entryId: entry.id,
          fieldId: definition.id,
          valueText: stored.text,
          valueSecret: stored.secret,
          createdAt: timestamp,
          updatedAt: timestamp,
          createdBy: actorId,
          updatedBy: actorId,
        })
        .run()
    } else if (previous.has(`fields:${field.key}`)) {
      db.update(fieldValues)
        .set({
          valueText: stored.text,
          valueSecret: stored.secret,
          updatedAt: timestamp,
          updatedBy: actorId,
        })
        .where(and(eq(fieldValues.entryId, entry.id), eq(fieldValues.fieldId, definition.id)))
        .run()
    }
  }
}

function mergeChecks(
  db: Db,
  entry: LoadedEntry,
  values: CheckInput[],
  linkValues: LinkInput[],
  previous: Set<string>,
  actorId: string | null,
  timestamp: Date,
): void {
  for (const check of entry.checks) {
    if (previous.has(`checks:${check.name}`) && !values.some((item) => item.name === check.name)) {
      db.delete(checks).where(eq(checks.id, check.id)).run()
    }
  }
  const incoming = values.filter((check) => {
    const existing = entry.checks.find((item) => item.name === check.name)
    return !existing || previous.has(`checks:${check.name}`)
  })
  for (const check of entry.checks) {
    if (previous.has(`checks:${check.name}`) && incoming.some((item) => item.name === check.name)) {
      db.delete(checks).where(eq(checks.id, check.id)).run()
    }
  }
  insertChecks(db, entry.id, incoming, linkValues, actorId, timestamp)
}

function mergeActions(
  db: Db,
  entry: LoadedEntry,
  values: ActionInput[],
  previous: Set<string>,
  actorId: string | null,
  timestamp: Date,
): void {
  for (const action of entry.actions) {
    if (
      previous.has(`actions:${action.name}`) &&
      !values.some((item) => item.name === action.name)
    ) {
      db.delete(actions).where(eq(actions.id, action.id)).run()
    }
  }
  const incoming = values.filter((action) => {
    const existing = entry.actions.find((item) => item.name === action.name)
    return !existing || previous.has(`actions:${action.name}`)
  })
  for (const action of entry.actions) {
    if (
      previous.has(`actions:${action.name}`) &&
      incoming.some((item) => item.name === action.name)
    ) {
      db.delete(actions).where(eq(actions.id, action.id)).run()
    }
  }
  insertActions(db, entry.id, incoming, actorId, timestamp)
}

function validateChildren(
  db: Db,
  linkValues: LinkInput[],
  fieldValuesInput: FieldValueInput[],
  checkValues: CheckInput[],
  actionValues: ActionInput[],
): void {
  const labels = new Set<string>()
  for (const link of linkValues) {
    if (labels.has(link.label)) {
      throw badRequest(`Duplicate link label ${link.label}`)
    }
    labels.add(link.label)
    assertKnownPlaceholders(link.urlTemplate, false)
  }
  if (linkValues.length > 0 && linkValues.filter((link) => link.isPrimary).length !== 1) {
    throw badRequest('An entry with links needs exactly one primary link')
  }
  const keys = new Set<string>()
  for (const field of fieldValuesInput) {
    if (keys.has(field.key)) {
      throw badRequest(`Duplicate field ${field.key}`)
    }
    keys.add(field.key)
    const definition = definitionByKey(db, field.key)
    storeFieldValue(definition.type, field.value)
  }
  const checkNames = new Set<string>()
  for (const check of checkValues) {
    if (checkNames.has(check.name)) {
      throw badRequest(`Duplicate check ${check.name}`)
    }
    checkNames.add(check.name)
    if (check.kind === 'tcp' && (check.port === null || check.port === undefined)) {
      throw badRequest('TCP checks need a port')
    }
    if (check.kind === 'http') {
      if (!check.requestSpec) {
        throw badRequest('HTTP checks need a request spec')
      }
      assertRequestPlaceholders(check.requestSpec)
    }
  }
  const actionNames = new Set<string>()
  for (const action of actionValues) {
    if (actionNames.has(action.name)) {
      throw badRequest(`Duplicate action ${action.name}`)
    }
    actionNames.add(action.name)
    assertRequestPlaceholders(action.requestSpec)
  }
}

function assertRequestPlaceholders(spec: {
  urlTemplate: string
  headers: Record<string, string>
  bodyTemplate: string | null
}): void {
  assertKnownPlaceholders(spec.urlTemplate, true)
  assertKnownPlaceholders(spec.bodyTemplate ?? '', true)
  for (const value of Object.values(spec.headers)) {
    assertKnownPlaceholders(value, true)
  }
}

function normalizeRequest(spec: ActionInput['requestSpec']): Record<string, unknown> {
  return { ...spec, method: spec.method.toUpperCase() }
}

function storeFieldValue(
  type: LoadedField['type'],
  value: string,
): { text: string | null; secret: string | null } {
  if (type === 'secret') {
    if (value.length === 0) {
      throw badRequest('Secret fields cannot be empty')
    }
    return { text: null, secret: encryptSecret(value) }
  }
  if (type === 'number' && !Number.isFinite(Number(value))) {
    throw badRequest('Number fields must be finite numbers')
  }
  if (type === 'url' && value.length === 0) {
    throw badRequest('URL fields cannot be empty')
  }
  return { text: value, secret: null }
}

function definitionByKey(db: Db, key: string) {
  const definition = db.select().from(fieldDefinitions).where(eq(fieldDefinitions.key, key)).get()
  if (!definition) {
    throw badRequest(`Unknown field ${key}`)
  }
  return definition
}

function ensureTag(
  db: Db,
  parsed: { namespaceName: string; value: string },
  timestamp: Date,
): TagRow {
  if (parsed.namespaceName) {
    const namespace = db
      .select()
      .from(tagNamespaces)
      .where(eq(tagNamespaces.name, parsed.namespaceName))
      .get()
    if (!namespace) {
      db.insert(tagNamespaces)
        .values({
          id: newId(),
          name: parsed.namespaceName,
          label: parsed.namespaceName,
          colour: namespaceColour,
          sort: 0,
          showInSidebar: true,
          createdAt: timestamp,
          updatedAt: timestamp,
          createdBy: null,
          updatedBy: null,
        })
        .run()
    }
  }
  const existing = db
    .select()
    .from(tags)
    .where(and(eq(tags.namespaceName, parsed.namespaceName), eq(tags.value, parsed.value)))
    .get()
  if (existing) {
    return existing
  }
  const id = newId()
  db.insert(tags)
    .values({
      id,
      namespaceName: parsed.namespaceName,
      value: parsed.value,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .run()
  return { id, namespaceName: parsed.namespaceName, value: parsed.value }
}

function present(entry: LoadedEntry, role: Role) {
  const visibleFields = entry.fields.filter((field) => roleAtLeast(role, field.minRoleToView))
  const fieldMap: Record<string, string> = {}
  const secretFields = new Set<string>()
  for (const field of visibleFields) {
    if (field.type === 'secret') {
      secretFields.add(field.key)
    } else if (field.valueText !== null) {
      fieldMap[field.key] = field.valueText
    }
  }
  return {
    id: entry.id,
    name: entry.name,
    description: entry.description,
    host: entry.host,
    iconRef: entry.iconRef,
    sort: entry.sort,
    source: entry.source,
    scope: scopeName(entry.source),
    externalKey: entry.externalKey,
    editMode: entry.editMode,
    managedFields: entry.managedFields,
    tags: entry.tags.map((tag) => ({
      namespace: tag.namespaceName || null,
      value: tag.value,
      label: formatTag(tag.namespaceName, tag.value),
    })),
    links: entry.links.map((link) => {
      const resolved = resolveLinkUrl(
        link.urlTemplate,
        {
          host: entry.host,
          name: entry.name,
          fields: fieldMap,
        },
        secretFields,
      )
      return { ...link, url: resolved.url, urlError: resolved.error }
    }),
    fields: visibleFields.map((field) => ({
      key: field.key,
      label: field.label,
      type: field.type,
      value: field.type === 'secret' ? null : field.valueText,
      masked: field.type === 'secret',
    })),
    checks: entry.checks,
    status: entryStatus(entry.checks),
    actions: entry.actions,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
    createdBy: entry.createdBy,
    updatedBy: entry.updatedBy,
  }
}

function hydrate(db: Db, rows: Array<typeof entries.$inferSelect>): LoadedEntry[] {
  if (rows.length === 0) {
    return []
  }
  const ids = rows.map((row) => row.id)
  const scopeModes = new Map(
    db
      .select()
      .from(ansibleScopes)
      .all()
      .map((scope) => [scope.name, scope.editMode]),
  )
  const tagRows = db
    .select({
      entryId: entryTags.entryId,
      id: tags.id,
      namespaceName: tags.namespaceName,
      value: tags.value,
    })
    .from(entryTags)
    .innerJoin(tags, eq(tags.id, entryTags.tagId))
    .where(inArray(entryTags.entryId, ids))
    .all()
  const linkRows = db.select().from(links).where(inArray(links.entryId, ids)).all()
  const valueRows = db.select().from(fieldValues).where(inArray(fieldValues.entryId, ids)).all()
  const definitions = new Map(
    db
      .select()
      .from(fieldDefinitions)
      .all()
      .map((definition) => [definition.id, definition]),
  )
  const checkRows = db.select().from(checks).where(inArray(checks.entryId, ids)).all()
  const statusRows = new Map(
    db
      .select()
      .from(checkStatus)
      .all()
      .map((status) => [status.checkId, status]),
  )
  const actionRows = db.select().from(actions).where(inArray(actions.entryId, ids)).all()
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    host: row.host,
    iconRef: row.iconRef,
    sort: row.sort,
    source: row.source,
    externalKey: row.externalKey,
    managedFields: row.managedFields,
    editMode: scopeModes.get(scopeName(row.source) ?? '') ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    tags: tagRows.filter((tag) => tag.entryId === row.id),
    links: linkRows
      .filter((link) => link.entryId === row.id)
      .map((link) => ({
        id: link.id,
        label: link.label,
        urlTemplate: link.urlTemplate,
        type: link.type,
        isPrimary: link.isPrimary,
        sort: link.sort,
        iconRef: link.iconRef,
      })),
    fields: valueRows
      .filter((value) => value.entryId === row.id)
      .flatMap((value) => {
        const definition = definitions.get(value.fieldId)
        if (!definition) {
          return []
        }
        return [
          {
            key: definition.key,
            label: definition.label,
            type: definition.type,
            minRoleToView: definition.minRoleToView,
            valueText: value.valueText,
            valueSecret: value.valueSecret,
          },
        ]
      }),
    checks: checkRows
      .filter((check) => check.entryId === row.id)
      .map((check) => ({
        id: check.id,
        name: check.name,
        kind: check.kind,
        executor: check.executor,
        intervalSeconds: check.intervalSeconds,
        timeoutMs: check.timeoutMs,
        tlsVerify: check.tlsVerify,
        host: check.host,
        port: check.port,
        linkId: check.linkId,
        requestSpec: check.requestSpec,
        state: statusRows.get(check.id)?.state ?? null,
        latencyMs: statusRows.get(check.id)?.latencyMs ?? null,
        statusMessage: statusRows.get(check.id)?.message ?? '',
        checkedAt: statusRows.get(check.id)?.checkedAt?.toISOString() ?? null,
        reportedBy: statusRows.get(check.id)?.reportedBy ?? null,
      })),
    actions: actionRows
      .filter((action) => action.entryId === row.id)
      .map((action) => ({
        id: action.id,
        name: action.name,
        icon: action.icon,
        requestSpec: action.requestSpec,
        confirm: action.confirm,
        minRole: action.minRole,
      })),
  }))
}

function mustLoad(db: Db, id: string): LoadedEntry {
  const row = db.select().from(entries).where(eq(entries.id, id)).get()
  if (!row) {
    throw notFound('Entry not found')
  }
  const [entry] = hydrate(db, [row])
  if (!entry) {
    throw notFound('Entry not found')
  }
  return entry
}

function duplicateWarningsFor(
  db: Db,
  name: string,
  host: string | null,
  excludeId: string | null,
): EntryWarning[] {
  const warnings: EntryWarning[] = []
  const nameWhere = excludeId
    ? and(eq(entries.name, name), ne(entries.id, excludeId))
    : eq(entries.name, name)
  if (db.select().from(entries).where(nameWhere).get()) {
    warnings.push({ code: 'duplicate_name', message: 'Another entry already uses this name' })
  }
  if (host) {
    const hostWhere = excludeId
      ? and(eq(entries.host, host), ne(entries.id, excludeId))
      : eq(entries.host, host)
    if (db.select().from(entries).where(hostWhere).get()) {
      warnings.push({ code: 'duplicate_host', message: 'Another entry already uses this host' })
    }
  }
  return warnings
}

function entryStatus(rows: LoadedCheck[]): 'up' | 'down' | 'unknown' | null {
  if (rows.length === 0) {
    return null
  }
  if (rows.some((check) => check.state === 'down')) {
    return 'down'
  }
  if (rows.every((check) => check.state === 'up')) {
    return 'up'
  }
  return 'unknown'
}

function withKeptSecrets(current: LoadedEntry, patch: EntryPatch): EntryPatch {
  if (!patch.fields) {
    return patch
  }
  const presentKeys = new Set(patch.fields.map((field) => field.key))
  const kept = current.fields
    .filter((field) => field.type === 'secret' && !presentKeys.has(field.key))
    .map((field) => ({
      key: field.key,
      value: field.valueSecret ? decryptSecret(field.valueSecret) : '',
    }))
  return { ...patch, fields: [...patch.fields, ...kept] }
}

function checksToInput(entry: LoadedEntry): CheckInput[] {
  const labels = new Map(entry.links.map((link) => [link.id, link.label]))
  return entry.checks.map((check) => ({
    ...checkToInput(check),
    linkLabel: check.linkId ? (labels.get(check.linkId) ?? null) : null,
  }))
}

function entrySnapshot(entry: LoadedEntry) {
  return {
    name: entry.name,
    description: entry.description,
    host: entry.host,
    iconRef: entry.iconRef,
    sort: entry.sort,
    tags: entry.tags.map((tag) => formatTag(tag.namespaceName, tag.value)),
    links: entry.links.map(linkToInput),
    fields: entry.fields
      .filter((field) => field.type !== 'secret')
      .map((field) => ({ key: field.key, value: field.valueText ?? '' })),
    checks: checksToInput(entry),
    actions: entry.actions.map(actionToInput),
  }
}

function managedPaths(input: SyncEntry): string[] {
  const paths = ['name']
  if (input.description !== undefined) {
    paths.push('description')
  }
  if (input.host !== undefined) {
    paths.push('host')
  }
  if (input.iconRef !== undefined) {
    paths.push('iconRef')
  }
  if (input.sort !== undefined) {
    paths.push('sort')
  }
  for (const tag of input.tags ?? []) {
    paths.push(`tags:${formatTag(...pair(parseTag(tag)))}`)
  }
  for (const link of input.links ?? []) {
    paths.push(`links:${link.label}`)
  }
  for (const field of input.fields ?? []) {
    paths.push(`fields:${field.key}`)
  }
  for (const check of input.checks ?? []) {
    paths.push(`checks:${check.name}`)
  }
  for (const action of input.actions ?? []) {
    paths.push(`actions:${action.name}`)
  }
  return paths
}

function sameEntry(before: LoadedEntry, after: LoadedEntry): boolean {
  return JSON.stringify(present(before, 'admin')) === JSON.stringify(present(after, 'admin'))
}

function parseTag(input: string): { namespaceName: string; value: string } {
  const trimmed = input.trim()
  const colon = trimmed.indexOf(':')
  if (colon === -1) {
    if (!trimmed) {
      throw badRequest('Tag is empty')
    }
    return { namespaceName: '', value: trimmed }
  }
  const namespaceName = trimmed.slice(0, colon).trim()
  const value = trimmed.slice(colon + 1).trim()
  if (!namespaceName || !value) {
    throw badRequest(`Tag "${input}" is invalid`)
  }
  return { namespaceName, value }
}

function formatTag(namespaceName: string, value: string): string {
  return namespaceName ? `${namespaceName}:${value}` : value
}

function pair(parsed: { namespaceName: string; value: string }): [string, string] {
  return [parsed.namespaceName, parsed.value]
}

function scopeName(source: string | null): string | null {
  if (!source?.startsWith('ansible:')) {
    return null
  }
  const name = source.slice('ansible:'.length)
  return name || null
}

function emptyToNull(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
}

function fieldValue(field: LoadedField): string {
  if (field.type === 'secret') {
    return field.valueSecret ? decryptSecret(field.valueSecret) : ''
  }
  return field.valueText ?? ''
}

function linkToInput(link: LoadedLink): LinkInput {
  return {
    label: link.label,
    urlTemplate: link.urlTemplate,
    type: link.type,
    isPrimary: link.isPrimary,
    sort: link.sort,
    iconRef: link.iconRef,
  }
}

function checkToInput(check: LoadedCheck): CheckInput {
  return {
    name: check.name,
    kind: check.kind,
    executor: check.executor,
    intervalSeconds: check.intervalSeconds,
    timeoutMs: check.timeoutMs,
    tlsVerify: check.tlsVerify,
    host: check.host,
    port: check.port,
    linkLabel: null,
    requestSpec: check.requestSpec as CheckInput['requestSpec'],
  }
}

function actionToInput(action: LoadedAction): ActionInput {
  return {
    name: action.name,
    icon: action.icon,
    requestSpec: action.requestSpec as ActionInput['requestSpec'],
    confirm: action.confirm,
    minRole: action.minRole,
  }
}

function linkChanges(current: LoadedLink[], next: LinkInput[]): string[] {
  const paths: string[] = []
  const currentByLabel = new Map(current.map((link) => [link.label, link]))
  const nextByLabel = new Map(next.map((link) => [link.label, link]))
  for (const [label, link] of nextByLabel) {
    const previous = currentByLabel.get(label)
    if (
      !previous ||
      previous.urlTemplate !== link.urlTemplate ||
      previous.type !== link.type ||
      previous.isPrimary !== link.isPrimary ||
      previous.sort !== link.sort ||
      previous.iconRef !== link.iconRef
    ) {
      paths.push(`links:${label}`)
    }
  }
  for (const label of currentByLabel.keys()) {
    if (!nextByLabel.has(label)) {
      paths.push(`links:${label}`)
    }
  }
  return paths
}

function namedChanges(current: string[], next: string[], prefix: string): string[] {
  const paths: string[] = []
  const currentSet = new Set(current)
  const nextSet = new Set(next)
  for (const name of nextSet) {
    if (!currentSet.has(name)) {
      paths.push(`${prefix}:${name}`)
    }
  }
  for (const name of currentSet) {
    if (!nextSet.has(name)) {
      paths.push(`${prefix}:${name}`)
    }
  }
  return paths
}
