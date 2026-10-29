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
  let blocked = false
  const onPolicyViolation = (event: SecurityPolicyViolationEvent) => {
    if (event.effectiveDirective === 'connect-src' && check.url?.startsWith(event.blockedURI))
      blocked = true
  }
  document.addEventListener('securitypolicyviolation', onPolicyViolation)
  try {
    await fetch(check.url, { mode: 'no-cors', signal: AbortSignal.timeout(check.timeoutMs) })
    return {
      state: 'up',
      latencyMs: Math.round(performance.now() - started),
      message: 'Browser probe started. Status codes are not visible.',
    }
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 0))
    return {
      state: blocked ? 'unknown' : 'down',
      latencyMs: Math.round(performance.now() - started),
      message: blocked
        ? 'Browser security policy prevented this probe'
        : 'Browser probe failed; network or certificate restrictions may be responsible',
    }
  } finally {
    document.removeEventListener('securitypolicyviolation', onPolicyViolation)
  }
}
