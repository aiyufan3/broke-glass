import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const SOURCE = new URL('../public/og-preview.svg', import.meta.url)
const OUTPUT = fileURLToPath(new URL('../public/og-preview.png', import.meta.url))
const CARD = { width: 1200, height: 630 }

const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || undefined })

try {
  const page = await browser.newPage({ viewport: CARD })
  await page.goto(SOURCE.href)
  await page.screenshot({ path: OUTPUT, clip: { x: 0, y: 0, ...CARD } })
  console.log(`Wrote ${OUTPUT}`)
} finally {
  await browser.close()
}
