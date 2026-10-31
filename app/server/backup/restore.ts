import { eq } from 'drizzle-orm'
import { strFromU8, unzipSync } from 'fflate'
import type { Actor } from '../auth/permissions'
import { getDatabase, type Db } from '../db/client'
import { decryptSecret, encryptSecret } from '../db/crypto'
import {
  actionTemplates,
  actions,
  ansibleScopes,
  apiTokens,
  auditLog,
  checks,
  checkStatus,
  entries,
  entryTags,
  faviconCache,
  fieldDefinitions,
  fieldValues,
  filters,
  icons,
  links,
  settings,
  tagNamespaces,
  tags,
  users,
  userPreferences,
} from '../db/schema'
import { badRequest } from '../http/errors'
import { writeAudit } from '../services/audit'
import { publishLive } from '../services/live'
import { backupDocumentSchema, type BackupDocument } from './document'
import { openSecrets, openString } from './passphrase'

export interface RestorePreview {
  entriesCreated: number
  entriesUpdated: number
  entriesUnchanged: number
  entriesDeleted: number
  warnings: string[]
}

class DryRun extends Error {
  constructor(readonly preview: RestorePreview) {
    super('dry run')
  }
}

export function restoreBackup(
  actor: Actor,
  archive: Uint8Array,
  mode: 'replace' | 'merge',
  dryRun: boolean,
  passphrase: string | undefined,
): RestorePreview {
  if (archive.byteLength > 32 * 1024 * 1024) {
    throw badRequest('Backup is too large')
  }
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(archive)
  } catch {
    throw badRequest('Backup is not a valid zip archive')
  }
  let total = 0
  for (const file of Object.values(files)) {
    total += file.byteLength
    if (total > 64 * 1024 * 1024) {
      throw badRequest('Backup is too large')
    }
  }
  const json = files['backup.json']
  if (!json) {
    throw badRequest('Backup is missing backup.json')
  }
  let document: BackupDocument
  try {
    document = backupDocumentSchema.parse(JSON.parse(strFromU8(json)))
  } catch {
    throw badRequest('Backup data is not a Bookmark-Page archive')
  }
  const key = document.passphrase ? openSecrets(document.passphrase, passphrase ?? '') : null
  if (document.fieldValues.some((field) => field.sealedSecret) && !key) {
    throw badRequest('This backup includes secrets. Enter its passphrase.')
  }
  try {
    const preview = getDatabase().transaction((tx) => {
      const result =
        mode === 'replace'
          ? replaceAll(tx, document, files, key)
          : mergeAll(tx, document, files, key)
      writeAudit(actor, 'backup.restore', 'backup', null, { mode, dryRun, ...counts(result) }, tx)
      if (dryRun) {
        throw new DryRun(result)
      }
      return result
    })
    publishLive({ type: 'entries' })
    return preview
  } catch (error) {
    if (error instanceof DryRun) {
      return error.preview
    }
    throw error
  }
}

function counts(preview: RestorePreview): Record<string, number> {
  return {
    entriesCreated: preview.entriesCreated,
    entriesUpdated: preview.entriesUpdated,
    entriesUnchanged: preview.entriesUnchanged,
    entriesDeleted: preview.entriesDeleted,
  }
}

function replaceAll(
  tx: Db,
  document: BackupDocument,
  files: Record<string, Uint8Array>,
  key: Buffer | null,
): RestorePreview {
  const preview: RestorePreview = {
    entriesCreated: document.entries.length,
    entriesUpdated: 0,
    entriesUnchanged: 0,
    entriesDeleted: tx.select().from(entries).all().length,
    warnings: document.fieldValues.some((field) => field.secretRedacted)
      ? ['Secret values were not in this backup, so those fields were restored empty.']
      : [],
  }
  tx.delete(checkStatus).run()
  tx.delete(checks).run()
  tx.delete(actions).run()
  tx.delete(fieldValues).run()
  tx.delete(links).run()
  tx.delete(entryTags).run()
  tx.delete(entries).run()
  tx.delete(filters).run()
  tx.delete(tags).run()
  tx.delete(tagNamespaces).run()
  tx.delete(fieldDefinitions).run()
  tx.delete(icons).run()
  tx.delete(faviconCache).run()
  tx.delete(actionTemplates).run()
  tx.delete(auditLog).run()
  tx.delete(settings).run()
  tx.delete(ansibleScopes).run()
  tx.delete(apiTokens).run()
  tx.delete(users).run()
  insertDocument(tx, document, files, key)
  return preview
}

