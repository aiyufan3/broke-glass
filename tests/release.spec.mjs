import { test as base, expect } from '@playwright/test'

const test = base.extend({
  page: async ({ page }, use) => {
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (['warning', 'error'].includes(message.type())) errors.push(message.text())
    })
    await use(page)
    expect(errors).toEqual([])
  },
})

const names = ['FieldOS', 'WetwareOS', 'QuantumOS', 'TelemetryOS', 'SpatialOS', 'StrataOS']
const launchers = ['.field-node', '.wet-cell', '.quantum-coordinate', '.tel-row', '.spatial-plane', '.strata-bed']
const surfaces = ['.field-os', '.wet-os', '.quantum-os', '.telemetry-os', '.spatial-os', '.strata-os']
const switchTo = (page, i) => page.getByRole('navigation', { name: 'Switch theme' }).getByRole('button', { name: names[i], exact: true }).click()
const prompt = (page) => page.getByRole('textbox', { name: 'Console command' })
const log = (page) => page.getByRole('log', { name: 'Console logs' })
const style = (page, selector, property) => page.locator(selector).first().evaluate((el, property) => getComputedStyle(el).getPropertyValue(property), property)
const frame = (page, selector) => page.locator(selector).first().evaluate((canvas) => canvas.toDataURL())
const park = (page) => page.mouse.move(6, 6)

async function drag(page, label, end) {
  const input = page.getByRole('slider', { name: label, exact: true })
  await input.scrollIntoViewIfNeeded()
  const box = await input.boundingBox()
  const y = box.y + box.height / 2
  await page.mouse.move(box.x + box.width / 2, y)
  await page.mouse.down()
  await page.mouse.move(end === 'min' ? box.x + 1 : box.x + box.width - 1, y, { steps: 4 })
  await page.mouse.up()
  await expect(input).toHaveValue(await input.getAttribute(end))
}

async function expectRedraw(page, selector, action) {
  const before = await frame(page, selector)
  await action()
  await expect.poll(() => frame(page, selector), { intervals: [20, 40, 80, 120] }).not.toBe(before)
}

// Counts pixels of one kind on a copy of the canvas, so the live canvas is never read back.
// 'contour' is mint line ink on the field; 'fringe' is a red or cyan sample that is not white.
function countPixels(page, selector, kind) {
  return page.locator(selector).first().evaluate((canvas, kind) => {
    const copy = new OffscreenCanvas(canvas.width, canvas.height)
    const context = copy.getContext('2d', { willReadFrequently: true })
    context.drawImage(canvas, 0, 0)
    const pixels = context.getImageData(0, 0, copy.width, copy.height).data
    let count = 0
    for (let i = 0; i < pixels.length; i += 4) {
      const red = pixels[i]
      const green = pixels[i + 1]
      if (kind === 'contour' ? green > 80 && green > red * 2 : Math.abs(red - green) > 100) count++
    }
    return count
  }, kind)
}

test('a timestamped stress event and command editing survive all six native consoles', async ({ page }) => {
  await page.goto('./#field')
  await page.locator('.field-node').first().click()
  await expect(prompt(page)).toBeFocused()
  const boot = await log(page).locator('time').first().textContent()
  await expect(page.locator('.status-bar time')).toHaveText(boot.slice(0, 5))
  await page.getByRole('button', { name: 'spike', exact: true }).click()
  const stamp = await log(page).locator('time').first().textContent()
  await page.keyboard.press('3')
  await expect(page.locator('.quantum-workspace h3')).toHaveText('Console')
  await expect(page.locator('.quantum-live-axis')).toContainText(/τ: [3-6]\d\.\d ms/)
  const state = await page.locator('.quantum-live-axis').textContent()
  await expect.poll(() => page.locator('.quantum-live-axis').textContent()).not.toBe(state)
  await page.keyboard.press('4')
  await expect(page.locator('.tel-bay h3')).toContainText('Console')
  await expect(log(page).locator('time').first()).toHaveText(stamp)
  await expect.poll(() => page.evaluate(() => document.querySelector('.tel-head time').textContent.startsWith(document.querySelector('.status-bar time').textContent))).toBe(true)
  for (const i of [4, 0, 1, 2, 5, 3]) {
    await switchTo(page, i)
    await expect(page.locator(surfaces[i])).toHaveAttribute('data-stress', 'true')
    await expect(log(page)).toContainText('Stress injection active')
    await expect(prompt(page)).toBeFocused()
    for (const word of ['help', 'scan', 'spike', 'status', 'clear']) {
      await expect(page.getByRole('button', { name: word, exact: true })).toBeVisible()
    }
    await prompt(page).fill('draft 26')
    await prompt(page).press('ArrowUp')
    await expect(prompt(page)).toHaveValue('spike')
    await prompt(page).press('ArrowDown')
    await expect(prompt(page)).toHaveValue('draft 26')
  }
  await prompt(page).fill('open telemetry')
  await prompt(page).press('Enter')
  await page.getByRole('button', { name: 'Link', exact: true }).click()
  await expect(page.locator('.tel-channel-label')).toHaveText('CH 03 / LINK')
  await expect(page.locator('.tel-mark')).toContainText('SEM–003')
  await switchTo(page, 4)
  await page.keyboard.press('Escape')
  await expect(page.locator('.spatial-window-1')).toContainText(/[3-6]\d\.\d MS/)
})

