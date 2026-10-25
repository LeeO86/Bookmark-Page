import { eq } from 'drizzle-orm'
import type { ColourMode, TileSize, ViewMode } from '../../shared/theme'
import { isColourMode, isTileSize, isViewMode } from '../../shared/theme'
import { getDatabase, type Db } from '../db/client'
import { now } from '../db/ids'
import { userPreferences } from '../db/schema'

export interface PreferenceRecord {
  colourMode: ColourMode | null
  viewModes: Record<string, ViewMode>
  facetsOpen: boolean
  tileSize: TileSize
  sidebarCollapsed: boolean
  groupModes: Record<string, string | null>
}

export function readPreferences(userId: string, db: Db = getDatabase()): PreferenceRecord {
  const row = db.select().from(userPreferences).where(eq(userPreferences.userId, userId)).get()
  return {
    colourMode: row?.colourMode && isColourMode(row.colourMode) ? row.colourMode : null,
    viewModes: cleanViewModes(row?.viewModes),
    facetsOpen: row?.facetsOpen === true,
    tileSize: row?.tileSize && isTileSize(row.tileSize) ? row.tileSize : 'regular',
    sidebarCollapsed: row?.sidebarCollapsed === true,
    groupModes: cleanGroupModes(row?.groupModes),
  }
}

export function writePreferences(
  userId: string,
  patch: {
    colourMode?: ColourMode | null
    viewModes?: Record<string, ViewMode>
    facetsOpen?: boolean
    tileSize?: TileSize
    sidebarCollapsed?: boolean
    groupModes?: Record<string, string | null>
  },
  db: Db = getDatabase(),
): PreferenceRecord {
  const current = readPreferences(userId, db)
  const next: PreferenceRecord = {
    colourMode: patch.colourMode === undefined ? current.colourMode : patch.colourMode,
    viewModes: patch.viewModes
      ? { ...current.viewModes, ...cleanViewModes(patch.viewModes) }
      : current.viewModes,
    facetsOpen: patch.facetsOpen === undefined ? current.facetsOpen : patch.facetsOpen,
    tileSize: patch.tileSize === undefined ? current.tileSize : patch.tileSize,
    sidebarCollapsed:
      patch.sidebarCollapsed === undefined ? current.sidebarCollapsed : patch.sidebarCollapsed,
    groupModes:
      patch.groupModes === undefined
        ? current.groupModes
        : { ...current.groupModes, ...cleanGroupModes(patch.groupModes) },
  }
  const timestamp = now()
  db.insert(userPreferences)
    .values({
      userId,
      colourMode: next.colourMode,
      viewModes: next.viewModes,
      facetsOpen: next.facetsOpen,
      tileSize: next.tileSize,
      sidebarCollapsed: next.sidebarCollapsed,
      groupModes: next.groupModes,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: {
        colourMode: next.colourMode,
        viewModes: next.viewModes,
        facetsOpen: next.facetsOpen,
        tileSize: next.tileSize,
        sidebarCollapsed: next.sidebarCollapsed,
        groupModes: next.groupModes,
        updatedAt: timestamp,
      },
    })
    .run()
  return next
}

function cleanGroupModes(value: unknown): Record<string, string | null> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  const modes: Record<string, string | null> = {}
  for (const [key, mode] of Object.entries(value)) {
    if (key.length === 0 || key.length > 80) {
      continue
    }
    if (mode === null) {
      modes[key] = null
      continue
    }
    if (typeof mode === 'string' && mode.length > 0 && mode.length <= 64) {
      modes[key] = mode
    }
  }
  return modes
}

function cleanViewModes(value: unknown): Record<string, ViewMode> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  const modes: Record<string, ViewMode> = {}
  for (const [key, mode] of Object.entries(value)) {
    if (typeof mode === 'string' && isViewMode(mode) && key.length > 0 && key.length <= 80) {
      modes[key] = mode
    }
  }
  return modes
}
