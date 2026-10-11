import { and, asc, eq } from 'drizzle-orm'
import { createHash, randomBytes } from 'node:crypto'
import type { EditMode } from '../../shared/contracts'
import { parseQuery } from '../../shared/query'
import { roleAtLeast, type Role, type StoredRole } from '../../shared/roles'
import type { Actor } from '../auth/permissions'
import { hashPassword } from '../auth/passwords'
import { getDatabase, transaction, type Db } from '../db/client'
import { newId, now } from '../db/ids'
import {
  ansibleScopes,
  apiTokens,
  entryTags,
  fieldDefinitions,
  filters,
  icons,
  tagNamespaces,
  tags,
  users,
} from '../db/schema'
import { badRequest, forbidden, notFound } from '../http/errors'
import { writeAudit, listAudit } from './audit'
import { entryVisible } from './entries'
import { adminSettings, defaultEditMode, publicSettings, writeSettings } from './settings'

export function listNamespaces() {
  return getDatabase()
    .select()
    .from(tagNamespaces)
    .orderBy(asc(tagNamespaces.sort), asc(tagNamespaces.name))
    .all()
    .map(presentNamespace)
}

export function createNamespace(
  actor: Actor,
  input: {
    name: string
    label: string
    colour: string
    sort: number
    showInSidebar: boolean
  },
) {
  return transaction((db) => {
    if (db.select().from(tagNamespaces).where(eq(tagNamespaces.name, input.name)).get()) {
      throw badRequest('Namespace already exists')
    }
    const timestamp = now()
    const id = newId()
    db.insert(tagNamespaces)
      .values({
        id,
        ...input,
        createdAt: timestamp,
        updatedAt: timestamp,
        createdBy: actor.userId,
        updatedBy: actor.userId,
      })
      .run()
    writeAudit(actor, 'namespace.create', 'namespace', id, { name: input.name }, db)
    return presentNamespace(
      must(
        db.select().from(tagNamespaces).where(eq(tagNamespaces.id, id)).get(),
        'Namespace not found',
      ),
    )
  })
}

export function updateNamespace(
  actor: Actor,
  id: string,
  input: Partial<{
    label: string
    colour: string
    sort: number
    showInSidebar: boolean
  }>,
) {
  return transaction((db) => {
    const current = must(
      db.select().from(tagNamespaces).where(eq(tagNamespaces.id, id)).get(),
      'Namespace not found',
    )
    const timestamp = now()
    db.update(tagNamespaces)
      .set({
        label: input.label ?? current.label,
        colour: input.colour ?? current.colour,
        sort: input.sort ?? current.sort,
        showInSidebar: input.showInSidebar ?? current.showInSidebar,
        updatedAt: timestamp,
        updatedBy: actor.userId,
      })
      .where(eq(tagNamespaces.id, id))
      .run()
    writeAudit(actor, 'namespace.update', 'namespace', id, input, db)
    return presentNamespace(
      must(
        db.select().from(tagNamespaces).where(eq(tagNamespaces.id, id)).get(),
        'Namespace not found',
      ),
    )
  })
}

export function deleteNamespace(actor: Actor, id: string): void {
  transaction((db) => {
    const current = must(
      db.select().from(tagNamespaces).where(eq(tagNamespaces.id, id)).get(),
      'Namespace not found',
    )
    db.delete(tagNamespaces).where(eq(tagNamespaces.id, id)).run()
    writeAudit(actor, 'namespace.delete', 'namespace', id, { name: current.name }, db)
  })
}

export function listTags(actor: Actor) {
  const db = getDatabase()
  const rows = db.select().from(tags).orderBy(asc(tags.namespaceName), asc(tags.value)).all()
  if (actor.role === 'anonymous') {
    return rows.filter((tag) => tagIsVisible(db, actor.role, tag.id)).map(presentTag)
  }
  return rows.map(presentTag)
}