function insertDocument(
  tx: Db,
  document: BackupDocument,
  files: Record<string, Uint8Array>,
  key: Buffer | null,
): void {
  for (const row of document.users) {
    tx.insert(users)
      .values({ ...row, createdAt: date(row.createdAt), updatedAt: date(row.updatedAt) })
      .run()
  }
  for (const row of document.preferences) {
    tx.insert(userPreferences)
      .values({ ...row, createdAt: date(row.createdAt), updatedAt: date(row.updatedAt) })
      .run()
  }
  for (const row of document.tokens) {
    tx.insert(apiTokens)
      .values({
        ...row,
        expiresAt: dateOrNull(row.expiresAt),
        lastUsedAt: dateOrNull(row.lastUsedAt),
        createdAt: date(row.createdAt),
        updatedAt: date(row.updatedAt),
      })
      .run()
  }
  for (const row of document.namespaces) {
    tx.insert(tagNamespaces)
      .values({ ...row, createdAt: date(row.createdAt), updatedAt: date(row.updatedAt) })
      .run()
  }
  for (const row of document.tags) {
    tx.insert(tags)
      .values({ ...row, createdAt: date(row.createdAt), updatedAt: date(row.updatedAt) })
      .run()
  }
  for (const row of document.fieldDefinitions) {
    tx.insert(fieldDefinitions)
      .values({ ...row, createdAt: date(row.createdAt), updatedAt: date(row.updatedAt) })
      .run()
  }
  for (const row of document.scopes) {
    tx.insert(ansibleScopes)
      .values({ ...row, createdAt: date(row.createdAt), updatedAt: date(row.updatedAt) })
      .run()
  }
  for (const row of document.settings) {
    tx.insert(settings)
      .values({ ...row, createdAt: date(row.createdAt), updatedAt: date(row.updatedAt) })
      .run()
  }
  for (const row of document.icons) {
    tx.insert(icons)
      .values({
        id: row.id,
        name: row.name,
        kind: row.kind,
        mediaType: row.mediaType,
        data: row.hasData ? bytes(files, `icons/${row.id}`) : null,
        createdAt: date(row.createdAt),
        updatedAt: date(row.updatedAt),
        createdBy: row.createdBy,
        updatedBy: row.updatedBy,
      })
      .run()
  }
  for (const row of document.favicons) {
    tx.insert(faviconCache)
      .values({
        id: row.id,
        origin: row.origin,
        sourceUrl: row.sourceUrl,
        direct: row.direct,
        status: row.status,
        mediaType: row.mediaType,
        byteSize: row.byteSize,
        error: row.error,
        fetchedAt: dateOrNull(row.fetchedAt),
        data: row.hasData ? bytes(files, `favicons/${row.id}`) : null,
        createdAt: date(row.createdAt),
        updatedAt: date(row.updatedAt),
      })
      .run()
  }
  for (const row of document.templates) {
    tx.insert(actionTemplates)
      .values({ ...row, createdAt: date(row.createdAt), updatedAt: date(row.updatedAt) })
      .run()
  }
  for (const row of document.filters) {
    tx.insert(filters)
      .values({ ...row, createdAt: date(row.createdAt), updatedAt: date(row.updatedAt) })
      .run()
  }
  for (const row of document.entries) {
    tx.insert(entries)
      .values({ ...row, createdAt: date(row.createdAt), updatedAt: date(row.updatedAt) })
      .run()
  }
  for (const row of document.entryTags) {
    tx.insert(entryTags)
      .values({ ...row, createdAt: date(row.createdAt), updatedAt: date(row.updatedAt) })
      .run()
  }
  for (const row of document.links) {
    tx.insert(links)
      .values({ ...row, createdAt: date(row.createdAt), updatedAt: date(row.updatedAt) })
      .run()
  }
  for (const row of document.fieldValues) {
    tx.insert(fieldValues)
      .values({
        id: row.id,
        entryId: row.entryId,
        fieldId: row.fieldId,
        valueText: row.valueText,
        valueSecret: sealed(row.sealedSecret, key),
        createdAt: date(row.createdAt),
        updatedAt: date(row.updatedAt),
        createdBy: row.createdBy,
        updatedBy: row.updatedBy,
      })
      .run()
  }
  for (const row of document.checks) {
    tx.insert(checks)
      .values({ ...row, createdAt: date(row.createdAt), updatedAt: date(row.updatedAt) })
      .run()
  }
  for (const row of document.checkStatuses) {
    tx.insert(checkStatus)
      .values({
        ...row,
        checkedAt: dateOrNull(row.checkedAt),
        createdAt: date(row.createdAt),
        updatedAt: date(row.updatedAt),
      })
      .run()
  }
  for (const row of document.actions) {
    tx.insert(actions)
      .values({ ...row, createdAt: date(row.createdAt), updatedAt: date(row.updatedAt) })
      .run()
  }
  for (const row of document.audit) {
    tx.insert(auditLog)
      .values({ ...row, createdAt: date(row.createdAt), updatedAt: date(row.updatedAt) })
      .run()
  }
}

