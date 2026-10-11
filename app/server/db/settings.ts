import { join } from 'node:path'

export interface AppSettings {
  secretKey: string | undefined
  databasePath: string
  migrationsFolder: string
}

const defaultDatabasePath = '/data/bookmark.db'

export function readSettings(env: NodeJS.ProcessEnv, cwd = process.cwd()): AppSettings {
  const databasePath = env.DATABASE_PATH?.trim() || defaultDatabasePath
  const migrationsFolder = env.MIGRATIONS_FOLDER?.trim() || join(cwd, 'drizzle')

  return {
    secretKey: env.BOOKMARK_SECRET_KEY,
    databasePath,
    migrationsFolder,
  }
}

export function assertSecretKey(value: string | undefined): void {
  if (value === undefined || value.trim() === '') {
    throw new Error('BOOKMARK_SECRET_KEY is required')
  }
}
