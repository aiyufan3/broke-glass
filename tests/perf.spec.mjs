import { expect, test } from '@playwright/test'
import { focus, gallery } from './perf-budgets.mjs'

/*
 * Performance budgets in the browser. Not part of the default `npm run test:e2e` run: start it
 * with `npm run test:perf`, which serves the production bundle (npm run build first). Every
 * budget lives in tests/perf-budgets.mjs. Each test prints what it measured, so a CI log is
 * enough to tighten a budget later.
 */

const paradigms = ['field', 'wetware', 'quantum', 'telemetry', 'spatial', 'strata', 'infinity']
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = sorted.length >> 1
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

test.use({ viewport: { width: 1440, height: 980 } })

test('the index stays free of long tasks', async ({ page }) => {
  await page.goto('./')
  await page.evaluate(() => document.fonts.ready)
  await expect(page.locator('.plate[data-plate]')).toHaveCount(paradigms.length)
  // Let every plate paint its settled frame before the window opens.
  await page.waitForTimeout(1000)
  const tasks = await page.evaluate((window) => new Promise((resolve) => {
    const durations = []
    const observer = new PerformanceObserver((list) => { for (const entry of list.getEntries()) durations.push(entry.duration) })
    observer.observe({ type: 'longtask' })
    setTimeout(() => { observer.disconnect(); resolve(durations) }, window)
  }), gallery.observeMs)
  const longest = Math.max(0, ...tasks)
  const total = tasks.reduce((sum, duration) => sum + duration, 0)
  console.log(`index: ${tasks.length} long tasks in ${gallery.observeMs} ms, longest ${longest.toFixed(1)} ms, total ${total.toFixed(1)} ms`)
  expect(longest, 'longest task').toBeLessThanOrEqual(gallery.longestTaskMs)
  expect(total, 'total long-task time').toBeLessThanOrEqual(gallery.totalLongTaskMs)
})

for (const id of paradigms) {
  test(`${id} holds its frame budget in focus`, async ({ page }) => {
    const medians = []
    const tails = []
    for (let run = 0; run < focus.runs; run++) {
      await page.goto(`./#${id}`)
      await page.evaluate(() => document.fonts.ready)
      const intervals = await page.evaluate(({ warmupMs, sampleMs }) => new Promise((resolve) => {
        const out = []
        let previous = 0
        let start = 0
        const tick = (now) => {
          if (!start) start = now
          if (now - start > warmupMs) {
            if (previous) out.push(now - previous)
            previous = now
          }
          if (now - start < warmupMs + sampleMs) requestAnimationFrame(tick)
          else resolve(out)
        }
        requestAnimationFrame(tick)
      }), focus)
      const sorted = [...intervals].sort((a, b) => a - b)
      medians.push(median(sorted))
      tails.push(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * .95))])
    }
    const frame = median(medians)
    const p95 = median(tails)
    console.log(`${id}: rAF median ${frame.toFixed(2)} ms, p95 ${p95.toFixed(2)} ms (runs: ${medians.map((m, i) => `${m.toFixed(1)}/${tails[i].toFixed(1)}`).join(', ')})`)
    expect(frame, 'median frame interval').toBeLessThanOrEqual(focus.medianFrameMs)
    expect(p95, 'p95 frame interval').toBeLessThanOrEqual(focus.p95FrameMs)
  })
}
