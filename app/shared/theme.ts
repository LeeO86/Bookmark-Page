export const shadeSteps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const
export type Shade = (typeof shadeSteps)[number]
export type ColourMode = 'system' | 'light' | 'dark'
export type NeutralPalette = 'slate' | 'gray' | 'zinc' | 'neutral' | 'stone'
export type ViewMode = 'list' | 'cards' | 'tiles'
export type AccentPreset = 'red' | 'yellow' | 'pink' | 'green' | 'cyan' | 'blue' | 'grey' | 'custom'

export const colourModes = ['system', 'light', 'dark'] as const
export const viewModes = ['list', 'cards', 'tiles'] as const
export const neutralPalettes = ['slate', 'gray', 'zinc', 'neutral', 'stone'] as const
export const accentPresetNames = [
  'red',
  'yellow',
  'pink',
  'green',
  'cyan',
  'blue',
  'grey',
  'custom',
] as const

export const plainTagColour = '#64748b'

/** V1 swatches. Page backgrounds in V1 were darker companions of these seeds. */
export const accentPresets: Record<
  Exclude<AccentPreset, 'custom'>,
  { label: string; seed: string }
> = {
  red: { label: 'Red', seed: '#804040' },
  yellow: { label: 'Yellow', seed: '#808040' },
  pink: { label: 'Pink', seed: '#804080' },
  green: { label: 'Green', seed: '#408040' },
  cyan: { label: 'Cyan', seed: '#408080' },
  blue: { label: 'Blue', seed: '#404080' },
  grey: { label: 'Grey', seed: '#6c757d' },
}

const neutralScales: Record<NeutralPalette, Record<Shade, string>> = {
  slate: {
    50: 'oklch(98.4% 0.003 247.858)',
    100: 'oklch(96.8% 0.007 247.896)',
    200: 'oklch(92.9% 0.013 255.508)',
    300: 'oklch(86.9% 0.022 252.894)',
    400: 'oklch(70.4% 0.04 256.788)',
    500: 'oklch(55.4% 0.046 257.417)',
    600: 'oklch(44.6% 0.043 257.281)',
    700: 'oklch(37.2% 0.044 257.287)',
    800: 'oklch(27.9% 0.041 260.031)',
    900: 'oklch(20.8% 0.042 265.755)',
    950: 'oklch(12.9% 0.042 264.695)',
  },
  gray: {
    50: 'oklch(98.5% 0.002 247.839)',
    100: 'oklch(96.7% 0.003 264.542)',
    200: 'oklch(92.8% 0.006 264.531)',
    300: 'oklch(87.2% 0.01 258.338)',
    400: 'oklch(70.7% 0.022 261.325)',
    500: 'oklch(55.1% 0.027 264.364)',
    600: 'oklch(44.6% 0.03 256.802)',
    700: 'oklch(37.3% 0.034 259.733)',
    800: 'oklch(27.8% 0.033 256.848)',
    900: 'oklch(21% 0.034 264.665)',
    950: 'oklch(13% 0.028 261.692)',
  },
  zinc: {
    50: 'oklch(98.5% 0 none)',
    100: 'oklch(96.7% 0.001 286.375)',
    200: 'oklch(92% 0.004 286.32)',
    300: 'oklch(87.1% 0.006 286.286)',
    400: 'oklch(70.5% 0.015 286.067)',
    500: 'oklch(55.2% 0.016 285.938)',
    600: 'oklch(44.2% 0.017 285.786)',
    700: 'oklch(37% 0.013 285.805)',
    800: 'oklch(27.4% 0.006 286.033)',
    900: 'oklch(21% 0.006 285.885)',
    950: 'oklch(14.1% 0.005 285.823)',
  },
  neutral: {
    50: 'oklch(98.5% 0 none)',
    100: 'oklch(97% 0 none)',
    200: 'oklch(92.2% 0 none)',
    300: 'oklch(87% 0 none)',
    400: 'oklch(70.8% 0 none)',
    500: 'oklch(55.6% 0 none)',
    600: 'oklch(43.9% 0 none)',
    700: 'oklch(37.1% 0 none)',
    800: 'oklch(26.9% 0 none)',
    900: 'oklch(20.5% 0 none)',
    950: 'oklch(14.5% 0 none)',
  },
  stone: {
    50: 'oklch(98.5% 0.001 106.423)',
    100: 'oklch(97% 0.001 106.424)',
    200: 'oklch(92.3% 0.003 48.717)',
    300: 'oklch(86.9% 0.005 56.366)',
    400: 'oklch(70.9% 0.01 56.259)',
    500: 'oklch(55.3% 0.013 58.071)',
    600: 'oklch(44.4% 0.011 73.639)',
    700: 'oklch(37.4% 0.01 67.558)',
    800: 'oklch(26.8% 0.007 34.298)',
    900: 'oklch(21.6% 0.006 56.043)',
    950: 'oklch(14.7% 0.004 49.25)',
  },
}

