import { describe, expect, it } from 'vitest'
import {
  accentPresets,
  bookmarkGlyph,
  contrastRatio,
  contrastingForeground,
  neutralPalettes,
  statusColours,
  themeStylesheet,
  type AccentPreset,
} from '../../shared/theme'

describe('theme contrast', () => {
  it('keeps vivid presets readable on the wash and on white controls', () => {
    for (const [name, preset] of Object.entries(accentPresets) as Array<
      [Exclude<AccentPreset, 'custom'>, (typeof accentPresets)[Exclude<AccentPreset, 'custom'>]]
    >) {
      for (const palette of neutralPalettes) {
        const css = themeStylesheet(preset.seed, palette, name, 'gradient')
        const primary = variable(css, '--ui-primary')
        const swatch = variable(css, '--ui-color-primary-500')
        const wash = variable(css, '--ui-color-primary-100')
        const paper = variable(css, '--ui-color-neutral-50')
        const night = variable(css, '--ui-color-primary-950')
        const ink = variable(css, '--ui-color-neutral-900')
        const nightPaper = variable(css, '--ui-color-neutral-950')
        const lightAccent = variable(block(css, false), '--bp-accent-text')
        const darkAccent = variable(block(css, true), '--bp-accent-text')
        expect(swatch).toBeTruthy()
        expect(contrastRatio(primary, '#ffffff')).toBeGreaterThanOrEqual(4.5)
        expect(contrastRatio(ink, wash)).toBeGreaterThanOrEqual(4.5)
        expect(contrastRatio(ink, paper)).toBeGreaterThanOrEqual(4.5)
        expect(contrastRatio('#ffffff', night)).toBeGreaterThanOrEqual(4.5)
        expect(contrastRatio('#ffffff', nightPaper)).toBeGreaterThanOrEqual(4.5)
        expect(contrastRatio('#ffffff', ink)).toBeGreaterThanOrEqual(4.5)
        expect(contrastRatio(lightAccent, wash)).toBeGreaterThanOrEqual(4.5)
        expect(contrastRatio(lightAccent, paper)).toBeGreaterThanOrEqual(4.5)
        expect(contrastRatio(darkAccent, night)).toBeGreaterThanOrEqual(4.5)
        expect(contrastRatio(darkAccent, nightPaper)).toBeGreaterThanOrEqual(4.5)
        expect(
          contrastRatio(contrastingForeground(preset.seed), preset.seed),
        ).toBeGreaterThanOrEqual(3)
      }
    }
    const tint = themeStylesheet(accentPresets.blue.seed, 'slate', 'blue', 'tint')
    const plain = themeStylesheet(accentPresets.blue.seed, 'slate', 'blue', 'plain')
    expect(tint).toContain('--bp-canvas: var(--ui-color-primary-100)')
    expect(plain).toContain('--bp-canvas: var(--ui-bg)')
    const custom = themeStylesheet('#ff2bd6', 'slate', 'custom', 'gradient')
    expect(contrastRatio(variable(custom, '--ui-primary'), '#ffffff')).toBeGreaterThanOrEqual(4.5)
    expect(custom).toContain('--bp-icon-plate: #ffffff')
  })

  it('keeps status marks visible on the light icon plate', () => {
    for (const colour of [statusColours.down, statusColours.unknown]) {
      expect(contrastRatio(colour, '#ffffff')).toBeGreaterThanOrEqual(3)
    }
  })

  it('picks a readable tag foreground', () => {
    expect(
      contrastRatio(contrastingForeground(accentPresets.red.seed), accentPresets.red.seed),
    ).toBeGreaterThanOrEqual(4.5)
    expect(contrastingForeground('#f8fafc')).toBe('#000000')
    expect(contrastRatio(contrastingForeground('#f59e0b'), '#f59e0b')).toBeGreaterThanOrEqual(3)
  })

  it('keeps the blue preset vivid', () => {
    const css = themeStylesheet(accentPresets.blue.seed, 'slate', 'blue')
    expect(variable(css, '--ui-color-primary-500')).toContain('0.214')
  })

  it('draws a same-origin bookmark glyph in the accent colour', () => {
    const svg = bookmarkGlyph(accentPresets.blue.seed)
    expect(svg).toContain(`fill="${accentPresets.blue.seed}"`)
    expect(svg).not.toContain('data:')
  })
})

function variable(css: string, name: string): string {
  const match = new RegExp(`${name}:\\s*([^;]+);`).exec(css)
  return match?.[1]?.trim() ?? ''
}

function block(css: string, dark: boolean): string {
  const parts = css.split('html.dark')
  return (dark ? parts[1] : parts[0]) ?? ''
}
