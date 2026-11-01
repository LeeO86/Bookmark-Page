import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import type { IncomingHttpHeaders } from 'node:http'
import { HtmlHeadScanner } from './html-head'

export interface LimitedResponse {
  status: number
  headers: IncomingHttpHeaders
  body: Buffer
  finalUrl: string
}

export async function limitedRequest(
  input: string,
  options: {
    method?: string
    headers?: Record<string, string>
    body?: string | null
    timeoutMs: number
    maxBytes: number
    htmlHeadMaxBytes?: number
    maxRedirects: number
    tlsVerify: boolean
  },
): Promise<LimitedResponse> {
  let current = parseHttpUrl(input)
  let redirects = 0
  const method = options.method ?? 'GET'
  while (true) {
    const response = await rawRequest(current, options, method)
    if (response.status >= 300 && response.status < 400 && response.headers.location) {
      if (redirects >= options.maxRedirects) {
        throw new Error('Too many redirects')
      }
      const location = Array.isArray(response.headers.location)
        ? response.headers.location[0]
        : response.headers.location
      if (!location) {
        throw new Error('Redirect is missing a location')
      }
      current = parseHttpUrl(new URL(location, current).toString())
      redirects += 1
      continue
    }
    return { ...response, finalUrl: current.toString() }
  }
}

export function parseHttpUrl(input: string): URL {
  let url: URL
  try {
    url = new URL(input)
  } catch {
    throw new Error('URL is invalid')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only http and https URLs are allowed')
  }
  if (url.username || url.password) {
    throw new Error('URLs with credentials are not allowed')
  }
  return url
}

function rawRequest(
  url: URL,
  options: {
    headers?: Record<string, string>
    body?: string | null
    timeoutMs: number
    maxBytes: number
    htmlHeadMaxBytes?: number
    tlsVerify: boolean
  },
  method: string,
): Promise<Omit<LimitedResponse, 'finalUrl'>> {
  return new Promise((resolve, reject) => {
    let settled = false
    const fail = (error: Error) => {
      if (settled) return
      settled = true
      reject(error)
    }
    const transport = url.protocol === 'https:' ? httpsRequest : httpRequest
    const req = transport(
      url,
      {
        method,
        headers: {
          'user-agent': 'Bookmark-Page',
          accept: '*/*',
          ...options.headers,
        },
        timeout: options.timeoutMs,
        rejectUnauthorized: options.tlsVerify,
      },
      (res) => {
        const chunks: Buffer[] = []
        let size = 0
        // Discovery pages may return images; those must still obey the full-image limit.
        const headLimit = /^image\//i.test(res.headers['content-type'] ?? '')
          ? undefined
          : options.htmlHeadMaxBytes
        const head = headLimit === undefined ? null : new HtmlHeadScanner()
        const finish = () => {
          if (settled) return
          settled = true
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks, size),
          })
        }
        res.on('data', (chunk: Buffer) => {
          if (settled) return
          if (head && headLimit !== undefined) {
            const prefix = chunk.subarray(0, headLimit - size)
            const end = head.push(prefix)
            const accepted = end === null ? prefix : prefix.subarray(0, end)
            chunks.push(accepted)
            size += accepted.length
            if (end !== null || size >= headLimit) {
              finish()
              res.destroy()
            }
            return
          }
          size += chunk.length
          if (size > options.maxBytes) {
            fail(new Error('Response is too large'))
            req.destroy()
            return
          }
          chunks.push(chunk)
        })
        res.on('end', finish)
        res.on('error', fail)
        res.on('close', () => {
          if (!res.complete) fail(new Error('Response was aborted'))
        })
      },
    )
    req.on('timeout', () => {
      fail(new Error('Timed out'))
      req.destroy()
    })
    req.on('error', fail)
    if (options.body) {
      req.write(options.body)
    }
    req.end()
  })
}
