import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { paradigmIds } from '../../src/data/paradigms'

/*
 * The silhouette rule as a number. scripts/silhouettes.mjs photographs every gallery plate under
 * grayscale(1) blur(12px) and averages the luminance of a 13 × 29 grid of cells (0–255, two hex
 * digits per cell, row by row). Two plates are compared by the normalised mean absolute
 * difference of those cells:
 *
 *   distance(a, b) = Σ |aᵢ − bᵢ| / (377 cells × 255)
 *
 * 0 means the same silhouette; 1 means one plate is white wherever the other is black.
 *
 * Measured on the six plates in scripts/silhouettes.json (2026-11-27), which set the floor:
 *
 *              field   wetware quantum telemetry spatial strata
 *   field      —       0.0704  0.0618  0.7121    0.1683  0.4451
 *   wetware    0.0704  —       0.1212  0.6491    0.1211  0.3823
 *   quantum    0.0618  0.1212  —       0.7682    0.2243  0.5011
 *   telemetry  0.7121  0.6491  0.7682  —         0.5464  0.2818
 *   spatial    0.1683  0.1211  0.2243  0.5464    —       0.2982
 *   strata     0.4451  0.3823  0.5011  0.2818    0.2982  —
 *
 * The closest pair is FieldOS and QuantumOS at 0.0618, two dark fields of fine marks that the
 * blur still tells apart. The floor is 0.7 of that minimum, rounded down: 0.043. A new plate
 * that lands nearer than 0.043 to any registered plate reads as a theme of it. The floor is not
 * lowered to admit a new paradigm; the paradigm changes instead.
 *
 * Re-measured with InfinityOS as plate 07 (2026-11-27). Seven columns make each plate narrower in
 * the gallery, which moves the existing pairs by at most 0.0055; FieldOS / QuantumOS is still the
 * closest pair, at 0.0616.
 *
 *              field   wetware quantum telemetry spatial strata  infinity
 *   infinity   0.7888  0.7258  0.8446  0.1244    0.6212  0.3523  —
 */
export const SILHOUETTE_FLOOR = 0.043

type Plate = { id: string; luminance: string }
type Sheet = { filter: string; grid: { columns: number; rows: number }; plates: Plate[] }

const sheet = JSON.parse(readFileSync(new URL('../../scripts/silhouettes.json', import.meta.url), 'utf8')) as Sheet
const cells = sheet.grid.columns * sheet.grid.rows

function vector(plate: Plate) {
  return (plate.luminance.match(/[0-9a-f]{2}/gi) ?? []).map((hex) => parseInt(hex, 16))
}

export function distance(a: number[], b: number[]) {
  if (a.length !== b.length || !a.length) throw new Error(`plates of ${a.length} and ${b.length} cells cannot be compared`)
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i])
  return sum / (a.length * 255)
}

/** Every pair of plates nearer than the floor, nearest first. */
export function confusable(plates: Plate[], floor = SILHOUETTE_FLOOR) {
  const pairs: { a: string; b: string; distance: number }[] = []
  for (let i = 0; i < plates.length; i++) {
    for (let j = i + 1; j < plates.length; j++) {
      const d = distance(vector(plates[i]), vector(plates[j]))
      if (d < floor) pairs.push({ a: plates[i].id, b: plates[j].id, distance: d })
    }
  }
  return pairs.sort((x, y) => x.distance - y.distance)
}

describe('silhouette distinctness', () => {
  test('every registered paradigm has a measured plate on the same 13 × 29 grid', () => {
    expect(sheet.filter).toBe('grayscale(1) blur(12px)')
    expect(sheet.grid).toEqual({ columns: 13, rows: 29 })
    expect(sheet.plates.map((plate) => plate.id)).toEqual(paradigmIds)
    for (const plate of sheet.plates) expect(vector(plate), plate.id).toHaveLength(cells)
  })

  test(`no two plates are nearer than ${SILHOUETTE_FLOOR} under the blur`, () => {
    expect(confusable(sheet.plates)).toEqual([])
  })

  test('the gate fails a plate that is a near copy of another', () => {
    // A copy of the FieldOS plate with every cell nudged by at most 3 grey levels: a theme, not a paradigm.
    const field = vector(sheet.plates[0])
    const theme = { id: 'theme', luminance: field.map((value, i) => Math.min(255, value + i % 4).toString(16).padStart(2, '0')).join('') }
    const pairs = confusable([...sheet.plates, theme])
    expect(pairs.map(({ a, b }) => [a, b])).toContainEqual([sheet.plates[0].id, 'theme'])
    expect(pairs[0].distance).toBeLessThan(.01)
    // The floor is inclusive: a pair exactly at it passes, a pair a hair below it fails.
    const pair = [{ id: 'a', luminance: '00'.repeat(cells) }, { id: 'b', luminance: '0b'.repeat(cells) }]
    const gap = distance(vector(pair[0]), vector(pair[1]))
    expect(confusable(pair, gap)).toEqual([])
    expect(confusable(pair, gap + 1e-9)).toHaveLength(1)
  })

  test('the distance is a metric on the grid and refuses plates of different sizes', () => {
    const [a, b, c] = sheet.plates.slice(0, 3).map(vector)
    expect(distance(a, a)).toBe(0)
    expect(distance(a, b)).toBe(distance(b, a))
    expect(distance(a, c)).toBeLessThanOrEqual(distance(a, b) + distance(b, c))
    expect(() => distance(a, a.slice(1))).toThrow(/cannot be compared/)
    expect(() => distance([], [])).toThrow(/cannot be compared/)
  })
})
