import { spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { $fetch, fetch, setup, useTestContext } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'
import { healthResponseSchema } from '../../shared/health'
import { testSecretKey } from '../secret'

const rootDir = fileURLToPath(new URL('../..', import.meta.url))
const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url))

describe('application', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'bookmark-e2e-'))
  process.env.BOOKMARK_SECRET_KEY = testSecretKey
  process.env.DATABASE_PATH = join(directory, 'bookmark.db')
  process.env.MIGRATIONS_FOLDER = migrationsFolder

  await setup({
    rootDir,
    server: true,
    browser: false,
  })

  it('serves the home page', async () => {
    const html = await $fetch<string>('/')
    expect(html).toContain('Bookmark-Page')
  })

  it('reports health when the database is reachable', async () => {
    const response = await fetch('/api/health')
    expect(response.status).toBe(200)
    const body: unknown = await response.json()
    expect(healthResponseSchema.parse(body)).toEqual({
      status: 'ok',
      database: 'ok',
    })
  })

  it('refuses to start without BOOKMARK_SECRET_KEY', () => {
    const outputDir = useTestContext().nuxt?.options.nitro.output?.dir
    if (!outputDir) {
      throw new Error('Nuxt output directory is unavailable')
    }
    const result = spawnSync(process.execPath, [resolve(outputDir, 'server/index.mjs')], {
      cwd: rootDir,
      env: {
        ...process.env,
        BOOKMARK_SECRET_KEY: '',
        DATABASE_PATH: join(directory, 'refused.db'),
        MIGRATIONS_FOLDER: migrationsFolder,
      },
      encoding: 'utf8',
      timeout: 30_000,
    })

    expect(result.status).toBe(1)
    expect(`${result.stdout}\n${result.stderr}`).toContain('BOOKMARK_SECRET_KEY is required')
  })
})