/** Marks that stay readable on light and dark surfaces. */
export const statusColours = {
  up: '#047857',
  down: '#dc2626',
  unknown: '#a16207',
  none: '#78716c',
} as const

const chipColours = {
  is: '#075985',
  has: '#5b21b6',
  group: '#9a3412',
  text: '#334155',
  tag: '#334155',
} as const

export function isHexColour(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value)
}

export function normalizeHex(value: string): string {
  return isHexColour(value) ? value.toLowerCase() : '#404040'
}

export function isNeutralPalette(value: string): value is NeutralPalette {
  return (neutralPalettes as readonly string[]).includes(value)
}

export function isAccentPreset(value: string): value is AccentPreset {
  return (accentPresetNames as readonly string[]).includes(value)
}

export function isColourMode(value: string): value is ColourMode {
  return value === 'system' || value === 'light' || value === 'dark'
}

export function isViewMode(value: string): value is ViewMode {
  return value === 'list' || value === 'cards' || value === 'tiles'
}

export function presetSeed(preset: AccentPreset, custom: string): string {
  if (preset === 'custom') {
    return normalizeHex(custom)
  }
  return accentPresets[preset].seed
}

export function relativeLuminance(colour: string): number {
  const [red, green, blue] = rgbChannels(colour)
  const linear = [red, green, blue].map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  )
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!
}

export function contrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background))
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background))
  return (lighter + 0.05) / (darker + 0.05)
}

export function contrastingForeground(background: string): '#000000' | '#ffffff' {
  const black = contrastRatio('#000000', background)
  const white = contrastRatio('#ffffff', background)
  return black >= white ? '#000000' : '#ffffff'
}

export function neutralBackground(palette: NeutralPalette, shade: Shade): string {
  return neutralScales[palette][shade]
}

export function themeStylesheet(accent: string, palette: NeutralPalette): string {
  const seed = normalizeHex(accent)
  const darkBackground = neutralBackground(palette, 900)
  const lightPrimary = passingColour(seed, '#ffffff')
  const darkPrimary = passingColour(seed, darkBackground)
  const scale = shadeScale(seed, lightPrimary, darkPrimary)
  const primaryLines = shadeSteps
    .map((shade) => `--ui-color-primary-${shade}: ${scale[shade]};`)
    .join('\n')
  const neutralLines = shadeSteps
    .map((shade) => `--ui-color-neutral-${shade}: ${neutralScales[palette][shade]};`)
    .join('\n')
  const chips = (Object.entries(chipColours) as Array<[keyof typeof chipColours, string]>)
    .map(
      ([name, colour]) =>
        `--bp-chip-${name}: ${colour};\n--bp-chip-${name}-fg: ${contrastingForeground(colour)};`,
    )
    .join('\n')
  return `html {\n${primaryLines}\n${neutralLines}\n--ui-primary: ${lightPrimary};\n--bp-accent-text: ${lightPrimary};\n--bp-status-up: ${statusColours.up};\n--bp-status-down: ${statusColours.down};\n--bp-status-unknown: ${statusColours.unknown};\n--bp-status-none: ${statusColours.none};\n${chips}\n}\nhtml.dark {\n--ui-primary: ${darkPrimary};\n--bp-accent-text: ${darkPrimary};\n}\n`
}

export function passingColour(seed: string, background: string): string {
  const source = hexToOklch(normalizeHex(seed))
  if (contrastRatio(seed, background) >= 4.5 && isHexColour(seed)) {
    return normalizeHex(seed)
  }
  const lightBackground = relativeLuminance(background) > 0.4
  let lightness = source.l
  let chroma = Math.max(source.c, 0.02)
  let best = normalizeHex(seed)
  let bestRatio = contrastRatio(best, background)
  for (let step = 0; step < 60; step += 1) {
    lightness += lightBackground ? -0.015 : 0.012
    if (lightness < 0.14 || lightness > 0.9) {
      chroma *= 0.85
      lightness = lightBackground ? 0.2 : 0.82
    }
    const candidate = oklchToHex(lightness, chroma, source.h)
    const ratio = contrastRatio(candidate, background)
    if (ratio > bestRatio) {
      best = candidate
      bestRatio = ratio
    }
    if (ratio >= 4.5) {
      return candidate
    }
  }
  return best
}

