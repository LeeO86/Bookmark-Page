import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../../app', import.meta.url))
const palette =
  /\b(?:bg|text|border|ring|outline|fill|stroke|from|to|via|decoration|divide|placeholder)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)(?:-\d{2,3})?(?:\/\d{1,3})?\b/
const hex = /#[0-9a-fA-F]{3,8}\b/
const functional = /\b(?:hsl|rgb|rgba|hsla)\(/

describe('portal colours', () => {
  it('uses semantic tokens instead of raw palette classes or hex colours', () => {
    const offenders: string[] = []
    for (const file of walk(root)) {
      const text = readFileSync(file, 'utf8')
      const lines = text.split('\n')
      lines.forEach((line, index) => {
        if (palette.test(line) || hex.test(line) || functional.test(line)) {
          offenders.push(`${file}:${index + 1}:${line.trim()}`)
        }
      })
    }
    expect(offenders).toEqual([])
  })
})

function walk(directory: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) {
      files.push(...walk(path))
      continue
    }
    if (path.endsWith('.vue') || path.endsWith('.css') || path.endsWith('.ts')) {
      files.push(path)
    }
  }
  return files
}
