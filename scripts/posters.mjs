import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const ROOT = new URL('../', import.meta.url)
const PAPER = '#F2F0E8'
const INK = '#0D0D0D'
const RED = '#E10600'
const COBALT = '#0047FF'
const SANS = "'Helvetica Neue', Helvetica, -apple-system, BlinkMacSystemFont, Arial, sans-serif"
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'
const THEMES = { light: { ground: PAPER, ink: INK }, dark: { ground: INK, ink: PAPER } }
const THESIS = ['Broke as in shattered.', 'Broke as in creatively', 'bankrupt.']

// Helvetica Bold advance widths in thousandths of an em. Arial and Liberation Sans share them, so a
// textLength computed from this table locks the display type to the grid whichever face is substituted.
const ADVANCE = { b: 611, r: 389, o: 611, k: 556, e: 556, '-': 333, g: 611, l: 278, a: 556, s: 556 }
const FIGURE = 556
// The tail of the Helvetica Bold g reaches 0.217 em below the baseline. The lowest display line sits
// that far plus a margin above the bottom edge, so no glyph is cropped by the sheet or by a card crop.
const DESCENT = .217

const round = (value) => Math.round(value * 10) / 10
const two = (value) => String(value).padStart(2, '0')
const percent = (value) => `${two(Math.round(value * 100))}%`
const escape = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const attributes = (map) => Object.entries(map).filter(([, value]) => value !== undefined)
  .map(([name, value]) => ` ${name}="${escape(value)}"`).join('')
const tag = (name, map, body) => body === undefined ? `<${name}${attributes(map)}/>` : `<${name}${attributes(map)}>${body}</${name}>`

const field = (x, y, width, height, fill, extra) => tag('rect', { x, y, width, height, fill, 'shape-rendering': 'crispEdges', ...extra })
const rule = (x1, y1, x2, y2, stroke, extra) => tag('line', {
  x1, y1, x2, y2, stroke, 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke', 'shape-rendering': 'crispEdges', ...extra,
})
const frame = (x, y, width, height, stroke, extra) => tag('rect', {
  x, y, width, height, fill: 'none', stroke, 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke', 'shape-rendering': 'crispEdges', ...extra,
})

function display(x, y, string, size, fill, tracking = -.045) {
  const natural = [...string].reduce((sum, glyph) => sum + (ADVANCE[glyph] ?? FIGURE), 0) / 1000
  return tag('text', {
    x, y, fill, 'font-family': SANS, 'font-size': size, 'font-weight': 700, 'letter-spacing': round(size * tracking),
    textLength: round(size * (natural + tracking * (string.length - 1))), lengthAdjust: 'spacingAndGlyphs',
  }, escape(string))
}

const sans = (x, y, string, size, fill, extra) => tag('text', {
  x, y, fill, 'font-family': SANS, 'font-size': size, 'font-weight': 700, 'letter-spacing': round(size * -.01), ...extra,
}, escape(string))

const mono = (x, y, string, fill, { size = 12.5, weight = 500, ...extra } = {}) => tag('text', {
  x, y, fill, 'font-family': MONO, 'font-size': size, 'font-weight': weight, 'letter-spacing': round(size * .09), ...extra,
}, escape(string))

const lines = (x, y, leading, strings, draw) => strings.map((string, index) => draw(x, y + index * leading, string)).join('\n')

function sheet(width, height, title, description, ground, body) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title description">`,
    tag('title', { id: 'title' }, escape(title)),
    tag('desc', { id: 'description' }, escape(description)),
    field(0, 0, width, height, ground),
    ...body,
    '</svg>',
    '',
  ].join('\n')
}

const { filter, grid, plates } = JSON.parse(await readFile(new URL('./silhouettes.json', import.meta.url), 'utf8'))
const specimens = await Promise.all(plates.map(async (plate, position) => {
  const cells = plate.luminance.match(/../g).map((pair) => parseInt(pair, 16) / 255)
  const modules = await readdir(new URL(`src/themes/${plate.id}/`, ROOT))
  return {
    ...plate,
    cells,
    index: two(position + 1),
    label: plate.name.replace(/OS$/, '').toUpperCase(),
    mean: cells.reduce((sum, value) => sum + value, 0) / cells.length,
    peak: Math.max(...cells),
    model: modules.find((file) => file.endsWith('.ts') && file !== 'renderer.ts'),
  }
}))
const count = two(specimens.length)

function ticks(width, y, pitch, stroke) {
  const marks = []
  for (let x = pitch; x < width; x += pitch) marks.push(rule(x, y - 6, x, y, stroke))
  return marks.join('\n')
}

