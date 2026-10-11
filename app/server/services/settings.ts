import { eq } from 'drizzle-orm'
import type { EditMode } from '../../shared/contracts'
import { getDatabase, type Db } from '../db/client'
import { now } from '../db/ids'
import { settings } from '../db/schema'
import { badRequest } from '../http/errors'

const defaults = {
  site_title: 'Bookmark-Page',
  site_claim: '',
  accent_colour: '#0f766e',
  favicon_colour: '#0f766e',
  all_tab_public: false,
  audit_retention_days: 365,
  default_scope_edit_mode: 'field_ownership' as EditMode,
}

export type SettingKey = keyof typeof defaults

export function seedSettings(db: Db = getDatabase(), retentionDays = 365): void {
  const timestamp = now()
  for (const [key, value] of Object.entries(defaults)) {
    const stored = key === 'audit_retention_days' ? retentionDays : value
    const existing = db.select().from(settings).where(eq(settings.key, key)).get()
    if (!existing) {
      db.insert(settings)
        .values({
          key,
          value: stored,
          createdAt: timestamp,
          updatedAt: timestamp,
          updatedBy: null,
        })
        .run()
    }
  }
}

export function readSettingsMap(db: Db = getDatabase()): typeof defaults {
  const rows = db.select().from(settings).all()
  const values = { ...defaults }
  for (const row of rows) {
    if (row.key in values) {
      Object.assign(values, { [row.key]: row.value })
    }
  }
  return values
}

export function publicSettings(db: Db = getDatabase()) {
  const values = readSettingsMap(db)
  return {
    siteTitle: values.site_title,
    siteClaim: values.site_claim,
    accentColour: values.accent_colour,
    faviconColour: values.favicon_colour,
    allTabPublic: values.all_tab_public,
    hasLogo: logoRecord(db) !== null,
  }
}

const logoLimit = 512 * 1024

export function saveLogo(
  contentType: string,
  dataBase64: string,
  actorId: string | null,
  db: Db = getDatabase(),
): void {
  if (contentType !== 'image/png' && contentType !== 'image/webp') {
    throw badRequest('Logo must be a PNG or WebP image')
  }
  const normalized = dataBase64.replace(/\s/g, '')
  const bytes = Buffer.from(normalized, 'base64')
  if (bytes.length === 0 || bytes.length > logoLimit || bytes.toString('base64') !== normalized) {
    throw badRequest('Logo must be standard Base64 up to 512 KB')
  }
  if (contentType === 'image/png' && !isPng(bytes)) {
    throw badRequest('Logo content is not a PNG image')
  }
  if (contentType === 'image/webp' && !isWebp(bytes)) {
    throw badRequest('Logo content is not a WebP image')
  }
  const timestamp = now()
  db.insert(settings)
    .values({
      key: 'logo',
      value: { contentType, data: normalized },
      createdAt: timestamp,
      updatedAt: timestamp,
      updatedBy: actorId,
    })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: { contentType, data: normalized }, updatedAt: timestamp, updatedBy: actorId },
    })
    .run()
}

export function clearLogo(db: Db = getDatabase()): void {
  db.delete(settings).where(eq(settings.key, 'logo')).run()
}

export function readLogo(db: Db = getDatabase()): { contentType: string; bytes: Buffer } | null {
  const record = logoRecord(db)
  if (!record) {
    return null
  }
  return { contentType: record.contentType, bytes: Buffer.from(record.data, 'base64') }
}

function logoRecord(db: Db): { contentType: string; data: string } | null {
  const row = db.select().from(settings).where(eq(settings.key, 'logo')).get()
  const value = row?.value
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  if (!('contentType' in value) || !('data' in value)) {
    return null
  }
  const contentType = value.contentType
  const data = value.data
  if (typeof contentType !== 'string' || typeof data !== 'string') {
    return null
  }
  return { contentType, data }
}

function isPng(bytes: Buffer): boolean {
  return (
    bytes.length > 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  )
}

function isWebp(bytes: Buffer): boolean {
  return (
    bytes.length > 12 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  )
}

export function adminSettings(db: Db = getDatabase()) {
  const values = readSettingsMap(db)
  return {
    ...publicSettings(db),
    auditRetentionDays: values.audit_retention_days,
    defaultScopeEditMode: values.default_scope_edit_mode,
  }
}

export function writeSettings(
  patch: Partial<{
    siteTitle: string
    siteClaim: string
    accentColour: string
    faviconColour: string
    allTabPublic: boolean
    auditRetentionDays: number
    defaultScopeEditMode: EditMode
  }>,
  actorId: string | null,
  db: Db = getDatabase(),
): ReturnType<typeof adminSettings> {
  const mapping: Record<string, SettingKey> = {
    siteTitle: 'site_title',
    siteClaim: 'site_claim',
    accentColour: 'accent_colour',
    faviconColour: 'favicon_colour',
    allTabPublic: 'all_tab_public',
    auditRetentionDays: 'audit_retention_days',
    defaultScopeEditMode: 'default_scope_edit_mode',
  }
  const timestamp = now()
  for (const [field, key] of Object.entries(mapping)) {
    if (field in patch) {
      const value = patch[field as keyof typeof patch]
      db.insert(settings)
        .values({
          key,
          value,
          createdAt: timestamp,
          updatedAt: timestamp,
          updatedBy: actorId,
        })
        .onConflictDoUpdate({
          target: settings.key,
          set: { value, updatedAt: timestamp, updatedBy: actorId },
        })
        .run()
    }
  }
  return adminSettings(db)
}

export function allTabPublic(db: Db = getDatabase()): boolean {
  return readSettingsMap(db).all_tab_public === true
}

export function defaultEditMode(db: Db = getDatabase()): EditMode {
  const value = readSettingsMap(db).default_scope_edit_mode
  if (value === 'locked' || value === 'free' || value === 'field_ownership') {
    return value
  }
  return 'field_ownership'
}

export function auditRetentionDays(db: Db = getDatabase()): number {
  const value = readSettingsMap(db).audit_retention_days
  return typeof value === 'number' ? value : 365
}
