import type { ColourMode, ViewMode } from '#shared/theme'

interface BookmarkTheme {
  css: string
  mode: ColourMode
  viewModes: Record<string, ViewMode>
}

export default defineNuxtPlugin(() => {
  const css = useState('bp-theme-css', () => '')
  const mode = useState<ColourMode>('bp-colour-mode', () => 'system')
  const viewModes = useState<Record<string, ViewMode>>('bp-view-modes', () => ({}))
  if (import.meta.server) {
    const event = useRequestEvent()
    const theme = event?.context.bookmarkTheme as BookmarkTheme | undefined
    if (theme) {
      css.value = theme.css
      mode.value = theme.mode
      viewModes.value = theme.viewModes
    }
  }
  const colorMode = useColorMode()
  colorMode.preference = mode.value
})
