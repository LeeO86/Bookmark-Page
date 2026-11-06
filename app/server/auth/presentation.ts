import type { Actor } from './permissions'

/** Public identity describes this request's actor, never another user's account. */
export function publicActor(actor: Actor) {
  return {
    role: actor.role,
    label: actor.label,
    kind: actor.kind,
    userId: actor.userId,
    displayName: actor.displayName ?? actor.label,
    username: actor.username ?? (actor.kind === 'anonymous' ? null : actor.label),
    email: actor.email ?? null,
    authMethod: actor.authMethod ?? null,
    authProvider: actor.authProvider ?? null,
  }
}
