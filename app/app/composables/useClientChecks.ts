import { apiFetch } from '../utils/api'

interface LeasedCheck {
  id: string
  leaseId: string
  name: string
  url: string | null
  timeoutMs: number
  note: string | null
}

export function useClientChecks() {
  const portal = usePortal()
  let timer: ReturnType<typeof setInterval> | undefined

  function start() {
    if (!import.meta.client || timer) {
      return
    }
    void tick()
    timer = setInterval(() => {
      void tick()
    }, 30_000)
  }

  function stop() {
    if (timer) {
      clearInterval(timer)
    }
    timer = undefined
  }

  async function tick() {
    if (portal.actor.value.role === 'anonymous' && !portal.settings.value?.clientChecksAnonymous) {
      return
    }
    try {
      const body = await apiFetch<{ checks: LeasedCheck[] }>('/api/v1/checks/lease', {
        method: 'POST',
        body: { limit: 5 },
      })
      for (const check of body.checks) {
        const result = await probe(check)
        await apiFetch(`/api/v1/checks/${check.id}/report`, {
          method: 'POST',
          body: { leaseId: check.leaseId, ...result },
        })
      }
    } catch {
      // A failed lease leaves the server checks for the next pass.
    }
  }

  return { start, stop }
}

async function probe(check: LeasedCheck): Promise<{
  state: 'up' | 'down' | 'unknown'
  latencyMs: number | null
  message: string
}> {
  if (!check.url) {
    return {
      state: 'unknown',
      latencyMs: null,
      message: check.note ?? 'Browser check has no target',
    }
  }
  if (location.protocol === 'https:' && check.url.startsWith('http:')) {
    return {
      state: 'unknown',
      latencyMs: null,
      message: 'An HTTPS page cannot probe an http:// target',
    }
  }
  const started = performance.now()
  try {
    await fetch(check.url, { mode: 'no-cors', signal: AbortSignal.timeout(check.timeoutMs) })
    return {
      state: 'up',
      latencyMs: Math.round(performance.now() - started),
      message: 'Browser probe started. Status codes are not visible.',
    }
  } catch {
    return {
      state: 'down',
      latencyMs: Math.round(performance.now() - started),
      message: 'Browser probe failed',
    }
  }
}
