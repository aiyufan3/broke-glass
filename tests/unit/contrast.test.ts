import { expect, test } from 'vitest'
import { contrast, inkOn, legible, luminance } from '../../src/data/contrast'
import { paradigmIds, paradigms } from '../../src/data/paradigms'
import { accentText } from '../../src/components/accentText'
import { HUES, INKS } from '../../src/themes/infinity/dots'

const LAB_INK = '#0B0B0C'
const SMALL_TEXT = 4.5

test('contrast is the WCAG ratio: 21 between black and white, 1 for a colour on itself, symmetric', () => {
  expect(luminance('#000000')).toBe(0)
  expect(luminance('#FFFFFF')).toBeCloseTo(1, 12)
  expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 9)
  expect(contrast('#B8401E', '#B8401E')).toBe(1)
  expect(contrast('#E60012', LAB_INK)).toBe(contrast(LAB_INK, '#E60012'))
  expect(contrast('#FFD400', '#FFFFFF')).toBeLessThan(1.5)
})

test('every paradigm accent is readable as small text on the lab chrome, and is only changed when it has to be', () => {
  for (const id of paradigmIds) {
    const { accent } = paradigms[id]
    const text = accentText(accent)
    expect(contrast(text, LAB_INK), id).toBeGreaterThanOrEqual(SMALL_TEXT)
    if (contrast(accent, LAB_INK) >= SMALL_TEXT) expect(text, id).toBe(accent.toUpperCase())
    else expect(contrast(text, LAB_INK), `${id} is lightened no further than needed`).toBeLessThan(SMALL_TEXT + .35)
  }
  // The two accents that did not read on the chrome are the ones that are lightened.
  expect(paradigmIds.filter((id) => accentText(paradigms[id].accent) !== paradigms[id].accent.toUpperCase())).toEqual(['strata', 'infinity'])
  expect(legible('#000000', '#000000', 22)).toBe('#FFFFFF')
})

test('a label on an InfinityOS dot is set in the ink that reads on that hue', () => {
  expect(INKS).toHaveLength(HUES.length)
  HUES.forEach((hue, index) => {
    expect(contrast(INKS[index], hue), hue).toBeGreaterThanOrEqual(SMALL_TEXT)
    expect(INKS[index]).toBe(inkOn(hue))
  })
  // White on red and blue, black on yellow, green and pink.
  expect(INKS).toEqual(['#FFFFFF', '#0B0B0B', '#FFFFFF', '#0B0B0B', '#0B0B0B'])
  expect(inkOn('#808080', ['#111111'])).toBe('#111111')
})
