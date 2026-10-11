import { bootApplication } from '../db/boot'
import { readSettings } from '../db/settings'

export default defineNitroPlugin(async () => {
  await bootApplication(readSettings(process.env))
})