function hero({ ground, ink }) {
  const index = specimens.map((specimen) => `${specimen.index}  ${specimen.label}`)
  const height = 448 + Math.round(250 * DESCENT) + 16
  return sheet(1280, height, 'broke-glass', `${THESIS.join(' ')} ${count} post-glass mobile OS paradigms on one live core.`, ground, [
    field(960, 0, 320, height, RED),
    rule(0, 32, 960, 32, ink),
    ticks(960, 32, 160, ink),
    rule(800, 32, 800, height, ink),
    mono(40, 21, 'NEXT-ERA Y3K INTERFACE LAB', ink),
    mono(784, 21, 'POST-GLASS MOBILE OS PARADIGMS', ink, { 'text-anchor': 'end' }),
    mono(816, 21, 'INDEX', ink),
    display(27, 228, 'broke-', 250, ink),
    display(187, 448, 'glass', 250, ink),
    lines(40, 408, 20, ['I DROPPED', 'MY GLASS.', "LET'S MOVE ON."], (x, y, string) => mono(x, y, string, ink)),
    lines(816, 66, 21, index, (x, y, string) => mono(x, y, string, ink)),
    field(816, 66 + index.length * 21 - 10, 10, 10, COBALT),
    mono(840, 66 + index.length * 21, `${two(specimens.length + 1)}  OPEN`, ink, { weight: 700 }),
    lines(816, 408, 20, ['1 LIVE CORE', '4 SHARED TOOLS', '0 SHARED CARDS'], (x, y, string) => mono(x, y, string, ink)),
    display(964, 228, count, 300, ground, -.03),
    sans(976, 268, 'paradigms', 30, ground),
    lines(976, 394, 27, THESIS, (x, y, string) => sans(x, y, string, 22, ink)),
  ])
}

function raster(specimen, x, y, width, height, ink) {
  const pitch = { x: width / grid.columns, y: height / grid.rows }
  const floor = Math.min(...specimen.cells)
  const span = specimen.peak - floor
  const squares = specimen.cells.map((luminance, cell) => {
    // Levels are stretched per plate: a dark interface averages under 15% grey and would otherwise
    // print as an empty frame. Dot area is then proportional to the stretched luminance.
    const side = Math.min(pitch.x, pitch.y) * Math.sqrt(.03 + .97 * (luminance - floor) / span)
    const left = x + (cell % grid.columns + .5) * pitch.x - side / 2
    const top = y + (Math.floor(cell / grid.columns) + .5) * pitch.y - side / 2
    return `M${round(left)} ${round(top)}h${round(side)}v${round(side)}h${round(-side)}z`
  })
  return [field(x, y, width, height, INK), tag('path', { d: squares.join(''), fill: PAPER }), frame(x, y, width, height, ink)].join('\n')
}

function silhouettes({ ground, ink }) {
  const column = 1280 / specimens.length
  const scale = Math.min(1, column / 256)
  const plates = specimens.map((specimen, position) => tag('g', { transform: `translate(${round(position * column)} 0) scale(${round(scale * 1000) / 1000})` }, [
    '',
    raster(specimen, 20, 52, 118, 262, ink),
    display(152, 104, specimen.index, 72, ink, -.03),
    mono(154, 130, specimen.label, ink, { weight: 700 }),
    mono(154, 158, `MEAN ${percent(specimen.mean)}`, ink, { size: 11.5 }),
    mono(154, 174, `PEAK ${percent(specimen.peak)}`, ink, { size: 11.5 }),
    ...specimen.colors.map((color, row) => [
      field(154, 252 + row * 17, 11, 11, color),
      frame(154, 252 + row * 17, 11, 11, ink, { 'stroke-opacity': .45 }),
      mono(172, 262 + row * 17, color.toUpperCase(), ink, { size: 11.5 }),
    ].join('\n')),
    '',
  ].join('\n')))
  const dividers = specimens.slice(1).map((_, position) => rule((position + 1) * column, 32, (position + 1) * column, 340, ink))
  return sheet(1280, 340, 'Silhouette test', `${specimens.map((specimen) => specimen.name).join(', ')} under ${filter}, sampled on a ${grid.columns} by ${grid.rows} raster and printed as a halftone.`, ground, [
    rule(0, 32, 1280, 32, ink),
    mono(20, 21, `SILHOUETTE TEST — ${filter.toUpperCase()}`, ink, { weight: 700 }),
    mono(1260, 21, `${grid.columns} × ${grid.rows} RASTER · LEVELS STRETCHED PER PLATE · MEASURED FROM THE RUNNING APP`, ink, { 'text-anchor': 'end' }),
    ...dividers,
    ...plates,
  ])
}

