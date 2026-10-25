import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { ipInCidrs } from '../../server/auth/proxy'
import { clearRateLimit, consumeRateLimit } from '../../server/auth/rate-limit'
import type { Actor } from '../../server/auth/permissions'
import { bootApplication } from '../../server/db/boot'
import { closeDatabase } from '../../server/db/client'
import { decryptSecret, encryptSecret } from '../../server/db/crypto'
import { clearSecretKey } from '../../server/db/keys'
import { writeStatus } from '../../server/checks/run'
import { parseQuery } from '../../shared/query'
import {
  createFieldDefinition,
  createFilter,
  updateFieldDefinition,
  ensureScope,
  listScopes,
  updateScope,
} from '../../server/services/catalog'
import {
  createEntry,
  deleteEntry,
  deleteManagedEntry,
  getEntry,
  listEntries,
  listEntryHistory,
  restoreEntry,
  revealField,
  updateEntry,
  upsertManagedEntry,
} from '../../server/services/entries'
import { readLogo, saveLogo } from '../../server/services/settings'
import { listAudit } from '../../server/services/audit'
import { syncScope } from '../../server/services/sync'
import { HttpError } from '../../server/http/errors'
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
const editor: Actor = { ...admin, role: 'editor', label: 'editor' }
const viewer: Actor = { ...admin, role: 'viewer', label: 'viewer' }
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

describe('parseQuery', () => {
  it('parses precedence, negation, and phrases', () => {
    const parsed = parseQuery('type:audio (room:studio1 OR room:studio2) -status:spare lawo')
    expect(parsed.ok).toBe(true)
    if (!parsed.ok || !parsed.ast) {
      return
    }
    expect(parsed.ast.type).toBe('and')
    const orQuery = parseQuery('a OR b c')
    expect(orQuery.ok && orQuery.ast?.type).toBe('or')
    const notQuery = parseQuery('NOT a OR b')
    expect(notQuery.ok && notQuery.ast?.type).toBe('or')
    const phrase = parseQuery('"studio 1"')
    expect(phrase.ok && phrase.ast).toEqual({ type: 'text', value: 'studio 1' })
    expect(parseQuery('is:UP').ok).toBe(true)
    const state = parseQuery('state:offline')
    expect(state.ok && state.ast).toEqual({ type: 'state', value: 'offline' })
    expect(parseQuery('state:sideways').ok).toBe(false)
    expect(parseQuery('type:*').ok).toBe(true)
    expect(parseQuery('(a').ok).toBe(false)
    expect(parseQuery('"open').ok).toBe(false)
  })
})

