/** Run inside a disposable, network-isolated release container. Synthetic data only. */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'

const base = 'http://127.0.0.1:3000'
const token = process.env.ADMIN_API_TOKEN
if (!token) throw new Error('Set a synthetic ADMIN_API_TOKEN on the test container')
const checks = []
const check = (name, condition) => {
  assert.ok(condition, name)
  checks.push(name)
}
async function api(method, path, body, authenticated = true) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(authenticated ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  assert.ok(response.ok, `${method} ${path}: ${response.status}`)
  return response.json()
}
for (let attempt = 0; ; attempt++) {
  try {
    if ((await fetch(base + '/api/health')).ok) break
  } catch {
    /* Wait for boot. */
  }
  if (attempt > 60) throw new Error('App did not become ready')
  await new Promise((resolve) => setTimeout(resolve, 250))
}
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#2563eb" onload="alert(1)"/><script>alert(1)</script></svg>'
const requests = []
let unavailable = false
const fixture = createServer((request, response) => {
  if (unavailable) {
    response.writeHead(503)
    response.end()
    return
  }
  requests.push(request.url)
  response.writeHead(200, { 'content-type': 'text/html' })
  response.end(
    `<html><head><link rel="icon" href="data:image/svg+xml,${encodeURIComponent(svg)}"><script>${'x'.repeat(700 * 1024)}</script></head><body></body></html>`,
  )
})
await new Promise((resolve) => fixture.listen(0, '127.0.0.1', resolve))
try {
  const settings = await api('GET', '/api/v1/settings')
  check('Bootstrap token authenticates without a login', typeof settings.siteTitle === 'string')
  const auth = await api('GET', '/api/v1/auth/status')
  check(
    'Automatic OIDC is off by default with the default provider label',
    !auth.oidcAutoLogin && !auth.oidcEnabled && auth.oidcProviderName === 'OpenID',
  )
  const identity = (await api('GET', '/api/v1/auth/session')).actor
  check(
    'The current actor exposes its enforced role and actual token sign-in method',
    identity.role === 'admin' && identity.username === 'admin' && identity.authMethod === 'token',
  )
  check(
    'Users include the nullable migrated display name',
    (await api('GET', '/api/v1/users')).users.every((user) => 'displayName' in user),
  )
  const source = `http://127.0.0.1:${fixture.address().port}/ui/`
  await api('POST', '/api/v1/fields', {
    key: 'icon_secret',
    label: 'Secret',
    type: 'secret',
    minRoleToView: 'admin',
  })
  const { entry: secretEntry } = await api('POST', '/api/v1/entries', {
    name: 'Secret-backed bookmark',
    fields: [{ key: 'icon_secret', value: 'never-fetch-secret-value' }],
    links: [
      {
        label: 'Private UI',
        urlTemplate: source + '{{field.icon_secret}}',
        type: 'web',
        isPrimary: true,
      },
    ],
  })
  check(
    'Secret-backed links remain unresolved',
    secretEntry.links[0].url === null && secretEntry.links[0].requiresReveal,
  )
  check(
    'Manual favicon refresh skips secret-backed links',
    (await api('POST', '/api/v1/entries/' + secretEntry.id + '/favicon')).queued === 0,
  )

  const { entry } = await api('POST', '/api/v1/entries', {
    name: 'Inline only',
    links: [{ label: 'UI', urlTemplate: source, type: 'web', isPrimary: true }],
  })
  let loaded
  for (let attempt = 0; attempt < 80; attempt++) {
    loaded = await api('GET', '/api/v1/entries/' + entry.id)
    if (loaded.iconUrl) break
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  check(
    '700 KiB page with an early inline icon obtains a cached iconUrl',
    loaded.iconUrl?.startsWith('/api/icons/favicon/'),
  )
  check(
    'Inline discovery uses the actual page path without an HTTP request for data',
    requests.length === 1 && requests[0] === '/ui/',
  )
  const iconResponse = await fetch(base + loaded.iconUrl, {
    headers: { authorization: `Bearer ${token}` },
  })
  const clean = await iconResponse.text()
  check(
    'Cached URL serves a sanitised SVG',
    iconResponse.ok &&
      iconResponse.headers.get('content-type') === 'image/svg+xml' &&
      clean.includes('#2563eb') &&
      !/script|onload/.test(clean),
  )
  const hidden = await fetch(base + loaded.iconUrl)
  check('Private favicon remains unavailable anonymously', hidden.status === 404)
  const failed = await api('GET', '/api/v1/favicons')
  check('Admin failure diagnostics are available', Array.isArray(failed.failures))
  const payload = {
    name: 'stable-icon',
    contentType: 'image/svg+xml',
    data: Buffer.from(svg).toString('base64'),
  }
  const preview = await api('POST', '/api/v1/icons/preview', payload)
  check(
    'Preview does not create an icon',
    (await api('GET', '/api/v1/icons?name=stable-icon')).icons.length === 0,
  )
  const uploaded = await api('POST', '/api/v1/icons', payload)
  check('Icon preview matches sanitised stored hash', uploaded.contentHash === preview.contentHash)
  const { entry: named } = await api('POST', '/api/v1/entries', {
    name: 'Named upload',
    iconRef: 'upload-name:stable-icon',
  })
  const replaced = await api('PUT', '/api/v1/icons/' + uploaded.id, {
    contentType: payload.contentType,
    data: Buffer.from(svg.replace('#2563eb', '#ec4899')).toString('base64'),
  })
  const updated = await api('GET', '/api/v1/entries/' + named.id)
  check(
    'Replacement preserves ID and entry reference',
    replaced.id === uploaded.id && updated.iconRef === uploaded.ref,
  )
  check(
    'Replacement changes the content version in image URLs',
    updated.iconUrl !== named.iconUrl && updated.iconUrl === replaced.url,
  )
  const tabs = {
    filters: [{ externalKey: 'tools', name: 'Tools', query: '', isPublic: false }],
    purge: true,
  }
  check(
    'Tab dry run reports creation',
    (await api('POST', '/api/v1/scopes/smoke/filters/sync', { ...tabs, dryRun: true })).created
      .length === 1,
  )
  check(
    'Tab dry run creates no tab',
    !(await api('GET', '/api/v1/filters')).filters.some((tab) => tab.scope === 'smoke'),
  )
  await api('POST', '/api/v1/scopes/smoke/filters/sync', tabs)
  check(
    'Repeated tab sync is unchanged',
    (await api('POST', '/api/v1/scopes/smoke/filters/sync', tabs)).unchanged.length === 1,
  )
  await api('POST', '/api/v1/entries', { name: 'Facet alpha', tags: ['group:smoke-a'] })
  await api('POST', '/api/v1/entries', { name: 'Facet beta', tags: ['group:smoke-b'] })
  const facetPath = '/api/v1/entries?q=group%3Asmoke-a&facetQuery=group%3Asmoke-a'
  const facets = await api('GET', facetPath)
  check(
    'Own-namespace counts retain the peer group while entry filtering remains unchanged',
    facets.entries.length === 1 &&
      facets.entries[0].name === 'Facet alpha' &&
      facets.facets.tags['group:smoke-b'] === 1,
  )
  const hiddenFacets = await api('GET', facetPath, undefined, false)
  check(
    'Anonymous facet counts reveal no private tags',
    hiddenFacets.entries.length === 0 && Object.keys(hiddenFacets.facets.tags).length === 0,
  )
  await api('PATCH', '/api/v1/settings', { allTabPublic: true })
  check(
    'Public favicon is served through the same visibility rules',
    (await fetch(base + loaded.iconUrl)).status === 200,
  )
  const guest = await api('GET', '/api/v1/entries/' + entry.id, undefined, false)
  check('Anonymous entry omits discovery diagnostics', !('faviconStatus' in guest))
  const refreshed = await api('POST', '/api/v1/favicons/refresh-missing')
  check('Admin missing-favicon refresh is available', typeof refreshed.queued === 'number')
  const supplyPath = '/api/v1/entries/' + entry.id + '/favicon'
  const suppliedPayload = {
    contentType: 'image/svg+xml',
    data: Buffer.from(svg.replace('#2563eb', '#ec4899')).toString('base64'),
  }
  const suppliedPreview = await api('POST', supplyPath + '/preview', suppliedPayload)
  check(
    'Supplied preview leaves the fetched image unchanged',
    (await api('GET', '/api/v1/entries/' + entry.id)).faviconStatus.source === 'fetched',
  )
  const supplied = await api('PUT', supplyPath, suppliedPayload)
  check(
    'Supplying sanitised pixels matches preview and pins provenance',
    supplied.changed && supplied.contentHash === suppliedPreview.contentHash,
  )
  check(
    'Repeated image supply is unchanged',
    !(await api('PUT', supplyPath, suppliedPayload)).changed,
  )
  const pinned = await api('GET', '/api/v1/entries/' + entry.id)
  check(
    'Supply preserves the entry icon choice and exposes provenance',
    pinned.iconRef === null &&
      pinned.faviconStatus.source === 'supplied' &&
      !!pinned.faviconStatus.suppliedAt,
  )
  const pinnedSvg = await (await fetch(base + pinned.iconUrl)).text()
  check(
    'Supplied image is served sanitised through the favicon cache',
    pinnedSvg.includes('#ec4899') && !/script|onload/.test(pinnedSvg),
  )
  const awaitStatus = async (status) => {
    for (let i = 0; i < 80; i++) {
      const current = await api('GET', '/api/v1/entries/' + entry.id)
      if (current.faviconStatus.status === status) return current
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    throw new Error('Favicon status did not become ' + status)
  }
  unavailable = true
  await api('POST', supplyPath)
  check(
    'Failed server retry retains supplied bytes',
    (await awaitStatus('error')).iconUrl === pinned.iconUrl,
  )
  unavailable = false
  await api('POST', supplyPath)
  check(
    'Successful server retry also retains supplied bytes',
    (await awaitStatus('ok')).iconUrl === pinned.iconUrl,
  )
  check(
    'Browser fallback remains opt-in',
    (await api('GET', '/api/v1/settings')).browserFavicons === false,
  )
  await api('PATCH', '/api/v1/entries/' + entry.id, {
    checks: [{ name: 'Image', kind: 'image', executor: 'client' }],
  })
  const imageLease = (await api('POST', '/api/v1/checks/lease', {})).checks.find(
    (item) => item.kind === 'image',
  )
  check(
    'Image lease targets the live device rather than the supplied cache',
    imageLease?.url === new URL('/favicon.ico', source).href,
  )
  check(
    'Removing supplied bytes resumes automatic discovery',
    (await api('DELETE', supplyPath)).changed,
  )
  console.log(JSON.stringify({ passed: true, checks }, null, 2))
} finally {
  await new Promise((resolve) => fixture.close(resolve))
}
