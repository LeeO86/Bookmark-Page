import { decodeDataImage } from '../../shared/data-image'

export interface IconCandidate {
  href: string
  rel: string
  size: number
  svg: boolean
  manifest: boolean
}

const linkPattern = /<link\b([^>]*)>/gi
const attributePattern = /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi

export function iconCandidates(
  html: string,
  baseUrl: string,
  maxBytes = 512 * 1024,
): IconCandidate[] {
  const candidates: IconCandidate[] = []
  for (const match of html.matchAll(linkPattern)) {
    const attrs = attributes(match[1] ?? '')
    const rel = (attrs.rel ?? '').toLowerCase()
    const href = attrs.href
    if (!href) {
      continue
    }
    const interesting =
      rel
        .split(/\s+/)
        .some((token) =>
          [
            'icon',
            'shortcut',
            'apple-touch-icon',
            'apple-touch-icon-precomposed',
            'manifest',
          ].includes(token),
        ) || rel === 'shortcut icon'
    if (!interesting && !rel.includes('icon') && rel !== 'manifest') {
      continue
    }
    let absolute: string
    try {
      absolute = new URL(href, baseUrl).toString()
    } catch {
      continue
    }
    let type = (attrs.type ?? '').toLowerCase()
    if (/^data:/i.test(absolute)) {
      try {
        type = decodeDataImage(absolute, maxBytes).mediaType
      } catch {
        continue
      }
    }
    const svg = /^data:/i.test(absolute)
      ? type === 'image/svg+xml'
      : type.includes('svg') || absolute.toLowerCase().split('?')[0]?.endsWith('.svg') === true
    candidates.push({
      href: absolute,
      rel,
      size: iconSize(attrs.sizes, rel),
      svg,
      manifest: rel.split(/\s+/).includes('manifest'),
    })
  }
  return candidates
}

export function pickIcon(candidates: readonly IconCandidate[]): IconCandidate | null {
  return orderedIcons(candidates)[0] ?? null
}

export function orderedIcons(candidates: readonly IconCandidate[]): IconCandidate[] {
  const rank = (candidate: IconCandidate) =>
    (candidate.rel.split(/\s+/).includes('mask-icon') ? 10_000_000 : 0) +
    (candidate.svg ? -1_000_000 : 0) -
    candidate.size
  return [
    ...new Map(
      candidates
        .filter((candidate) => !candidate.manifest)
        .map((candidate) => [candidate.href, candidate]),
    ).values(),
  ].sort((left, right) => rank(left) - rank(right))
}

export function manifestHref(candidates: readonly IconCandidate[]): string | null {
  return candidates.find((candidate) => candidate.manifest)?.href ?? null
}

export function manifestIcons(
  manifest: unknown,
  baseUrl: string,
  maxBytes = 512 * 1024,
): IconCandidate[] {
  if (!manifest || typeof manifest !== 'object' || !('icons' in manifest)) {
    return []
  }
  const icons = manifest.icons
  if (!Array.isArray(icons)) {
    return []
  }
  const candidates: IconCandidate[] = []
  for (const icon of icons) {
    if (!icon || typeof icon !== 'object' || !('src' in icon) || typeof icon.src !== 'string') {
      continue
    }
    try {
      const sizes = 'sizes' in icon && typeof icon.sizes === 'string' ? icon.sizes : ''
      let type = 'type' in icon && typeof icon.type === 'string' ? icon.type : ''
      const href = new URL(icon.src, baseUrl).toString()
      if (/^data:/i.test(href)) type = decodeDataImage(href, maxBytes).mediaType
      candidates.push({
        href,
        rel: 'manifest',
        size: iconSize(sizes, ''),
        svg: /^data:/i.test(href)
          ? type === 'image/svg+xml'
          : type.includes('svg') || href.toLowerCase().split('?')[0]?.endsWith('.svg') === true,
        manifest: false,
      })
    } catch {
      // Skip a bad manifest icon.
    }
  }
  return candidates
}

function attributes(source: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const match of source.matchAll(attributePattern)) {
    const name = match[1]?.toLowerCase()
    const value = match[2] ?? match[3] ?? match[4] ?? ''
    if (name) {
      result[name] = value
    }
  }
  return result
}

function iconSize(sizes: string | undefined, rel: string): number {
  const match = sizes?.match(/(\d+)\s*x\s*(\d+)/i)
  const width = match?.[1] ? Number(match[1]) : 0
  const height = match?.[2] ? Number(match[2]) : 0
  if (width > 0 && height > 0) {
    return Math.max(width, height)
  }
  if (rel.includes('apple-touch-icon')) {
    return 180
  }
  return 16
}