describe('entries, visibility, secrets, and sync', () => {
  it('keeps anonymous queries inside public filters and hides secret values', async () => {
    await boot()
    await createFieldDefinition(admin, {
      key: 'note',
      label: 'Note',
      type: 'text',
      minRoleToView: 'anonymous',
      searchable: true,
      showAsColumnDefault: true,
      sort: 0,
    })
    await createFieldDefinition(admin, {
      key: 'password',
      label: 'Password',
      type: 'secret',
      minRoleToView: 'viewer',
      searchable: true,
      showAsColumnDefault: false,
      sort: 1,
    })
    await createFieldDefinition(admin, {
      key: 'serial',
      label: 'Serial',
      type: 'text',
      minRoleToView: 'admin',
      searchable: true,
      showAsColumnDefault: false,
      sort: 2,
    })
    createFilter(admin, {
      name: 'Audio',
      query: 'type:audio',
      columns: [],
      sort: 0,
      isPublic: true,
      global: true,
    })
    const audio = createEntry(
      admin,
      entry('Mixer', 'type:audio', {
        note: 'lawo desk',
        password: 'secret-pass',
        serial: 'SN-1',
      }),
    )
    createEntry(
      admin,
      entry('Camera', 'type:video', { note: 'cam', password: 'x', serial: 'SN-2' }, '10.0.0.6'),
    )

    const anonymousList = listEntries(anonymous, 'type:audio OR type:video')
    expect(anonymousList.entries.map((item) => item.name)).toEqual(['Mixer'])
    expect(anonymousList.entries[0]?.fields.map((field) => field.key)).toEqual(['note'])

    const viewerList = listEntries(viewer, '')
    expect(viewerList.entries.map((item) => item.name).sort()).toEqual(['Camera', 'Mixer'])
    const mixer = viewerList.entries.find((item) => item.name === 'Mixer')
    expect(mixer?.fields.find((field) => field.key === 'password')).toMatchObject({
      masked: true,
      value: null,
    })
    expect(mixer?.fields.some((field) => field.key === 'serial')).toBe(false)

    expect(() => getEntry(anonymous, audio.entry.id)).not.toThrow()
    expect(() =>
      getEntry(anonymous, viewerList.entries.find((item) => item.name === 'Camera')?.id ?? ''),
    ).toThrow(HttpError)

    expect(listEntries(admin, 'secret-pass').entries).toHaveLength(0)
    expect(listEntries(admin, 'lawo desk').entries).toHaveLength(1)
    expect(listEntries(admin, "' OR 1=1").entries).toHaveLength(0)

    const revealed = revealField(viewer, audio.entry.id, 'password')
    expect(revealed.value).toBe('secret-pass')
    const audit = JSON.stringify(listAudit('admin'))
    expect(audit).not.toContain('secret-pass')
    expect(audit).toContain('field.reveal')
  })

  it('preserves user-added tags and blocks managed attribute edits', async () => {
    await boot()
    ensureScope('studio', admin)
    const first = upsertManagedEntry(
      'studio',
      {
        externalKey: 'mixer-1',
        name: 'Mixer',
        host: '10.0.0.8',
        tags: ['type:audio'],
        links: [
          {
            label: 'Admin',
            urlTemplate: 'https://{{host}}/admin',
            type: 'web',
            isPrimary: true,
            sort: 0,
            iconRef: null,
          },
        ],
      },
      admin,
    )
    expect(first).toBe('created')
    const created = listEntries(admin, 'type:audio').entries[0]
    expect(created?.links[0]?.url).toBe('https://10.0.0.8/admin')
    expect(created?.editMode).toBe('field_ownership')

    updateEntry(editor, created?.id ?? '', { tags: ['type:audio', 'room:studio1'] })
    expect(() => updateEntry(editor, created?.id ?? '', { name: 'Renamed' })).toThrow(HttpError)

    const synced = syncScope(admin, 'studio', {
      dryRun: true,
      purge: true,
      entries: [
        {
          externalKey: 'mixer-1',
          name: 'Mixer',
          host: '10.0.0.9',
          tags: ['type:audio'],
        },
      ],
    })
    expect(synced.updated.map((item) => item.externalKey)).toEqual(['mixer-1'])
    expect(listEntries(admin, '').entries[0]?.host).toBe('10.0.0.8')

    syncScope(admin, 'studio', {
      dryRun: false,
      purge: false,
      entries: [
        {
          externalKey: 'mixer-1',
          name: 'Mixer',
          host: '10.0.0.9',
          tags: ['type:audio'],
        },
      ],
    })
    const after = listEntries(admin, '').entries[0]
    expect(after?.host).toBe('10.0.0.9')
    expect(after?.tags.map((tag) => tag.label).sort()).toEqual(['room:studio1', 'type:audio'])
    expect(after?.links).toHaveLength(1)

    const scope = listScopes()[0]
    if (!scope) {
      throw new Error('scope missing')
    }
    updateScope(admin, scope.id, 'free')
    updateEntry(editor, after?.id ?? '', { name: 'Renamed' })
    expect(getEntry(editor, after?.id ?? '').name).toBe('Renamed')
  })
})

