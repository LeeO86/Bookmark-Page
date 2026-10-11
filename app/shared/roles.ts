export const storedRoles = ['viewer', 'editor', 'admin'] as const
export const roles = ['anonymous', ...storedRoles] as const

export type StoredRole = (typeof storedRoles)[number]
export type Role = (typeof roles)[number]

const rank: Record<Role, number> = {
  anonymous: 0,
  viewer: 1,
  editor: 2,
  admin: 3,
}

export function roleAtLeast(actual: Role, minimum: Role): boolean {
  return rank[actual] >= rank[minimum]
}

export function highestRole(values: readonly StoredRole[]): StoredRole {
  let best: StoredRole = 'viewer'
  for (const value of values) {
    if (rank[value] > rank[best]) {
      best = value
    }
  }
  return best
}

export function isStoredRole(value: string): value is StoredRole {
  return (storedRoles as readonly string[]).includes(value)
}