export function createTag(actor: Actor, input: { namespace: string | null; value: string }) {
  return transaction((db) => {
    const timestamp = now()
    const namespaceName = input.namespace ?? ''
    if (namespaceName) {
      const namespace = db
        .select()
        .from(tagNamespaces)
        .where(eq(tagNamespaces.name, namespaceName))
        .get()
      if (!namespace) {
        db.insert(tagNamespaces)
          .values({
            id: newId(),
            name: namespaceName,
            label: namespaceName,
            colour: '#64748b',
            sort: 0,
            showInSidebar: true,
            createdAt: timestamp,
            updatedAt: timestamp,
            createdBy: actor.userId,
            updatedBy: actor.userId,
          })
          .run()
      }
    }
    const existing = db
      .select()
      .from(tags)
      .where(and(eq(tags.namespaceName, namespaceName), eq(tags.value, input.value)))
      .get()
    if (existing) {
      return presentTag(existing)
    }
    const id = newId()
    db.insert(tags)
      .values({
        id,
        namespaceName,
        value: input.value,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run()
    writeAudit(
      actor,
      'tag.create',
      'tag',
      id,
      { namespace: namespaceName || null, value: input.value },
      db,
    )
    return presentTag(must(db.select().from(tags).where(eq(tags.id, id)).get(), 'Tag not found'))
  })
}

export function deleteTag(actor: Actor, id: string): void {
  transaction((db) => {
    const current = must(db.select().from(tags).where(eq(tags.id, id)).get(), 'Tag not found')
    db.delete(tags).where(eq(tags.id, id)).run()
    writeAudit(actor, 'tag.delete', 'tag', id, presentTag(current), db)
  })
}

export function listFilters(actor: Actor) {
  const rows = getDatabase()
    .select()
    .from(filters)
    .orderBy(asc(filters.sort), asc(filters.name))
    .all()
  return rows
    .filter((filter) => canSeeFilter(actor, filter.ownerUserId, filter.isPublic))
    .map(presentFilter)
}

export function createFilter(
  actor: Actor,
  input: {
    name: string
    query: string
    columns: string[]
    groupBy?: string | null
    sort: number
    icon?: string | null
    isPublic: boolean
    global: boolean
  },
) {
  assertQuery(input.query)
  return transaction((db) => {
    const global = actor.role === 'admin' && input.global
    if ((input.isPublic || input.global) && actor.role !== 'admin') {
      throw forbidden('Only an admin can publish a global filter')
    }
    const timestamp = now()
    const id = newId()
    db.insert(filters)
      .values({
        id,
        name: input.name,
        query: input.query,
        ownerUserId: global ? null : actor.userId,
        columns: input.columns,
        groupBy: input.groupBy ?? null,
        sort: input.sort,
        icon: input.icon ?? null,
        isPublic: global && input.isPublic,
        createdAt: timestamp,
        updatedAt: timestamp,
        createdBy: actor.userId,
        updatedBy: actor.userId,
      })
      .run()
    writeAudit(actor, 'filter.create', 'filter', id, { name: input.name }, db)
    return presentFilter(
      must(db.select().from(filters).where(eq(filters.id, id)).get(), 'Filter not found'),
    )
  })
}

export function updateFilter(
  actor: Actor,
  id: string,
  input: Partial<{
    name: string
    query: string
    columns: string[]
    groupBy: string | null
    sort: number
    icon: string | null
    isPublic: boolean
  }>,
) {
  if (input.query !== undefined) {
    assertQuery(input.query)
  }
  return transaction((db) => {
    const current = must(
      db.select().from(filters).where(eq(filters.id, id)).get(),
      'Filter not found',
    )
    if (actor.role !== 'admin' && current.ownerUserId !== actor.userId) {
      throw forbidden()
    }
    if (input.isPublic !== undefined && actor.role !== 'admin') {
      throw forbidden('Only an admin can change public visibility')
    }
    if (input.isPublic === true && current.ownerUserId !== null) {
      throw badRequest('Only a global filter can be public')
    }
    const timestamp = now()
    db.update(filters)
      .set({
        name: input.name ?? current.name,
        query: input.query ?? current.query,
        columns: input.columns ?? current.columns,
        groupBy: input.groupBy === undefined ? current.groupBy : input.groupBy,
        sort: input.sort ?? current.sort,
        icon: input.icon === undefined ? current.icon : input.icon,
        isPublic: input.isPublic ?? current.isPublic,
        updatedAt: timestamp,
        updatedBy: actor.userId,
      })
      .where(eq(filters.id, id))
      .run()
    writeAudit(actor, 'filter.update', 'filter', id, { name: input.name ?? current.name }, db)
    return presentFilter(
      must(db.select().from(filters).where(eq(filters.id, id)).get(), 'Filter not found'),
    )
  })
}

export function deleteFilter(actor: Actor, id: string): void {
  transaction((db) => {
    const current = must(
      db.select().from(filters).where(eq(filters.id, id)).get(),
      'Filter not found',
    )
    if (actor.role !== 'admin' && current.ownerUserId !== actor.userId) {
      throw forbidden()
    }
    db.delete(filters).where(eq(filters.id, id)).run()
    writeAudit(actor, 'filter.delete', 'filter', id, { name: current.name }, db)
  })
}

export function listFieldDefinitions(role: Role) {
  return getDatabase()
    .select()
    .from(fieldDefinitions)
    .orderBy(asc(fieldDefinitions.sort), asc(fieldDefinitions.key))
    .all()
    .filter((field) => roleAtLeast(role, field.minRoleToView))
    .map(presentField)
}

export function createFieldDefinition(
  actor: Actor,
  input: {
    key: string
    label: string
    type: 'text' | 'url' | 'number' | 'secret'
    minRoleToView: Role
    searchable: boolean
    showAsColumnDefault: boolean
    sort: number
  },
) {
  return transaction((db) => {
    if (db.select().from(fieldDefinitions).where(eq(fieldDefinitions.key, input.key)).get()) {
      throw badRequest('Field already exists')
    }
    const timestamp = now()
    const id = newId()
    db.insert(fieldDefinitions)
      .values({
        id,
        ...input,
        searchable: input.type === 'secret' ? false : input.searchable,
        createdAt: timestamp,
        updatedAt: timestamp,
        createdBy: actor.userId,
        updatedBy: actor.userId,
      })
      .run()
    writeAudit(
      actor,
      'field_definition.create',
      'field_definition',
      id,
      { key: input.key, type: input.type },
      db,
    )
    return presentField(
      must(
        db.select().from(fieldDefinitions).where(eq(fieldDefinitions.id, id)).get(),
        'Field not found',
      ),
    )
  })
}

export function deleteFieldDefinition(actor: Actor, id: string): void {
  transaction((db) => {
    const current = must(
      db.select().from(fieldDefinitions).where(eq(fieldDefinitions.id, id)).get(),
      'Field not found',
    )
    db.delete(fieldDefinitions).where(eq(fieldDefinitions.id, id)).run()
    writeAudit(actor, 'field_definition.delete', 'field_definition', id, { key: current.key }, db)
  })
}

export function listIcons() {
  return getDatabase().select().from(icons).orderBy(asc(icons.name)).all().map(presentIcon)
}

export function createIcon(actor: Actor, input: { name: string; mediaType: string; data: Buffer }) {
  return transaction((db) => {
    if (db.select().from(icons).where(eq(icons.name, input.name)).get()) {
      throw badRequest('Icon already exists')
    }
    const timestamp = now()
    const id = newId()
    db.insert(icons)
      .values({
        id,
        name: input.name,
        kind: 'upload',
        mediaType: input.mediaType,
        data: input.data,
        createdAt: timestamp,
        updatedAt: timestamp,
        createdBy: actor.userId,
        updatedBy: actor.userId,
      })
      .run()
    writeAudit(
      actor,
      'icon.create',
      'icon',
      id,
      { name: input.name, mediaType: input.mediaType },
      db,
    )
    return presentIcon(
      must(db.select().from(icons).where(eq(icons.id, id)).get(), 'Icon not found'),
    )
  })
}

export function deleteIcon(actor: Actor, id: string): void {
  transaction((db) => {
    const current = must(db.select().from(icons).where(eq(icons.id, id)).get(), 'Icon not found')
    db.delete(icons).where(eq(icons.id, id)).run()
    writeAudit(actor, 'icon.delete', 'icon', id, { name: current.name }, db)
  })
}

export function listUsers() {
  return getDatabase().select().from(users).orderBy(asc(users.username)).all().map(presentUser)
}

export async function createUser(
  actor: Actor,
  input: {
    username: string
    email?: string | null
    password?: string
    role: StoredRole
    breakGlass: boolean
  },
) {
  if (!input.password) {
    throw badRequest('Password is required')
  }
  const passwordHash = await hashPassword(input.password)
  return transaction((db) => {
    if (db.select().from(users).where(eq(users.username, input.username)).get()) {
      throw badRequest('Username already exists')
    }
    const timestamp = now()
    const id = newId()
    db.insert(users)
      .values({
        id,
        username: input.username,
        email: input.email ?? null,
        passwordHash,
        role: input.role,
        breakGlass: input.breakGlass,
        authSource: 'local',
        oidcIssuer: null,
        oidcSubject: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        createdBy: actor.userId,
        updatedBy: actor.userId,
      })
      .run()
    writeAudit(actor, 'user.create', 'user', id, { username: input.username, role: input.role }, db)
    return presentUser(
      must(db.select().from(users).where(eq(users.id, id)).get(), 'User not found'),
    )
  })
}

export async function updateUser(
  actor: Actor,
  id: string,
  input: {
    email?: string | null
    password?: string
    role?: StoredRole
    breakGlass?: boolean
  },
) {
  const passwordHash = input.password ? await hashPassword(input.password) : undefined
  return transaction((db) => {
    const current = must(db.select().from(users).where(eq(users.id, id)).get(), 'User not found')
    if (input.role && input.role !== 'admin' && current.role === 'admin') {
      const admins = db.select().from(users).where(eq(users.role, 'admin')).all()
      if (admins.length <= 1) {
        throw forbidden('The last admin cannot be demoted')
      }
    }
    const timestamp = now()
    db.update(users)
      .set({
        email: input.email === undefined ? current.email : input.email,
        role: input.role ?? current.role,
        breakGlass: input.breakGlass ?? current.breakGlass,
        passwordHash: passwordHash ?? current.passwordHash,
        updatedAt: timestamp,
        updatedBy: actor.userId,
      })
      .where(eq(users.id, id))
      .run()
    writeAudit(
      actor,
      'user.update',
      'user',
      id,
      { username: current.username, role: input.role ?? current.role },
      db,
    )
    return presentUser(
      must(db.select().from(users).where(eq(users.id, id)).get(), 'User not found'),
    )
  })
}

export function deleteUser(actor: Actor, id: string): void {
  transaction((db) => {
    const current = must(db.select().from(users).where(eq(users.id, id)).get(), 'User not found')
    if (current.role === 'admin') {
      const admins = db.select().from(users).where(eq(users.role, 'admin')).all()
      if (admins.length <= 1) {
        throw forbidden('The last admin cannot be deleted')
      }
    }
    db.delete(users).where(eq(users.id, id)).run()
    writeAudit(actor, 'user.delete', 'user', id, { username: current.username }, db)
  })
}

export function listTokens(actor: Actor) {
  const rows = getDatabase().select().from(apiTokens).all()
  return rows
    .filter((token) => actor.role === 'admin' || token.userId === actor.userId)
    .map(presentToken)
}

export async function createToken(
  actor: Actor,
  input: {
    name: string
    userId?: string
    scopes: Array<'read' | 'write' | 'admin'>
    expiresAt?: string | null
  },
) {
  const userId = input.userId ?? actor.userId
  if (!userId) {
    throw badRequest('Token user is required')
  }
  if (actor.role !== 'admin' && userId !== actor.userId) {
    throw forbidden()
  }
  const owner = must(
    getDatabase().select().from(users).where(eq(users.id, userId)).get(),
    'User not found',
  )
  assertScopesFitRole(owner.role, input.scopes)
  const secret = `bp_${randomBytes(32).toString('base64url')}`
  const timestamp = now()
  const id = newId()
  getDatabase()
    .insert(apiTokens)
    .values({
      id,
      userId,
      name: input.name,
      tokenHash: hashToken(secret),
      scopes: input.scopes,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      lastUsedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy: actor.userId,
      updatedBy: actor.userId,
    })
    .run()
  writeAudit(actor, 'token.create', 'token', id, { name: input.name, userId, scopes: input.scopes })
  const token = presentToken(
    must(
      getDatabase().select().from(apiTokens).where(eq(apiTokens.id, id)).get(),
      'Token not found',
    ),
  )
  return { token: secret, ...token }
}

export function deleteToken(actor: Actor, id: string): void {
  const current = must(
    getDatabase().select().from(apiTokens).where(eq(apiTokens.id, id)).get(),
    'Token not found',
  )
  if (actor.role !== 'admin' && current.userId !== actor.userId) {
    throw forbidden()
  }
  getDatabase().delete(apiTokens).where(eq(apiTokens.id, id)).run()
  writeAudit(actor, 'token.delete', 'token', id, { name: current.name })
}

export function listScopes() {
  return getDatabase()
    .select()
    .from(ansibleScopes)
    .orderBy(asc(ansibleScopes.name))
    .all()
    .map(presentScope)
}

export function createScope(actor: Actor, input: { name: string; editMode?: EditMode }) {
  return transaction((db) => {
    if (db.select().from(ansibleScopes).where(eq(ansibleScopes.name, input.name)).get()) {
      throw badRequest('Scope already exists')
    }
    const timestamp = now()
    const id = newId()
    db.insert(ansibleScopes)
      .values({
        id,
        name: input.name,
        editMode: input.editMode ?? defaultEditMode(db),
        createdAt: timestamp,
        updatedAt: timestamp,
        createdBy: actor.userId,
        updatedBy: actor.userId,
      })
      .run()
    writeAudit(actor, 'scope.create', 'scope', id, { name: input.name }, db)
    return presentScope(
      must(
        db.select().from(ansibleScopes).where(eq(ansibleScopes.id, id)).get(),
        'Scope not found',
      ),
    )
  })
}

export function ensureScope(name: string, actor: Actor): void {
  const db = getDatabase()
  if (db.select().from(ansibleScopes).where(eq(ansibleScopes.name, name)).get()) {
    return
  }
  const timestamp = now()
  db.insert(ansibleScopes)
    .values({
      id: newId(),
      name,
      editMode: defaultEditMode(db),
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy: actor.userId,
      updatedBy: actor.userId,
    })
    .run()
}

export function updateScope(actor: Actor, id: string, editMode: EditMode) {
  const timestamp = now()
  const current = must(
    getDatabase().select().from(ansibleScopes).where(eq(ansibleScopes.id, id)).get(),
    'Scope not found',
  )
  getDatabase()
    .update(ansibleScopes)
    .set({
      editMode,
      updatedAt: timestamp,
      updatedBy: actor.userId,
    })
    .where(eq(ansibleScopes.id, id))
    .run()
  writeAudit(actor, 'scope.update', 'scope', id, { name: current.name, editMode })
  return presentScope(
    must(
      getDatabase().select().from(ansibleScopes).where(eq(ansibleScopes.id, id)).get(),
      'Scope not found',
    ),
  )
}

export function readSettings(actor: Actor) {
  return actor.role === 'admin' ? adminSettings() : publicSettings()
}

export function patchSettings(actor: Actor, patch: Parameters<typeof writeSettings>[0]) {
  const updated = writeSettings(patch, actor.userId)
  writeAudit(actor, 'settings.update', 'settings', null, patch)
  return updated
}

export function readAudit(role: Role) {
  return { entries: listAudit(role) }
}

function presentNamespace(row: typeof tagNamespaces.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    label: row.label,
    colour: row.colour,
    sort: row.sort,
    showInSidebar: row.showInSidebar,
  }
}

function presentTag(row: typeof tags.$inferSelect) {
  return {
    id: row.id,
    namespace: row.namespaceName || null,
    value: row.value,
    label: row.namespaceName ? `${row.namespaceName}:${row.value}` : row.value,
  }
}

function presentFilter(row: typeof filters.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    query: row.query,
    ownerUserId: row.ownerUserId,
    columns: row.columns,
    groupBy: row.groupBy,
    sort: row.sort,
    icon: row.icon,
    isPublic: row.isPublic,
  }
}

