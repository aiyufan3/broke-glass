import { expect, test } from '@playwright/test'
import { initialParams, paradigmIds, paradigms } from '../src/data/paradigms'

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
