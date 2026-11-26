import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { createServer } from 'vite'

const OUTPUT = new URL('./silhouettes.json', import.meta.url)
const GRID = { columns: 13, rows: 29 }
// Vite's default host is localhost, which macOS resolves to ::1 first; pin IPv4 so the server
// listens on the address the browser opens.
const HOST = '127.0.0.1'
const PORT = 5183

function sample({ png, grid }) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onerror = reject
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const context = canvas.getContext('2d')
      context.drawImage(image, 0, 0)
      const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height)
      const cells = []
      for (let row = 0; row < grid.rows; row++) {
        for (let column = 0; column < grid.columns; column++) {
          const left = Math.round(column * width / grid.columns)
          const right = Math.round((column + 1) * width / grid.columns)
          const top = Math.round(row * height / grid.rows)
          const bottom = Math.round((row + 1) * height / grid.rows)
          let sum = 0
          for (let y = top; y < bottom; y++) {
            for (let x = left; x < right; x++) {
              const offset = (y * width + x) * 4
              // Rec. 709 luma; the filtered plate is already grey, so the weights only guard against rounding.
              sum += .2126 * data[offset] + .7152 * data[offset + 1] + .0722 * data[offset + 2]
            }
          }
          cells.push(Math.round(sum / ((right - left) * (bottom - top))))
        }
      }
      resolve(cells)
    }
    image.src = `data:image/png;base64,${png}`
  })
}

const server = await createServer({ server: { host: HOST, port: PORT, strictPort: true }, logLevel: 'error' })
await server.listen()
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || undefined })

try {
  const { paradigmIds, paradigms } = await server.ssrLoadModule('/src/data/paradigms.ts')
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 2, reducedMotion: 'reduce' })
  // The TelemetryOS plate prints the wall clock; a fixed time keeps the measurement reproducible.
  await page.clock.setFixedTime(new Date('2026-01-01T09:41:00'))
  await page.goto(`http://${HOST}:${PORT}/`)
  await page.evaluate(() => document.fonts.ready)
  await page.addStyleTag({ content: '.plate .iphone-screen { border-radius: 0 !important; }' })
  await page.getByRole('button', { name: /Silhouette test/ }).click()
  await page.waitForTimeout(400)

  const screens = await page.locator('.plate .iphone-screen').all()
  const plates = []
  for (const [index, id] of paradigmIds.entries()) {
    const png = (await screens[index].screenshot()).toString('base64')
    const cells = await page.evaluate(sample, { png, grid: GRID })
    plates.push({
      id,
      name: paradigms[id].name,
      colors: paradigms[id].colors,
      luminance: cells.map((value) => value.toString(16).padStart(2, '0')).join(''),
    })
  }
  await writeFile(OUTPUT, `${JSON.stringify({ filter: 'grayscale(1) blur(12px)', grid: GRID, plates }, null, 2)}\n`)
  console.log(`Wrote ${fileURLToPath(OUTPUT)}`)
} finally {
  await browser.close()
  await server.close()
}
