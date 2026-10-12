import { defineEventHandler, setResponseStatus } from 'nuxt/server'
import { getDatabase, type AppDatabase } from '../db/client'
import { handleHealth } from '../db/health'

export default defineEventHandler((event) => {
  let database: AppDatabase | undefined
  try {
    database = getDatabase()
  } catch {
    database = undefined
  }
  const result = handleHealth(database)
  setResponseStatus(event, result.statusCode)
  return result.body
})
