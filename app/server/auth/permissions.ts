import { roleAtLeast, type Role } from '../../shared/roles'
import { forbidden } from '../http/errors'

export type TokenScope = 'read' | 'write' | 'admin'

export interface Actor {
  role: Role
  userId: string | null
  tokenId: string | null
  tokenScopes: TokenScope[]
  kind: 'anonymous' | 'user' | 'token'
  label: string
}

export const anonymousActor: Actor = {
  role: 'anonymous',
  userId: null,
  tokenId: null,
  tokenScopes: [],
  kind: 'anonymous',
  label: 'anonymous',
}

export function requireRole(actor: Actor, minimum: Role): void {
  if (!roleAtLeast(actor.role, minimum)) {
    throw forbidden()
  }
}

export function requireRead(actor: Actor): void {
  requireRole(actor, 'viewer')
  requireTokenScope(actor, ['read', 'write', 'admin'])
}

export function requireWrite(actor: Actor): void {
  requireRole(actor, 'editor')
  requireTokenScope(actor, ['write', 'admin'])
}

export function requireAdmin(actor: Actor): void {
  requireRole(actor, 'admin')
  requireTokenScope(actor, ['admin'])
}

function requireTokenScope(actor: Actor, allowed: readonly TokenScope[]): void {
  if (!actor.tokenId) {
    return
  }
  if (!actor.tokenScopes.some((scope) => allowed.includes(scope))) {
    throw forbidden('Token scope does not allow this request')
  }
}
