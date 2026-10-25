import { strToU8, zipSync } from 'fflate'
import type { Actor } from '../auth/permissions'
import { decryptSecret } from '../db/crypto'
import { getDatabase } from '../db/client'
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
} from '../db/schema'
import { badRequest } from '../http/errors'
import { writeAudit } from '../services/audit'
import { backupDocumentSchema, type BackupDocument } from './document'
import { protectSecrets, sealString, type PassphraseHeader } from './passphrase'

export function createBackup(
  actor: Actor,
  includeSecrets: boolean,
  passphrase: string | undefined,
): Uint8Array {
  if (includeSecrets && (!passphrase || passphrase.length < 8)) {
    throw badRequest('A passphrase of at least 8 characters is required to export secrets')
  }
  const db = getDatabase()
  let header: PassphraseHeader | undefined
  let key: Buffer | undefined
  if (includeSecrets && passphrase) {
    const protectedSecrets = protectSecrets(passphrase)
    header = protectedSecrets.header
    key = protectedSecrets.key
  }
  const document: BackupDocument = {
    format: 1,
    exportedAt: new Date().toISOString(),
    ...(header ? { passphrase: header } : {}),
    users: db
      .select()
      .from(users)
      .all()
      .map((row) => ({
        ...row,
        createdAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
      })),
    tokens: db
      .select()
      .from(apiTokens)
      .all()
      .map((row) => ({
        ...row,
        expiresAt: isoOrNull(row.expiresAt),
        lastUsedAt: isoOrNull(row.lastUsedAt),
        createdAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
      })),
    namespaces: db
      .select()
      .from(tagNamespaces)
      .all()
      .map((row) => ({
        ...row,
        createdAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
      })),
    tags: db
      .select()
      .from(tags)
      .all()
      .map((row) => ({
        ...row,
        createdAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
      })),
    fieldDefinitions: db
      .select()
      .from(fieldDefinitions)
      .all()
      .map((row) => ({
        ...row,
        createdAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
      })),
    entries: db
      .select()
      .from(entries)
      .all()
      .map((row) => ({
        ...row,
        createdAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
      })),
    entryTags: db
      .select()
      .from(entryTags)
      .all()
      .map((row) => ({
        ...row,
        createdAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
      })),
    links: db
      .select()
      .from(links)
      .all()
      .map((row) => ({
        ...row,
        createdAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
      })),
    fieldValues: db
      .select()
      .from(fieldValues)
      .all()
      .map((row) => {
        const base = {
          id: row.id,
          entryId: row.entryId,
          fieldId: row.fieldId,
          valueText: row.valueText,
          createdAt: iso(row.createdAt),
          updatedAt: iso(row.updatedAt),
          createdBy: row.createdBy,
          updatedBy: row.updatedBy,
        }
        if (!row.valueSecret) {
          return base
        }
        if (!key) {
          return { ...base, secretRedacted: true }
        }
        return { ...base, sealedSecret: sealString(decryptSecret(row.valueSecret), key) }
      }),
    filters: db
      .select()
      .from(filters)
      .all()
      .map((row) => ({
        ...row,
        createdAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
      })),
    icons: db
      .select()
      .from(icons)
      .all()
      .map((row) => ({
        id: row.id,
        name: row.name,
        kind: row.kind,
        mediaType: row.mediaType,
        hasData: row.data !== null,
        createdAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
        createdBy: row.createdBy,
        updatedBy: row.updatedBy,
      })),
    favicons: db
      .select()
      .from(faviconCache)
      .all()
      .map((row) => ({
        id: row.id,
        origin: row.origin,
        status: row.status,
        mediaType: row.mediaType,
        byteSize: row.byteSize,
        error: row.error,
        fetchedAt: isoOrNull(row.fetchedAt),
        hasData: row.data !== null,
        createdAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
      })),
    checks: db
      .select()
      .from(checks)
      .all()
      .map((row) => ({
        ...row,
        createdAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
      })),
    checkStatuses: db
      .select()
      .from(checkStatus)
      .all()
      .map((row) => ({
        ...row,
        checkedAt: isoOrNull(row.checkedAt),
        createdAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
      })),
    actions: db
      .select()
      .from(actions)
      .all()
      .map((row) => ({
        ...row,
        createdAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
      })),
    templates: db
      .select()
      .from(actionTemplates)
      .all()
      .map((row) => ({
        ...row,
        createdAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
      })),
    audit: db
      .select()
      .from(auditLog)
      .all()
      .map((row) => ({
        ...row,
        createdAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
      })),
    settings: db
      .select()
      .from(settings)
      .all()
      .map((row) => ({
        ...row,
        createdAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
      })),
    scopes: db
      .select()
      .from(ansibleScopes)
      .all()
      .map((row) => ({
        ...row,
        createdAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
      })),
  }
  const checked = backupDocumentSchema.parse(document)
  const files: Record<string, Uint8Array> = {
    'backup.json': strToU8(JSON.stringify(checked)),
  }
  for (const row of db.select().from(icons).all()) {
    if (row.data) {
      files[`icons/${row.id}`] = row.data
    }
  }
  for (const row of db.select().from(faviconCache).all()) {
    if (row.data) {
      files[`favicons/${row.id}`] = row.data
    }
  }
  writeAudit(actor, 'backup.export', 'backup', null, {
    includeSecrets,
    entries: checked.entries.length,
  })
  return zipSync(files)
}

function iso(value: Date): string {
  return value.toISOString()
}

function isoOrNull(value: Date | null): string | null {
  return value ? value.toISOString() : null
}