function architecture({ ground, ink }) {
  const node = 88
  const first = 250
  const pitch = (1200 - first - 170) / specimens.length
  const rail = 64
  const top = 96
  const centre = (position) => first + position * pitch + node / 2
  const open = specimens.length
  const engines = specimens.map((specimen, position) => {
    const x = first + position * pitch
    return [
      rule(centre(position), rail, centre(position), top, RED, { 'stroke-width': 2 }),
      field(centre(position) - 4, rail - 4, 8, 8, RED),
      frame(x, top, node, node, ink),
      display(x + 12, top + 70, specimen.index, 44, ink, -.03),
      mono(x, top + node + 20, specimen.label, ink, { weight: 700 }),
      specimen.model ? mono(x, top + node + 36, specimen.model, ink, { size: 11.5 }) : '',
    ].join('\n')
  })
  const last = first + (open - 1) * pitch + node
  return sheet(1200, 280, 'System architecture', `One live core, src/state/osStore.tsx with src/data, feeds ${count} engines that share no layout component. Slot ${two(open + 1)} is open.`, ground, [
    rule(0, 32, 1200, 32, ink),
    mono(40, 21, 'SYSTEM ARCHITECTURE — DATA PARITY ONLY, ZERO LAYOUT PARITY', ink, { weight: 700 }),
    mono(1160, 21, 'SRC/STATE → SRC/THEMES', ink, { 'text-anchor': 'end' }),
    field(40, 76, 128, 128, ink),
    display(54, 186, '01', 84, ground, -.03),
    mono(40, 226, 'LIVE CORE', ink, { weight: 700 }),
    mono(40, 242, 'src/state/osStore.tsx', ink, { size: 11.5 }),
    mono(40, 258, 'src/data/*', ink, { size: 11.5 }),
    tag('path', { d: `M168 140H216V${rail}H${round(centre(open - 1))}`, fill: 'none', stroke: RED, 'stroke-width': 2, 'shape-rendering': 'crispEdges' }),
    tag('path', { d: `M${round(centre(open - 1))} ${rail}H${round(centre(open))}V${top}`, fill: 'none', stroke: COBALT, 'stroke-width': 2, 'stroke-dasharray': '2 6', 'shape-rendering': 'crispEdges' }),
    mono(232, rail - 12, 'SESSION STATE · 4 TOOLS · IMPULSE CHANNEL · 48-SAMPLE LATENCY TRACE', ink, { size: 11.5 }),
    ...engines,
    frame(first + open * pitch, top, node, node, COBALT, { 'stroke-dasharray': '2 6' }),
    display(first + open * pitch + 12, top + 70, two(open + 1), 44, COBALT, -.03),
    mono(first + open * pitch, top + node + 20, 'OPEN SLOT', ink, { weight: 700 }),
    mono(first + open * pitch, top + node + 36, 'src/themes/<id>/', ink, { size: 11.5 }),
    rule(first, 246, last, 246, ink),
    rule(first, 240, first, 246, ink),
    rule(last, 240, last, 246, ink),
    mono(first, 266, `${count} ZERO-PARITY ENGINES — NO SHARED CARD, MODAL, DOCK OR GRID`, ink, { weight: 700 }),
  ])
}

function card({ ground, ink }) {
  const base = 630 - 40 - Math.round(262 * DESCENT)
  return sheet(1200, 630, 'broke-glass', `${THESIS.join(' ')} ${count} post-glass mobile OS paradigms on one live core.`, ground, [
    field(880, 0, 320, 630, RED),
    rule(0, 48, 880, 48, ink),
    ticks(880, 48, 160, ink),
    mono(40, 31, `${count} POST-GLASS MOBILE OS PARADIGMS · 1 LIVE CORE · 0 SHARED CARDS`, ink, { size: 16 }),
    display(27, 292, 'broke-', 262, ink),
    display(199, base, 'glass', 262, ink),
    lines(40, base - 58, 29, ['I dropped', 'my glass.', "Let's move on."], (x, y, string) => sans(x, y, string, 21, ink)),
    display(892, 292, count, 300, ground, -.03),
    sans(896, 336, 'paradigms', 32, ground),
    lines(896, base - 68, 34, THESIS, (x, y, string) => sans(x, y, string, 27, ink)),
  ])
}

function badge(label, live) {
  const size = 11.5
  const inset = live ? 30 : 14
  const width = Math.round(inset + label.length * size * .69 + 14)
  return sheet(width, 26, label, label, INK, [
    frame(.5, .5, width - 1, 25, PAPER, { 'stroke-opacity': .4 }),
    live ? field(13, 9.5, 7, 7, RED) : '',
    mono(inset, 17, label, PAPER, { size, weight: 700 }),
  ])
}

const outputs = {
  'docs/readme-hero.svg': hero(THEMES.light),
  'docs/readme-hero-dark.svg': hero(THEMES.dark),
  'docs/paradigm-silhouettes.svg': silhouettes(THEMES.light),
  'docs/paradigm-silhouettes-dark.svg': silhouettes(THEMES.dark),
  'docs/architecture.svg': architecture(THEMES.light),
  'docs/architecture-dark.svg': architecture(THEMES.dark),
  'docs/badge-live-demo.svg': badge('LIVE DEMO', true),
  'docs/badge-paradigms.svg': badge(`${specimens.length} PARADIGMS`),
  'docs/badge-shared-cards.svg': badge('0 SHARED CARDS'),
  'docs/badge-license.svg': badge('MIT'),
  'public/og-preview.svg': card(THEMES.light),
}

await mkdir(new URL('docs/', ROOT), { recursive: true })
for (const [path, svg] of Object.entries(outputs)) {
  await writeFile(new URL(path, ROOT), svg)
  console.log(`Wrote ${fileURLToPath(new URL(path, ROOT))}`)
}
