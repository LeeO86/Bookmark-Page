import { getCookie, getSession, setCookie } from 'nuxt/server'
import { sessionConfig, type AppSession } from '../auth/session'
import { readPreferences } from '../services/preferences'
import { publicSettings } from '../services/settings'
import {
  isColourMode,
  isViewMode,
  themeStylesheet,
  type ColourMode,
  type ViewMode,
} from '../../shared/theme'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', async (event) => {
    const pathname = event.path.split('?')[0] ?? '/'
    if (
      pathname.startsWith('/api') ||
      pathname.startsWith('/_') ||
      pathname.startsWith('/metrics') ||
      pathname.includes('.')
    ) {
      return
    }
    try {
      const current = event as unknown as Parameters<typeof getCookie>[0]
      const settings = publicSettings()
      const cookieMode = getCookie(current, 'bp-color-mode')
      let mode: ColourMode = settings.defaultColourMode
      if (cookieMode && isColourMode(cookieMode)) {
        mode = cookieMode
      }
      const session = await getSession<AppSession>(
        current as unknown as Parameters<typeof getSession>[0],
        sessionConfig(),
      )
      const stored = session.data.userId ? readPreferences(session.data.userId) : null
      if (stored?.colourMode) {
        mode = stored.colourMode
      }
      const viewModes = stored?.viewModes ?? readViewCookie(getCookie(current, 'bp-theme'))
      const secure = process.env.SESSION_COOKIE_SECURE === 'true'
      const cookie = { path: '/', sameSite: 'lax' as const, secure, httpOnly: false }
      const response = current as unknown as Parameters<typeof setCookie>[0]
      setCookie(response, 'bp-color-mode', mode, cookie)
      setCookie(
        response,
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
    } catch {
      event.context.bookmarkTheme = {
        css: themeStylesheet('#0f766e', 'slate'),
        mode: 'system' as ColourMode,
        viewModes: {},
      }
    }
  })
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
