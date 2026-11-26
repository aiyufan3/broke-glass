import { defineConfig } from '@playwright/test'

// PLAYWRIGHT_PREVIEW=1 runs the suite against the production bundle in dist/ (npm run build first);
// otherwise it runs against the dev server, where development-only warnings also fail the suite.
const preview = process.env.PLAYWRIGHT_PREVIEW === '1'
const origin = preview ? 'http://127.0.0.1:4173' : 'http://127.0.0.1:5173'

export default defineConfig({
  testDir: './tests',
  // Pure-function suites run under Vitest (npm run test:unit); Playwright owns the browser.
  testIgnore: '**/unit/**',
  fullyParallel: false,
  use: {
    baseURL: process.env.SHOWCASE_URL || origin,
    viewport: { width: 1440, height: 980 },
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
  },
  webServer: process.env.SHOWCASE_URL ? undefined : {
    command: preview ? 'npx vite preview --host 127.0.0.1 --port 4173 --strictPort' : 'npm run dev',
    url: origin,
    reuseExistingServer: !process.env.CI,
  },
})
