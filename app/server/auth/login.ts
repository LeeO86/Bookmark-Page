import { eq } from 'drizzle-orm'
import { getRuntimeEnv } from '../config/env'
import { getDatabase } from '../db/client'
import { users } from '../db/schema'
import { forbidden, HttpError, unauthorized } from '../http/errors'
import { verifyPassword } from './passwords'
import { clearRateLimit, consumeRateLimit } from './rate-limit'

const windowMs = 15 * 60 * 1000
const failureLimit = 10

export async function authenticateLocal(
  username: string,
  password: string,
  ip: string,
): Promise<{
  id: string
  username: string
  role: 'viewer' | 'editor' | 'admin'
}> {
  const key = `login:${ip}`
  if (!consumeRateLimit(key, failureLimit, windowMs)) {
    throw new HttpError(429, 'Too many login attempts', 'rate_limited')
  }
  const user = getDatabase().select().from(users).where(eq(users.username, username)).get()
  const matches = Boolean(user?.passwordHash && (await verifyPassword(user.passwordHash, password)))
  if (!user || !matches) {
    throw unauthorized('Invalid username or password')
  }
  clearRateLimit(key)
  if (!getRuntimeEnv().localLoginEnabled && !user.breakGlass) {
    throw forbidden('Local login is disabled')
  }
  return { id: user.id, username: user.username, role: user.role }
}
