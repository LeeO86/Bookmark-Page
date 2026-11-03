import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './test/playwright',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    trace: 'retain-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : undefined,
  },
  projects: [
    {
      name: 'chromium-network',
      testMatch: '**/image-compat.spec.ts',
      use: { browserName: 'chromium' },
    },
    {
      name: 'firefox-network',
      testMatch: '**/image-compat.spec.ts',
      use: { browserName: 'firefox' },
    },
    {
      name: 'chromium',
      testIgnore: '**/image-compat.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
