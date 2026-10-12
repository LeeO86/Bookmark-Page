const buckets = new Map<string, number[]>()

export function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): boolean {
  const recent = (buckets.get(key) ?? []).filter((time) => now - time < windowMs)
  if (recent.length >= limit) {
    buckets.set(key, recent)
    return false
  }
  recent.push(now)
  buckets.set(key, recent)
  return true
}

export function resetRateLimits(): void {
  buckets.clear()
}

export function clearRateLimit(key: string): void {
  buckets.delete(key)
}
