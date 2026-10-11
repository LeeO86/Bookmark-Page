import { bootApplication } from '../db/boot'
import { readSettings } from '../db/settings'

export default defineNitroPlugin(() => {
  bootApplication(readSettings(process.env))
})