function mergeAll(
  tx: Db,
  document: BackupDocument,
  files: Record<string, Uint8Array>,
  key: Buffer | null,
): RestorePreview {
  const preview: RestorePreview = {
    entriesCreated: 0,
    entriesUpdated: 0,
    entriesUnchanged: 0,
    entriesDeleted: 0,
    warnings: [],
  }
  if (document.fieldValues.some((field) => field.secretRedacted)) {
    preview.warnings.push(
      'Secret values were not in this backup. Existing secret values were kept.',
    )
  }
  const userIds = new Map<string, string>()
  for (const row of document.users) {
    const current = tx.select().from(users).where(eq(users.username, row.username)).get()
    if (!current) {
      tx.insert(users)
        .values({ ...row, createdAt: date(row.createdAt), updatedAt: date(row.updatedAt) })
        .run()
      userIds.set(row.id, row.id)
      continue
    }
    userIds.set(row.id, current.id)
    tx.update(users)
      .set({
        email: row.email,
        passwordHash: row.passwordHash ?? current.passwordHash,
        role: row.role,
        breakGlass: row.breakGlass,
        updatedAt: date(row.updatedAt),
      })
      .where(eq(users.id, current.id))
      .run()
  }
  for (const row of document.preferences) {
    const userId = userIds.get(row.userId)
    if (!userId) continue
    const values = {
      ...row,
      userId,
      createdAt: date(row.createdAt),
      updatedAt: date(row.updatedAt),
    }
    tx.insert(userPreferences)
      .values(values)
      .onConflictDoUpdate({ target: userPreferences.userId, set: values })
      .run()
  }
  for (const row of document.namespaces) {
    const current = tx.select().from(tagNamespaces).where(eq(tagNamespaces.name, row.name)).get()
    if (!current) {
      tx.insert(tagNamespaces)
        .values({ ...row, createdAt: date(row.createdAt), updatedAt: date(row.updatedAt) })
        .run()
    } else {
      tx.update(tagNamespaces)
        .set({
          label: row.label,
          colour: row.colour,
          sort: row.sort,
          showInSidebar: row.showInSidebar,
          updatedAt: date(row.updatedAt),
        })
        .where(eq(tagNamespaces.id, current.id))
        .run()
    }
  }
  const tagIds = new Map<string, string>()
  for (const row of document.tags) {
    const current = tx
      .select()
      .from(tags)
      .where(eq(tags.namespaceName, row.namespaceName))
      .all()
      .find((tag) => tag.value === row.value)
    if (!current) {
      tx.insert(tags)
        .values({
          ...row,
          displayLabel: row.displayLabel ?? null,
          createdAt: date(row.createdAt),
          updatedAt: date(row.updatedAt),
        })
        .run()
      tagIds.set(row.id, row.id)
    } else {
      tagIds.set(row.id, current.id)
    }
  }
  const fieldIds = new Map<string, string>()
  for (const row of document.fieldDefinitions) {
    const current = tx
      .select()
      .from(fieldDefinitions)
      .where(eq(fieldDefinitions.key, row.key))
      .get()
    if (!current) {
      tx.insert(fieldDefinitions)
        .values({ ...row, createdAt: date(row.createdAt), updatedAt: date(row.updatedAt) })
        .run()
      fieldIds.set(row.id, row.id)
      continue
    }
    fieldIds.set(row.id, current.id)
    if (current.type !== row.type) {
      preview.warnings.push(`Field ${row.key} kept its existing type ${current.type}.`)
    }
    tx.update(fieldDefinitions)
      .set({
        label: row.label,
        minRoleToView: row.minRoleToView,
        searchable: row.type === 'secret' || current.type === 'secret' ? false : row.searchable,
        showAsColumnDefault: row.showAsColumnDefault,
        sort: row.sort,
        updatedAt: date(row.updatedAt),
      })
      .where(eq(fieldDefinitions.id, current.id))
      .run()
  }
  for (const row of document.scopes) {
    const current = tx.select().from(ansibleScopes).where(eq(ansibleScopes.name, row.name)).get()
    if (!current) {
      tx.insert(ansibleScopes)
        .values({ ...row, createdAt: date(row.createdAt), updatedAt: date(row.updatedAt) })
        .run()
    } else if (current.editMode !== row.editMode) {
      tx.update(ansibleScopes)
        .set({ editMode: row.editMode, updatedAt: date(row.updatedAt) })
        .where(eq(ansibleScopes.id, current.id))
        .run()
    }
  }
  for (const row of document.settings) {
    const current = tx.select().from(settings).where(eq(settings.key, row.key)).get()
    if (!current) {
      tx.insert(settings)
        .values({ ...row, createdAt: date(row.createdAt), updatedAt: date(row.updatedAt) })
        .run()
    } else {
      tx.update(settings)
        .set({ value: row.value, updatedAt: date(row.updatedAt), updatedBy: row.updatedBy })
        .where(eq(settings.key, row.key))
        .run()
    }
  }
  for (const row of document.icons) {
    const current = tx.select().from(icons).where(eq(icons.name, row.name)).get()
    const data = row.hasData ? bytes(files, `icons/${row.id}`) : null
    if (!current) {
      tx.insert(icons)
        .values({
          id: row.id,
          name: row.name,
          kind: row.kind,
          mediaType: row.mediaType,
          data,
          createdAt: date(row.createdAt),
          updatedAt: date(row.updatedAt),
          createdBy: row.createdBy,
          updatedBy: row.updatedBy,
        })
        .run()
    } else if (data) {
      tx.update(icons)
        .set({ mediaType: row.mediaType, data, updatedAt: date(row.updatedAt) })
        .where(eq(icons.id, current.id))
        .run()
    }
  }
  const entryIds = new Map<string, string>()
  for (const row of document.entries) {
    const byId = tx.select().from(entries).where(eq(entries.id, row.id)).get()
    const byKey =
      !byId && row.source && row.externalKey
        ? tx
            .select()
            .from(entries)
            .where(eq(entries.source, row.source))
            .all()
            .find((entry) => entry.externalKey === row.externalKey)
        : undefined
    const current = byId ?? byKey
    if (!current) {
      tx.insert(entries)
        .values({ ...row, createdAt: date(row.createdAt), updatedAt: date(row.updatedAt) })
        .run()
      entryIds.set(row.id, row.id)
      preview.entriesCreated += 1
      continue
    }
    entryIds.set(row.id, current.id)
    const same =
      current.name === row.name &&
      current.description === row.description &&
      current.host === row.host &&
      current.iconRef === row.iconRef &&
      current.faviconUrl === row.faviconUrl &&
      current.sort === row.sort
    if (!same) {
      tx.update(entries)
        .set({
          name: row.name,
          description: row.description,
          host: row.host,
          iconRef: row.iconRef,
          faviconUrl: row.faviconUrl,
          sort: row.sort,
          managedFields: row.managedFields,
          updatedAt: date(row.updatedAt),
        })
        .where(eq(entries.id, current.id))
        .run()
      preview.entriesUpdated += 1
    } else {
      preview.entriesUnchanged += 1
    }
  }
  for (const row of document.entryTags) {
    const entryId = entryIds.get(row.entryId)
    const tagId = tagIds.get(row.tagId)
    if (!entryId || !tagId) {
      continue
    }
    const current = tx
      .select()
      .from(entryTags)
      .where(eq(entryTags.entryId, entryId))
      .all()
      .find((link) => link.tagId === tagId)
    if (!current) {
      tx.insert(entryTags)
        .values({
          entryId,
          tagId,
          createdAt: date(row.createdAt),
          updatedAt: date(row.updatedAt),
        })
        .run()
    }
  }
  const linkIds = new Map<string, string>()
  for (const row of document.links) {
    const entryId = entryIds.get(row.entryId)
    if (!entryId) {
      continue
    }
    const current = tx
      .select()
      .from(links)
      .where(eq(links.entryId, entryId))
      .all()
      .find((link) => link.label === row.label)
    if (!current) {
      tx.insert(links)
        .values({
          ...row,
          entryId,
          createdAt: date(row.createdAt),
          updatedAt: date(row.updatedAt),
        })
        .run()
      linkIds.set(row.id, row.id)
    } else {
      linkIds.set(row.id, current.id)
      if (
        current.urlTemplate !== row.urlTemplate ||
        current.type !== row.type ||
        current.isPrimary !== row.isPrimary ||
        current.sort !== row.sort
      ) {
        tx.update(links)
          .set({
            urlTemplate: row.urlTemplate,
            type: row.type,
            isPrimary: row.isPrimary,
            sort: row.sort,
            iconRef: row.iconRef,
            updatedAt: date(row.updatedAt),
          })
          .where(eq(links.id, current.id))
          .run()
      }
    }
  }
  for (const row of document.fieldValues) {
    const entryId = entryIds.get(row.entryId)
    const fieldId = fieldIds.get(row.fieldId)
    if (!entryId || !fieldId) {
      continue
    }
    const current = tx
      .select()
      .from(fieldValues)
      .where(eq(fieldValues.entryId, entryId))
      .all()
      .find((field) => field.fieldId === fieldId)
    const secret = row.secretRedacted ? undefined : sealed(row.sealedSecret, key)
    if (!current) {
      tx.insert(fieldValues)
        .values({
          id: row.id,
          entryId,
          fieldId,
          valueText: row.valueText,
          valueSecret: secret ?? null,
          createdAt: date(row.createdAt),
          updatedAt: date(row.updatedAt),
          createdBy: row.createdBy,
          updatedBy: row.updatedBy,
        })
        .run()
      continue
    }
    if (row.secretRedacted) {
      continue
    }
    const sameText = current.valueText === row.valueText
    const sameSecret =
      secret == null
        ? current.valueSecret == null
        : current.valueSecret !== null &&
          decryptSecret(current.valueSecret) === openSealed(row.sealedSecret, key)
    if (!sameText || !sameSecret) {
      tx.update(fieldValues)
        .set({
          valueText: row.valueText,
          valueSecret: secret,
          updatedAt: date(row.updatedAt),
        })
        .where(eq(fieldValues.id, current.id))
        .run()
    }
  }
  for (const row of document.filters) {
    const ownerUserId = row.ownerUserId ? (userIds.get(row.ownerUserId) ?? null) : null
    const current = tx.select().from(filters).where(eq(filters.id, row.id)).get()
    if (!current) {
      tx.insert(filters)
        .values({
          ...row,
          ownerUserId,
          createdAt: date(row.createdAt),
          updatedAt: date(row.updatedAt),
        })
        .run()
    }
  }
  for (const row of document.audit) {
    const current = tx.select().from(auditLog).where(eq(auditLog.id, row.id)).get()
    if (!current) {
      tx.insert(auditLog)
        .values({ ...row, createdAt: date(row.createdAt), updatedAt: date(row.updatedAt) })
        .run()
    }
  }
  for (const row of document.checks) {
    const entryId = entryIds.get(row.entryId)
    if (!entryId) {
      continue
    }
    const current = tx
      .select()
      .from(checks)
      .where(eq(checks.entryId, entryId))
      .all()
      .find((check) => check.name === row.name)
    if (!current) {
      tx.insert(checks)
        .values({
          ...row,
          entryId,
          linkId: row.linkId ? (linkIds.get(row.linkId) ?? null) : null,
          createdAt: date(row.createdAt),
          updatedAt: date(row.updatedAt),
        })
        .run()
    }
  }
  for (const row of document.actions) {
    const entryId = entryIds.get(row.entryId)
    if (!entryId) {
      continue
    }
    const current = tx
      .select()
      .from(actions)
      .where(eq(actions.entryId, entryId))
      .all()
      .find((action) => action.name === row.name)
    if (!current) {
      tx.insert(actions)
        .values({
          ...row,
          entryId,
          createdAt: date(row.createdAt),
          updatedAt: date(row.updatedAt),
        })
        .run()
    }
  }
  for (const row of document.templates) {
    const current = tx
      .select()
      .from(actionTemplates)
      .where(eq(actionTemplates.name, row.name))
      .get()
    if (!current) {
      tx.insert(actionTemplates)
        .values({ ...row, createdAt: date(row.createdAt), updatedAt: date(row.updatedAt) })
        .run()
    }
  }
  return preview
}

function sealed(value: string | undefined, key: Buffer | null): string | null {
  if (!value) {
    return null
  }
  if (!key) {
    throw badRequest('This backup includes secrets. Enter its passphrase.')
  }
  return encryptSecret(openString(value, key))
}

function openSealed(value: string | undefined, key: Buffer | null): string {
  if (!value || !key) {
    return ''
  }
  return openString(value, key)
}

function bytes(files: Record<string, Uint8Array>, path: string): Buffer {
  const file = files[path]
  if (!file) {
    throw badRequest(`Backup is missing ${path}`)
  }
  return Buffer.from(file)
}

function date(value: string): Date {
  return new Date(value)
}

function dateOrNull(value: string | null): Date | null {
  return value ? new Date(value) : null
}
