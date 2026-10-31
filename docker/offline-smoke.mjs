import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { setTimeout } from 'node:timers/promises'

const base = 'http://127.0.0.1:3000'
const request = (path) => fetch(new URL(path, base), { signal: AbortSignal.timeout(15_000) })
for (let attempt = 0; ; attempt++) {
  try {
    const health = await request('/api/health')
    assert.equal(health.status, 200)
    break
  } catch (error) {
    if (attempt === 29) throw error
    await setTimeout(500)
  }
}
const home = await request('/')
assert.equal(home.status, 200)
const html = await home.text()

// Include dynamic names as well as the navigation icons that triggered issue #34.
const names = [
  'chevron-down',
  'copy',
  'ellipsis',
  'eye',
  'grid-2x2',
  'layout-grid',
  'list',
  'panel-left',
  'camera',
  'router',
  'server',
  'cable',
  'radio-tower',
]
const response = await request('/api/_nuxt_icon/lucide.json?icons=' + names.join(','))
assert.equal(response.status, 200, 'Lucide must resolve with the container network disabled')
const collection = await response.json()
assert.equal(collection.prefix, 'lucide')
assert.deepEqual(collection.not_found ?? [], [])
for (const name of names) assert.ok(collection.icons[name]?.body, 'Missing Lucide icon: ' + name)

// Unbundled collections must fail locally rather than time out on an external API.
assert.equal((await request('/api/_nuxt_icon/mdi.json?icons=home')).status, 404)
const entryIcon = await request('/api/icons/lucide/camera')
assert.equal(entryIcon.status, 200)
assert.match(await entryIcon.text(), /<svg/)

const publicDir = '/app/.output/public'
const fonts = new Set()
function findFonts(content, baseUrl) {
  for (const match of content.matchAll(
    /url\(\s*['"]?([^'"\s)]+\.woff2(?:\?[^'"\s)]*)?)['"]?\s*\)/g,
  )) {
    const url = new URL(match[1], baseUrl)
    assert.equal(url.origin, base, 'Fonts must be served from the app origin')
    fonts.add(url.href)
  }
}
// Global font-face rules can be rendered inline in the page by Nuxt Fonts.
findFonts(html, base)
function scanCss(directory) {
  for (const file of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, file.name)
    if (file.isDirectory()) scanCss(path)
    else if (file.name.endsWith('.css')) {
      const css = readFileSync(path, 'utf8')
      const cssUrl = new URL('/' + relative(publicDir, path), base)
      findFonts(css, cssUrl)
    }
  }
}
scanCss(publicDir)
assert.ok(fonts.size > 0, 'The production build must include its font files')
for (const url of fonts) {
  const font = await request(url)
  assert.equal(font.status, 200, 'Missing local font: ' + url)
  assert.equal(
    Buffer.from(await font.arrayBuffer())
      .subarray(0, 4)
      .toString(),
    'wOF2',
  )
}
console.log(
  JSON.stringify({
    offline: true,
    icons: names.length,
    fonts: fonts.size,
    unknownCollectionStatus: 404,
  }),
)
