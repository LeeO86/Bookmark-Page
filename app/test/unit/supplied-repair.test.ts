import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import { bootApplication } from '../../server/db/boot'
import { closeDatabase, getDatabase, openDatabase, migrateDatabase } from '../../server/db/client'
import { faviconCache } from '../../server/db/schema'
import { testSecretKey } from '../secret'
let directory = ''
afterEach(() => {
  closeDatabase()
  if (directory) rmSync(directory, { recursive: true, force: true })
})
it('repairs legacy supplied-slot errors without changing bytes, provenance or attempt time', async () => {
  directory = mkdtempSync(join(tmpdir(), 'bp-supply-repair-'))
  const current = fileURLToPath(new URL('../../drizzle', import.meta.url))
  const old = join(directory, 'old-migrations')
  mkdirSync(join(old, 'meta'), { recursive: true })
  const journal = JSON.parse(readFileSync(join(current, 'meta/_journal.json'), 'utf8'))
  journal.entries = journal.entries.filter((entry: { idx: number }) => entry.idx < 11)
  writeFileSync(join(old, 'meta/_journal.json'), JSON.stringify(journal))
  for (const entry of journal.entries)
    copyFileSync(join(current, entry.tag + '.sql'), join(old, entry.tag + '.sql'))
  const databasePath = join(directory, 'bookmark.db')
  const legacy = openDatabase(databasePath)
  migrateDatabase(legacy, old)
  const stamp = new Date('2026-11-06T12:00:00.000Z')
  const bytes = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')
  legacy
    .insert(faviconCache)
    .values({
      id: 'legacy-supplied',
      origin: 'https://device.example',
      sourceUrl: 'https://device.example',
      status: 'error',
      imageSource: 'supplied',
      mediaType: 'image/svg+xml',
      byteSize: bytes.length,
      data: bytes,
      suppliedBy: 'fixture-admin',
      suppliedAt: stamp,
      fetchedAt: stamp,
      failureCount: 4,
      failureKind: 'temporary',
      error: 'Timed out',
      createdAt: stamp,
      updatedAt: stamp,
    })
    .run()
  legacy.$client.close()
  await bootApplication({ secretKey: testSecretKey, databasePath, migrationsFolder: current })
  expect(getDatabase().select().from(faviconCache).get()).toMatchObject({
    status: 'ok',
    error: null,
    failureCount: 0,
    imageSource: 'supplied',
    data: bytes,
    suppliedBy: 'fixture-admin',
    suppliedAt: stamp,
    fetchedAt: stamp,
    updatedAt: stamp,
  })
})
