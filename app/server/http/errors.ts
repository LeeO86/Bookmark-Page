export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    readonly code: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message)
  }
}

export function badRequest(message: string, code = 'bad_request'): HttpError {
  return new HttpError(400, message, code)
}

export function unauthorized(message = 'Authentication required'): HttpError {
  return new HttpError(401, message, 'unauthorized')
}

export function forbidden(message = 'Forbidden'): HttpError {
  return new HttpError(403, message, 'forbidden')
}

export function notFound(message = 'Not found'): HttpError {
  return new HttpError(404, message, 'not_found')
}

export function tooManyRequests(message: string): HttpError {
  return new HttpError(429, message, 'rate_limited')
}

export function confirmAction(name: string, method: string): HttpError {
  return new HttpError(409, 'Confirm this action before it runs', 'confirm_action', {
    action: { name, method },
  })
}

export function confirmDuplicate(warnings: unknown): HttpError {
  return new HttpError(
    409,
    'Confirm the duplicate name or host before saving',
    'confirm_duplicate',
    { warnings },
  )
}
