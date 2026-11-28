import { test as base, expect } from '@playwright/test'
import { CHAMBER, createTissue, organSlack } from '../src/themes/wetware/tissue.ts'

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

const names = ['FieldOS', 'WetwareOS', 'QuantumOS', 'TelemetryOS', 'SpatialOS', 'StrataOS', 'InfinityOS']
const launchers = ['.field-node', '.wet-cell', '.quantum-coordinate', '.tel-row', '.spatial-plane', '.strata-bed', '.infinity-orb']
const surfaces = ['.field-os', '.wet-os', '.quantum-os', '.telemetry-os', '.spatial-os', '.strata-os', '.infinity-os']
const plateLabel = (i) => `PL. ${String(i + 1).padStart(2, '0')}`
// The switcher shows plate numbers; each name starts with its number, then the paradigm.
const switchTo = (page, i) => page.getByRole('navigation', { name: 'Switch theme' }).getByRole('button', { name: `${String(i + 1).padStart(2, '0')} ${names[i]}`, exact: true }).click()
const prompt = (page) => page.getByRole('textbox', { name: 'Console command' })
const log = (page) => page.getByRole('log', { name: 'Console logs' })
const style = (page, selector, property) => page.locator(selector).first().evaluate((el, property) => getComputedStyle(el).getPropertyValue(property), property)
const frame = (page, selector) => page.locator(selector).first().evaluate((canvas) => canvas.toDataURL())
const park = (page) => page.mouse.move(6, 6)
const tools = ['.field-workspace', '.wet-organ', '.quantum-workspace', '.tel-bay', '.spatial-chamber', '.strata-gallery', '.infinity-room']
const fullCanvases = ['.field-map', '.wet-tissue', '.quantum-sky', '.spatial-corridor', '.strata-section', '.infinity-field']

