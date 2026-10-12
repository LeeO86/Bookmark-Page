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
}

export function readPreferences(userId: string, db: Db = getDatabase()): PreferenceRecord {
  const row = db.select().from(userPreferences).where(eq(userPreferences.userId, userId)).get()
  return {
    colourMode: row?.colourMode && isColourMode(row.colourMode) ? row.colourMode : null,
    viewModes: cleanViewModes(row?.viewModes),
    facetsOpen: row?.facetsOpen === true,
    tileSize: row?.tileSize && isTileSize(row.tileSize) ? row.tileSize : 'regular',
  }
}

export function writePreferences(
  userId: string,
  patch: {
    colourMode?: ColourMode | null
    viewModes?: Record<string, ViewMode>
    facetsOpen?: boolean
    tileSize?: TileSize
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
  }
  const timestamp = now()
  db.insert(userPreferences)
    .values({
      userId,
      colourMode: next.colourMode,
      viewModes: next.viewModes,
      facetsOpen: next.facetsOpen,
      tileSize: next.tileSize,
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
        updatedAt: timestamp,
      },
    })
    .run()
  return next
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
