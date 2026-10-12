import { getRequestHeader, setResponseStatus } from 'nuxt/server'
import type { RequestEvent } from 'nuxt/schema'
import { ZodError } from 'zod'
import { resolveActor } from '../auth/resolve'
import type { Actor } from '../auth/permissions'
import { HttpError } from './errors'

export async function run(
  event: RequestEvent,
  handler: (actor: Actor) => Promise<unknown> | unknown,
): Promise<unknown> {
  try {
    assertCsrf(event)
    const actor = await resolveActor(event)
    return await handler(actor)
  } catch (error) {
    if (error instanceof HttpError) {
      setResponseStatus(event, error.statusCode)
      return { error: { code: error.code, message: error.message, ...error.details } }
    }
    if (error instanceof ZodError) {
      setResponseStatus(event, 400)
      return {
        error: {
          code: 'validation_error',
          message: 'Request validation failed',
          issues: error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
        },
      }
    }
    console.error(error instanceof Error ? error.name : 'Request failed')
    setResponseStatus(event, 500)
    return { error: { code: 'internal_error', message: 'Internal error' } }
  }
}

function assertCsrf(event: RequestEvent): void {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(event.req.method)) {
    return
  }
  const authorization = getRequestHeader(event, 'authorization')
  if (authorization?.toLowerCase().startsWith('bearer ')) {
    return
  }
  const origin = getRequestHeader(event, 'origin')
  if (!origin) {
    throw new HttpError(403, 'Origin header is required', 'csrf')
  }
  let originHost: string
  try {
    originHost = new URL(origin).host
  } catch {
    throw new HttpError(403, 'Origin header is invalid', 'csrf')
  }
  const host = getRequestHeader(event, 'host')
  if (!host || originHost.toLowerCase() !== host.toLowerCase()) {
    throw new HttpError(403, 'Origin is not allowed', 'csrf')
  }
}
