export const shadeSteps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const
export type Shade = (typeof shadeSteps)[number]
export type ColourMode = 'system' | 'light' | 'dark'
export type NeutralPalette = 'slate' | 'gray' | 'zinc' | 'neutral' | 'stone'
export type ViewMode = 'list' | 'cards' | 'tiles'
export type AccentPreset = 'red' | 'yellow' | 'pink' | 'green' | 'cyan' | 'blue' | 'grey' | 'custom'
export type BackgroundStyle = 'gradient' | 'tint' | 'plain'
export type TileSize = 'regular' | 'large'

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
export const backgroundStyles = ['gradient', 'tint', 'plain'] as const
export const tileSizes = ['regular', 'large'] as const

/** Vivid Tailwind scales. Yellow uses amber so the preset stays bright. */
export const accentPresets: Record<
  Exclude<AccentPreset, 'custom'>,
  { label: string; seed: string; scale: keyof typeof vividScales }
> = {
  red: { label: 'Red', seed: '#ef4444', scale: 'red' },
  yellow: { label: 'Yellow', seed: '#f59e0b', scale: 'amber' },
  pink: { label: 'Pink', seed: '#ec4899', scale: 'pink' },
  green: { label: 'Green', seed: '#22c55e', scale: 'green' },
  cyan: { label: 'Cyan', seed: '#06b6d4', scale: 'cyan' },
  blue: { label: 'Blue', seed: '#3b82f6', scale: 'blue' },
  grey: { label: 'Grey', seed: '#64748b', scale: 'slate' },
}

const vividScales = {
  red: scale(
    'oklch(97.1% 0.013 17.38)',
    'oklch(93.6% 0.032 17.717)',
    'oklch(88.5% 0.062 18.334)',
    'oklch(80.8% 0.114 19.571)',
    'oklch(70.4% 0.191 22.216)',
    'oklch(63.7% 0.237 25.331)',
    'oklch(57.7% 0.245 27.325)',
    'oklch(50.5% 0.213 27.518)',
    'oklch(44.4% 0.177 26.899)',
    'oklch(39.6% 0.141 25.723)',
    'oklch(25.8% 0.092 26.042)',
  ),
  amber: scale(
    'oklch(98.7% 0.022 95.277)',
    'oklch(96.2% 0.059 95.617)',
    'oklch(92.4% 0.12 95.746)',
    'oklch(87.9% 0.169 91.605)',
    'oklch(82.8% 0.189 84.429)',
    'oklch(76.9% 0.188 70.08)',
    'oklch(66.6% 0.179 58.318)',
    'oklch(55.5% 0.163 48.998)',
    'oklch(47.3% 0.137 46.201)',
    'oklch(41.4% 0.112 45.904)',
    'oklch(27.9% 0.077 45.635)',
  ),
  pink: scale(
    'oklch(97.1% 0.014 343.198)',
    'oklch(94.8% 0.028 342.258)',
    'oklch(89.9% 0.061 343.231)',
    'oklch(82.3% 0.12 346.018)',
    'oklch(71.8% 0.202 349.761)',
    'oklch(65.6% 0.241 354.308)',
    'oklch(59.2% 0.249 0.584)',
    'oklch(52.5% 0.223 3.958)',
    'oklch(45.9% 0.187 3.815)',
    'oklch(40.8% 0.153 2.432)',
    'oklch(28.4% 0.109 3.907)',
  ),
  green: scale(
    'oklch(98.2% 0.018 155.826)',
    'oklch(96.2% 0.044 156.743)',
    'oklch(92.5% 0.084 155.995)',
    'oklch(87.1% 0.15 154.449)',
    'oklch(79.2% 0.209 151.711)',
    'oklch(72.3% 0.219 149.579)',
    'oklch(62.7% 0.194 149.214)',
    'oklch(52.7% 0.154 150.069)',
    'oklch(44.8% 0.119 151.328)',
    'oklch(39.3% 0.095 152.535)',
    'oklch(26.6% 0.065 152.934)',
  ),
  cyan: scale(
    'oklch(98.4% 0.019 200.873)',
    'oklch(95.6% 0.045 203.388)',
    'oklch(91.7% 0.08 205.041)',
    'oklch(86.5% 0.127 207.078)',
    'oklch(78.9% 0.154 211.53)',
    'oklch(71.5% 0.143 215.221)',
    'oklch(60.9% 0.126 221.723)',
    'oklch(52% 0.105 223.128)',
    'oklch(45% 0.085 224.283)',
    'oklch(39.8% 0.07 227.392)',
    'oklch(30.2% 0.056 229.695)',
  ),
  blue: scale(
    'oklch(97% 0.014 254.604)',
    'oklch(93.2% 0.032 255.585)',
    'oklch(88.2% 0.059 254.128)',
    'oklch(80.9% 0.105 251.813)',
    'oklch(70.7% 0.165 254.624)',
    'oklch(62.3% 0.214 259.815)',
    'oklch(54.6% 0.245 262.881)',
    'oklch(48.8% 0.243 264.376)',
    'oklch(42.4% 0.199 265.638)',
    'oklch(37.9% 0.146 265.522)',
    'oklch(28.2% 0.091 267.935)',
  ),
  slate: scale(
    'oklch(98.4% 0.003 247.858)',
    'oklch(96.8% 0.007 247.896)',
    'oklch(92.9% 0.013 255.508)',
    'oklch(86.9% 0.022 252.894)',
    'oklch(70.4% 0.04 256.788)',
    'oklch(55.4% 0.046 257.417)',
    'oklch(44.6% 0.043 257.281)',
    'oklch(37.2% 0.044 257.287)',
    'oklch(27.9% 0.041 260.031)',
    'oklch(20.8% 0.042 265.755)',
    'oklch(12.9% 0.042 264.695)',
  ),
} as const

