import { detectIcmp } from './probe'
import { runDueServerChecks } from './run'
import { refreshStaleFavicons } from '../icons/favicon'

let started = false
let faviconsStarted = false

export function startMonitors(): void {
  if (!faviconsStarted && process.env.BOOKMARK_FAVICON_FETCH !== '0') {
    faviconsStarted = true
    void refreshStaleFavicons()
    const faviconTimer = setInterval(() => {
      void refreshStaleFavicons()
    }, 60_000)
    faviconTimer.unref?.()
  }
  if (started || process.env.BOOKMARK_MONITORS === '0') {
    return
  }
  started = true
  void detectIcmp()
  const timer = setInterval(() => {
    void runDueServerChecks()
  }, 5000)
  timer.unref?.()
}
