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
  const secretKeys = new Set(
    db
      .select()
      .from(fieldDefinitions)
      .all()
      .filter((field) => field.type === 'secret' || !roleAtLeast(role, field.minRoleToView))
      .map((field) => field.key),
  )
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
      diff: redact(row.diff, secretKeys),
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
