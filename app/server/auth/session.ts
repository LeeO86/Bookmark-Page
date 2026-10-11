import type { SessionConfig } from 'nuxt/server'
import { getSecretKey } from '../db/keys'

export interface AppSession {
  [key: string]: unknown
  userId?: string
  oidcState?: string
  oidcVerifier?: string
}

export function sessionConfig(): SessionConfig {
  return {
    name: 'nuxt-session',
    password: getSecretKey(),
    maxAge: 60 * 60 * 24 * 7,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.SESSION_COOKIE_SECURE === 'true',
      path: '/',
    },
  }
}
