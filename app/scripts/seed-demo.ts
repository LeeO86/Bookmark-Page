import { join } from 'node:path'
import { bootApplication } from '../server/db/boot'
import { closeDatabase } from '../server/db/client'
import { readSettings } from '../server/db/settings'
import { seedDemo } from '../server/demo/seed'

const demoKey = 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc='

if (!process.env.BOOKMARK_SECRET_KEY) {
  process.env.BOOKMARK_SECRET_KEY = demoKey
  console.log(
    'Using the local demo secret. Set BOOKMARK_SECRET_KEY before seeding a real database.',
  )
}
if (!process.env.DATABASE_PATH) {
  process.env.DATABASE_PATH = join(process.cwd(), '..', 'data', 'bookmark-demo.db')
}
process.env.BOOKMARK_FAVICON_FETCH = '0'
process.env.BOOKMARK_MONITORS = '0'
process.env.ADMIN_USERNAME ||= 'admin'
process.env.ADMIN_PASSWORD ||= 'admin-pass-1'

const settings = readSettings(process.env)
await bootApplication(settings)
const seeded = seedDemo()
closeDatabase()
console.log(
  `Seeded ${seeded.entries} entries and ${seeded.filters} tabs in ${settings.databasePath}`,
)
console.log(`Sign in as ${process.env.ADMIN_USERNAME} if this database had no users yet.`)
