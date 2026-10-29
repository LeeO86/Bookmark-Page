import { contentSecurityPolicyFor, securityHeaders } from '../http/security'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('beforeResponse', (event, response) => {
    const pathname = event.path.split('?')[0] ?? '/'
    const html = responseBody(response)
    const headers = securityHeaders(pathname, import.meta.dev)
    if (headers['content-security-policy'] && !pathname.startsWith('/api/icons')) {
      headers['content-security-policy'] = contentSecurityPolicyFor(html, import.meta.dev)
    }
    for (const [name, value] of Object.entries(headers)) {
      if (pathname.startsWith('/api/icons') && name === 'content-security-policy') {
        continue
      }
      writeHeader(event, name, value)
    }
  })
})

function responseBody(response: unknown): string {
  if (!response || typeof response !== 'object' || !('body' in response)) {
    return ''
  }
  return typeof response.body === 'string' ? response.body : ''
}

function writeHeader(
  event: { node?: { res?: NodeResponse }; res?: NodeResponse & WebResponse },
  name: string,
  value: string,
) {
  event.res?.headers?.set?.(name, value)
  event.res?.setHeader?.(name, value)
  event.node?.res?.setHeader?.(name, value)
}

interface NodeResponse {
  setHeader?: (name: string, value: string) => void
}

interface WebResponse {
  headers?: { set?: (name: string, value: string) => void }
}
