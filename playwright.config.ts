import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:8080',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // CI installs bundled Chromium; local fallback: PLAYWRIGHT_USE_CHROME=1
        ...(process.env.PLAYWRIGHT_USE_CHROME === '1'
          ? { channel: 'chrome' as const }
          : {}),
      },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npx tsx gateway/src/index.ts',
        url: 'http://127.0.0.1:8080/health',
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
        env: {
          PROTOCOL: 'mock',
          PORT: '8080',
          HOST: '127.0.0.1',
          NODE_ENV: 'production',
        },
      },
})
