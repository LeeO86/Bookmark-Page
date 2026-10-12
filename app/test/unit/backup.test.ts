import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { strFromU8, unzipSync } from 'fflate'
import { afterEach, describe, expect, it } from 'vitest'
import { createBackup } from '../../server/backup/export'
import { importCsv, parseCsv, previewCsv } from '../../server/backup/csv'
import { restoreBackup } from '../../server/backup/restore'
import type { Actor } from '../../server/auth/permissions'
import { bootApplication } from '../../server/db/boot'
import { closeDatabase } from '../../server/db/client'
import { clearSecretKey } from '../../server/db/keys'
import { createFieldDefinition } from '../../server/services/catalog'
import { createEntry, getEntry, listEntries, revealField } from '../../server/services/entries'
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

afterEach(() => {
  clearSecretKey()
  closeDatabase()
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('backup and csv import', () => {
  it('round-trips a backup and keeps secrets out unless a passphrase is set', async () => {
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
    const created = createEntry(admin, {
      name: 'Mixer',
      description: 'Lawo desk',
      host: '10.0.0.8',
      sort: 1,
      tags: ['type:audio'],
      links: [
        {
          label: 'Admin',
          urlTemplate: 'https://{{host}}/',
          type: 'web',
          isPrimary: true,
          sort: 0,
          iconRef: null,
        },
      ],
      fields: [{ key: 'password', value: 'secret-pass' }],
      checks: [],
      actions: [],
    })
    const plain = createBackup(admin, false, undefined)
    const plainJson = strFromU8(unzipSync(plain)['backup.json'] ?? new Uint8Array())
    expect(plainJson).not.toContain('secret-pass')
    expect(() =>
      restoreBackup(admin, createBackup(admin, true, 'backup-pass'), 'merge', true, undefined),
    ).toThrow(HttpError)
    expect(() =>
      restoreBackup(admin, createBackup(admin, true, 'backup-pass'), 'merge', false, 'wrong-pass'),
    ).toThrow(HttpError)

    const archive = createBackup(admin, true, 'backup-pass')
    const changed = listEntries(admin, '').entries[0]
    expect(changed).toBeTruthy()
    const preview = restoreBackup(admin, archive, 'replace', true, 'backup-pass')
    expect(preview.entriesDeleted).toBe(1)
    expect(getEntry(admin, created.entry.id).description).toBe('Lawo desk')
    restoreBackup(admin, archive, 'merge', false, 'backup-pass')
    expect(revealField(admin, created.entry.id, 'password').value).toBe('secret-pass')
  })

  it('merges a changed entry back to the backup and then stays unchanged', async () => {
    await boot()
    const created = createEntry(admin, {
      name: 'Camera',
      description: 'Studio',
      host: '10.0.0.9',
      sort: 0,
      tags: [],
      links: [],
      fields: [],
      checks: [],
      actions: [],
    })
    const archive = createBackup(admin, false, undefined)
    const { updateEntry } = await import('../../server/services/entries')
    updateEntry(admin, created.entry.id, { description: 'Changed' })
    const dry = restoreBackup(admin, archive, 'merge', true, undefined)
    expect(dry.entriesUpdated).toBe(1)
    expect(getEntry(admin, created.entry.id).description).toBe('Changed')
    const applied = restoreBackup(admin, archive, 'merge', false, undefined)
    expect(applied.entriesUpdated).toBe(1)
    expect(getEntry(admin, created.entry.id).description).toBe('Studio')
    const again = restoreBackup(admin, archive, 'merge', false, undefined)
    expect(again.entriesUnchanged).toBe(1)
    expect(again.entriesUpdated).toBe(0)
  })

  it('imports CSV rows and asks before writing a duplicate name', async () => {
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
    const csv =
      'Name,Host,Remarks,URL,Tags,Note\nMixer,10.0.0.8,"Lawo, desk",https://mixer/,type:audio,desk\n'
    expect(parseCsv(csv)[1]?.[2]).toBe('Lawo, desk')
    expect(previewCsv(csv).headers).toEqual(['Name', 'Host', 'Remarks', 'URL', 'Tags', 'Note'])
    const mapping = {
      name: 'Name',
      host: 'Host',
      description: 'Remarks',
      link: 'URL',
      tags: 'Tags',
      fields: { note: 'Note' },
    }
    const dry = importCsv(admin, csv, mapping, true, false)
    expect(dry.created).toBe(1)
    expect(listEntries(admin, '').entries).toHaveLength(0)
    const imported = importCsv(admin, csv, mapping, false, false)
    expect(imported.created).toBe(1)
    const entry = listEntries(admin, 'type:audio').entries[0]
    expect(entry?.description).toBe('Lawo, desk')
    expect(entry?.links[0]?.urlTemplate).toBe('https://mixer/')
    expect(entry?.fields.find((field) => field.key === 'note')?.value).toBe('desk')
    const duplicate = importCsv(admin, csv, mapping, false, false)
    expect(duplicate.needsConfirmation).toBe(true)
    expect(listEntries(admin, '').entries).toHaveLength(1)
    const confirmed = importCsv(admin, csv, mapping, false, true)
    expect(confirmed.created).toBe(1)
    expect(listEntries(admin, '').entries).toHaveLength(2)
  })
})

async function boot(): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), 'bookmark-backup-'))
  directories.push(directory)
  await bootApplication({
    secretKey: testSecretKey,
    databasePath: join(directory, 'bookmark.db'),
    migrationsFolder,
  })
}
