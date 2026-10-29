import { createServer } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import { bootApplication } from '../../server/db/boot'
import { closeDatabase } from '../../server/db/client'
import { clearSecretKey } from '../../server/db/keys'
import { createEntry, getEntry } from '../../server/services/entries'
import { createFieldDefinition } from '../../server/services/catalog'
import { runServerCheck } from '../../server/checks/run'
import { executeNamedAction } from '../../server/services/actions'
import { listAudit } from '../../server/services/audit'
import { entryWriteSchema } from '../../shared/contracts'
import { testSecretKey } from '../secret'
import type { Actor } from '../../server/auth/permissions'
const admin: Actor = {
  role: 'admin',
  userId: null,
  tokenId: null,
  tokenScopes: [],
  kind: 'user',
  label: 'audit',
}
let directory = ''
afterEach(() => {
  closeDatabase()
  clearSecretKey()
  if (directory) rmSync(directory, { recursive: true, force: true })
})
async function boot() {
  directory = mkdtempSync(join(tmpdir(), 'bp-audit-checks-'))
  await bootApplication({
    secretKey: testSecretKey,
    databasePath: join(directory, 'bookmark.db'),
    migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)),
  })
}
it('server HTTP check resolves the configured headers and body', async () => {
  await boot()
  const seen: Array<{ header: string | undefined; body: string }> = []
  const server = createServer((request, response) => {
    let body = ''
    request.on('data', (chunk) => {
      body += chunk
    })
    request.on('end', () => {
      seen.push({ header: request.headers['x-audit'] as string | undefined, body })
      response.end('ok')
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No test port')
  try {
    const created = createEntry(
      admin,
      entryWriteSchema.parse({
        name: 'AuditCheck',
        host: '127.0.0.1',
        checks: [
          {
            name: 'HTTP',
            kind: 'http',
            executor: 'server',
            requestSpec: {
              method: 'POST',
              urlTemplate: `http://127.0.0.1:${address.port}/`,
              headers: { 'X-Audit': '{{entry.name}}' },
              bodyTemplate: 'host={{host}}',
            },
          },
        ],
      }),
    )
    await runServerCheck(created.entry.checks[0]!.id)
    expect(getEntry(admin, created.entry.id).status).toBe('up')
    expect(seen).toEqual([{ header: 'AuditCheck', body: 'host=127.0.0.1' }])
  } finally {
    server.close()
  }
})
it('redacts short secret values from action results and audit', async () => {
  await boot()
  createFieldDefinition(admin, {
    key: 'pin',
    label: 'PIN',
    type: 'secret',
    minRoleToView: 'admin',
    searchable: false,
    showAsColumnDefault: false,
    sort: 0,
  })
  const server = createServer((request, response) => {
    response.end(new URL(request.url!, 'http://localhost').searchParams.get('pin') || '')
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No test port')
  try {
    const created = createEntry(
      admin,
      entryWriteSchema.parse({
        name: 'Short secret',
        fields: [{ key: 'pin', value: '7Qx' }],
        actions: [
          {
            name: 'Echo',
            minRole: 'admin',
            confirm: false,
            requestSpec: {
              method: 'GET',
              urlTemplate: `http://127.0.0.1:${address.port}/?pin={{field.pin}}`,
            },
          },
        ],
      }),
    )
    const result = await executeNamedAction(admin, created.entry.id, 'Echo', {
      confirmed: true,
      inputs: {},
    })
    expect.soft(result.body).not.toContain('7Qx')
    expect.soft(JSON.stringify(listAudit('admin'))).not.toContain('7Qx')
  } finally {
    server.close()
  }
})
