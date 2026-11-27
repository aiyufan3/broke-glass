export type Vec = { x: number; y: number }
export type Tint = 'coral' | 'aqua' | 'violet' | 'rose'

export const SURFACE = { width: 377, height: 836 } as const
export const OUTLINE_POINTS = 72
export const CORE = 4
export const NUCLEUS = 5
export const FIRST_BUD = 6
/** The chamber a selected cell swells into. */
export const CHAMBER = { x: 188.5, y: 400, rx: 168, ry: 218 } as const
/** The box a swollen organ's contents are laid out in. The membrane decides how much of each row is usable. */
export const ORGAN = { left: 46, top: 228, width: 285, height: 350 } as const
/** How much of its harmonics a fully swollen cell gives up: an organ holds a calmer outline. */
const CALM = .62
const TAU = Math.PI * 2
const HARMONICS = [2, 3, 4, 5] as const

type CellSpec = { x: number; y: number; rx: number; ry: number; tilt: number; tint: Tint; drift: Vec }

const specs: readonly CellSpec[] = [
  { x: 115, y: 282, rx: 86, ry: 62, tilt: -.1, tint: 'coral', drift: { x: -92, y: -66 } },
  { x: 283.5, y: 365, rx: 72, ry: 56, tilt: .1, tint: 'aqua', drift: { x: 84, y: -40 } },
  { x: 128, y: 465.5, rx: 92, ry: 68, tilt: -.07, tint: 'violet', drift: { x: -98, y: 30 } },
  { x: 284.5, y: 550.5, rx: 58, ry: 50, tilt: .12, tint: 'rose', drift: { x: 88, y: 70 } },
  { x: 277.5, y: 188.5, rx: 65, ry: 55, tilt: .05, tint: 'aqua', drift: { x: 46, y: -58 } },
  { x: 186, y: 713, rx: 56, ry: 48, tilt: 0, tint: 'coral', drift: { x: 0, y: 0 } },
  { x: 78, y: 690, rx: 26, ry: 21, tilt: -.2, tint: 'violet', drift: { x: 0, y: 0 } },
  { x: 111, y: 777, rx: 26, ry: 21, tilt: .15, tint: 'aqua', drift: { x: 0, y: 0 } },
  { x: 264, y: 777, rx: 26, ry: 21, tilt: -.1, tint: 'violet', drift: { x: 0, y: 0 } },
  { x: 298, y: 691, rx: 26, ry: 21, tilt: .2, tint: 'rose', drift: { x: 0, y: 0 } },
]

export const CELL_HOMES: readonly Vec[] = specs.map(({ x, y }) => ({ x, y }))
export const CELL_RADII: readonly Vec[] = specs.map(({ rx, ry }) => ({ x: rx, y: ry }))

export type Cell = {
  spec: CellSpec
  x: number
  y: number
  vx: number
  vy: number
  rx: number
  ry: number
  vrx: number
  vry: number
  swell: number
  flash: number
  dim: number
  vigor: number
  amplitudes: number[]
  phases: number[]
  spines: number[]
}

/** A vessel runs from the membrane of one cell to the membrane of another. */
type VesselSpec = { from: number; to: number; side: 1 | -1; bow: number }
type Pulse = { vessel: number; t: number }
export type Bezier = [Vec, Vec, Vec, Vec]

export type Tissue = {
  cells: Cell[]
  vessels: VesselSpec[]
  pulses: Pulse[]
  breath: number
  selected: number
  swell: number
  beat: number
  nextIdle: number
  heldUntil: number
}

type TissueInputs = {
  selected: number
  pulse: number
  speed: number
  stress: boolean
}

