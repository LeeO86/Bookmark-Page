import {
  defineEventHandler,
  getRequestHeader,
  getRouterParam,
  setResponseStatus,
} from 'nuxt/server'
import { resolveActor } from '../../../../auth/resolve'
import { iconEtag, readPublicIcon } from '../../../../icons/files'

export default defineEventHandler(async (event) => {
  const kind = getRouterParam(event, 'kind') ?? ''
  const name = getRouterParam(event, 'name') ?? ''
  const actor = await resolveActor(event)
  const icon = readPublicIcon(actor, kind, decodeURIComponent(name))
  if (!icon) {
    setResponseStatus(event, 404)
    return { error: { code: 'not_found', message: 'Icon not found' } }
  }
  const etag = iconEtag(icon.bytes)
  event.res.headers.set('etag', etag)
  if (getRequestHeader(event, 'if-none-match') === etag) {
    setResponseStatus(event, 304)
    return ''
  }
  return new Response(new Uint8Array(icon.bytes), {
    headers: {
      'content-type': icon.mediaType,
      etag,
      'cache-control': 'public, max-age=86400',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'",
    },
  })
})
