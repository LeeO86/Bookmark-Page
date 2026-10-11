import {
  closeDatabase,
  migrateDatabase,
  openDatabase,
  setDatabase,
  type AppDatabase,
} from './client'
import { assertSecretKey, type AppSettings } from './settings'

export function bootApplication(settings: AppSettings): void {
  let database: AppDatabase | undefined
  try {
    assertSecretKey(settings.secretKey)
    closeDatabase()
    database = openDatabase(settings.databasePath)
    migrateDatabase(database, settings.migrationsFolder)
    setDatabase(database)
    database = undefined
  } catch (error) {
    database?.$client.close()
    const message = error instanceof Error ? error.message : 'Startup failed'
    console.error(message)
    process.exit(1)
  }
}
