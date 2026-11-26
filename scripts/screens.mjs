import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { chromium } from '@playwright/test'
import { createServer } from 'vite'

const OUTPUT = resolve(process.argv[2] ?? 'screens.local')
// Vite's default host is localhost, which macOS resolves to ::1 first; pin IPv4 so the server
// listens on the address the browser opens.
const HOST = '127.0.0.1'
const PORT = 5183
const ORIGIN = `http://${HOST}:${PORT}/`
const DESKTOP = { width: 1440, height: 900 }
// The focus device renders at 393 × 852 only when the viewport is at least 1002 px tall.
const STAGE = { width: 1440, height: 1080 }
const PHONE = { width: 393, height: 852 }
const TRANSPARENT = 'html, body, #root, main, .focus-stage, .focus-device { background: transparent !important; }'

const command = (page) => page.getByRole('textbox', { name: 'Console command' })
const slider = (page, name) => page.getByRole('slider', { name, exact: true })

async function open(page, hash = '') {
  await page.mouse.move(4, 4)
  await page.goto(`${ORIGIN}${hash}`)
  await page.reload()
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(700)
}

async function nudge(page, name, steps) {
  await slider(page, name).focus()
  for (const key of steps) await page.keyboard.press(key)
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
}

async function spike(page) {
  await command(page).fill('spike')
  await command(page).press('Enter')
  await command(page).blur()
}

async function hoverAt(page, selector, x, y) {
  const box = await page.locator(selector).boundingBox()
  await page.mouse.move(box.x + box.width * x, box.y + box.height * y, { steps: 12 })
}

const focus = {
  field: async (page) => {
    await hoverAt(page, '.focus-device .field-os', .66, .63)
    await page.waitForTimeout(1400)
  },
  wetware: async (page) => {
    await nudge(page, 'Synapse Speed', ['ArrowRight', 'ArrowLeft'])
    await page.waitForTimeout(420)
  },
  quantum: async (page) => {
    await nudge(page, 'RGB Dispersion', ['ArrowRight', 'ArrowRight'])
    await page.locator('.quantum-coordinate').nth(1).hover()
    await page.waitForTimeout(1500)
  },
  telemetry: async (page) => {
    await page.locator('.tel-row').nth(1).click()
    await page.waitForTimeout(1600)
  },
  spatial: async (page) => {
    await hoverAt(page, '.focus-device .spatial-os', .82, .7)
    await page.waitForTimeout(1600)
  },
}

const active = {
  field: async (page) => {
    await page.locator('.field-node').nth(1).click()
    await page.waitForTimeout(900)
    await page.getByRole('button', { name: 'Stress mode' }).click()
    await page.waitForTimeout(1400)
  },
  wetware: async (page) => {
    await page.locator('.wet-cell').nth(0).click()
    await page.waitForTimeout(900)
    await spike(page)
    await page.waitForTimeout(1200)
  },
  quantum: async (page) => {
    await page.locator('.quantum-coordinate').nth(1).click()
    await page.waitForTimeout(900)
    await page.getByRole('button', { name: /Stress mode/ }).click()
    await page.waitForTimeout(1600)
  },
  telemetry: async (page) => {
    await page.locator('.tel-row').nth(0).click()
    await page.waitForTimeout(900)
    await spike(page)
    await page.waitForTimeout(1400)
  },
  spatial: async (page) => {
    await page.locator('.spatial-plane').nth(1).click()
    await page.waitForTimeout(1900)
    await page.getByRole('button', { name: /Stress mode/ }).click()
    await page.waitForTimeout(1200)
  },
}

const server = await createServer({ server: { host: HOST, port: PORT, strictPort: true }, logLevel: 'error' })
await server.listen()
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || undefined })
const written = []

async function capture(target, path, options = {}) {
  const file = join(OUTPUT, path)
  await target.screenshot({ path: file, ...options })
  written.push(file)
}

try {
  await mkdir(join(OUTPUT, 'paradigms'), { recursive: true })
  const { paradigmIds } = await server.ssrLoadModule('/src/data/paradigms.ts')

  const desktop = await browser.newPage({ viewport: DESKTOP, deviceScaleFactor: 2 })
  await open(desktop)
  await capture(desktop, '00-gallery-overview@2x.png')
  for (const [index, id] of paradigmIds.entries()) {
    await open(desktop, `#${id}`)
    await focus[id]?.(desktop)
    await capture(desktop, `${String(index + 1).padStart(2, '0')}-focus-${id}-os@2x.png`)
  }

  await desktop.close()

  const stage = await browser.newPage({ viewport: STAGE, deviceScaleFactor: 2 })
  for (const id of paradigmIds) {
    for (const [state, setUp] of [['home'], ['active', active[id]]]) {
      await open(stage, `#${id}`)
      await setUp?.(stage)
      await stage.mouse.move(4, 4)
      await stage.addStyleTag({ content: TRANSPARENT })
      const box = await stage.locator('.focus-device .iphone').boundingBox()
      const clip = { x: Math.round(box.x), y: Math.round(box.y), width: PHONE.width, height: PHONE.height }
      await capture(stage, `paradigms/${id}-os-${state}@2x.png`, { clip, omitBackground: true })
    }
  }
  await stage.close()

  const phone = await browser.newPage({ viewport: PHONE, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  await open(phone)
  await capture(phone, '06-mobile-gallery-banner@2x.png')
  await phone.getByRole('button', { name: 'Try Native Fullscreen OS' }).tap()
  await phone.getByRole('combobox', { name: 'Fullscreen theme' }).selectOption('wetware')
  await phone.waitForTimeout(1200)
  await capture(phone, '07-mobile-native-fullscreen@2x.png')
  await phone.close()

  for (const file of written) console.log(`Wrote ${file}`)
} finally {
  await browser.close()
  await server.close()
}