function scale(
  s50: string,
  s100: string,
  s200: string,
  s300: string,
  s400: string,
  s500: string,
  s600: string,
  s700: string,
  s800: string,
  s900: string,
  s950: string,
): Record<Shade, string> {
  return {
    50: s50,
    100: s100,
    200: s200,
    300: s300,
    400: s400,
    500: s500,
    600: s600,
    700: s700,
    800: s800,
    900: s900,
    950: s950,
  }
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

export function suggestedNeutral(preset: AccentPreset, accent = ''): NeutralPalette {
  if (preset === 'red' || preset === 'yellow' || preset === 'pink') {
    return 'stone'
  }
  if (preset === 'custom' && isHexColour(accent)) {
    const hue = hexToOklch(normalizeHex(accent)).h
    if (hue >= 330 || hue <= 70) {
      return 'stone'
    }
  }
  return 'slate'
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

export function isBackgroundStyle(value: string): value is BackgroundStyle {
  return (backgroundStyles as readonly string[]).includes(value)
}

export function isTileSize(value: string): value is TileSize {
  return value === 'regular' || value === 'large'
}

export function letterColour(name: string): string {
  let hash = 0
  for (const char of name) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  }
  return oklchToHex(0.55, 0.14, hash % 360)
}

export function themeStylesheet(
  accent: string,
  palette: NeutralPalette,
  preset: AccentPreset = 'custom',
  background: BackgroundStyle = 'gradient',
): string {
  const colours =
    preset === 'custom' ? customScale(accent) : vividScales[accentPresets[preset].scale]
  const neutral = neutralScales[palette]
  const lightPrimary = firstContrast(colours, '#ffffff', [600, 700, 800, 900])
  const darkPrimary = firstContrast(colours, neutral[900], [400, 300, 200, 500])
  const lightAccentText = firstContrastAll(
    colours,
    [colours[100], neutral[50]],
    [800, 900, 950, 700],
  )
  const darkAccentText = firstContrastAll(
    colours,
    [colours[950], neutral[950]],
    [200, 300, 100, 400],
  )
  const primaryLines = shadeSteps
    .map((shade) => `--ui-color-primary-${shade}: ${colours[shade]};`)
    .join('\n')
  const neutralLines = shadeSteps
    .map((shade) => `--ui-color-neutral-${shade}: ${neutral[shade]};`)
    .join('\n')
  const chips = (Object.entries(chipColours) as Array<[keyof typeof chipColours, string]>)
    .map(
      ([name, colour]) =>
        `--bp-chip-${name}: ${colour};\n--bp-chip-${name}-fg: ${contrastingForeground(colour)};`,
    )
    .join('\n')
  const canvas = canvasValue(background, 'light')
  const darkCanvas = canvasValue(background, 'dark')
  return `html {\n${primaryLines}\n${neutralLines}\n--ui-primary: ${lightPrimary};\n--bp-accent-text: ${lightAccentText};\n--bp-canvas: ${canvas};\n--bp-content: ${neutral[100]};\n--bp-card: ${neutral[50]};\n--bp-icon-plate: #ffffff;\n--bp-status-up: ${statusColours.up};\n--bp-status-down: ${statusColours.down};\n--bp-status-unknown: ${statusColours.unknown};\n--bp-status-none: ${statusColours.none};\n${chips}\n}\nhtml.dark {\n--ui-primary: ${darkPrimary};\n--bp-accent-text: ${darkAccentText};\n--bp-canvas: ${darkCanvas};\n--bp-content: ${neutral[950]};\n--bp-card: ${neutral[900]};\n}\n`
}

function canvasValue(background: BackgroundStyle, mode: 'light' | 'dark'): string {
  if (background === 'plain') {
    return 'var(--ui-bg)'
  }
  if (background === 'tint') {
    return mode === 'light' ? 'var(--ui-color-primary-100)' : 'var(--ui-color-primary-950)'
  }
  return mode === 'light'
    ? 'linear-gradient(180deg, var(--ui-color-primary-100), var(--ui-color-neutral-50))'
    : 'linear-gradient(180deg, var(--ui-color-primary-950), var(--ui-color-neutral-950))'
}

function firstContrast(
  colours: Record<Shade, string>,
  background: string,
  order: readonly Shade[],
): string {
  return firstContrastAll(colours, [background], order)
}

function firstContrastAll(
  colours: Record<Shade, string>,
  backgrounds: readonly string[],
  order: readonly Shade[],
): string {
  for (const shade of order) {
    if (backgrounds.every((background) => contrastRatio(colours[shade], background) >= 4.5)) {
      return colours[shade]
    }
  }
  return colours[order[order.length - 1] ?? 700]
}

function customScale(seed: string): Record<Shade, string> {
  const source = hexToOklch(normalizeHex(seed))
  const targets: Record<Shade, number> = {
    50: 0.97,
    100: 0.93,
    200: 0.86,
    300: 0.77,
    400: 0.68,
    500: Math.min(0.62, Math.max(0.42, source.l)),
    600: 0.5,
    700: 0.42,
    800: 0.34,
    900: 0.27,
    950: 0.2,
  }
  const chroma: Record<Shade, number> = {
    50: 0.25,
    100: 0.4,
    200: 0.6,
    300: 0.8,
    400: 0.95,
    500: 1,
    600: 1,
    700: 0.9,
    800: 0.75,
    900: 0.6,
    950: 0.45,
  }
  const built = {} as Record<Shade, string>
  for (const shade of shadeSteps) {
    built[shade] = oklchToHex(targets[shade], Math.max(source.c, 0.04) * chroma[shade], source.h)
  }
  return built
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