describe('duplicate confirmation, restore, and logo', () => {
  it('does not store a duplicate until it is confirmed', async () => {
    await boot()
    createEntry(admin, entry('Mixer', 'type:audio', {}, '10.0.0.8'))
    expect(() => createEntry(admin, entry('Mixer', 'type:video', {}, '10.0.0.9'))).toThrow(
      HttpError,
    )
    try {
      createEntry(admin, entry('Mixer', 'type:video', {}, '10.0.0.9'))
    } catch (error) {
      expect(error).toMatchObject({ statusCode: 409, code: 'confirm_duplicate' })
    }
    expect(listEntries(admin, '').entries).toHaveLength(1)
    createEntry(admin, { ...entry('Mixer', 'type:video', {}, '10.0.0.9'), confirmDuplicates: true })
    expect(listEntries(admin, '').entries).toHaveLength(2)

    const original = listEntries(admin, 'type:audio').entries[0]
    expect(() => updateEntry(admin, original?.id ?? '', { host: '10.0.0.9' })).toThrow(HttpError)
    expect(getEntry(admin, original?.id ?? '').host).toBe('10.0.0.8')
    updateEntry(admin, original?.id ?? '', { host: '10.0.0.9', confirmDuplicates: true })
    expect(getEntry(admin, original?.id ?? '').host).toBe('10.0.0.9')
  })

  it('keeps secret values when a version is restored or a field is omitted', async () => {
    await boot()
    await createFieldDefinition(admin, {
      key: 'note',
      label: 'Note',
      type: 'text',
      minRoleToView: 'viewer',
      searchable: true,
      showAsColumnDefault: false,
      sort: 0,
    })
    await createFieldDefinition(admin, {
      key: 'password',
      label: 'Password',
      type: 'secret',
      minRoleToView: 'viewer',
      searchable: false,
      showAsColumnDefault: false,
      sort: 1,
    })
    const created = createEntry(
      admin,
      entry('Mixer', 'type:audio', { note: 'first', password: 'secret-pass' }, '10.1.1.1'),
    )
    updateEntry(admin, created.entry.id, { description: 'edited' })
    updateEntry(admin, created.entry.id, { fields: [{ key: 'note', value: 'changed' }] })
    expect(revealField(admin, created.entry.id, 'password').value).toBe('secret-pass')
    expect(
      getEntry(admin, created.entry.id).fields.find((field) => field.key === 'note')?.value,
    ).toBe('changed')

    const history = listEntryHistory(admin, created.entry.id)
    const createdRow = history.find((row) => row.action === 'entry.create')
    expect(createdRow?.restorable).toBe(true)
    expect(JSON.stringify(history)).not.toContain('secret-pass')
    restoreEntry(admin, created.entry.id, createdRow?.id ?? '')
    expect(getEntry(admin, created.entry.id).description).toBe('')
    expect(revealField(admin, created.entry.id, 'password').value).toBe('secret-pass')
    expect(JSON.stringify(listEntryHistory(admin, created.entry.id))).not.toContain('[redacted]')
  })

  it('accepts PNG, WebP, and sanitised SVG logos and rejects other content', async () => {
    await boot()
    const png =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    saveLogo('image/png', png, null)
    expect(readLogo()?.contentType).toBe('image/png')
    const webp = Buffer.alloc(16)
    webp.write('RIFF', 0)
    webp.writeUInt32LE(8, 4)
    webp.write('WEBP', 8)
    saveLogo('image/webp', webp.toString('base64'), null)
    expect(readLogo()?.contentType).toBe('image/webp')
    saveLogo(
      'image/svg+xml',
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect width="8" height="8" fill="#111111"/></svg>',
      ).toString('base64'),
      null,
    )
    expect(readLogo()?.contentType).toBe('image/svg+xml')
    expect(readLogo()?.bytes.toString('utf8')).not.toContain('script')
    expect(() => saveLogo('image/gif', png, null)).toThrow(HttpError)
    expect(() => saveLogo('image/png', webp.toString('base64'), null)).toThrow(HttpError)
  })
})

describe('crypto, proxy, and rate limit', () => {
  it('round-trips secrets and matches proxy CIDRs', async () => {
    await boot()
    const encoded = encryptSecret('secret-pass')
    expect(encoded).not.toContain('secret-pass')
    expect(decryptSecret(encoded)).toBe('secret-pass')
    expect(ipInCidrs('10.1.2.3', ['10.0.0.0/8'])).toBe(true)
    expect(ipInCidrs('10.1.2.3', ['192.168.0.0/16'])).toBe(false)
    expect(ipInCidrs('::ffff:127.0.0.1', ['127.0.0.1/32'])).toBe(true)
    expect(ipInCidrs('::1', ['::1/128'])).toBe(true)
    expect(ipInCidrs('8.8.8.8', ['127.0.0.1/32'])).toBe(false)
    clearRateLimit('login:test')
    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect(consumeRateLimit('login:test', 10, 1000)).toBe(true)
    }
    expect(consumeRateLimit('login:test', 10, 1000)).toBe(false)
  })
})

