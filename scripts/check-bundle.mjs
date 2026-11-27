// Fails when the production build outgrows its byte budgets (tests/perf-budgets.mjs). Run after `npm run build`.
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bundle } from '../tests/perf-budgets.mjs'

const root = fileURLToPath(new URL('../dist/', import.meta.url))

function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? files(path) : [{ path, bytes: statSync(path).size }]
  })
}

let all
try { all = files(root) } catch { console.error('dist/ is missing: run npm run build first.'); process.exit(1) }
const total = all.reduce((sum, file) => sum + file.bytes, 0)
const scripts = all.filter((file) => file.path.endsWith('.js')).sort((a, b) => b.bytes - a.bytes)
const largest = scripts[0] ?? { path: '(none)', bytes: 0 }
const rows = [
  ['dist/ total', total, bundle.totalBytes],
  [`largest script ${largest.path.slice(root.length)}`, largest.bytes, bundle.largestScriptBytes],
]
let failed = false
for (const [label, actual, budget] of rows) {
  const over = actual > budget
  failed ||= over
  console.log(`${over ? '✗' : '✓'} ${label}: ${actual.toLocaleString('en')} B of ${budget.toLocaleString('en')} B (${(actual / budget * 100).toFixed(1)} %)`)
}
if (failed) {
  console.error('Bundle over budget. Shrink it, or raise the budget in tests/perf-budgets.mjs with the measurement that justifies it.')
  process.exit(1)
}
