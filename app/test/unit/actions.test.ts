import { createServer, type Server } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import type { Actor } from '../../server/auth/permissions'
import { clearRateLimit } from '../../server/auth/rate-limit'
import { bootApplication } from '../../server/db/boot'
import { closeDatabase } from '../../server/db/client'
import { clearSecretKey } from '../../server/db/keys'
import { HttpError } from '../../server/http/errors'
import { listAudit } from '../../server/services/audit'
import {
  createActionTemplate,
  executeNamedAction,
  listRunnableActions,
} from '../../server/services/actions'
import { createFieldDefinition, createFilter } from '../../server/services/catalog'
import { createEntry, listEntries } from '../../server/services/entries'
import { testSecretKey } from '../secret'

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url))
const directories: string[] = []
const servers: Server[] = []
const admin: Actor = {
  role: 'admin',
  userId: 'admin-user',
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
  clearRateLimit('action:admin-user')
  for (const server of servers.splice(0)) {
    server.close()
  }
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('action execution', () => {
  it('requires confirmation, redacts secrets, and only offers a template on matching entries', async () => {
    await boot()
    await createFieldDefinition(admin, {
      key: 'password',
      label: 'Password',
      type: 'secret',
      minRoleToView: 'editor',
      searchable: false,
      showAsColumnDefault: false,
      sort: 0,
    })
    let hits = 0
    const server = createServer((request, response) => {
      hits += 1
      const url = new URL(request.url ?? '/', 'http://127.0.0.1')
      response.end(url.searchParams.get('p') ?? '')
    })
    servers.push(server)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    const port = address && typeof address === 'object' ? address.port : 0
    const spec = {
      headers: {},
      bodyTemplate: null,
      tlsVerify: false,
      timeoutMs: 2000,
      expectation: {
        status: ['2xx'],
        bodyContains: null as string | null,
        bodyRegex: null,
        jsonPath: null,
        equals: null,
      },
    }
    const created = createEntry(admin, {
      name: 'Mixer',
      description: '',
      host: '127.0.0.1',
      sort: 0,
      tags: ['type:audio'],
      links: [],
      fields: [{ key: 'password', value: 'secret-pass' }],
      checks: [],
      actions: [
        {
          name: 'Ping',
          requestSpec: {
            ...spec,
            method: 'POST',
            urlTemplate: `http://127.0.0.1:${port}/?p={{field.password}}`,
            expectation: { ...spec.expectation, bodyContains: null },
          },
          inputs: [],
          confirm: true,
          minRole: 'editor',
        },
      ],
    })
    createEntry(admin, {
      name: 'Camera',
      description: '',
      host: '10.0.0.9',
      sort: 1,
      tags: ['type:video'],
      links: [],
      fields: [],
      checks: [],
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
    createActionTemplate(admin, {
      name: 'Reboot',
      query: 'type:audio',
      requestSpec: { ...spec, method: 'GET', urlTemplate: `http://127.0.0.1:${port}/ok` },
      inputs: [
        { name: 'reason', label: 'Reason', type: 'text', defaultValue: null, required: false },
      ],
      confirm: false,
      minRole: 'editor',
    })

    await expect(
      executeNamedAction(admin, created.entry.id, 'Ping', { confirmed: false, inputs: {} }),
    ).rejects.toThrow(HttpError)
    expect(hits).toBe(0)
    const result = await executeNamedAction(admin, created.entry.id, 'Ping', {
      confirmed: true,
      inputs: {},
    })
    expect(result.ok).toBe(true)
    expect(result.status).toBe(200)
    expect(result.body).toBe('[redacted]')
    expect(hits).toBe(1)
    const executed = listAudit('admin').find((row) => row.action === 'action.execute')
    expect(JSON.stringify(executed)).not.toContain('secret-pass')
    expect(JSON.stringify(executed)).toContain('[redacted]')

    expect(listRunnableActions(admin, created.entry.id).map((action) => action.name)).toEqual([
      'Ping',
      'Reboot',
    ])
    const cameraId = listEntries(admin, 'type:video').entries[0]?.id ?? ''
    expect(listRunnableActions(admin, cameraId).map((action) => action.name)).not.toContain(
      'Reboot',
    )
    expect(listRunnableActions(anonymous, created.entry.id).map((action) => action.name)).toEqual(
      [],
    )
  })
})

async function boot(): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), 'bookmark-actions-'))
  directories.push(directory)
  await bootApplication({
    secretKey: testSecretKey,
    databasePath: join(directory, 'bookmark.db'),
    migrationsFolder,
  })
}
