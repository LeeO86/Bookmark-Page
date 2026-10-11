export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: Record<string, unknown>

  constructor(status: number, code: string, message: string, details: Record<string, unknown>) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

interface ErrorBody {
  error?: {
    code?: string
    message?: string
  } & Record<string, unknown>
}

export async function apiFetch<T>(
  url: string,
  options?: { method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'; body?: unknown },
): Promise<T> {
  const response = await fetch(url, {
    method: options?.method ?? 'GET',
    credentials: 'same-origin',
    headers: options?.body === undefined ? undefined : { 'content-type': 'application/json' },
    body: options?.body === undefined ? undefined : JSON.stringify(options.body),
  })
  const text = await response.text()
  const payload = text ? (JSON.parse(text) as ErrorBody | T) : undefined
  if (!response.ok) {
    const body = (payload as ErrorBody | undefined)?.error
    const details: Record<string, unknown> = {}
    if (body) {
      for (const [key, value] of Object.entries(body)) {
        if (key !== 'code' && key !== 'message') {
          details[key] = value
        }
      }
    }
    throw new ApiError(
      response.status,
      body?.code ?? 'request_failed',
      body?.message ?? 'Request failed',
      details,
    )
  }
  return payload as T
}
