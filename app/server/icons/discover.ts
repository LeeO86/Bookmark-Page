export interface IconCandidate {
  href: string
  rel: string
  size: number
  svg: boolean
  manifest: boolean
}

const linkPattern = /<link\b([^>]*)>/gi
const attributePattern = /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi

export function iconCandidates(html: string, baseUrl: string): IconCandidate[] {
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
    const type = (attrs.type ?? '').toLowerCase()
    const svg =
      type.includes('svg') || absolute.toLowerCase().split('?')[0]?.endsWith('.svg') === true
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
  const icons = candidates.filter((candidate) => !candidate.manifest)
  const svg = icons.find((candidate) => candidate.svg)
  if (svg) {
    return svg
  }
  const rasters = [...icons].sort((left, right) => right.size - left.size)
  return rasters[0] ?? null
}

export function manifestHref(candidates: readonly IconCandidate[]): string | null {
  return candidates.find((candidate) => candidate.manifest)?.href ?? null
}

export function manifestIcons(manifest: unknown, baseUrl: string): IconCandidate[] {
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
      const type = 'type' in icon && typeof icon.type === 'string' ? icon.type : ''
      const href = new URL(icon.src, baseUrl).toString()
      candidates.push({
        href,
        rel: 'manifest',
        size: iconSize(sizes, ''),
        svg: type.includes('svg') || href.toLowerCase().includes('.svg'),
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
