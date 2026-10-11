import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const namePattern = /^[a-z0-9-]+$/
let cachedNames: string[] | null = null

export function lucideIconsDir(): string {
  const candidates = [
    process.env.LUCIDE_ICONS_DIR,
    join(process.cwd(), 'node_modules/lucide-static/icons'),
    join(process.cwd(), '../node_modules/lucide-static/icons'),
    '/app/node_modules/lucide-static/icons',
  ]
  for (const candidate of candidates) {
    if (!candidate) {
      continue
    }
    try {
      readdirSync(candidate)
      return candidate
    } catch {
      // Try the next location.
    }
  }
  throw new Error('Lucide icons are not installed')
}

export function isLucideName(name: string): boolean {
  return namePattern.test(name)
}

export function lucideNames(): string[] {
  if (!cachedNames) {
    cachedNames = readdirSync(lucideIconsDir())
      .filter((file) => file.endsWith('.svg'))
      .map((file) => file.slice(0, -'.svg'.length))
      .sort()
  }
  return cachedNames
}

export function searchLucide(query: string, limit = 40): string[] {
  const needle = query.trim().toLowerCase()
  const names = lucideNames()
  const matched = needle ? names.filter((name) => name.includes(needle)) : names.slice(0, limit)
  return matched.slice(0, limit)
}

export function readLucideSvg(name: string): string | null {
  if (!isLucideName(name) || !lucideNames().includes(name)) {
    return null
  }
  return readFileSync(join(lucideIconsDir(), `${name}.svg`), 'utf8')
}
