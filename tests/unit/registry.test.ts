import { expect, test } from 'vitest'
import { initialParams, paradigmIds, paradigms } from '../../src/data/paradigms'
import { clockText, nodes, searchNodes, sessionTime } from '../../src/data/osData'

const HEX = /^#[0-9A-F]{6}$/i

test('every registered paradigm declares engine ranges that contain their initial value', () => {
  for (const id of paradigmIds) {
    paradigms[id].controls.forEach((control, slot) => {
      expect(control.min, `${id} · ${control.label}`).toBeLessThan(control.max)
      expect(initialParams[id][slot], `${id} · ${control.label}`).toBeGreaterThanOrEqual(control.min)
      expect(initialParams[id][slot], `${id} · ${control.label}`).toBeLessThanOrEqual(control.max)
      expect(control.effect.length, `${id} · ${control.label} effect`).toBeGreaterThan(0)
    })
  }
})

test('paradigm names are unique and every colour token is a six-digit hex value', () => {
  const names = paradigmIds.map((id) => paradigms[id].name)
  expect(new Set(names).size).toBe(names.length)
  for (const id of paradigmIds) {
    for (const color of [paradigms[id].accent, ...paradigms[id].colors]) expect(color, id).toMatch(HEX)
  }
})

test('a node search requires every term and the media clock reads minutes and seconds', () => {
  expect(searchNodes('').length).toBe(nodes.length)
  expect(searchNodes('mycelial').map((node) => node.coordinate)).toEqual(['W-116'])
  expect(searchNodes('network relay').map((node) => node.coordinate)).toEqual(['W-116'])
  expect(searchNodes('network quasar')).toEqual([])
  expect(clockText(62.9)).toBe('1:02')
  expect(sessionTime(new Date(2026, 0, 1, 9, 4, 7))).toBe('09:04:07')
})
