import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    env: {
      BOOKMARK_FAVICON_FETCH: '0',
      BOOKMARK_MONITORS: '0',
    },
    projects: [
      {
        test: {
          name: 'unit',
          include: ['test/unit/**/*.test.ts'],
          environment: 'node',
          env: {
            BOOKMARK_FAVICON_FETCH: '0',
            BOOKMARK_MONITORS: '0',
          },
        },
      },
      {
        test: {
          name: 'e2e',
          include: ['test/e2e/**/*.test.ts'],
          environment: 'node',
          env: {
            BOOKMARK_FAVICON_FETCH: '0',
            BOOKMARK_MONITORS: '0',
          },
          testTimeout: 180_000,
          hookTimeout: 180_000,
        },
      },
    ],
  },
})
