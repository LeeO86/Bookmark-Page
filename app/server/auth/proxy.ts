export function normalizeIp(ip: string): string {
  const lower = ip.toLowerCase()
  if (lower.startsWith('::ffff:')) {
    const mapped = lower.slice('::ffff:'.length)
    if (ipv4ToInt(mapped) !== null) {
      return mapped
    }
  }
  return lower
}

export function ipInCidrs(ip: string, cidrs: readonly string[]): boolean {
  const normalized = normalizeIp(ip)
  return cidrs.some((cidr) => ipInCidr(normalized, cidr.trim()))
}

function ipInCidr(ip: string, cidr: string): boolean {
  const slash = cidr.indexOf('/')
  const base = slash === -1 ? cidr : cidr.slice(0, slash)
  const prefixText = slash === -1 ? undefined : cidr.slice(slash + 1)
  const address = ipv4ToInt(normalizeIp(ip))
  const network = ipv4ToInt(base)
  if (address !== null && network !== null) {
    const prefix = prefixText === undefined ? 32 : Number(prefixText)
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
      return false
    }
    if (prefix === 0) {
      return true
    }
    const mask = prefix === 32 ? 0xffff_ffff : (0xffff_ffff << (32 - prefix)) >>> 0
    return (address & mask) === (network & mask)
  }
  return ipv6InCidr(normalizeIp(ip), base, prefixText)
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.')
  if (parts.length !== 4) {
    return null
  }
  let value = 0
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) {
      return null
    }
    const number = Number(part)
    if (number > 255) {
      return null
    }
    value = ((value << 8) + number) >>> 0
  }
  return value
}

function ipv6InCidr(ip: string, base: string, prefixText: string | undefined): boolean {
  const address = ipv6Parts(ip)
  const network = ipv6Parts(base)
  if (!address || !network) {
    return false
  }
  const prefix = prefixText === undefined ? 128 : Number(prefixText)
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 128) {
    return false
  }
  let remaining = prefix
  for (let index = 0; index < 8; index += 1) {
    const bits = Math.min(16, remaining)
    if (bits <= 0) {
      return true
    }
    const mask = bits === 16 ? 0xffff : (0xffff << (16 - bits)) & 0xffff
    const addressPart = address[index] ?? 0
    const networkPart = network[index] ?? 0
    if ((addressPart & mask) !== (networkPart & mask)) {
      return false
    }
    remaining -= bits
  }
  return true
}

function ipv6Parts(ip: string): number[] | null {
  const halves = ip.split('::')
  if (halves.length > 2) {
    return null
  }
  const left = halves[0] ? halves[0].split(':') : []
  const right = halves[1] ? halves[1].split(':') : []
  if (halves.length === 1 && left.length !== 8) {
    return null
  }
  const missing = 8 - (left.length + right.length)
  if (halves.length === 2 && missing < 0) {
    return null
  }
  const groups =
    halves.length === 2 ? [...left, ...Array.from({ length: missing }, () => '0'), ...right] : left
  if (groups.length !== 8) {
    return null
  }
  const parts: number[] = []
  for (const group of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(group)) {
      return null
    }
    parts.push(Number.parseInt(group, 16))
  }
  return parts
}
