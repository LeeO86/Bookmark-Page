import { createError, defineEventHandler, getCookie, getRequestURL, setCookie } from 'nuxt/server'
import { resolveActor } from '../auth/resolve'
import { readPreferences } from '../services/preferences'
import { publicSettings } from '../services/settings'
import { initialPortal } from '../services/portal'
import { HttpError } from '../http/errors'
import {
  isColourMode,
  isViewMode,
  themeStylesheet,
  type ColourMode,
  type ViewMode,
} from '../../shared/theme'

export default defineEventHandler(async (event) => {
  const requestUrl = getRequestURL(event)
  const pathname = requestUrl.pathname
  if (
    pathname.startsWith('/api') ||
    pathname.startsWith('/_') ||
    pathname.startsWith('/metrics') ||
    pathname.includes('.')
  ) {
    return
  }
  event.res.headers.set('cache-control', 'private, no-store')
  event.res.headers.append('vary', 'Cookie, Authorization')
  try {
    const settings = publicSettings()
    const cookieMode = getCookie(event, 'bp-color-mode')
    let mode: ColourMode = settings.defaultColourMode
    if (cookieMode && isColourMode(cookieMode)) {
      mode = cookieMode
    }
    const actor = await resolveActor(event)
    const stored = actor.userId ? readPreferences(actor.userId) : null
    if (stored?.colourMode) {
      mode = stored.colourMode
    }
    const viewModes = stored?.viewModes ?? readViewCookie(getCookie(event, 'bp-theme'))
    const secure = process.env.SESSION_COOKIE_SECURE === 'true'
    const cookie = { path: '/', sameSite: 'lax' as const, secure, httpOnly: false }
    setCookie(event, 'bp-color-mode', mode, cookie)
    setCookie(
      event,
      'bp-theme',
      JSON.stringify({
        accent: settings.accentColour,
        neutral: settings.neutralPalette,
        preset: settings.accentPreset,
        viewModes,
      }),
      cookie,
    )
    event.context.bookmarkTheme = {
      css: themeStylesheet(
        settings.accentColour,
        settings.neutralPalette,
        settings.accentPreset,
        settings.background,
      ),
      mode,
      viewModes,
    }
    event.context.bookmarkBranding = {
      settings,
      actor: { role: actor.role, label: actor.label, kind: actor.kind, userId: actor.userId },
    }
    if (pathname === '/') {
      const query = requestUrl.searchParams
      const parameter = (name: string) =>
        query.getAll(name).length === 1 ? (query.get(name) ?? '') : ''
      event.context.bookmarkPortal = initialPortal(
        actor,
        {
          q: parameter('q'),
          tab: parameter('tab'),
        },
        settings,
        stored ?? {
          colourMode: null,
          viewModes,
          facetsOpen: getCookie(event, 'bp-facets') === '1',
          sidebarCollapsed: getCookie(event, 'bp-sidebar') === '1',
          tileSize: 'regular',
          groupModes: {},
        },
      )
    }
  } catch (error) {
    throw createError({
      status: error instanceof HttpError ? error.statusCode : 500,
      message: error instanceof HttpError ? error.message : 'The portal could not be loaded',
    })
  }
})

function readViewCookie(value: string | undefined): Record<string, ViewMode> {
  if (!value) {
    return {}
  }
  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || !('viewModes' in parsed)) {
      return {}
    }
    const modes = parsed.viewModes
    if (!modes || typeof modes !== 'object' || Array.isArray(modes)) {
      return {}
    }
    const result: Record<string, ViewMode> = {}
    for (const [key, mode] of Object.entries(modes)) {
      if (typeof mode === 'string' && isViewMode(mode)) {
        result[key] = mode
      }
    }
    return result
  } catch {
    return {}
  }
}
