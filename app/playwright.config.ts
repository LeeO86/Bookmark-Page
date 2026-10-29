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
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