describe('field definitions and sync idempotence', () => {
  it('updates a field definition and refuses a new key', async () => {
    await boot()
    const created = createFieldDefinition(admin, {
      key: 'note',
      label: 'Note',
      type: 'text',
      minRoleToView: 'viewer',
      searchable: true,
      showAsColumnDefault: false,
      sort: 0,
    })
    const updated = updateFieldDefinition(admin, created.id, {
      label: 'Notes',
      showAsColumnDefault: true,
    })
    expect(updated).toMatchObject({ key: 'note', label: 'Notes', showAsColumnDefault: true })
    expect(() => updateFieldDefinition(admin, created.id, { key: 'other' })).toThrow(HttpError)
    const secret = updateFieldDefinition(admin, created.id, { type: 'secret', searchable: true })
    expect(secret).toMatchObject({ type: 'secret', searchable: false })
  })

  it('does not rewrite an unchanged managed entry', async () => {
    await boot()
    await createFieldDefinition(admin, {
      key: 'password',
      label: 'Password',
      type: 'secret',
      minRoleToView: 'viewer',
      searchable: false,
      showAsColumnDefault: false,
      sort: 0,
    })
    const payload = {
      externalKey: 'mixer-1',
      name: 'Mixer',
      host: '10.0.0.8',
      description: 'Lawo',
      tags: ['type:audio'],
      fields: [{ key: 'password', value: 'secret-pass' }],
      checks: [
        {
          name: 'Ping',
          kind: 'icmp' as const,
          executor: 'server' as const,
          intervalSeconds: 60,
          timeoutMs: 5000,
          tlsVerify: false,
        },
      ],
    }
    ensureScope('studio', admin)
    expect(upsertManagedEntry('studio', payload, admin)).toBe('created')
    const managed = listEntries(admin, 'type:audio').entries[0]
    expect(() => deleteEntry(admin, managed?.id ?? '')).toThrow(HttpError)
    deleteManagedEntry('studio', 'mixer-1', admin)
    expect(listEntries(admin, 'type:audio').entries).toHaveLength(0)
    expect(upsertManagedEntry('studio', payload, admin)).toBe('created')
    const created = listEntries(admin, 'type:audio').entries[0]
    expect(upsertManagedEntry('studio', payload, admin)).toBe('unchanged')
    const again = listEntries(admin, 'type:audio').entries[0]
    expect(again?.checks[0]?.id).toBe(created?.checks[0]?.id)
    expect(again?.updatedAt).toBe(created?.updatedAt)
    expect(upsertManagedEntry('studio', { ...payload, host: '10.0.0.9' }, admin)).toBe('updated')
    expect(
      upsertManagedEntry(
        'studio',
        { ...payload, host: '10.0.0.9', fields: [{ key: 'password', value: 'secret-pass' }] },
        admin,
      ),
    ).toBe('unchanged')
    expect(
      upsertManagedEntry(
        'studio',
        { ...payload, host: '10.0.0.9', fields: [{ key: 'password', value: 'next-secret' }] },
        admin,
      ),
    ).toBe('updated')
  })
})

describe('state query', () => {
  it('keeps entries with no check out of state:unknown', async () => {
    await boot()
    const up = createEntry(admin, {
      ...entry('Up', 'type:audio', {}, '10.1.0.1'),
      checks: [ping('Up ping')],
    })
    const down = createEntry(admin, {
      ...entry('Down', 'type:audio', {}, '10.1.0.2'),
      checks: [ping('Down ping')],
    })
    const unclear = createEntry(admin, {
      ...entry('Unclear', 'type:audio', {}, '10.1.0.3'),
      checks: [ping('Unclear ping')],
    })
    createEntry(admin, entry('Quiet', 'type:audio', {}, '10.1.0.4'))
    writeStatus(checkId(up.entry.id), { state: 'up', latencyMs: 1, message: 'ok' }, 'test')
    writeStatus(checkId(down.entry.id), { state: 'down', latencyMs: 2, message: 'down' }, 'test')
    writeStatus(
      checkId(unclear.entry.id),
      { state: 'unknown', latencyMs: null, message: 'unknown' },
      'test',
    )
    expect(names('state:online')).toEqual(['Up'])
    expect(names('state:offline')).toEqual(['Down'])
    expect(names('state:unknown')).toEqual(['Unclear'])
    expect(names('is:unknown')).toEqual(['Quiet', 'Unclear'])
  })
})

function checkId(entryId: string): string {
  return getEntry(admin, entryId).checks[0]?.id ?? ''
}

function names(query: string): string[] {
  return listEntries(admin, query)
    .entries.map((entry) => entry.name)
    .sort()
}

function ping(name: string) {
  return {
    name,
    kind: 'icmp' as const,
    executor: 'server' as const,
    intervalSeconds: 60,
    timeoutMs: 1000,
    tlsVerify: false,
  }
}

async function boot(): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), 'bookmark-domain-'))
  directories.push(directory)
  await bootApplication({
    secretKey: testSecretKey,
    databasePath: join(directory, 'bookmark.db'),
    migrationsFolder,
  })
}

function entry(name: string, tag: string, fields: Record<string, string>, host = '10.0.0.5') {
  return {
    name,
    description: '',
    host,
    iconRef: null,
    sort: 0,
    tags: [tag],
    links: [],
    fields: Object.entries(fields).map(([key, value]) => ({ key, value })),
    checks: [],
    actions: [],
  }
}
