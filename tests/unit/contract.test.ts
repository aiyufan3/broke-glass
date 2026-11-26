import { readFileSync, readdirSync } from 'node:fs'
import postcss from 'postcss'
import { describe, expect, test } from 'vitest'
import { SURFACE, initialParams, paradigmIds, paradigmPrompt } from '../../src/data/paradigms'
import { createField, droppedSegments, settleField, stepField } from '../../src/themes/field/potential'
import type { FieldInputs } from '../../src/themes/field/potential'

const THEMES = new URL('../../src/themes/', import.meta.url)

/** The first compound selector, up to the first combinator outside brackets and parentheses. */
function leftmost(selector: string) {
  let depth = 0
  let compound = ''
  for (const char of selector.trim()) {
    if (char === '(' || char === '[') depth++
    else if (char === ')' || char === ']') depth--
    else if (depth === 0 && /[\s>+~]/.test(char)) break
    compound += char
  }
  return compound
}

/** A class stem scopes a selector when it abbreviates the paradigm id: `tel-` and `telemetry-` both scope telemetry. */
const scopes = (id: string, name: string) => {
  const stem = name.split('-')[0]
  return name.includes('-') && stem.length >= 3 && id.startsWith(stem)
}

/** README Rule: every selector in a theme's CSS starts from a class carrying the theme's prefix. */
export function cssViolations(id: string, css: string, file = `${id}.css`) {
  const violations: string[] = []
  const root = postcss.parse(css, { from: file })
  root.walkAtRules(/keyframes$/i, (rule) => {
    if (!scopes(id, rule.params)) violations.push(`${file}: @keyframes ${rule.params}`)
  })
  root.walkRules((rule) => {
    if (rule.parent?.type === 'atrule' && /keyframes$/i.test((rule.parent as postcss.AtRule).name)) return
    for (const selector of rule.selectors) {
      let compound = leftmost(selector)
      while (/\([^()]*\)/.test(compound)) compound = compound.replace(/\([^()]*\)/g, '')
      const classes = [...compound.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((match) => match[1])
      if (!classes.some((name) => scopes(id, name))) violations.push(`${file}: ${selector}`)
    }
  })
  return violations
}

describe('theme CSS is scoped to its paradigm', () => {
  test('the checker rejects global, foreign and unprefixed selectors and keyframes', () => {
    const css = `
      :root { --x: 1; }
      body, .tel-head { margin: 0; }
      .telemetry-os h2, .tel-row:is(.a, .b) > span { color: red; }
      h2 .tel-head { color: red; }
      .field-node { color: red; }
      :is(.tel-a) .x { color: red; }
      @media (width < 600px) { .tel-wave, .wave { height: 0; } }
      @keyframes spin { to { rotate: 1turn; } }
      @keyframes tel-acquire { to { opacity: 1; } }`
    expect(cssViolations('telemetry', css)).toEqual([
      'telemetry.css: @keyframes spin',
      'telemetry.css: :root',
      'telemetry.css: body',
      'telemetry.css: h2 .tel-head',
      'telemetry.css: .field-node',
      'telemetry.css: :is(.tel-a) .x',
      'telemetry.css: .wave',
    ])
  })

  test('every stylesheet under src/themes passes', () => {
    const folders = readdirSync(THEMES, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name)
    expect(folders.sort()).toEqual([...paradigmIds].sort())
    for (const id of folders) {
      const sheets = readdirSync(new URL(`${id}/`, THEMES)).filter((file) => file.endsWith('.css'))
      expect(sheets.length, id).toBeGreaterThan(0)
      for (const sheet of sheets) expect(cssViolations(id, readFileSync(new URL(`${id}/${sheet}`, THEMES), 'utf8'), `${id}/${sheet}`)).toEqual([])
    }
  })
})

describe('the paradigm prompt describes the real surface', () => {
  // Model modules only: renderers need a canvas and do not declare the surface.
  const models = import.meta.glob<{ SURFACE?: { width: number; height: number } }>(['../../src/themes/*/*.ts', '!../../src/themes/*/renderer.ts'], { eager: true })

  test('every engine that declares a SURFACE declares the registry surface', () => {
    const declared = Object.entries(models).filter(([, module]) => module.SURFACE)
    expect(declared.length).toBeGreaterThanOrEqual(4)
    for (const [path, module] of declared) expect(module.SURFACE, path).toEqual(SURFACE)
  })

  test('each prompt names the surface size and the current control values', () => {
    for (const id of paradigmIds) {
      const prompt = paradigmPrompt(id, initialParams[id])
      expect(prompt).toContain(`an interactive ${SURFACE.width} × ${SURFACE.height} mobile`)
      expect(prompt).not.toMatch(/\b393\b|\b852\b/)
    }
  })
})

describe('FieldOS contours never drop segments silently', () => {
  const FRAME_MS = 1000 / 60

  test('the segment buffers hold the densest field the controls can ask for', () => {
    let worst = 0
    for (const levels of [8, 30, 48]) {
      for (const warp of [0, .58, 1]) {
        for (const stress of [false, true]) {
          for (const selected of [-1, 0, 3]) {
            const inputs: FieldInputs = { warp, levels, drift: 1, stress, selected }
            const field = createField()
            field.pointerInside = true
            field.pointer = { x: 200, y: 340 }
            settleField(field, inputs, 0)
            worst = Math.max(worst, droppedSegments(field))
            field.hover = selected < 0 ? 1 : -1
            for (let step = 0; step < 40; step++) {
              stepField(field, inputs, step * FRAME_MS, FRAME_MS)
              worst = Math.max(worst, droppedSegments(field))
            }
          }
        }
      }
    }
    expect(worst).toBe(0)
  })

  test('a full buffer keeps its segments and reports every one it could not store', () => {
    const field = createField()
    field.major = { data: new Float32Array(4 * 10), count: 0, dropped: 0 }
    field.minor = { data: new Float32Array(4 * 20), count: 0, dropped: 0 }
    settleField(field, { warp: .58, levels: 30, drift: 0, stress: false, selected: -1 }, 0)
    expect(field.major.count).toBe(10)
    expect(field.minor.count).toBe(20)
    expect(droppedSegments(field)).toBeGreaterThan(1000)
    const healthy = createField()
    settleField(healthy, { warp: .58, levels: 30, drift: 0, stress: false, selected: -1 }, 0)
    expect(healthy.major.count + healthy.minor.count).toBe(field.major.count + field.minor.count + droppedSegments(field))
  })
})
