import { detectIcmp } from './probe'
import { runDueServerChecks } from './run'
import { refreshStaleFavicons } from '../icons/favicon'

let started = false
let faviconTick = 0

export function startMonitors(): void {
  if (started || process.env.BOOKMARK_MONITORS === '0') {
    return
  }
  started = true
  void detectIcmp()
  const timer = setInterval(() => {
    void runDueServerChecks()
    faviconTick += 1
    if (faviconTick % 720 === 0) {
      void refreshStaleFavicons()
    }
  }, 5000)
  timer.unref?.()
}
