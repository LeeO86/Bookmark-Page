import { createServer } from 'node:net'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { bootApplication } from '../../server/db/boot'
import { closeDatabase } from '../../server/db/client'
import { clearSecretKey } from '../../server/db/keys'
import { iconCandidates, pickIcon } from '../../server/icons/discover'
import { prepareUpload } from '../../server/icons/files'
import { sanitizeSvg } from '../../server/icons/sanitize'
import { readLucideSvg, searchLucide } from '../../server/icons/lucide'
import { expectationMet } from '../../server/checks/expect'
import { leaseChecks, reportCheck } from '../../server/checks/lease'
import { probeTcp } from '../../server/checks/probe'
import { runServerCheck } from '../../server/checks/run'
import { renderMetrics } from '../../server/metrics'
import { HttpError } from '../../server/http/errors'
import { createEntry, getEntry } from '../../server/services/entries'
import { createFilter } from '../../server/services/catalog'
import { writeSettings } from '../../server/services/settings'
import type { Actor } from '../../server/auth/permissions'
import { testSecretKey } from '../secret'

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url))
const directories: string[] = []
const admin: Actor = {
  role: 'admin',
  userId: null,
  tokenId: null,
  tokenScopes: [],
  kind: 'user',
  label: 'admin',
}
const anonymous: Actor = {
  role: 'anonymous',
  userId: null,
  tokenId: null,
  tokenScopes: [],
  kind: 'anonymous',
  label: 'anonymous',
}

afterEach(() => {
  clearSecretKey()
  closeDatabase()
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('svg sanitiser', () => {
  it('keeps drawing commands and strips active content', () => {
    const clean = sanitizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script><path d="M0 0"/><a href="https://evil.test"><path d="M1 1"/></a><use href="javascript:alert(1)"/></svg>',
    )
    expect(clean).toContain('M0 0')
    expect(clean).not.toContain('script')
    expect(clean).not.toContain('onload')
    expect(clean).not.toContain('evil.test')
    expect(clean).not.toContain('javascript:')
    expect(() =>
      sanitizeSvg('<svg><!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]></svg>'),
    ).toThrow()
  })

  it('rejects an uploaded SVG that contains a script', () => {
    const payload = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    ).toString('base64')
    expect(prepareUpload('image/svg+xml', payload).toString('utf8')).not.toContain('script')
    expect(() =>
      prepareUpload('image/svg+xml', Buffer.from('<html></html>').toString('base64')),
    ).toThrow(HttpError)
  })
})

describe('icons and checks', () => {
  it('reads a Lucide icon and prefers SVG favicon candidates', () => {
    expect(readLucideSvg('camera')).toContain('<svg')
    expect(searchLucide('camera')).toContain('camera')
    const candidates = iconCandidates(
      '<link rel="icon" href="/small.png" sizes="16x16"><link rel="apple-touch-icon" href="/big.png" sizes="180x180"><link rel="icon" type="image/svg+xml" href="/mark.svg"><link rel="manifest" href="/manifest.webmanifest">',
      'https://mixer.example/',
    )
    expect(pickIcon(candidates)?.href).toBe('https://mixer.example/mark.svg')
  })

  it('evaluates HTTP expectations and probes TCP', async () => {
    expect(expectationMet(204, '', { status: ['2xx'] }).ok).toBe(true)
    expect(expectationMet(404, '', { status: ['2xx'] }).ok).toBe(false)
    expect(
      expectationMet(200, '{"ok":true}', { status: ['200'], jsonPath: 'ok', equals: 'true' }).ok,
    ).toBe(true)
    const server = createServer((socket) => {
      socket.end()
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    const port = address && typeof address === 'object' ? address.port : 0
    const result = await probeTcp('127.0.0.1', port, 1000)
    server.close()
    expect(result.state).toBe('up')
  })

  it('runs a server TCP check, leases only visible client checks, and renders metrics', async () => {
    await boot()
    const server = createServer((socket) => {
      socket.end()
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    const port = address && typeof address === 'object' ? address.port : 0
    const created = createEntry(admin, {
      name: 'Mixer',
      description: '',
      host: '127.0.0.1',
      sort: 0,
      tags: ['type:audio'],
      links: [],
      fields: [],
      checks: [
        {
          name: 'Port',
          kind: 'tcp',
          executor: 'server',
          intervalSeconds: 60,
          timeoutMs: 1000,
          tlsVerify: false,
          host: '127.0.0.1',
          port,
        },
        {
          name: 'Browser',
          kind: 'http',
          executor: 'client',
          intervalSeconds: 60,
          timeoutMs: 1000,
          tlsVerify: false,
          requestSpec: {
            method: 'GET',
            urlTemplate: 'http://{{host}}/',
            headers: {},
            bodyTemplate: null,
            tlsVerify: false,
            timeoutMs: 1000,
            expectation: {
              status: ['2xx'],
              bodyContains: null,
              bodyRegex: null,
              jsonPath: null,
              equals: null,
            },
          },
        },
      ],
      actions: [],
    })
    createEntry(admin, {
      name: 'Camera',
      description: '',
      host: '10.0.0.9',
      sort: 1,
      tags: ['type:video'],
      links: [],
      fields: [],
      checks: [
        {
          name: 'Hidden',
          kind: 'tcp',
          executor: 'client',
          intervalSeconds: 60,
          timeoutMs: 1000,
          tlsVerify: false,
          host: '10.0.0.9',
          port: 9,
        },
      ],
      actions: [],
    })
    createFilter(admin, {
      name: 'Audio',
      query: 'type:audio',
      columns: [],
      sort: 0,
      isPublic: true,
      global: true,
    })
    const tcp = getEntry(admin, created.entry.id).checks.find((check) => check.name === 'Port')
    await runServerCheck(tcp?.id ?? '')
    expect(
      getEntry(admin, created.entry.id).checks.find((check) => check.name === 'Port')?.state,
    ).toBe('up')
    expect(() => leaseChecks(anonymous, 5)).toThrow(HttpError)
    writeSettings({ clientChecksAnonymous: true }, null)
    const leased = leaseChecks(anonymous, 5)
    expect(leased.map((check) => check.name)).toEqual(['Browser'])
    expect(leased[0]?.url).toBe('http://127.0.0.1/')
    reportCheck(anonymous, leased[0]?.id ?? '', {
      leaseId: leased[0]?.leaseId ?? '',
      state: 'unknown',
      latencyMs: 4,
      message: 'An HTTPS page cannot probe an http:// target',
    })
    expect(
      getEntry(admin, created.entry.id).checks.find((check) => check.name === 'Browser')
        ?.reportedBy,
    ).toBe('client:anonymous')
    const metrics = renderMetrics()
    expect(metrics).toContain('bookmark_entries 2')
    expect(metrics).toContain('bookmark_checks{state="up"} 1')
    expect(metrics).toContain('bookmark_action_executions_total 0')
    server.close()
  })
})

async function boot(): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), 'bookmark-icons-'))
  directories.push(directory)
  await bootApplication({
    secretKey: testSecretKey,
    databasePath: join(directory, 'bookmark.db'),
    migrationsFolder,
  })
}