test('search disclosures and inspection actions work in each native geometry', async ({ page }) => {
  await page.goto('./#field')
  for (let i = 0; i < names.length; i++) {
    await switchTo(page, i)
    await page.locator(launchers[i]).nth(2).click()
    await page.getByRole('textbox', { name: 'Search nodes' }).fill('mycelial')
    const specimen = page.getByRole('button', { name: /Mycelial Relay/ })
    await specimen.click()
    await expect(specimen).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByText('A living junction that routes packets along branching filaments.', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: /Trace in Console|Send to nucleus|Observe in Console|Log specimen|Inspect in Console|Log to core/ }).click()
    await expect(log(page)).toContainText('W-116 · Mycelial Relay')
    await expect(prompt(page)).toBeFocused()
    await page.keyboard.press('Escape')
  }
  await switchTo(page, 4)
  await expect(page.locator('.spatial-window-2')).toContainText('1 / mycelial')
  await page.locator('.spatial-plane').nth(3).click()
  await page.getByRole('button', { name: 'Next track' }).click()
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await page.keyboard.press('Escape')
  await expect(page.locator('.spatial-window-3')).toContainText('02 / PLAY')
  await switchTo(page, 2)
  await expect(page.locator('.quantum-coordinate').last()).toContainText('65 Hz · emitting')
})

test('all eighteen engine controls change what their engine draws', async ({ page }) => {
  // Reduced motion freezes every engine on its settled frame, so a changed frame can only come from a control.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('./#field')

  await drag(page, 'Gravity Warp', 'min')
  await park(page)
  const massless = await frame(page, '.field-map')
  await page.locator('.field-node').first().hover()
  await page.waitForTimeout(160)
  expect(await frame(page, '.field-map')).toBe(massless)
  await expectRedraw(page, '.field-map', () => drag(page, 'Gravity Warp', 'max'))
  await park(page)
  await expectRedraw(page, '.field-map', () => page.locator('.field-node').first().hover())
  await park(page)
  const contourInk = () => countPixels(page, '.field-map', 'contour')
  await drag(page, 'Field Line Density', 'min')
  const sparse = await contourInk()
  await drag(page, 'Field Line Density', 'max')
  expect(await contourInk()).toBeGreaterThan(sparse * 2)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await drag(page, 'Orbit Drift', 'min')
  await expect.poll(async () => {
    const first = await frame(page, '.field-map')
    await page.waitForTimeout(160)
    return first === await frame(page, '.field-map')
  }, { timeout: 8000 }).toBe(true)
  await expectRedraw(page, '.field-map', () => drag(page, 'Orbit Drift', 'max'))

  await switchTo(page, 1)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expectRedraw(page, '.wet-tissue', () => drag(page, 'Membrane Pulse', 'max'))
  await expectRedraw(page, '.wet-tissue', () => drag(page, 'Cytoplasm Opacity', 'min'))
  const resting = await frame(page, '.wet-tissue')
  await drag(page, 'Synapse Speed', 'min')
  await expect.poll(() => frame(page, '.wet-tissue'), { intervals: [10, 30, 60] }).not.toBe(resting)
  await expect.poll(() => frame(page, '.wet-tissue')).toBe(resting)

  await switchTo(page, 2)
  await expectRedraw(page, '.quantum-sky', () => drag(page, 'Particle Count', 'min'))
  await expectRedraw(page, '.quantum-sky', () => drag(page, 'Collapse Force', 'max'))
  const fringes = () => countPixels(page, '.quantum-sky', 'fringe')
  await drag(page, 'RGB Dispersion', 'min')
  const neutral = await fringes()
  await drag(page, 'RGB Dispersion', 'max')
  expect(await fringes()).toBeGreaterThan(neutral + 100)

  await switchTo(page, 3)
  await drag(page, 'Scan Sweep Rate', 'max')
  await expect(page.locator('.tel-period')).toHaveText('1.40 s/pass')
  await expectRedraw(page, '.tel-wave canvas', () => drag(page, 'Signal Noise', 'max'))
  await expectRedraw(page, '.tel-surface', () => drag(page, 'Thermal Gain', 'min'))
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expectRedraw(page, '.tel-surface', () => page.waitForTimeout(60))

  await switchTo(page, 4)
  await drag(page, 'Perspective Depth', 'min')
  expect(await style(page, '.spatial-view', 'perspective')).toBe('500px')
  await expect.poll(() => style(page, '.spatial-scene', 'transform')).toMatch(/^matrix(3d)?\((1, 0, 0, 1, 0, 0|1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)\)$/)
  const level = await style(page, '.spatial-scene', 'transform')
  await drag(page, 'Parallax Tilt', 'max')
  await expect.poll(() => style(page, '.spatial-scene', 'transform'), { intervals: [20, 40, 60] }).not.toBe(level)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expectRedraw(page, '.spatial-corridor', () => drag(page, 'Chamber Fog', 'max'))

  await switchTo(page, 5)
  await expectRedraw(page, '.strata-section', () => drag(page, 'Deposition Rate', 'max'))
  await expect(page.locator('.strata-head p')).toContainText('30 beds')
  await expect(page.locator('.strata-readout')).toContainText('/30')
  await expectRedraw(page, '.strata-section', () => drag(page, 'Compaction', 'min'))
  await drag(page, 'Tectonic Fold', 'min')
  await expectRedraw(page, '.strata-section', () => drag(page, 'Tectonic Fold', 'max'))
})

