import { eq } from 'drizzle-orm'
import type { EditMode } from '../../shared/contracts'
import { getDatabase, type Db } from '../db/client'
import { now } from '../db/ids'
import { settings } from '../db/schema'

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
  }
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
