/** Image loads need no CORS permission; bytes are never read or uploaded. */
export function probeImageTarget(input: {
  url: string
  timeoutMs: number
}): Promise<{ state: 'up' | 'down'; latencyMs: number; message: string }> {
  return new Promise((resolve) => {
    const image = new Image()
    image.referrerPolicy = 'no-referrer'
    const started = performance.now()
    const finish = (state: 'up' | 'down', message: string) => {
      clearTimeout(timer)
      image.onload = null
      image.onerror = null
      image.removeAttribute('src')
      resolve({ state, latencyMs: Math.round(performance.now() - started), message })
    }
    const timer = setTimeout(
      () => finish('down', 'Image probe timed out; browser restrictions can also prevent loading'),
      input.timeoutMs,
    )
    image.onload = () => finish('up', 'The configured image loaded')
    image.onerror = () =>
      finish(
        'down',
        'Image did not load: unavailable, non-image response, certificate or browser security restriction',
      )
    const target = new URL(input.url, location.href)
    target.searchParams.set(
      '_bp_check',
      Date.now().toString(36) + Math.random().toString(36).slice(2),
    )
    image.src = target.href
  })
}
