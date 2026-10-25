import {
  closeDatabase,
  migrateDatabase,
  openDatabase,
  setDatabase,
  type AppDatabase,
} from './client'
import { bootstrap } from '../services/bootstrap'
import { installSecretKey } from './keys'
import type { AppSettings } from './settings'

export async function bootApplication(settings: AppSettings): Promise<void> {
  let database: AppDatabase | undefined
  try {
    installSecretKey(settings.secretKey)
    closeDatabase()
    database = openDatabase(settings.databasePath)
    migrateDatabase(database, settings.migrationsFolder)
    setDatabase(database)
    database = undefined
    await bootstrap()
  } catch (error) {
    database?.$client.close()
    const message = error instanceof Error ? error.message : 'Startup failed'
    console.error(message)
    process.exit(1)
  }
}