/** sRGB channels, 0 to 255, of the first colour in a computed value: rgb(…) or color(srgb …). */
function channels(value) {
  const srgb = /color\(srgb ([\d.e+-]+) ([\d.e+-]+) ([\d.e+-]+)/.exec(value)
  return srgb ? srgb.slice(1, 4).map((channel) => Math.round(Number(channel) * 255)) : value.match(/[\d.]+/g).slice(0, 3).map(Number)
}

function contrastOf(a, b) {
  const linear = (value) => { const unit = value / 255; return unit <= .03928 ? unit / 12.92 : ((unit + .055) / 1.055) ** 2.4 }
  const luminance = (value) => { const [r, g, b] = channels(value).map(linear); return .2126 * r + .7152 * g + .0722 * b }
  const [dark, light] = [luminance(a), luminance(b)].sort((x, y) => x - y)
  return (light + .05) / (dark + .05)
}

/** A soft keyboard raised: the window loses height, the screen it is on does not. Returns once the page has drawn it. */
async function raiseKeyboard(page, height) {
  const metrics = await page.evaluate(() => ({ width: innerWidth, screenWidth: screen.width, screenHeight: screen.height, deviceScaleFactor: devicePixelRatio }))
  await page.evaluate(() => {
    window.keyboardRaised = new Promise((resolve) => addEventListener('resize', () => requestAnimationFrame(() => requestAnimationFrame(resolve)), { once: true }))
  })
  const session = await page.context().newCDPSession(page)
  await session.send('Emulation.setDeviceMetricsOverride', { ...metrics, height, mobile: true })
  await page.evaluate(() => window.keyboardRaised)
}

/**
 * The least contrast between the strip's ink and what its labels are set on: the strip is shot with its
 * text lifted off, and every pixel under every label is read.
 */
async function stripContrast(page) {
  const strip = page.locator('.specimen-strip')
  const ink = channels(await strip.evaluate((element) => getComputedStyle(element).color))
  const area = await strip.boundingBox()
  const boxes = await strip.evaluate((element) => [...element.querySelectorAll('button, [aria-live]')].map((label) => {
    const range = document.createRange()
    range.selectNodeContents(label)
    const { left, top, width, height } = range.getBoundingClientRect()
    return { left, top, width, height }
  }))
  const lift = await page.addStyleTag({ content: '.specimen-strip, .specimen-strip * { color: transparent !important; }' })
  const shot = await page.screenshot({ clip: area })
  await lift.evaluate((tag) => tag.remove())
  return page.evaluate(async ({ png, ink, area, boxes }) => {
    const image = new Image()
    image.src = `data:image/png;base64,${png}`
    await image.decode()
    const ratio = image.width / area.width
    const canvas = new OffscreenCanvas(image.width, image.height)
    const context = canvas.getContext('2d', { willReadFrequently: true })
    context.drawImage(image, 0, 0)
    const { data } = context.getImageData(0, 0, image.width, image.height)
    const linear = (value) => { const unit = value / 255; return unit <= .03928 ? unit / 12.92 : ((unit + .055) / 1.055) ** 2.4 }
    const luminance = (r, g, b) => .2126 * linear(r) + .7152 * linear(g) + .0722 * linear(b)
    const inkLight = luminance(...ink)
    let least = 21
    for (const box of boxes) {
      for (let y = Math.max(0, Math.floor((box.top - area.y) * ratio)); y < Math.min(image.height, Math.ceil((box.top + box.height - area.y) * ratio)); y++) {
        for (let x = Math.max(0, Math.floor((box.left - area.x) * ratio)); x < Math.min(image.width, Math.ceil((box.left + box.width - area.x) * ratio)); x++) {
          const i = (y * image.width + x) * 4
          const [dark, light] = [inkLight, luminance(data[i], data[i + 1], data[i + 2])].sort((a, b) => a - b)
          least = Math.min(least, (light + .05) / (dark + .05))
        }
      }
    }
    return least
  }, { png: shot.toString('base64'), ink, area, boxes })
}

/**
 * Controls in the specimen that meet WCAG 2.5.8 at the specimen's own size but not as a phone draws it:
 * 24 × 24 CSS px, or a 24 px circle on the control's centre that meets no other control and no other
 * small control's circle.
 */
function brokenTargets(page) {
  return page.evaluate(() => {
    const surface = document.querySelector('.bare-surface')
    const frame = surface.getBoundingClientRect()
    const scale = frame.height / 836
    const targets = [...surface.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=slider], [tabindex]:not([tabindex="-1"])')]
      .filter((element) => !element.closest('[inert]') && !element.disabled && getComputedStyle(element).visibility !== 'hidden')
      .map((element) => ({ element, box: element.getBoundingClientRect() }))
      .filter(({ box }) => box.width > 2 && box.height > 2)
      .map(({ element, box }) => ({
        name: element.getAttribute('aria-label') || element.textContent.trim().slice(0, 24),
        x: (box.left - frame.left) / scale, y: (box.top - frame.top) / scale, w: box.width / scale, h: box.height / scale,
      }))
    const passes = (target, s) => {
      if (target.w * s >= 24 && target.h * s >= 24) return true
      const cx = (target.x + target.w / 2) * s
      const cy = (target.y + target.h / 2) * s
      return targets.every((other) => {
        if (other === target) return true
        const dx = Math.max(other.x * s - cx, 0, cx - (other.x + other.w) * s)
        const dy = Math.max(other.y * s - cy, 0, cy - (other.y + other.h) * s)
        if (Math.hypot(dx, dy) < 12) return false
        const small = other.w * s < 24 || other.h * s < 24
        return !small || Math.hypot((other.x + other.w / 2) * s - cx, (other.y + other.h / 2) * s - cy) >= 24
      })
    }
    return targets.filter((target) => passes(target, 1) && !passes(target, scale)).map((target) => target.name)
  })
}

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

test('a timestamped stress event and command editing survive all seven native consoles', async ({ page }) => {
  // The boot log is stamped once and the status bar shows the minute: a fixed clock keeps the two from
  // straddling a minute boundary. Timers and frames keep running.
  await page.clock.setFixedTime(new Date('2026-01-01T09:41:30'))
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
  for (const i of [4, 0, 1, 2, 5, 6, 3]) {
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
    await page.getByRole('button', { name: /Trace in Console|Send to nucleus|Observe in Console|Log specimen|Inspect in Console|Log to core|Seed in Console/ }).click()
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

test('all twenty-one engine controls change what their engine draws', async ({ page }) => {
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

  await switchTo(page, 6)
  const readout = page.locator('.infinity-readout')
  await expectRedraw(page, '.infinity-field', () => drag(page, 'Proliferation', 'max'))
  const dense = Number((await readout.textContent()).match(/^(\d+) dots/)[1])
  await expectRedraw(page, '.infinity-field', () => drag(page, 'Proliferation', 'min'))
  await expect.poll(async () => Number((await readout.textContent()).match(/^(\d+) dots/)[1])).toBeLessThan(dense / 5)
  await expectRedraw(page, '.infinity-field', () => drag(page, 'Obliteration', 'max'))
  await expect(readout).toContainText('100% obliterated')
  await expectRedraw(page, '.infinity-field', () => drag(page, 'Infinity Depth', 'min'))
  await expect(readout).toContainText('· 4 rows')
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

test('touching an orb swallows the viewer into its room, commands seed dots there, and stepping out returns to the field', async ({ page }) => {
  // Reduced motion: every frame is the settled one, so a changed frame can only come from what the command did.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('./#infinity')
  const swell = () => page.locator('.infinity-os').evaluate((el) => parseFloat(el.style.getPropertyValue('--infinity-swell')))
  const dots = async () => Number((await page.locator('.infinity-readout').textContent()).match(/^(\d+) dots/)[1])
  const orb = page.locator('.infinity-orb').first()
  await orb.click()
  await expect.poll(swell).toBe(1)
  await expect(page.locator('.infinity-room h3')).toHaveText('Console')
  await expect(prompt(page)).toBeFocused()
  const before = await dots()
  // The burst lands on the room's own floor, in the canvas the viewer is inside.
  await expectRedraw(page, '.infinity-field', () => page.getByRole('button', { name: 'spike', exact: true }).click())
  await expect.poll(dots).toBeGreaterThan(before)
  // Under load the pulse runs through the room as well.
  const calm = await frame(page, '.infinity-field')
  await prompt(page).fill('open telemetry')
  await prompt(page).press('Enter')
  await expect(page.locator('.infinity-room h3')).toHaveText('Telemetry')
  await expect.poll(() => frame(page, '.infinity-field')).not.toBe(calm)
  await page.getByRole('button', { name: 'Step out' }).click()
  await expect.poll(swell).toBe(0)
  await expect(page.locator('.infinity-room')).toHaveCount(0)
  await expect(page.locator('.infinity-orb').nth(1)).toBeFocused()

  // Entering again while an orb is still closing puts the viewer back in a live tool.
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await orb.click()
  await expect.poll(swell).toBeGreaterThan(.99)
  await page.getByRole('button', { name: 'Step out' }).click()
  await orb.click()
  await expect(prompt(page)).toBeFocused()
})

test('opening a tool moves keyboard focus into it and closing it returns focus to its launcher, in every paradigm', async ({ page }) => {
  await page.goto('./#field')
  for (let i = 0; i < names.length; i++) {
    await switchTo(page, i)
    const launcher = page.locator(launchers[i]).nth(1)
    await launcher.focus()
    await page.keyboard.press('Enter')
    await expect(page.locator(tools[i])).toBeVisible()
    await expect.poll(() => page.evaluate((selector) => {
      const tool = document.querySelector(selector)
      const focused = document.activeElement
      return Boolean(tool && focused && focused !== document.body && tool.contains(focused) && !focused.closest('[inert]'))
    }, tools[i]), { message: `${names[i]}: focus did not enter the tool` }).toBe(true)
    await page.keyboard.press('Escape')
    await expect(launcher, `${names[i]}: focus did not return to the launcher`).toBeFocused()
    // The launcher's name is its module, not a reading that changes every tick.
    await expect(launcher).toHaveAccessibleName(/^Telemetry/)
    await expect(launcher).not.toHaveAccessibleName(/\d/)
    // Instrument readouts are not live regions: the console log is the one channel that announces.
    await expect(page.locator('.iphone-screen output:not([aria-live="off"]):not([aria-hidden="true"])')).toHaveCount(0)
  }
  // Focus the operator has placed on the lab's own controls is not pulled into the specimen when a tool closes.
  await page.locator(launchers[6]).nth(1).click()
  const fader = page.getByRole('slider', { name: 'Proliferation', exact: true })
  await fader.focus()
  await page.keyboard.press('Escape')
  await expect(page.locator(tools[6])).toBeHidden()
  await expect(fader).toBeFocused()

  // With a tool open, the number keys still walk the paradigms: a mounting tool does not take focus into a field.
  await switchTo(page, 0)
  await page.locator(launchers[0]).nth(2).click()
  await expect(page.getByRole('textbox', { name: 'Search nodes' })).toBeVisible()
  for (const [key, id] of [['2', 'wetware'], ['3', 'quantum'], ['4', 'telemetry']]) {
    await page.keyboard.press(key)
    await expect(page).toHaveURL(new RegExp(`#${id}$`))
  }
  await expect(page.getByRole('textbox', { name: 'Search nodes' })).toHaveValue('')
  await page.keyboard.press('Escape')

  // QuantumOS keeps its prompt on screen: a command that opens a tool leaves the prompt ready for the next one.
  await switchTo(page, 2)
  await prompt(page).focus()
  for (const [command, title] of [['open telemetry', 'Telemetry'], ['open media', 'Media']]) {
    await page.keyboard.type(command)
    await page.keyboard.press('Enter')
    await expect(page.locator('.quantum-workspace h3')).toHaveText(title)
    await expect(prompt(page)).toBeFocused()
  }
  await page.keyboard.press('Escape')

  // StrataOS: a console reopened while its gallery is still backfilling is a fresh visit, with the prompt focused.
  await switchTo(page, 5)
  const bed = page.locator(launchers[5]).first()
  await bed.focus()
  await page.keyboard.press('Enter')
  await expect(prompt(page)).toBeFocused()
  await page.keyboard.press('Escape')
  await page.keyboard.press('Enter')
  await expect(prompt(page)).toBeFocused()
  await page.keyboard.press('Escape')

  // Opening a plate with the console left open focuses the paradigm's title, not the prompt inside it.
  await page.locator(launchers[5]).first().click()
  await page.getByRole('button', { name: 'All plates' }).click()
  await page.getByRole('button', { name: 'PL. 06 StrataOS, open in focus mode' }).press('Enter')
  await expect(page.getByRole('heading', { level: 1, name: 'StrataOS' })).toBeFocused()
  await page.keyboard.press('Escape')

  // Fullscreen replaces the tree: focus lands on the control that leaves it, and comes back to the one that entered.
  await page.getByRole('button', { name: 'Native Fullscreen' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Exit fullscreen' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Native Fullscreen' })).toBeFocused()
})

test('every canvas is sized for the scale it is shown at, on first paint and after a resize', async ({ browser, baseURL }) => {
  // A short window draws the focus device at about 0.79 of full size, far enough from 1 that a canvas sized
  // before the device was scaled cannot pass for one sized after.
  const context = await browser.newContext({ baseURL, deviceScaleFactor: 2, viewport: { width: 1440, height: 700 } })
  try {
    const page = await context.newPage()
    // Backing pixels per CSS pixel against what the frame loop should choose: the device ratio times the
    // scale the specimen is drawn at, held between 1 and 2.5.
    const mismatches = (scope) => page.evaluate(([scope, selectors]) => selectors.flatMap((selector) => {
      const canvas = document.querySelector(`${scope} ${selector}`)
      if (!canvas) return []
      const host = canvas.closest('section')
      const wanted = Math.min(2.5, Math.max(1, devicePixelRatio * host.getBoundingClientRect().width / host.offsetWidth))
      return Math.abs(canvas.width / canvas.offsetWidth - wanted) > .06 ? [`${selector}: ${(canvas.width / canvas.offsetWidth).toFixed(2)}, wanted ${wanted.toFixed(2)}`] : []
    }), [scope, fullCanvases])
    // In the focus device the surface is drawn a little under full size: the backing store follows that
    // scale. No resize is sent, so a ratio measured before the device was scaled would stay wrong.
    for (const id of ['field', 'strata', 'infinity']) {
      await page.goto(`./#${id}`)
      await expect(page.locator('.focus-device canvas').first()).toBeVisible()
      await expect.poll(() => mismatches('.focus-device')).toEqual([])
    }

    await page.goto('./#field')
    await page.getByRole('button', { name: 'Native Fullscreen' }).click()
    await expect(page.locator('.native-surface .field-map')).toBeVisible()
    await expect.poll(() => mismatches('.native-surface')).toEqual([])
    const before = await page.locator('.native-surface .field-map').evaluate((canvas) => canvas.width)
    // A smaller window draws the surface smaller; once the resize has settled the canvas follows it.
    await page.setViewportSize({ width: 700, height: 520 })
    await expect.poll(() => page.locator('.native-surface .field-map').evaluate((canvas) => canvas.width)).toBeLessThan(before)
    expect(await mismatches('.native-surface')).toEqual([])
  } finally { await context.close() }
})

test('SpatialOS repaints its corridor only when the picture changes', async ({ page }) => {
  await page.addInitScript(() => {
    window.corridorPaints = 0
    const fill = CanvasRenderingContext2D.prototype.fillRect
    CanvasRenderingContext2D.prototype.fillRect = function (...box) {
      if (this.canvas.classList.contains('spatial-corridor')) window.corridorPaints++
      return fill.apply(this, box)
    }
  })
  await page.goto('./#spatial')
  await park(page)
  const paints = () => page.evaluate(() => window.corridorPaints)
  // At rest the camera stops moving, and the corridor stops being painted.
  await expect.poll(async () => {
    const first = await paints()
    await page.waitForTimeout(250)
    return await paints() - first
  }, { timeout: 8000 }).toBe(0)
  const resting = await paints()
  expect(resting).toBeGreaterThan(0)
  // A pointer over the surface turns the camera, and the picture is painted again.
  const box = await page.locator('.spatial-os').boundingBox()
  await page.mouse.move(box.x + box.width * .8, box.y + box.height * .3, { steps: 6 })
  await expect.poll(paints).toBeGreaterThan(resting)
})

test('a WetwareOS organ keeps its heading and every row inside its own membrane', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('./#wetware')
  await page.evaluate(() => document.fonts.ready)
  const swollen = () => expect.poll(() => page.locator('.wet-os').evaluate((el) => Number(el.style.getPropertyValue('--swell')))).toBeGreaterThan(.99)
  const cells = createTissue().cells
  // Everything an organ draws is measured where it is drawn and tested against the chamber the cell swells
  // into, shrunk by how far that cell's membrane can dip inward at this Membrane Pulse. Inputs are measured
  // by their boxes; list rows only over the part of them the list shows.
  const escaped = (cell, pulse) => page.locator('.wet-os').evaluate((host, { chamber, slack }) => {
    const frame = host.getBoundingClientRect()
    const scale = frame.width / 377
    const out = []
    for (const row of host.querySelectorAll('.wet-organ header > *, .wet-organ > [data-fit], .wet-organ [data-fit-rows] > *')) {
      const list = row.parentElement.matches('[data-fit-rows]') ? row.parentElement.getBoundingClientRect() : null
      const range = document.createRange()
      range.selectNodeContents(row)
      const boxes = [...range.getClientRects()]
      for (const drawn of boxes.length ? boxes : [row.getBoundingClientRect()]) {
        const rect = list ? { left: drawn.left, right: drawn.right, top: Math.max(drawn.top, list.top), bottom: Math.min(drawn.bottom, list.bottom) } : drawn
        if (rect.right <= rect.left || rect.bottom <= rect.top) continue
        for (const [x, y] of [[rect.left, rect.top], [rect.right, rect.top], [rect.left, rect.bottom], [rect.right, rect.bottom]]) {
          const u = ((x - frame.left) / scale - chamber.x) / (chamber.rx * (1 - slack))
          const v = ((y - frame.top) / scale - chamber.y) / (chamber.ry * (1 - slack))
          if (Math.hypot(u, v) > 1) out.push(`${(row.textContent || row.className).slice(0, 24)} at ${Math.hypot(u, v).toFixed(3)}`)
        }
      }
    }
    return [...new Set(out)]
  }, { chamber: CHAMBER, slack: organSlack(cells[cell], pulse) })

  for (const pulse of [44, 100]) {
    if (pulse === 100) await drag(page, 'Membrane Pulse', 'max')
    for (let cell = 0; cell < 4; cell++) {
      await page.locator('.wet-cell').nth(cell).click()
      await swollen()
      expect(await escaped(cell, pulse), `organ ${cell} at pulse ${pulse}`).toEqual([])
      await expect(page.locator('.wet-organ h3')).toBeVisible()
      await page.keyboard.press('Escape')
    }
  }

  // Neural Search: opened results and scrolling keep every row on screen at a usable width, and a closed
  // row keeps one height, so fitting a row to the wall never moves the rows after it.
  await page.locator('.wet-cell').nth(2).click()
  await swollen()
  const rows = () => page.locator('.wet-memories').evaluate((list) => {
    const box = list.getBoundingClientRect()
    return [...list.children].filter((row) => { const r = row.getBoundingClientRect(); return r.bottom > box.top + 1 && r.top < box.bottom - 1 })
      .map((row) => ({ width: Math.round(row.getBoundingClientRect().width), height: Math.round(row.offsetHeight * 10) / 10, open: !!row.querySelector('[aria-expanded="true"]') }))
  })
  const closedHeight = (await rows())[0].height
  for (const name of [/Janus Aperture/, /Alabaster Array/]) {
    await page.getByRole('button', { name }).click()
    const shown = await rows()
    expect(shown.every((row) => row.width >= 90), JSON.stringify(shown)).toBe(true)
    expect(shown.filter((row) => !row.open).every((row) => row.height === closedHeight), JSON.stringify(shown)).toBe(true)
    expect(await escaped(2, 100)).toEqual([])
    await page.getByRole('button', { name }).click()
  }
  for (let step = 0; step < 24; step++) {
    await page.locator('.wet-memories').evaluate((list, by) => { list.scrollTop += by }, step < 12 ? 9 : -9)
    await page.waitForTimeout(20)
    const shown = await rows()
    expect(shown.every((row) => row.width >= 90 && row.height === closedHeight), `scroll step ${step}: ${JSON.stringify(shown)}`).toBe(true)
  }
  expect(await escaped(2, 100)).toEqual([])
  // With nothing found, the note takes the list's place and stays one line inside the cell.
  await page.getByRole('textbox', { name: 'Search nodes' }).fill('no such specimen')
  await expect(page.getByText('No matching nodes.')).toBeVisible()
  expect(await escaped(2, 100)).toEqual([])
  expect(await page.getByText('No matching nodes.').evaluate((note) => note.offsetHeight)).toBeLessThan(20)
})

test('pressed controls keep readable text on their fill', async ({ page }) => {
  const ratio = (locator) => locator.evaluate((element) => {
    const channel = (value) => { const unit = value / 255; return unit <= .03928 ? unit / 12.92 : ((unit + .055) / 1.055) ** 2.4 }
    const luminance = (colour) => { const [r, g, b] = colour.match(/[\d.]+/g).map(Number); return .2126 * channel(r) + .7152 * channel(g) + .0722 * channel(b) }
    const style = getComputedStyle(element)
    const [dark, light] = [luminance(style.color), luminance(style.backgroundColor)].sort((a, b) => a - b)
    return (light + .05) / (dark + .05)
  })
  await page.goto('./#infinity')
  await page.locator('.infinity-orb').nth(1).click()
  for (const channel of ['Core', 'Field', 'Link', 'Audio']) {
    const key = page.getByRole('button', { name: channel, exact: true })
    await key.click()
    await park(page)
    await expect(key).toHaveAttribute('aria-pressed', 'true')
    expect(await ratio(key), `InfinityOS channel ${channel}`).toBeGreaterThanOrEqual(4.5)
  }
  await page.keyboard.press('Escape')
  await switchTo(page, 3)
  await page.locator('.tel-row').nth(1).click()
  const stress = page.locator('.tel-stress')
  await stress.click()
  await park(page)
  await expect(stress).toHaveAttribute('aria-pressed', 'true')
  expect(await ratio(stress), 'TelemetryOS stress key').toBeGreaterThanOrEqual(4.5)
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

// Opaque pixels on the transit layer (sampled): above zero while a transition is drawing, zero once it has cleared.
// The layer is read from a copy, so the live canvas is never read back.
const veiled = (page) => page.locator('[data-specimen-screen] .transit').evaluate((canvas) => {
  const copy = new OffscreenCanvas(canvas.width, canvas.height)
  const context = copy.getContext('2d', { willReadFrequently: true })
  context.drawImage(canvas, 0, 0)
  const { data } = context.getImageData(0, 0, copy.width, copy.height)
  let opaque = 0
  for (let i = 3; i < data.length; i += 4 * 61) if (data[i] > 8) opaque++
  return opaque
})

/**
 * Records what every animation frame shows until stopped: the hash, how many plates are in flight and,
 * on the device's transit layer, the share of pixels that are clear (the specimen shows through), ink
 * (the lab's ground) and bright marks. A transition's states last a few hundred milliseconds; polling
 * from the test can miss them on a busy machine, the page cannot.
 */
async function recording(page) {
  await page.evaluate(() => {
    const log = []
    const id = (window.transitSequence ?? 0) + 1
    window.transitSequence = id
    window.transitRecording = id
    window.transitLog = log
    const copy = new OffscreenCanvas(377, 836)
    const context = copy.getContext('2d', { willReadFrequently: true })
    const frame = () => {
      if (window.transitRecording !== id) return
      const layer = document.querySelector('[data-specimen-screen] .transit')
      const entry = {
        hash: location.hash, ghosts: document.querySelectorAll('.plate-ghost').length, layer: !!layer, clear: 1, ink: 0, marks: 0, top: Math.round(scrollY),
        index: !!document.querySelector('.plates-grid'), device: !!document.querySelector('.focus-device'), native: !!document.querySelector('.native-mode'),
        hidden: [...document.querySelectorAll('.plate-raster')].filter((raster) => raster.style.visibility === 'hidden').length,
      }
      // On a phone: the ground laid around the surface, the strip's ink, and where a plate in flight starts.
      const stage = document.querySelector('.bare-stage')
      const strip = document.querySelector('.specimen-strip')
      const ghost = document.querySelector('.plate-ghost')
      Object.assign(entry, {
        ground: stage ? getComputedStyle(stage).backgroundColor : '', strip: strip ? getComputedStyle(strip).color : '',
        ghostTop: ghost ? Math.round(ghost.getBoundingClientRect().top) : null,
      })
      if (layer?.width) {
        context.clearRect(0, 0, 377, 836)
        context.drawImage(layer, 0, 0, 377, 836)
        const { data } = context.getImageData(0, 0, 377, 836)
        let clear = 0
        let ink = 0
        let marks = 0
        for (let i = 0; i < data.length; i += 8) {
          const light = .2126 * data[i] + .7152 * data[i + 1] + .0722 * data[i + 2]
          if (data[i + 3] < 8) clear++
          else if (data[i + 3] > 245 && light < 24) ink++
          else if (data[i + 3] > 200 && light > 120) marks++
        }
        const total = data.length / 8
        Object.assign(entry, { clear: clear / total, ink: ink / total, marks })
      }
      log.push(entry)
      requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
  })
  // Stopped two frames after it is asked to: a layer cleared just before the test looked is seen cleared.
  return async () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => {
    window.transitRecording = 0
    resolve(window.transitLog)
  }))))
}

const settledOn = async (page, hash) => {
  await expect(page).toHaveURL(hash)
  await expect(page.locator('.plate-ghost')).toHaveCount(0)
  await expect.poll(() => veiled(page), { timeout: 4000 }).toBe(0)
}

test('the index shows every paradigm as a numbered halftone plate, with no name and no live engine', async ({ page }) => {
  await page.goto('./')
  const plates = page.locator('.plate[data-plate]')
  await expect(plates).toHaveCount(names.length)
  for (let i = 0; i < names.length; i++) {
    // What is seen is the plate number; the name follows it for assistive technology, and is not seen.
    await expect(plates.nth(i).locator('.plate-number')).toHaveText(plateLabel(i))
    await expect(plates.nth(i)).toHaveAccessibleName(`${plateLabel(i)} ${names[i]}, open in focus mode`)
    // One square dot for each cell of the 13 x 29 raster the plate was measured on.
    expect(await plates.nth(i).locator('path').evaluate((path) => path.getAttribute('d').split('M').length - 1)).toBe(13 * 29)
  }
  const drawn = await plates.locator('path').evaluateAll((paths) => new Set(paths.map((path) => path.getAttribute('d'))).size)
  expect(drawn).toBe(names.length)
  // No paradigm name is drawn anywhere in the index: every text that carries one is the visually hidden kind.
  const shownNames = await page.locator('.plates').evaluate((index) => {
    const found = []
    const walker = document.createTreeWalker(index, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      const box = walker.currentNode.parentElement.getBoundingClientRect()
      if (/[A-Za-z]+OS/.test(walker.currentNode.textContent) && box.width > 2 && box.height > 2) found.push(walker.currentNode.textContent)
    }
    return found
  })
  expect(shownNames).toEqual([])
  await expect(page.locator('.plate--open')).toHaveAccessibleName(/^PL\. 08 Open/)
  await expect(page.locator('.plate--open')).toHaveAttribute('href', /github\.com\/.+\/broke-glass/)
  await expect(page.locator('canvas')).toHaveCount(0)
})

test('a plate flies to the device and develops into its paradigm, and Escape screens it back onto its plate', async ({ page }) => {
  await page.goto('./')
  const plate = page.locator('.plate[data-plate="quantum"]')
  const raster = plate.locator('.plate-raster')
  const before = await raster.boundingBox()
  let stop = await recording(page)
  await plate.click()
  await settledOn(page, /#quantum$/)
  let frames = (await stop()).filter((frame) => frame.layer)
  await expect(page.locator('.quantum-os')).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: 'QuantumOS' })).toBeFocused()
  const flying = frames.findIndex((frame) => frame.ghosts > 0)
  expect(flying, 'the plate never took off').toBeGreaterThanOrEqual(0)
  // The plate is in the air from the first frame the device is shown in: it is never nowhere.
  expect(frames[0].ghosts).toBe(1)
  // Nothing of the paradigm is seen before the plate lands: until it is in flight the layer is closed,
  // and it stays closed for as long as the plate is in the air.
  expect(frames.slice(0, flying).filter((frame) => frame.clear > .02)).toEqual([])
  expect(frames.filter((frame) => frame.ghosts > 0 && frame.clear > .02)).toEqual([])
  // It develops: the layer opens through intermediate states, from closed to clear.
  expect(frames.some((frame) => frame.clear > .1 && frame.clear < .9)).toBe(true)
  expect(frames.at(-1).clear).toBe(1)

  stop = await recording(page)
  await page.keyboard.press('Escape')
  await expect(page).not.toHaveURL(/#/)
  await expect(page.locator('.plate-ghost')).toHaveCount(0)
  await expect(raster).toBeVisible()
  frames = await stop()
  // The first frame of the index already has the plate in the air and its slot empty: it is never home early.
  const home = frames.find((frame) => frame.index)
  expect([home.ghosts, home.hidden]).toEqual([1, 1])
  // Screened down on the device first, with the view still on QuantumOS; then flown home.
  expect(frames.some((frame) => frame.hash === '#quantum' && frame.layer && frame.clear < .9 && frame.clear > .02)).toBe(true)
  expect(frames.some((frame) => frame.hash === '' && frame.ghosts > 0)).toBe(true)
  expect(await raster.boundingBox()).toEqual(before)
  await expect(plate).toBeFocused()
})

test('a transition that is overtaken never uncovers the specimen and never leaves the device black', async ({ page }) => {
  // Escape while the plate is still landing: the plate is printed and flown home without ever opening.
  await page.goto('./')
  await expect(page.locator('.plate[data-plate]')).toHaveCount(names.length)
  let stop = await recording(page)
  await page.locator('.plate[data-plate="wetware"]').click()
  await expect(page.locator('.plate-ghost')).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(page).not.toHaveURL(/#/)
  await expect(page.locator('.plate-ghost')).toHaveCount(0)
  const frames = (await stop()).filter((frame) => frame.layer)
  expect(frames.length).toBeGreaterThan(0)
  expect(frames.filter((frame) => frame.clear > .02)).toEqual([])

  // A plate opened and then taken into fullscreen and back: the device is not left under a veil.
  await page.locator('.plate[data-plate="field"]').click()
  await settledOn(page, /#field$/)
  await page.getByRole('button', { name: 'Native Fullscreen' }).click()
  await page.getByRole('button', { name: 'Exit fullscreen' }).click()
  await expect(page.locator('.focus-device .field-os')).toBeVisible()
  await expect.poll(() => veiled(page), { timeout: 900 }).toBe(0)

  // The same when fullscreen is entered while the plate is still on its way.
  await page.keyboard.press('Escape')
  await expect(page).not.toHaveURL(/#/)
  await expect(page.locator('.plate-ghost')).toHaveCount(0)
  await page.locator('.plate[data-plate="strata"]').click()
  await page.getByRole('button', { name: 'Native Fullscreen' }).click()
  await page.getByRole('button', { name: 'Exit fullscreen' }).click()
  await expect(page.locator('.focus-device .strata-os')).toBeVisible()
  await expect(page.locator('.plate-ghost')).toHaveCount(0)
  await expect.poll(() => veiled(page), { timeout: 900 }).toBe(0)
})

test('on the index the number keys open plates, and asking for the shown paradigm mid-switch calls the switch off', async ({ page }) => {
  await page.goto('./')
  // The keys are listened for once the index has rendered.
  await expect(page.locator('.plate[data-plate]')).toHaveCount(names.length)
  await expect.poll(async () => {
    await page.keyboard.press('5')
    return page.url()
  }).toMatch(/#spatial$/)
  await expect(page.locator('.spatial-os')).toBeVisible()
  await settledOn(page, /#spatial$/)
  // 6 starts the migration to StrataOS; 5, delivered before any frame of it, keeps SpatialOS. The page is
  // being read below the specimen, and a switch called off leaves it there.
  await page.setViewportSize({ width: 1440, height: 700 })
  await expect.poll(() => page.evaluate(() => { window.scrollTo(0, 300); return scrollY })).toBe(300)
  const stop = await recording(page)
  await page.evaluate(() => { for (const key of ['6', '5']) window.dispatchEvent(new KeyboardEvent('keydown', { key })) })
  await page.waitForTimeout(1200)
  const frames = await stop()
  expect(await page.evaluate(() => scrollY)).toBe(300)
  expect(frames.filter((frame) => frame.hash !== '#spatial')).toEqual([])
  // Called off before its first frame: the layer is never drawn on, so no migration ran in its place.
  expect(frames.filter((frame) => frame.layer && frame.clear < 1)).toEqual([])
  await expect(page.locator('.spatial-os')).toBeVisible()
  expect(await veiled(page)).toBe(0)
  // A switch that goes ahead is played at the top, and the entry it leaves keeps the place it was read
  // at: Back returns there.
  await page.keyboard.press('6')
  await settledOn(page, /#strata$/)
  expect(await page.evaluate(() => scrollY)).toBe(0)
  await page.goBack()
  await expect(page).toHaveURL(/#spatial$/)
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(300)
  // Fullscreen taken during a return ends that movement and forgets where it scrolled from: a switch
  // called off later keeps the page where it is then.
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    document.querySelector('.native-open').click()
  })
  await page.getByRole('button', { name: 'Exit fullscreen' }).click()
  await expect.poll(() => page.evaluate(() => { window.scrollTo(0, 120); return scrollY })).toBe(120)
  await page.evaluate(() => { for (const key of ['6', '5']) window.dispatchEvent(new KeyboardEvent('keydown', { key })) })
  await page.waitForTimeout(600)
  expect(await page.evaluate(() => scrollY)).toBe(120)
  await page.setViewportSize({ width: 1440, height: 980 })
  // After the switch has committed, the same key is a new switch back, not a cancellation.
  await page.keyboard.press('6')
  await expect(page).toHaveURL(/#strata$/)
  await page.keyboard.press('5')
  await settledOn(page, /#spatial$/)
  await expect(page.locator('.spatial-os')).toBeVisible()
})

test('fullscreen and the lab controls during a movement end it cleanly and keep what was asked for', async ({ page }) => {
  // Fullscreen while the specimen is being screened down: fullscreen wins, and the lab still navigates after.
  await page.goto('./#quantum')
  await expect(page.locator('.quantum-os')).toBeVisible()
  await expect.poll(() => veiled(page), { timeout: 4000 }).toBe(0)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Native Fullscreen' }).click()
  await expect(page.locator('.native-surface .quantum-os')).toBeVisible()
  await page.getByRole('button', { name: 'Exit fullscreen' }).click()
  await expect(page.locator('.focus-device .quantum-os')).toBeVisible()
  await expect.poll(() => veiled(page), { timeout: 900 }).toBe(0)
  await page.getByRole('button', { name: 'All plates' }).click()
  await expect(page).not.toHaveURL(/#/)
  await expect(page.locator('.plate-ghost')).toHaveCount(0)
  await expect(page.locator('.plate[data-plate="quantum"] .plate-raster')).toBeVisible()

  // Fullscreen while a plate is in the air: the plate is put down at once, not flown across the fullscreen OS.
  let stop = await recording(page)
  await page.locator('.plate[data-plate="strata"]').click()
  await page.getByRole('button', { name: 'Native Fullscreen' }).click()
  await expect(page.locator('.native-surface .strata-os')).toBeVisible()
  let frames = await stop()
  expect(frames.filter((frame) => frame.native && frame.ghosts > 0)).toEqual([])
  await page.getByRole('button', { name: 'Exit fullscreen' }).click()
  await expect.poll(() => veiled(page), { timeout: 900 }).toBe(0)

  // Fullscreen while the core is migrating: the switch that was asked for is made, in fullscreen.
  await page.keyboard.press('3')
  await page.getByRole('button', { name: 'Native Fullscreen' }).click()
  await expect(page).toHaveURL(/#quantum$/)
  await expect(page.locator('.native-surface .quantum-os')).toBeVisible()
  await page.getByRole('button', { name: 'Exit fullscreen' }).click()
  await expect.poll(() => veiled(page), { timeout: 900 }).toBe(0)

  // The lab-bar Focus button, already pressed, does not call off a switch under way.
  stop = await recording(page)
  await page.keyboard.press('6')
  await page.getByRole('navigation', { name: 'Showcase view' }).getByRole('button', { name: 'Focus' }).click()
  await settledOn(page, /#strata$/)
  frames = await stop()
  expect(frames.some((frame) => frame.hash === '#strata')).toBe(true)
  await expect(page.locator('.focus-device .strata-os')).toBeVisible()
})

test('switching paradigm passes through the bare core, and reduced motion switches at once', async ({ page }) => {
  await page.goto('./#field')
  await page.evaluate(() => document.fonts.ready)
  await expect(page.locator('.field-os')).toBeVisible()
  await expect.poll(() => veiled(page), { timeout: 4000 }).toBe(0)
  let stop = await recording(page)
  await page.keyboard.press('6')
  await settledOn(page, /#strata$/)
  let frames = (await stop()).filter((frame) => frame.layer)
  // Held bare: the surface is the lab's ground, and on it only the samples and their legend.
  const bare = frames.filter((frame) => frame.ink > .9 && frame.marks > 150)
  expect(bare.length, JSON.stringify(frames.map((frame) => [frame.hash, +frame.ink.toFixed(2), frame.marks]))).toBeGreaterThan(0)
  // The view changes under the veil: the first frame that shows the new hash is a bare one.
  const changed = frames.find((frame) => frame.hash === '#strata')
  expect(changed.ink).toBeGreaterThan(.9)
  await expect(page.locator('.strata-os')).toBeVisible()

  // A second switch before the first has finished takes over from it and lands where it was sent.
  await page.keyboard.press('2')
  await page.keyboard.press('7')
  await settledOn(page, /#infinity$/)
  await expect(page.locator('.infinity-os')).toBeVisible()

  await page.emulateMedia({ reducedMotion: 'reduce' })
  stop = await recording(page)
  await page.keyboard.press('3')
  await expect(page).toHaveURL(/#quantum$/)
  await expect(page.locator('.quantum-os')).toBeVisible()
  frames = await stop()
  expect(frames.filter((frame) => frame.layer && frame.clear < 1)).toEqual([])
})

test('a phone opens each plate as the specimen itself: no device around it, on its own ground, at its own size', async ({ browser, baseURL }) => {
  const phone = await browser.newContext({ baseURL, hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } })
  try {
    const page = await phone.newPage()
    await page.goto('./')
    // A keyboard is laid over the page, never made to shrink it: a field in the specimen is typed into
    // with the specimen still at its size.
    expect(await page.locator('meta[name="viewport"]').getAttribute('content')).toContain('interactive-widget=resizes-visual')
    await expect(page.locator('.plate[data-plate]')).toHaveCount(names.length)
    let stop = await recording(page)
    await page.locator('.plate[data-plate="infinity"]').tap()
    await settledOn(page, /#infinity$/)
    let frames = (await stop()).filter((frame) => frame.layer)
    // The plate flies onto the surface and develops there. Nothing of the paradigm shows before it lands,
    // not even its ground: while the plate is in the air the screen is the lab's, and the strip reads on it.
    const flying = frames.findIndex((frame) => frame.ghosts > 0)
    expect(flying, 'the plate never took off').toBeGreaterThanOrEqual(0)
    expect(frames.slice(0, flying).filter((frame) => frame.clear > .02)).toEqual([])
    const airborne = frames.filter((frame) => frame.ghosts > 0)
    expect(airborne.filter((frame) => frame.clear > .02)).toEqual([])
    expect(airborne.filter((frame) => channels(frame.ground).join() !== '11,11,12')).toEqual([])
    expect(airborne.filter((frame) => contrastOf(frame.strip, frame.ground) < 4.5)).toEqual([])
    expect(frames.at(-1).clear).toBe(1)
    // Landed: the paradigm's own ground, and the strip in its status ink.
    const stage = page.locator('.bare-stage')
    const strip = page.locator('.specimen-strip')
    const computed = (locator, property) => locator.evaluate((element, property) => getComputedStyle(element)[property], property).then(channels)
    await expect.poll(() => computed(stage, 'backgroundColor')).toEqual([255, 255, 255])
    expect(await computed(strip, 'color')).toEqual([13, 13, 13])
    // Nothing of a device is drawn: no frame, no clock, no island, no home bar, and no lab bar above the specimen.
    await expect(page.locator('.iphone, .status-bar, .dynamic-island, .home-indicator, .lab-bar')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Native Fullscreen/ })).toHaveCount(0)
    // Focus lands on the specimen, which is the first screen; the Design DNA printed below is not scrolled to.
    // The strip is the first thing reached from it, and the band between its controls belongs to the specimen.
    await expect(page.getByRole('region', { name: 'InfinityOS specimen' })).toBeFocused()
    expect(await page.evaluate(() => scrollY)).toBe(0)
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'Index', exact: true })).toBeFocused()
    expect(await page.evaluate(() => {
      const index = document.querySelector('.specimen-strip > button').getBoundingClientRect()
      const step = document.querySelector('.specimen-strip__step').getBoundingClientRect()
      const band = document.querySelector('.specimen-strip').getBoundingClientRect()
      return !!document.elementFromPoint((index.right + step.left) / 2, band.top + band.height / 2)?.closest('.bare-surface')
    })).toBe(true)
    // A fault plate is the lab's own ground: the strip reads on it as it does under the veil.
    await page.locator('.bare-surface').evaluate((surface) => surface.append(Object.assign(document.createElement('section'), { className: 'specimen-fault' })))
    expect(await computed(stage, 'backgroundColor')).toEqual([11, 11, 12])
    expect(await computed(strip, 'color')).toEqual([233, 231, 225])
    await page.locator('.bare-surface > .specimen-fault').evaluate((fault) => fault.remove())
    // InfinityOS's rooms mirror their floor into the band. The strip's labels keep their own ground there.
    for (const orb of [0, 1]) {
      await page.locator('.infinity-orb').nth(orb).tap()
      await expect(page.locator('.infinity-room')).toBeVisible()
      await page.waitForTimeout(600)
      expect(await stripContrast(page), `room ${orb}`).toBeGreaterThanOrEqual(4.5)
      await page.keyboard.press('Escape')
      await expect(page.locator('.infinity-room')).toHaveCount(0)
    }

    const fit = () => page.locator('.bare-surface').evaluate((surface) => {
      const r = surface.getBoundingClientRect()
      const box = surface.parentElement.getBoundingClientRect()
      const room = surface.closest('.bare-stage').getBoundingClientRect()
      const band = document.querySelector('.specimen-strip').getBoundingClientRect()
      const scale = r.height / 836
      const across = box.width / 377
      return {
        aspect: Math.abs(r.width / r.height - 377 / 836) < .0001,
        // At its own size, as an OS is on its screen: larger only to fill a larger screen, smaller only on
        // a screen narrower than the surface.
        scale: Math.abs(scale - Math.min(across, Math.max(1, Math.min(across, box.height / 836)))) < .002,
        inside: r.left >= box.left - 1 && r.right <= box.right + 1 && r.top >= room.top - 1 && r.bottom <= room.bottom + 1,
        // The strip lies in the band the paradigm keeps clear at its top.
        band: Math.abs(band.top - r.top) < 1 && Math.abs(band.height - 44 * scale) < 1,
        across: document.documentElement.scrollWidth === innerWidth,
      }
    })
    const fitted = { aspect: true, scale: true, inside: true, band: true, across: true }
    for (const size of [{ width: 390, height: 844 }, { width: 390, height: 664 }, { width: 320, height: 568 }, { width: 360, height: 780 }, { width: 932, height: 430 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(size)
      await expect.poll(fit, { message: JSON.stringify(size) }).toEqual(fitted)
      await expect(page.locator('.iphone')).toHaveCount(0)
    }
  } finally { await phone.close() }
})

test('on a phone every movement is played on the specimen, at the top, and the strip and the Design DNA move between plates', async ({ browser, baseURL }) => {
  const phone = await browser.newContext({ baseURL, hasTouch: true, isMobile: true, viewport: { width: 844, height: 390 } })
  try {
    const page = await phone.newPage()
    await page.goto('./#quantum')
    await expect(page.locator('.bare-surface .quantum-os')).toBeVisible()
    // On its side the specimen is taller than the screen. A switch made from an open console, into a
    // paradigm whose prompt takes the focus as it mounts, is played at the top and left there.
    await page.keyboard.press('Control+k')
    await expect(page.locator('.bare-surface .quantum-workspace')).toBeVisible()
    let stop = await recording(page)
    await page.keyboard.press('4')
    await settledOn(page, /#telemetry$/)
    let frames = (await stop()).filter((frame) => frame.layer && frame.clear < 1)
    expect(frames.length, 'the switch never drew the core').toBeGreaterThan(0)
    expect(frames.filter((frame) => frame.top !== 0)).toEqual([])
    await expect(prompt(page)).toBeFocused()
    expect(await page.evaluate(() => scrollY)).toBe(0)
    // And a plate opened from the index with the console still open lands at the top, where it is drawn.
    await page.getByRole('button', { name: 'Index', exact: true }).tap()
    await expect(page).not.toHaveURL(/#/)
    await expect(page.locator('.plate-ghost')).toHaveCount(0)
    stop = await recording(page)
    await page.locator('.plate[data-plate="telemetry"]').tap()
    await settledOn(page, /#telemetry$/)
    frames = await stop()
    const landing = frames.filter((frame) => frame.ghosts > 0).at(-1)
    expect(landing?.ghostTop, 'the plate landed off the top of the screen').toBeGreaterThanOrEqual(-1)
    expect(frames.filter((frame) => frame.layer && frame.top !== 0)).toEqual([])
    expect(await page.evaluate(() => scrollY)).toBe(0)
    await page.keyboard.press('Escape')
    await page.setViewportSize({ width: 390, height: 844 })

    // The strip moves between plates through the core, and says which plate is now shown.
    const live = page.locator('.specimen-strip [aria-live]')
    stop = await recording(page)
    await page.getByRole('button', { name: 'Next plate, 05 SpatialOS' }).tap()
    await settledOn(page, /#spatial$/)
    expect((await stop()).filter((frame) => frame.layer && frame.ink > .9).length, 'the strip skipped the core').toBeGreaterThan(0)
    await expect(live).toHaveText('PL. 05 / 07 SpatialOS')

    // The Design DNA is printed below the specimen, and reading goes on from it. A movement started down
    // there is played on the specimen, brought back into view first: the core is never moved, or screened
    // down, out of sight.
    const atDna = () => page.locator('.focus-dna').evaluate((dna) => Math.round(Math.abs(dna.getBoundingClientRect().top)))
    const toDna = async () => {
      await page.getByRole('button', { name: 'DNA', exact: true }).tap()
      await expect(page.locator('.focus-dna h1')).toBeFocused()
      await expect.poll(atDna).toBeLessThanOrEqual(1)
    }
    await toDna()
    stop = await recording(page)
    await page.getByRole('button', { name: '06 StrataOS', exact: true }).tap()
    await settledOn(page, /#strata$/)
    frames = (await stop()).filter((frame) => frame.layer && frame.clear < 1)
    expect(frames.length, 'the switch never drew the core').toBeGreaterThan(0)
    expect(frames.filter((frame) => frame.top !== 0)).toEqual([])
    // Held bare, the core has nothing of either paradigm around it, not SpatialOS's dark nor StrataOS's
    // paper: the ground is the lab's too. (A frame that is ink over nine tenths of the surface has its
    // veil at .96 or more, so its ground is within 10 of the lab's ink.)
    const held = frames.filter((frame) => frame.ink > .9)
    expect(held.length, 'the core was never held bare').toBeGreaterThan(0)
    expect(held.filter((frame) => channels(frame.ground).some((channel, index) => Math.abs(channel - [11, 11, 12][index]) > 10))).toEqual([])
    await expect(live).toHaveText('PL. 06 / 07 StrataOS')
    // Back returns to SpatialOS where its Design DNA was being read, and reading goes on from there.
    await page.goBack()
    await expect(page).toHaveURL(/#spatial$/)
    await expect.poll(atDna).toBeLessThanOrEqual(2)
    await expect(page.locator('.focus-dna h1')).toBeFocused()

    // Asked for while a movement is still under way, the DNA is read at once.
    await page.getByRole('button', { name: 'Next plate, 06 StrataOS' }).tap()
    await page.waitForTimeout(150)
    await page.getByRole('button', { name: 'DNA', exact: true }).tap()
    await settledOn(page, /#strata$/)
    await expect.poll(atDna).toBeLessThanOrEqual(1)
    await expect(page.locator('.focus-dna h1')).toBeFocused()
    // While the page is still gliding down to the DNA, a switch is played at the top all the same.
    await page.evaluate(() => window.scrollTo(0, 0))
    stop = await recording(page)
    await page.getByRole('button', { name: 'DNA', exact: true }).tap()
    await page.waitForTimeout(100)
    await page.keyboard.press('2')
    await settledOn(page, /#wetware$/)
    frames = (await stop()).filter((frame) => frame.layer && frame.clear < 1)
    expect(frames.length, 'the switch never drew the core').toBeGreaterThan(0)
    expect(frames.filter((frame) => frame.top !== 0)).toEqual([])

    // The paradigm works as itself: its Neural Search organ opens and answers.
    await page.locator('.wet-cell').nth(2).tap()
    await page.getByRole('button', { name: /Orbital Memory/ }).tap()
    await expect(page.getByText('Memory addressed by orbital phase and radius.', { exact: true })).toBeVisible()
    await expect(page.locator('.wet-organ h3')).toHaveText('Neural Search')
    await toDna()
    stop = await recording(page)
    await page.getByRole('button', { name: 'All plates' }).tap()
    await expect(page).not.toHaveURL(/#/)
    await expect(page.locator('.plate-ghost')).toHaveCount(0)
    frames = await stop()
    // Screened down where it is seen, and flown home from where it was drawn.
    const screened = frames.filter((frame) => frame.hash === '#wetware' && frame.layer && frame.clear < 1)
    expect(screened.length, 'the specimen was never screened down').toBeGreaterThan(0)
    expect(screened.filter((frame) => frame.top !== 0)).toEqual([])
    const flight = frames.find((frame) => frame.ghosts > 0)
    expect(flight?.ghostTop, 'the plate left from above the screen').toBeGreaterThanOrEqual(-1)
    await expect(page.locator('.plate[data-plate="wetware"] .plate-raster')).toBeVisible()
  } finally { await phone.close() }
})

test('on a phone at least as wide as the specimen, every control that works at its own size still works as drawn', async ({ browser, baseURL }) => {
  // The shortest screens a phone gives: in portrait under the browser's bars, and on its side. (A screen
  // narrower than 377 px draws the specimen at its width, and the paradigms' smallest controls with it.)
  const phone = await browser.newContext({ baseURL, hasTouch: true, isMobile: true, reducedMotion: 'reduce', viewport: { width: 390, height: 664 } })
  try {
    const page = await phone.newPage()
    for (const size of [{ width: 390, height: 664 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(size)
      await page.goto('./#field')
      for (const [index, name] of names.entries()) {
        if (index) await page.keyboard.press(String(index + 1))
        await expect(page.locator(`.bare-surface ${surfaces[index]}`)).toBeVisible()
        expect(await brokenTargets(page), `${name} at ${size.width} × ${size.height}`).toEqual([])
        // The console is open in every paradigm's own tool; QuantumOS's prompt outlives it, so the tool is waited for.
        const console = page.locator(`.bare-surface ${tools[index]}`)
        await page.keyboard.press('Control+k')
        await expect(console).toBeVisible()
        expect(await brokenTargets(page), `${name}'s console at ${size.width} × ${size.height}`).toEqual([])
        await page.keyboard.press('Escape')
        await expect(console).toHaveCount(0)
      }
    }
    // With nothing animated, a plate opened from the index with the console open still lands at the top,
    // with the focus: a prompt that takes the focus as it mounts does not scroll the page to itself.
    await page.setViewportSize({ width: 390, height: 664 })
    await page.goto('./#field')
    await page.keyboard.press('Control+k')
    await expect(page.locator('.bare-surface .field-workspace')).toBeVisible()
    await page.getByRole('button', { name: 'Index', exact: true }).tap()
    await page.locator('.plate[data-plate="telemetry"]').tap()
    await expect(page).toHaveURL(/#telemetry$/)
    await expect(page.getByRole('region', { name: 'TelemetryOS specimen' })).toBeFocused()
    expect(await page.evaluate(() => scrollY)).toBe(0)
  } finally { await phone.close() }
})

test('only a phone loses the device: a tablet keeps it through its keyboard, a narrow or zoomed window keeps it at its width', async ({ browser, baseURL }) => {
  // A touch screen too large to be a phone keeps the device, and a keyboard raised over it changes nothing.
  const tablet = await browser.newContext({ baseURL, hasTouch: true, isMobile: true, viewport: { width: 1280, height: 660 }, screen: { width: 1280, height: 800 } })
  try {
    const page = await tablet.newPage()
    await page.goto('./#field')
    await expect(page.locator('.focus-device .iphone')).toHaveCount(1)
    await page.locator('.field-node').nth(2).tap()
    const search = page.getByRole('textbox', { name: 'Search nodes' })
    await search.tap()
    await expect(search).toBeFocused()
    const field = await search.elementHandle()
    await raiseKeyboard(page, 350)
    await expect(page.locator('.focus-device .iphone')).toHaveCount(1)
    await expect(page.locator('.bare-stage')).toHaveCount(0)
    await page.keyboard.type('or')
    expect(await field.evaluate((element) => element.isConnected && element === document.activeElement && element.value)).toBe('or')
  } finally { await tablet.close() }

  // A desktop window at 200 % zoom is 720 × 395 CSS px under a mouse. It keeps the device, drawn at its
  // width, so zooming in still enlarges the specimen instead of fitting it to the shrinking height.
  const zoomed = await browser.newContext({ baseURL, viewport: { width: 720, height: 395 } })
  try {
    const page = await zoomed.newPage()
    await page.goto('./#field')
    await expect(page.locator('.focus-device .iphone')).toHaveCount(1)
    await expect(page.locator('.bare-stage')).toHaveCount(0)
    await expect.poll(() => page.locator('.iphone-screen').evaluate((screen) => screen.getBoundingClientRect().width)).toBeGreaterThan(395 * 377 / 836 * 1.5)
  } finally { await zoomed.close() }

  // A foldable closed while in fullscreen comes back as a phone, which has no fullscreen control to return
  // focus to: the specimen takes it.
  const foldable = await browser.newContext({ baseURL, hasTouch: true, isMobile: true, viewport: { width: 1280, height: 800 } })
  try {
    const page = await foldable.newPage()
    await page.goto('./#field')
    // Folded shut, with nothing else touched, it is a phone and the device goes; opened, it comes back.
    await expect(page.locator('.focus-device .iphone')).toHaveCount(1)
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(page.locator('.bare-stage')).toHaveCount(1)
    await expect(page.locator('.focus-device')).toHaveCount(0)
    await page.setViewportSize({ width: 1280, height: 800 })
    await expect(page.locator('.focus-device .iphone')).toHaveCount(1)
    await page.getByRole('button', { name: 'Native Fullscreen' }).tap()
    await expect(page.getByRole('button', { name: 'Exit fullscreen' })).toBeVisible()
    await page.setViewportSize({ width: 390, height: 844 })
    await page.keyboard.press('Escape')
    await expect(page.getByRole('region', { name: 'FieldOS specimen' })).toBeFocused()
  } finally { await foldable.close() }
})

test('the static Pages document exposes a fetchable 1200 × 630 preview before JavaScript runs', async ({ request }) => {
  const response = await request.get('./')
  expect(response.ok()).toBe(true)
  const html = await response.text()
  expect(html).toContain('<title>broke-glass — Seven Post-Glass Mobile OS Paradigms</title>')
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