function presentField(row: typeof fieldDefinitions.$inferSelect) {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    type: row.type,
    minRoleToView: row.minRoleToView,
    searchable: row.searchable,
    showAsColumnDefault: row.showAsColumnDefault,
    sort: row.sort,
  }
}

function presentIcon(row: typeof icons.$inferSelect) {
  return { id: row.id, name: row.name, kind: row.kind, mediaType: row.mediaType }
}

function presentUser(row: typeof users.$inferSelect) {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    role: row.role,
    breakGlass: row.breakGlass,
    authSource: row.authSource,
  }
}

function presentToken(row: typeof apiTokens.$inferSelect) {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    scopes: row.scopes,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
  }
}

function presentScope(row: typeof ansibleScopes.$inferSelect) {
  return { id: row.id, name: row.name, editMode: row.editMode }
}

function canSeeFilter(actor: Actor, ownerUserId: string | null, isPublic: boolean): boolean {
  if (ownerUserId === null) {
    return isPublic || actor.role !== 'anonymous'
  }
  return ownerUserId === actor.userId
}

function tagIsVisible(db: Db, role: Role, tagId: string): boolean {
  const linksToEntries = db.select().from(entryTags).where(eq(entryTags.tagId, tagId)).all()
  return linksToEntries.some((link) => entryVisible(role, link.entryId, db))
}

function assertQuery(query: string): void {
  const parsed = parseQuery(query)
  if (!parsed.ok) {
    throw badRequest(parsed.message, 'invalid_query')
  }
}

function assertScopesFitRole(role: StoredRole, scopes: readonly string[]): void {
  const allowed =
    role === 'admin' ? ['read', 'write', 'admin'] : role === 'editor' ? ['read', 'write'] : ['read']
  if (scopes.some((scope) => !allowed.includes(scope))) {
    throw badRequest('Token scope exceeds the user role')
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function must<T>(value: T | undefined, message: string): T {
  if (!value) {
    throw notFound(message)
  }
  return value
}

export function findUserByTokenHash(token: string) {
  return getDatabase()
    .select()
    .from(apiTokens)
    .where(eq(apiTokens.tokenHash, hashToken(token)))
    .get()
}

export { hashToken }
