import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'

export type AppDatabase = BetterSQLite3Database & {
  $client: Database.Database
}

let current: AppDatabase | undefined

export type Db = Pick<AppDatabase, 'select' | 'insert' | 'update' | 'delete'>

export function openDatabase(databasePath: string): AppDatabase {
  mkdirSync(dirname(databasePath), { recursive: true })
  const sqlite = new Database(databasePath)
  sqlite.pragma('foreign_keys = ON')
  const journalMode: unknown = sqlite.pragma('journal_mode = WAL', { simple: true })
  if (journalMode !== 'wal') {
    sqlite.close()
    throw new Error(`SQLite journal mode is ${String(journalMode)}`)
  }
  return drizzle(sqlite)
}

export function transaction<T>(fn: (db: Db) => T): T {
  return getDatabase().transaction((tx) => fn(tx))
}

export function migrateDatabase(database: AppDatabase, migrationsFolder: string): void {
  migrate(database, { migrationsFolder })
}

export function setDatabase(database: AppDatabase): void {
  current = database
}

export function getDatabase(): AppDatabase {
  if (!current) {
    throw new Error('Database is not initialised')
  }
  return current
}

export function closeDatabase(): void {
  if (!current) {
    return
  }
  const database = current
  current = undefined
  try {
    database.$client.close()
  } catch {
    // The handle may already be closed when a health check is simulating failure.
  }
}