export function bookmarkGlyph(fill: string): string {
  const colour = normalizeHex(fill)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path fill="${colour}" d="M8 3h16a2 2 0 0 1 2 2v24l-10-6-10 6V5a2 2 0 0 1 2-2z"/></svg>`
}

function shadeScale(
  seed: string,
  lightPrimary: string,
  darkPrimary: string,
): Record<Shade, string> {
  const source = hexToOklch(seed)
  const light = hexToOklch(lightPrimary)
  const dark = hexToOklch(darkPrimary)
  const targets: Record<Shade, number> = {
    50: 0.97,
    100: 0.94,
    200: 0.89,
    300: Math.min(0.86, dark.l + 0.08),
    400: dark.l,
    500: light.l,
    600: Math.max(0.18, light.l - 0.07),
    700: Math.max(0.15, light.l - 0.13),
    800: Math.max(0.13, light.l - 0.19),
    900: Math.max(0.11, light.l - 0.25),
    950: Math.max(0.09, light.l - 0.31),
  }
  const chromaScale: Record<Shade, number> = {
    50: 0.2,
    100: 0.35,
    200: 0.55,
    300: 0.75,
    400: 1,
    500: 1,
    600: 0.9,
    700: 0.75,
    800: 0.6,
    900: 0.45,
    950: 0.35,
  }
  const scale = {} as Record<Shade, string>
  for (const shade of shadeSteps) {
    scale[shade] = oklchToHex(targets[shade], source.c * chromaScale[shade], source.h)
  }
  scale[400] = darkPrimary
  scale[500] = lightPrimary
  return scale
}

interface Oklch {
  l: number
  c: number
  h: number
}

function hexToOklch(hex: string): Oklch {
  const [red, green, blue] = rgbChannels(hex).map(srgbToLinear) as [number, number, number]
  const l = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue)
  const m = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue)
  const s = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue)
  const labL = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const labA = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const labB = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  const hue = (Math.atan2(labB, labA) * 180) / Math.PI
  return { l: labL, c: Math.hypot(labA, labB), h: hue < 0 ? hue + 360 : hue }
}

function oklchToHex(lightness: number, chroma: number, hue: number): string {
  let current = chroma
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const hex = oklabToHex(
      lightness,
      current * Math.cos((hue * Math.PI) / 180),
      current * Math.sin((hue * Math.PI) / 180),
    )
    const back = hexToOklch(hex)
    if (Math.abs(back.l - lightness) < 0.03 || current < 0.005) {
      return hex
    }
    current *= 0.85
  }
  return oklabToHex(lightness, 0, 0)
}

function oklabToHex(lightness: number, a: number, b: number): string {
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3
  const red = linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)
  const green = linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)
  const blue = linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)
  return `#${toByte(red)}${toByte(green)}${toByte(blue)}`
}

function rgbChannels(colour: string): [number, number, number] {
  if (colour.startsWith('oklch')) {
    return hexToRgb(oklchStringToHex(colour))
  }
  return hexToRgb(normalizeHex(colour))
}

function hexToRgb(hex: string): [number, number, number] {
  const value = normalizeHex(hex).slice(1)
  return [
    Number.parseInt(value.slice(0, 2), 16) / 255,
    Number.parseInt(value.slice(2, 4), 16) / 255,
    Number.parseInt(value.slice(4, 6), 16) / 255,
  ]
}

function oklchStringToHex(value: string): string {
  const match = /oklch\(\s*([0-9.]+)%\s+([0-9.]+)\s+([0-9.]+|none)\s*\)/.exec(value)
  if (!match) {
    return '#000000'
  }
  const lightness = Number(match[1]) / 100
  const chroma = Number(match[2])
  const hue = match[3] === 'none' ? 0 : Number(match[3])
  return oklchToHex(lightness, chroma, hue)
}

function srgbToLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
}

function linearToSrgb(channel: number): number {
  const clamped = Math.min(1, Math.max(0, channel))
  return clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055
}

function toByte(channel: number): string {
  return Math.round(Math.min(1, Math.max(0, channel)) * 255)
    .toString(16)
    .padStart(2, '0')
}
