import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  // Pure-function suites run under Vitest (npm run test:unit); Playwright owns the browser.
  testIgnore: '**/unit/**',
  fullyParallel: false,
  use: {
    baseURL: process.env.SHOWCASE_URL || 'http://127.0.0.1:5173',
    viewport: { width: 1440, height: 980 },
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
  },
  webServer: process.env.SHOWCASE_URL ? undefined : {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
  },
})
