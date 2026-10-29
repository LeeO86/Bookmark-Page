import { lt } from 'drizzle-orm'
import type { Actor } from '../auth/permissions'
import { getDatabase, type Db } from '../db/client'
import { newId, now } from '../db/ids'
import { auditLog, fieldDefinitions } from '../db/schema'
import { roleAtLeast, type Role } from '../../shared/roles'
import { redact } from './redact'
import { auditRetentionDays } from './settings'

export function writeAudit(
  actor:
    | Pick<Actor, 'userId' | 'tokenId' | 'kind' | 'label'>
    | { kind: 'system'; userId: null; tokenId: null; label: string },
  action: string,
  targetType: string,
  targetId: string | null,
  diff: Record<string, unknown>,
  db: Db = getDatabase(),
): void {
  const secretKeys = new Set(
    db
      .select()
      .from(fieldDefinitions)
      .all()
      .filter((field) => field.type === 'secret')
      .map((field) => field.key),
  )
  const timestamp = now()
  db.insert(auditLog)
    .values({
      id: newId(),
      actorId: actor.userId,
      actorType: actor.kind === 'token' ? 'token' : actor.kind === 'user' ? 'user' : 'system',
      actorLabel: actor.label,
      action,
      targetType,
      targetId,
      diff: redact(diff, secretKeys) as Record<string, unknown>,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .run()
}

export function listAudit(role: Role, db: Db = getDatabase()) {
  return db
    .select()
    .from(auditLog)
    .all()
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .slice(0, 500)
    .map((row) => ({
      id: row.id,
      actorId: row.actorId,
      actorType: row.actorType,
      actorLabel: row.actorLabel,
      action: row.action,
      targetType: row.targetType,
      targetId: row.targetId,
      diff: visibleAuditDiff(row.diff, role, db),
      createdAt: row.createdAt.toISOString(),
    }))
}

export function purgeAudit(db: Db = getDatabase()): void {
  const days = auditRetentionDays(db)
  if (days <= 0) {
    return
  }
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  db.delete(auditLog).where(lt(auditLog.createdAt, cutoff)).run()
}

export function visibleAuditDiff(value: unknown, role: Role, db: Db = getDatabase()): unknown {
  const visible = new Set(
    db
      .select()
      .from(fieldDefinitions)
      .all()
      .filter((field) => field.type !== 'secret' && roleAtLeast(role, field.minRoleToView))
      .map((field) => field.key),
  )
  const visit = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(visit)
    if (!item || typeof item !== 'object') return item
    const out: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(item)) {
      if (key === 'fields' && Array.isArray(child)) {
        out[key] = child
          .filter(
            (field) =>
              field &&
              typeof field === 'object' &&
              typeof field.key === 'string' &&
              visible.has(field.key),
          )
          .map(visit)
      } else if (key === 'actions' && Array.isArray(child)) {
        out[key] = child
          .filter(
            (action) =>
              action && typeof action === 'object' && roleAtLeast(role, action.minRole ?? 'admin'),
          )
          .map(visit)
      } else if (key === 'paths' && Array.isArray(child)) {
        out[key] = child.filter(
          (path) =>
            typeof path !== 'string' || !path.startsWith('fields:') || visible.has(path.slice(7)),
        )
      } else out[key] = visit(child)
    }
    return out
  }
  return redact(visit(value))
}