test('an excited body repels its neighbour and tethered cells follow the tissue engine', async ({ page }) => {
  await page.goto('./#field')
  await page.locator('.field-node').first().hover()
  await expect.poll(() => page.locator('.field-node').nth(1).evaluate((el) => parseFloat(el.style.translate) || 0)).toBeGreaterThan(2)
  await switchTo(page, 1)
  await page.locator('.wet-cell').first().click()
  await expect.poll(() => page.locator('.wet-cell').nth(1).evaluate((el) => parseFloat(el.style.translate) || 0)).toBeGreaterThan(60)
  await expect.poll(() => page.locator('.wet-os').evaluate((el) => Number(el.style.getPropertyValue('--swell')))).toBeGreaterThan(.95)
  await expect(page.locator('.wet-organ h3')).toHaveText('Console')
})

test('the camera travels through an aperture and the chamber reports arrival', async ({ page }) => {
  await page.goto('./#spatial')
  const flight = (name) => page.locator('.spatial-os').evaluate((el, name) => Number(el.style.getPropertyValue(name)), name)
  await page.locator('.spatial-plane').nth(1).click()
  await expect.poll(() => flight('--dive')).toBeGreaterThan(0)
  await expect.poll(() => flight('--arrive')).toBe(1)
  await expect(page.locator('.spatial-wall h3')).toHaveText('Telemetry')
  await page.getByRole('button', { name: /Exit chamber/ }).click()
  await expect.poll(() => flight('--dive')).toBe(0)
  await expect(page.locator('.spatial-plane').nth(1)).toBeFocused()
})

test('drilling a formation opens a gallery in its bed and backfill returns to the surface', async ({ page }) => {
  await page.goto('./#strata')
  const variable = (name) => page.locator('.strata-os').evaluate((el, name) => parseFloat(el.style.getPropertyValue(name)), name)
  const launcher = page.locator('.strata-bed').nth(1)
  await launcher.click()
  await expect.poll(() => variable('--strata-open')).toBeGreaterThan(.99)
  await expect.poll(() => variable('--strata-height')).toBeGreaterThan(340)
  await expect(page.locator('.strata-gallery h3')).toHaveText('Telemetry')
  await expect(page.locator('.strata-readout')).toContainText('Probe')
  await park(page)
  await expect(page.locator('.strata-readout')).toContainText(/^Core \d{3}\.\d m · \d+\.\d ka · bed \d\d\/16$/)
  await page.getByRole('button', { name: 'Backfill' }).click()
  await expect.poll(() => variable('--strata-open')).toBeLessThan(.01)
  await expect(page.locator('.strata-gallery')).toHaveCount(0)
  await expect(launcher).toBeFocused()
})

