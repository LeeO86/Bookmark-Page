import { describe, expect, it } from 'vitest'
import {
  accentPresets,
  bookmarkGlyph,
  contrastRatio,
  contrastingForeground,
  neutralPalettes,
  passingColour,
  statusColours,
  themeStylesheet,
} from '../../shared/theme'

const pageBackgrounds = ['#ffffff', ...neutralPalettes.map((palette) => palette)]

describe('theme contrast', () => {
  it('keeps preset text and status marks above WCAG AA', () => {
    for (const preset of Object.values(accentPresets)) {
      for (const palette of neutralPalettes) {
        const css = themeStylesheet(preset.seed, palette)
        const light = variable(css, '--bp-accent-text')
        const dark = variable(css.split('html.dark')[1] ?? '', '--bp-accent-text')
        const darkBackground = variable(css, '--ui-color-neutral-900')
        expect(contrastRatio(light, '#ffffff')).toBeGreaterThanOrEqual(4.5)
        expect(contrastRatio(dark, darkBackground)).toBeGreaterThanOrEqual(4.5)
        expect(contrastRatio(variable(css, '--ui-primary'), '#ffffff')).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('keeps status marks visible on white and on every neutral surface', () => {
    for (const colour of Object.values(statusColours)) {
      expect(contrastRatio(colour, '#ffffff')).toBeGreaterThanOrEqual(3)
      for (const palette of neutralPalettes) {
        const background = variable(themeStylesheet('#404080', palette), '--ui-color-neutral-900')
        expect(contrastRatio(colour, background)).toBeGreaterThanOrEqual(3)
      }
    }
    expect(pageBackgrounds.length).toBeGreaterThan(0)
  })

  it('picks a readable tag foreground', () => {
    expect(contrastingForeground('#804040')).toBe('#ffffff')
    expect(contrastingForeground('#f8fafc')).toBe('#000000')
    expect(contrastRatio(contrastingForeground('#808040'), '#808040')).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(contrastingForeground('#6c757d'), '#6c757d')).toBeGreaterThanOrEqual(3)
  })

  it('darkens yellow and grey until text passes on white', () => {
    expect(contrastRatio(accentPresets.yellow.seed, '#ffffff')).toBeLessThan(4.5)
    expect(
      contrastRatio(passingColour(accentPresets.yellow.seed, '#ffffff'), '#ffffff'),
    ).toBeGreaterThanOrEqual(4.5)
    expect(
      contrastRatio(passingColour(accentPresets.grey.seed, '#ffffff'), '#ffffff'),
    ).toBeGreaterThanOrEqual(4.5)
  })

  it('draws a same-origin bookmark glyph in the accent colour', () => {
    const svg = bookmarkGlyph('#404080')
    expect(svg).toContain('fill="#404080"')
    expect(svg).not.toContain('data:')
  })
})

function variable(css: string, name: string): string {
  const match = new RegExp(`${name}:\\s*([^;]+);`).exec(css)
  return match?.[1]?.trim() ?? ''
}
