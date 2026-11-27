import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

/*
 * Pixel regression on each engine's settled frame. Not a screenshot diff: each renderer's canvas
 * is sampled on a 12 × 26 grid, and every sample is the mean RGB of a 5 × 5 CSS px window centred
 * on its grid point, so a moved contour, a new colour or a changed density shows while
 * sub-pixel anti-aliasing does not.
 *
 * The frame is the one the gallery and reduced motion get: prefers-reduced-motion makes
 * useFrameLoop issue `still` frames, which render the engine's settled state, exactly as the
 * release suite reads frames. The wall clock is fixed because TelemetryOS prints it.
 *
 * Canvas text is drawn in the host's system monospace (SF Mono on macOS; on Linux whatever
 * fontconfig resolves, which differs between the Playwright image and the GitHub runner). Glyphs
 * are the operating system's, not the renderer's, so in this suite fillText paints a solid block
 * with the string's length, size, colour, alignment and baseline instead. Where a label is,
 * how long it is and what colour it has stay locked; the font does not decide the result.
 *
 * UPDATE_BASELINES=1 npm run test:e2e -- tests/settled.spec.mjs rewrites the baseline instead of
 * comparing against it. Only do that for an intended change to a renderer, and commit the JSON with it.
 */
const BASELINE = new URL('./baselines/settled-samples.json', import.meta.url)
const GRID = { columns: 12, rows: 26 }
const WINDOW = 5
/*
 * Largest allowed difference per channel, in 0–255 levels. Measured 2026-11-27 with text as blocks:
 * three macOS runs differ by 0 on every channel of every sample, two runs in the Linux amd64
 * Playwright image (mcr.microsoft.com/playwright:v1.65.1-noble) differ by 0, the same frame read
 * twice differs by 0, and Linux against the macOS baseline differs by at most 1 (one QuantumOS
 * sample). 8 is that worst case with a wide margin for other GPUs and Chromium patch releases,
 * and still fails any colour or geometry change the grid can see.
 */
const TOLERANCE = 8
const update = process.env.UPDATE_BASELINES === '1'

/** Each paradigm's renderer canvas: the surface its engine paints every settled frame into. */
const engines = {
  field: '.field-map',
  wetware: '.wet-tissue',
  quantum: '.quantum-sky',
  telemetry: '.tel-surface',
  spatial: '.spatial-corridor',
  strata: '.strata-section',
  infinity: '.infinity-field',
}

test.use({ viewport: { width: 1440, height: 980 }, deviceScaleFactor: 1 })

/** Replaces canvas glyphs with blocks of the same extent, so system fonts cannot move a sample. */
function blockText() {
  CanvasRenderingContext2D.prototype.fillText = function (text, x, y) {
    const size = parseFloat(/(\d+(?:\.\d+)?)px/.exec(this.font)?.[1] ?? '10')
    const width = String(text).length * size * .6
    const align = this.textAlign
    const left = align === 'right' || align === 'end' ? x - width : align === 'center' ? x - width / 2 : x
    const baseline = this.textBaseline
    const top = baseline === 'top' || baseline === 'hanging' ? y : baseline === 'middle' ? y - size / 2 : y - size * .8
    this.fillRect(left, top, width, size)
  }
}

function sample(canvas, { grid, window }) {
  const copy = new OffscreenCanvas(canvas.width, canvas.height)
  const context = copy.getContext('2d', { willReadFrequently: true })
  context.drawImage(canvas, 0, 0)
  const { data } = context.getImageData(0, 0, copy.width, copy.height)
  // Backing pixels per CSS pixel of the canvas's own layout box, before any gallery or fullscreen scaling.
  const scale = canvas.width / canvas.offsetWidth
  const half = Math.max(1, Math.round(window * scale / 2))
  const points = []
  for (let row = 0; row < grid.rows; row++) {
    for (let column = 0; column < grid.columns; column++) {
      const cx = Math.round((column + .5) * canvas.width / grid.columns)
      const cy = Math.round((row + .5) * canvas.height / grid.rows)
      const sum = [0, 0, 0]
      let count = 0
      for (let y = cy - half; y < cy + half; y++) {
        for (let x = cx - half; x < cx + half; x++) {
          const offset = (y * canvas.width + x) * 4
          for (let channel = 0; channel < 3; channel++) sum[channel] += data[offset + channel]
          count++
        }
      }
      points.push(sum.map((value) => Math.round(value / count).toString(16).padStart(2, '0')).join(''))
    }
  }
  return points.join(' ')
}

const rgb = (point) => [0, 2, 4].map((offset) => parseInt(point.slice(offset, offset + 2), 16))

/** Every sample whose channels differ by more than the tolerance, with its grid position. */
export function drift(expected, actual, tolerance = TOLERANCE) {
  const a = expected.split(' ')
  const b = actual.split(' ')
  if (a.length !== b.length) return [{ point: -1, expected: `${a.length} samples`, actual: `${b.length} samples` }]
  const out = []
  for (let i = 0; i < a.length; i++) {
    const delta = Math.max(...rgb(a[i]).map((value, channel) => Math.abs(value - rgb(b[i])[channel])))
    if (delta > tolerance) out.push({ point: i, column: i % GRID.columns, row: Math.floor(i / GRID.columns), expected: a[i], actual: b[i], delta })
  }
  return out
}

function readBaseline() {
  try { return JSON.parse(readFileSync(BASELINE, 'utf8')) } catch { return null }
}

const measured = {}

test('every plate in the index has a recorded engine', async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('.plate[data-plate]')).toHaveCount(Object.keys(engines).length)
})

for (const [id, selector] of Object.entries(engines)) {
  test(`${id} settles on its recorded frame`, async ({ page }) => {
    await page.addInitScript(blockText)
    await page.clock.setFixedTime(new Date('2026-01-01T09:41:00'))
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(`./#${id}`)
    await page.evaluate(() => document.fonts.ready)
    const canvas = page.locator(selector).first()
    await expect(canvas).toBeVisible()
    const read = () => canvas.evaluate(sample, { grid: GRID, window: WINDOW })
    // A settled frame is a fixed point: once the fonts are in, reading it again must give the same samples.
    let first = await read()
    await expect.poll(async () => {
      await page.waitForTimeout(150)
      const next = await read()
      const settled = next === first
      first = next
      return settled
    }, { message: `${id} never settled`, timeout: 5000 }).toBe(true)
    await page.waitForTimeout(300)
    const again = await read()
    expect(drift(first, again, 0), `${id}: the same settled frame read twice differs`).toEqual([])

    measured[id] = first
    if (update) return
    const baseline = readBaseline()
    expect(baseline, 'no baseline: run with UPDATE_BASELINES=1 once and commit tests/baselines/settled-samples.json').not.toBeNull()
    expect(baseline.grid).toEqual(GRID)
    expect(Object.keys(baseline.engines).sort(), 'every engine has a baseline and every baseline an engine').toEqual(Object.keys(engines).sort())
    expect(drift(baseline.engines[id], first), `${id}: samples beyond ±${TOLERANCE}`).toEqual([])
  })
}

test.afterAll(() => {
  if (!update) return
  if (Object.keys(measured).length !== Object.keys(engines).length) throw new Error('not every engine was measured; the baseline was not written')
  mkdirSync(new URL('.', BASELINE), { recursive: true })
  writeFileSync(BASELINE, `${JSON.stringify({ grid: GRID, window: WINDOW, engines: measured }, null, 2)}\n`)
})