test('engine settings survive a reload and corrupt storage falls back to the defaults', async ({ page }) => {
  const key = 'broke-glass/paradigm-params'
  const slider = (name) => page.getByRole('slider', { name, exact: true })
  await page.goto('./#field')
  await drag(page, 'Gravity Warp', 'min')
  await drag(page, 'Orbit Drift', 'max')
  await page.reload()
  await expect(slider('Gravity Warp')).toHaveValue('0')
  await expect(slider('Field Line Density')).toHaveValue('30')
  await expect(slider('Orbit Drift')).toHaveValue('100')
  const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), key)
  expect(Object.keys(stored).sort()).toEqual(['params', 'version'])
  expect(stored.params.field).toEqual([0, 30, 100])
  await switchTo(page, 5)
  await expect(slider('Deposition Rate')).toHaveValue('16')

  for (const corrupt of ['{"version":1,"params":{"field":[0,', JSON.stringify({ version: 99, params: { field: [0, 30, 100] } }), JSON.stringify({ version: 1, params: { field: [500, 30, 100] } })]) {
    await page.evaluate(([key, value]) => localStorage.setItem(key, value), [key, corrupt])
    await page.goto('./#field')
    await page.reload()
    await expect(slider('Gravity Warp')).toHaveValue('58')
    await expect(slider('Orbit Drift')).toHaveValue('28')
  }
})

test('the silhouette test filters every plate in the gallery', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: /Silhouette test/ }).click()
  const filters = await page.locator('.plate .iphone-screen > section').evaluateAll((sections) => sections.map((section) => getComputedStyle(section).filter))
  expect(filters).toEqual(names.map(() => 'grayscale(1) blur(12px)'))
})

test('mobile gallery opens a safe uniformly scaled native surface in both orientations', async ({ browser, baseURL }) => {
  const phone = await browser.newContext({ baseURL, hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } })
  try {
    const page = await phone.newPage()
    await page.goto('./')
    await page.getByRole('button', { name: 'Try Native Fullscreen OS' }).tap()
    await expect(page.locator('.iphone')).toHaveCount(0)
    for (const size of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 639, height: 920 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(size)
      await expect.poll(() => page.locator('.native-surface').evaluate((el) => {
        const r = el.getBoundingClientRect()
        const capsule = document.querySelector('.native-capsule').getBoundingClientRect()
        const root = document.documentElement
        return Math.abs(r.width / r.height - 377 / 836) < .0001 && r.top >= capsule.bottom - 1
          && r.left >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1
          && root.scrollWidth === innerWidth && root.scrollHeight === innerHeight
      })).toBe(true)
    }
    await page.setViewportSize({ width: 390, height: 844 })
    await page.locator('.field-node').nth(2).tap()
    await page.getByRole('combobox', { name: 'Fullscreen theme' }).selectOption('wetware')
    await page.getByRole('button', { name: /Orbital Memory/ }).tap()
    await expect(page.getByText('Memory addressed by orbital phase and radius.', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Exit fullscreen' }).tap()
    await expect(page.locator('.wet-organ h3')).toHaveText('Neural Search')
  } finally { await phone.close() }
})

test('the static Pages document exposes a fetchable 1200 × 630 preview before JavaScript runs', async ({ request }) => {
  const response = await request.get('./')
  expect(response.ok()).toBe(true)
  const html = await response.text()
  expect(html).toContain('<title>broke-glass — Six Post-Glass Mobile OS Paradigms</title>')
  for (const key of ['og:type', 'og:title', 'og:description', 'og:image', 'og:image:width', 'og:image:height',
    'twitter:card', 'twitter:title', 'twitter:description', 'twitter:image']) {
    expect(html).toContain(`="${key}"`)
  }
  const images = [...html.matchAll(/(?:property="og:image"|name="twitter:image") content="([^"]+)"/g)]
  expect(images).toHaveLength(2)
  expect(images[0][1]).toBe(images[1][1])
  const banner = await request.get(new URL(images[0][1], response.url()).href)
  expect(banner.ok()).toBe(true)
  const png = await banner.body()
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630])
  const vector = await request.get('./og-preview.svg')
  expect(vector.ok()).toBe(true)
  expect(await vector.text()).toContain('width="1200" height="630"')
})
