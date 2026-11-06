import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { eq } from 'drizzle-orm'
import { afterEach, expect, it, vi } from 'vitest'
import { bootApplication } from '../../server/db/boot'
import { closeDatabase, getDatabase } from '../../server/db/client'
import { checks, checkStatus } from '../../server/db/schema'
import { anonymousActor } from '../../server/auth/permissions'
import { createEntry } from '../../server/services/entries'
import { entryWriteSchema } from '../../shared/contracts'
import { serverCheckSchedule, inFlightServerChecks } from '../../server/checks/schedule'
import { mapClaimToRole } from '../../server/config/env'
import { testSecretKey } from '../secret'
let directory = ''
afterEach(() => {
  inFlightServerChecks.clear()
  closeDatabase()
  vi.unstubAllEnvs()
  if (directory) rmSync(directory, { recursive: true, force: true })
})
it('schedules never-run probes first, then oldest checkedAt, with bounded capacity diagnostics and client checks excluded', async () => {
  directory = mkdtempSync(join(tmpdir(), 'bp-schedule-'))
  await bootApplication({
    secretKey: testSecretKey,
    databasePath: join(directory, 'bookmark.db'),
    migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)),
  })
  const entry = createEntry(
    { ...anonymousActor, role: 'admin', kind: 'user' },
    entryWriteSchema.parse({
      name: 'Queue fixture',
      checks: ['recent', 'oldest', 'never', 'fresh', 'client'].map((name) => ({
        name,
        kind: 'tcp',
        executor: name === 'client' ? 'client' : 'server',
        port: 1,
        intervalSeconds: 60,
      })),
    }),
  ).entry
  const timestamp = Date.now()
  const db = getDatabase()
  db.update(checks)
    .set({ createdAt: new Date(timestamp - 300000) })
    .run()
  for (const check of entry.checks) {
    const age = check.name === 'oldest' ? 181000 : check.name === 'recent' ? 61000 : 1000
    if (check.name === 'never' || check.name === 'client') continue
    db.insert(checkStatus)
      .values({
        checkId: check.id,
        state: 'up',
        latencyMs: 1,
        message: 'fixture',
        checkedAt: new Date(timestamp - age),
        reportedBy: 'server',
        createdAt: new Date(timestamp),
        updatedAt: new Date(timestamp),
      })
      .run()
  }
  vi.stubEnv('CHECK_CONCURRENCY', '2')
  const schedule = serverCheckSchedule(timestamp)
  expect(schedule.due.map((item) => item.check.name)).toEqual(['never', 'oldest', 'recent'])
  expect(schedule.concurrency).toBe(2)
  expect(schedule.overdue).toBe(2)
  expect(schedule.maxOverdueSeconds).toBe(300)
  db.update(checks)
    .set({ intervalSeconds: 300 })
    .where(eq(checks.id, entry.checks.find((c) => c.name === 'recent')!.id))
    .run()
  expect(serverCheckSchedule(timestamp).due.map((item) => item.check.name)).toEqual([
    'never',
    'oldest',
  ])
  vi.stubEnv('CHECK_CONCURRENCY', '2.5')
  expect(serverCheckSchedule(timestamp).concurrency).toBe(4)
})
it('ignores inherited property names in role mappings rather than treating them as mapped roles', () => {
  expect(mapClaimToRole(['constructor', '__proto__'], {})).toBe('viewer')
  expect(mapClaimToRole(['constructor'], { constructor: 'editor' })).toBe('editor')
})