// Mulberry32: cell shapes are reproducible, so the colony looks the same on every load.
function seeded(seed: number) {
  return () => {
    seed = seed + 0x6d2b79f5 | 0
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

export function createTissue(): Tissue {
  const random = seeded(1904)
  const cells = specs.map((spec): Cell => {
    const spineCount = Math.round(14 + spec.rx * .16)
    return {
      spec, x: spec.x, y: spec.y, vx: 0, vy: 0, rx: spec.rx, ry: spec.ry, vrx: 0, vry: 0, swell: 0, flash: 0, dim: 0, vigor: 1,
      amplitudes: HARMONICS.map((order) => (.14 / order) * (.55 + random() * .9)),
      phases: HARMONICS.map(() => random() * TAU),
      spines: Array.from({ length: spineCount }, (_, index) => (index + random() * .5) / spineCount * TAU),
    }
  })
  const vessels: VesselSpec[] = [
    ...[0, 1, 2, 3].map((to): VesselSpec => ({ from: NUCLEUS, to, side: to % 2 ? 1 : -1, bow: 41 + to * 9 })),
    ...[0, 1, 2, 3].map((to): VesselSpec => ({ from: CORE, to, side: to % 2 ? 1 : -1, bow: 30 + to * 7 })),
    ...[0, 1, 2, 3].map((bud): VesselSpec => ({ from: NUCLEUS, to: FIRST_BUD + bud, side: bud < 2 ? -1 : 1, bow: 12 })),
  ]
  return { cells, vessels, pulses: [], breath: 0, selected: -1, swell: 0, beat: 0, nextIdle: 1.2, heldUntil: 0 }
}

/**
 * Membrane radius multiplier at angle `theta`: a few low harmonics around 1. `lag` delays the breath
 * for inner pleats so that they ripple after the membrane, and `gain` scales every harmonic.
 */
function membrane(cell: Cell, theta: number, breath: number, lag: number, gain: number) {
  let radius = 1
  for (let index = 0; index < HARMONICS.length; index++) {
    const order = HARMONICS[index]
    radius += cell.amplitudes[index] * gain * Math.sin(order * theta + cell.phases[index] + (breath - lag) * (.55 + index * .21))
  }
  return radius
}

/** Membrane Pulse as the gain on every harmonic of the breath. */
function vigorOf(pulse: number) {
  return .5 + pulse * .011
}

/**
 * The largest share of its radius an organ's membrane dips inward at any phase of its breath, at a
 * Membrane Pulse setting: every harmonic at its trough at once.
 */
export function organSlack(cell: Cell, pulse: number) {
  return cell.amplitudes.reduce((sum, amplitude) => sum + Math.abs(amplitude), 0) * vigorOf(pulse) * (1 - CALM)
}

/**
 * The part of a row between heights `top` and `bottom` that lies inside a swollen organ's membrane
 * through its whole breath, with `clearance` pixels to spare. Null where the membrane leaves no room.
 * An organ's contents are set inside this span, so no label can cross its own cell wall.
 */
export function chamberSpan(slack: number, top: number, bottom: number, clearance = 10) {
  const rx = CHAMBER.rx * (1 - slack) - clearance
  const ry = CHAMBER.ry * (1 - slack) - clearance
  const reach = Math.max(Math.abs(top - CHAMBER.y), Math.abs(bottom - CHAMBER.y)) / ry
  if (reach >= 1) return null
  const half = rx * Math.sqrt(1 - reach * reach)
  return { left: CHAMBER.x - half, right: CHAMBER.x + half }
}

/** Harmonic gain of a cell: Membrane Pulse deepens the breath, and a swollen organ holds a calmer outline. */
function gainOf(cell: Cell) {
  return cell.vigor * (1 - cell.swell * CALM)
}

export function membranePoint(cell: Cell, theta: number, breath: number, scale = 1, lag = 0): Vec {
  const radius = membrane(cell, theta, breath, lag, gainOf(cell)) * scale
  const localX = Math.cos(theta) * cell.rx * radius
  const localY = Math.sin(theta) * cell.ry * radius
  const tilt = cell.spec.tilt * (1 - cell.swell)
  return {
    x: cell.x + localX * Math.cos(tilt) - localY * Math.sin(tilt),
    y: cell.y + localX * Math.sin(tilt) + localY * Math.cos(tilt),
  }
}

/** The hilum: the point of a cell's membrane that faces `toward`, where a vessel attaches. */
function hilum(cell: Cell, toward: Vec, breath: number): Vec {
  const tilt = cell.spec.tilt * (1 - cell.swell)
  const dx = toward.x - cell.x
  const dy = toward.y - cell.y
  const localX = dx * Math.cos(tilt) + dy * Math.sin(tilt)
  const localY = -dx * Math.sin(tilt) + dy * Math.cos(tilt)
  return membranePoint(cell, Math.atan2(localY / cell.ry, localX / cell.rx), breath)
}

export function vesselCurve(tissue: Tissue, index: number): Bezier {
  const spec = tissue.vessels[index]
  const source = tissue.cells[spec.from]
  const target = tissue.cells[spec.to]
  const root = hilum(source, target, tissue.breath)
  const tip = hilum(target, source, tissue.breath)
  const tension = (tip.y - root.y) * .42
  return [root, { x: root.x + spec.side * spec.bow, y: root.y + tension }, { x: tip.x - spec.side * spec.bow * 1.3, y: tip.y - tension }, tip]
}

export function bezierPoint([a, b, c, d]: Bezier, t: number): Vec {
  const q = 1 - t
  const wa = q * q * q
  const wb = 3 * q * q * t
  const wc = 3 * q * t * t
  const wd = t * t * t
  return { x: wa * a.x + wb * b.x + wc * c.x + wd * d.x, y: wa * a.y + wb * b.y + wc * c.y + wd * d.y }
}

export function bezierTangent([a, b, c, d]: Bezier, t: number): Vec {
  const q = 1 - t
  const x = 3 * q * q * (b.x - a.x) + 6 * q * t * (c.x - b.x) + 3 * t * t * (d.x - c.x)
  const y = 3 * q * q * (b.y - a.y) + 6 * q * t * (c.y - b.y) + 3 * t * t * (d.y - c.y)
  const length = Math.hypot(x, y) || 1
  return { x: x / length, y: y / length }
}

export const PULSE_HOLD_MS = 480

function launch(tissue: Tissue, cell: number) {
  tissue.vessels.forEach((vessel, index) => {
    if (vessel.from === NUCLEUS && vessel.to === cell) tissue.pulses.push({ vessel: index, t: 0 })
  })
}

/** Sends a pulse from the nucleus to one cell, or to every module cell. `now` is the caller's clock in ms. */
export function firePulse(tissue: Tissue, cell: number | 'all', now: number) {
  if (cell === 'all') for (let index = 0; index < CORE; index++) launch(tissue, index)
  else launch(tissue, cell)
  tissue.heldUntil = now + PULSE_HOLD_MS
}

/** Breathing period in seconds, from Membrane Pulse, Synapse Speed and load. */
function breathPeriod(inputs: TissueInputs) {
  return Math.max(.75, 10.5 - inputs.pulse * .074 - inputs.speed * .02 - (inputs.stress ? 1.55 : 0))
}

function targetOf(tissue: Tissue, index: number) {
  const { spec } = tissue.cells[index]
  const open = tissue.selected >= 0
  if (index === tissue.selected) return { x: CHAMBER.x, y: CHAMBER.y, rx: CHAMBER.rx, ry: CHAMBER.ry }
  const displaced = open && index <= CORE
  return {
    x: spec.x + (displaced ? spec.drift.x : 0),
    y: spec.y + (displaced ? spec.drift.y : 0),
    rx: spec.rx * (displaced ? .9 : 1),
    ry: spec.ry * (displaced ? .9 : 1),
  }
}

function measure(tissue: Tissue, inputs: TissueInputs) {
  for (const cell of tissue.cells) {
    cell.swell = Math.min(1.1, Math.max(0, (cell.rx - cell.spec.rx) / (CHAMBER.rx - cell.spec.rx)))
    cell.vigor = vigorOf(inputs.pulse)
  }
  tissue.swell = tissue.selected >= 0 ? Math.min(1, tissue.cells[tissue.selected].swell) : 0
}

export function stepTissue(tissue: Tissue, inputs: TissueInputs, seconds: number) {
  tissue.selected = inputs.selected
  tissue.beat += seconds
  tissue.breath += seconds * TAU / breathPeriod(inputs)

  // Under-damped springs: cells overshoot and settle, like tissue under tension.
  tissue.cells.forEach((cell, index) => {
    const target = targetOf(tissue, index)
    cell.vx += (62 * (target.x - cell.x) - 9.6 * cell.vx) * seconds
    cell.vy += (62 * (target.y - cell.y) - 9.6 * cell.vy) * seconds
    cell.vrx += (54 * (target.rx - cell.rx) - 10 * cell.vrx) * seconds
    cell.vry += (54 * (target.ry - cell.ry) - 10 * cell.vry) * seconds
    cell.x += cell.vx * seconds
    cell.y += cell.vy * seconds
    cell.rx += cell.vrx * seconds
    cell.ry += cell.vry * seconds
    cell.flash *= Math.exp(-seconds / .35)
    const dimmed = tissue.selected >= 0 && index !== tissue.selected && index <= CORE ? 1 : 0
    cell.dim += (dimmed - cell.dim) * (1 - Math.exp(-seconds / .2))
  })
  measure(tissue, inputs)

  const velocity = (.45 + inputs.speed * .024) * (inputs.stress ? 1.6 : 1)
  for (const pulse of tissue.pulses) {
    pulse.t += velocity * seconds
    if (pulse.t >= 1) tissue.cells[tissue.vessels[pulse.vessel].to].flash = 1
  }
  tissue.pulses = tissue.pulses.filter((pulse) => pulse.t < 1)

  if (tissue.beat >= tissue.nextIdle) {
    launch(tissue, tissue.selected >= 0 ? tissue.selected : Math.floor(tissue.beat * 1.7) % CORE)
    tissue.nextIdle = tissue.beat + breathPeriod(inputs) * (inputs.stress ? .16 : .42)
  }
}

/** Resting state for a still frame. A pulse fired within the hold window is shown mid-vessel so it stays visible. */
export function settleTissue(tissue: Tissue, inputs: TissueInputs, now: number) {
  tissue.selected = inputs.selected
  tissue.cells.forEach((cell, index) => {
    const target = targetOf(tissue, index)
    cell.x = target.x
    cell.y = target.y
    cell.rx = target.rx
    cell.ry = target.ry
    cell.vx = cell.vy = cell.vrx = cell.vry = 0
    cell.flash = 0
    cell.dim = tissue.selected >= 0 && index !== tissue.selected && index <= CORE ? 1 : 0
  })
  measure(tissue, inputs)
  tissue.pulses = now < tissue.heldUntil ? tissue.pulses.map((pulse) => ({ ...pulse, t: .75 })) : []
}
