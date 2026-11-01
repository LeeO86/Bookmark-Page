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
const fixture = createServer((request, response) => {
  requests.push(request.url)
  response.writeHead(200, { 'content-type': 'text/html' })
  response.end(
    `<html><link rel="icon" href="data:image/svg+xml,${encodeURIComponent(svg)}"></html>`,
  )
})
await new Promise((resolve) => fixture.listen(0, '127.0.0.1', resolve))
try {
  const settings = await api('GET', '/api/v1/settings')
  check('Bootstrap token authenticates without a login', typeof settings.siteTitle === 'string')
  const source = `http://127.0.0.1:${fixture.address().port}/ui/`
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
    'Inline-only page obtains a cached iconUrl',
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
  await api('PATCH', '/api/v1/settings', { allTabPublic: true })
  check(
    'Public favicon is served through the same visibility rules',
    (await fetch(base + loaded.iconUrl)).status === 200,
  )
  const guest = await api('GET', '/api/v1/entries/' + entry.id, undefined, false)
  check('Anonymous entry omits discovery diagnostics', !('faviconStatus' in guest))
  const refreshed = await api('POST', '/api/v1/favicons/refresh-missing')
  check('Admin missing-favicon refresh is available', typeof refreshed.queued === 'number')
  console.log(JSON.stringify({ passed: true, checks }, null, 2))
} finally {
  await new Promise((resolve) => fixture.close(resolve))
}
