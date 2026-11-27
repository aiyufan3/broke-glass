import { inkOn } from '../../data/contrast'

export type Vec = { x: number; y: number }

export const SURFACE = { width: 377, height: 836 } as const
/** The one horizon, and the vanishing point on it. Every row of the floor recedes toward it. */
export const HORIZON = 372
export const VANISH = { x: SURFACE.width / 2, y: HORIZON } as const
/** Pinhole camera: screen pixels per world unit at depth 1, and the eye's height above the floor. */
export const FOCAL = 520
export const EYE = 1
/** The nearest row sits on the bottom edge, just above the home indicator. */
const FLOOR_EDGE = SURFACE.height - 12
export const NEAR = FOCAL * EYE / (FLOOR_EDGE - HORIZON)
/** Each row lies this much farther than the one in front of it, so 24 rows reach the horizon. */
export const ROW_RATIO = 1.28
const MARGIN = 24
/**
 * Dots are seeded more sparsely with distance: the spacing grows as depth to the power 0.6, while
 * perspective shrinks everything as 1 / depth. On screen the dots still shrink and crowd toward the
 * horizon, and the near rows keep dots large enough to read as Kusama's.
 */
const GRADE = .6
export const MIN_ROWS = 4
export const MAX_ROWS = 24
export const MIN_DOTS = 200
export const MAX_DOTS = 2400
/** At rest the floor holds this share of Proliferation; commands seed the rest, up to the cap. */
export const SEED_SHARE = .62
/** Red, yellow, blue, green, pink. */
export const HUES = ['#E60012', '#FFD400', '#0057FF', '#00A651', '#FF3EA5'] as const
/** The ink that reads on each hue when a dot carries a label: white on red and blue, black on the light three. */
export const INKS = HUES.map((hue) => inkOn(hue))
/** Coverage at Obliteration 0: the dots never vanish. */
const BASE_COVERAGE = .24
/** At coverage 1 a dot's radius is this share of the gap to its neighbour, so neighbours overlap into solid colour. */
const FILL = .72
const BURST_DOTS = 60
const BURST_SECONDS = .45
const SWELL_SECONDS = .22
const TURN_RATE = .22
const PULSE_RATE = .7
const PULSE_WIDTH = .12
export const PULSE_GAIN = .55
const LOAD_SECONDS = .3
const ORB_DOTS = 140
const ORB_TILT = .38
/** Where a swallowed orb is centred, and the radius at which it covers the whole surface. */
export const ROOM = { x: SURFACE.width / 2, y: 448, radius: Math.hypot(SURFACE.width, SURFACE.height) * .62 } as const

/** Four spheres at staggered depths, one hue each. x and z are world units; h is the centre's height above the floor. */
export const ORBS = [
  { x: -.55, h: 1.35, z: 3.2, radius: .34, hue: 0 },
  { x: .74, h: 1.92, z: 4.6, radius: .4, hue: 2 },
  { x: -.34, h: 3.05, z: 9.4, radius: .62, hue: 1 },
  { x: .44, h: .52, z: 2.35, radius: .25, hue: 4 },
] as const

export type InfinityInputs = {
  /** Proliferation: the most dots the floor may ever hold. */
  proliferation: number
  /** Obliteration, 0 to 1. */
  obliteration: number
  /** Infinity Depth: rows of the floor. */
  rows: number
  stress: boolean
  /** Orb that has swallowed the viewer, or -1. */
  selected: number
}

/** One lattice of floor dots in screen space, row by row from the nearest. */
export type Floor = {
  spacing: number
  count: number
  rows: number
  /** Index of each row's first dot; rows + 1 entries. */
  rowStart: Int32Array
  depth: Float32Array
  x: Float32Array
  y: Float32Array
  rx: Float32Array
  ry: Float32Array
  hue: Uint8Array
}

type Burst = { x: number; z: number; hue: number; age: number }

export type DotField = {
  proliferation: number
  obliteration: number
  rows: number
  coverage: number
  floor: Floor
  bursts: Burst[]
  turn: number
  swell: number[]
  selected: number
  pulse: number
  load: number
  random: () => number
}

// Mulberry32: the floor's hues and every burst are reproducible from the seed.
function seeded(seed: number) {
  return () => {
    seed = seed + 0x6d2b79f5 | 0
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

/** A dot's hue from its lattice address, so the same dot keeps its colour while the field is retuned. */
function hueAt(column: number, row: number) {
  let h = Math.imul(column + 0x9e37, 0x85ebca6b) ^ Math.imul(row + 0x7f4a, 0xc2b2ae35)
  h ^= h >>> 13
  h = Math.imul(h, 0x27d4eb2d)
  return ((h ^ h >>> 15) >>> 0) % HUES.length
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))
const ease = (t: number) => t * t * (3 - 2 * t)

/** Fraction of the way from bare dots to dots that merge with their neighbours. Monotonic, and always within [0, 1]. */
export function coverage(obliteration: number) {
  return clamp(BASE_COVERAGE + (1 - BASE_COVERAGE) * clamp(obliteration, 0, 1), 0, 1)
}

export function rowDepth(row: number) {
  return NEAR * ROW_RATIO ** row
}

/** Projects a point on the floor plane, or at height h above it, through the one vanishing point. */
export function project(x: number, z: number, h = 0): Vec {
  return { x: VANISH.x + FOCAL * x / z, y: HORIZON + FOCAL * (EYE - h) / z }
}

/** Half the floor's visible width at depth z, in world units, with a margin so dots enter from beyond the edge. */
function halfWidth(z: number) {
  return (SURFACE.width / 2 + MARGIN) * z / FOCAL
}

/** World spacing between neighbouring dots at depth z, for a floor whose nearest row is spaced `spacing`. */
function spacingAt(z: number, spacing: number) {
  return spacing * (z / NEAR) ** GRADE
}

function columns(row: number, spacing: number) {
  const z = rowDepth(row)
  return Math.floor(halfWidth(z) / spacingAt(z, spacing))
}

/** Dots a lattice of the given near spacing puts on that many rows: every column in view on each row. */
export function latticeCount(spacing: number, rows: number) {
  let count = 0
  for (let row = 0; row < rows; row++) count += 2 * columns(row, spacing) + 1
  return count
}

/** The finest spacing whose lattice holds at most `target` dots. The count only falls as the spacing grows. */
export function spacingFor(target: number, rows: number) {
  let low = 1e-3
  let high = 64
  for (let i = 0; i < 48; i++) {
    const middle = (low + high) / 2
    if (latticeCount(middle, rows) > target) low = middle
    else high = middle
  }
  return high
}

/**
 * The gaps around a dot at depth z: across to the next column and back to the next row, in screen pixels.
 * Both shrink as 1/z, so every radius drawn from them falls strictly with depth.
 */
function dotRadii(z: number, spacing: number, cover: number) {
  const across = FOCAL * spacingAt(z, spacing) / z
  const back = FOCAL * EYE * (1 - 1 / ROW_RATIO) / z
  const rx = cover * FILL * across
  // A disc on the floor is foreshortened by the eye's angle to the floor; as Obliteration nears 1 it swells
  // into the row behind it too, so the field closes over into solid colour.
  const ry = Math.max(rx * Math.min(1, EYE / z), cover ** 6 * FILL * back)
  return { rx, ry }
}

/**
 * Lays out the floor. Proliferation fixes the spacing as if the room were as deep as it can be, so
 * Infinity Depth only decides how far the rows reach toward the horizon and the cap holds at every depth.
 */
export function layoutFloor(target: number, rows: number, cover: number, hueOverride = -1): Floor {
  const spacing = spacingFor(target, MAX_ROWS)
  const count = latticeCount(spacing, rows)
  const floor: Floor = {
    spacing, count, rows,
    rowStart: new Int32Array(rows + 1),
    depth: new Float32Array(count),
    x: new Float32Array(count),
    y: new Float32Array(count),
    rx: new Float32Array(count),
    ry: new Float32Array(count),
    hue: new Uint8Array(count),
  }
  let index = 0
  for (let row = 0; row < rows; row++) {
    floor.rowStart[row] = index
    const z = rowDepth(row)
    const span = columns(row, spacing)
    const { rx, ry } = dotRadii(z, spacing, cover)
    const step = spacingAt(z, spacing)
    for (let column = -span; column <= span; column++) {
      const point = project(column * step, z)
      floor.depth[index] = z
      floor.x[index] = point.x
      floor.y[index] = point.y
      floor.rx[index] = rx
      floor.ry[index] = ry
      floor.hue[index] = hueOverride >= 0 ? hueOverride : hueAt(column, row)
      index++
    }
  }
  floor.rowStart[rows] = index
  return floor
}

function floorTarget(proliferation: number) {
  return Math.round(proliferation * SEED_SHARE)
}

export function createDots(seed = 7007): DotField {
  const field: DotField = {
    proliferation: 0, obliteration: -1, rows: 0, coverage: 0,
    floor: layoutFloor(1, 1, 0),
    bursts: [], turn: 0, swell: ORBS.map(() => 0), selected: -1, pulse: .5, load: 0,
    random: seeded(seed),
  }
  return field
}

/** Every dot on the floor, lattice and bursts together. Never more than Proliferation. */
export function dotCount(field: DotField) {
  return field.floor.count + field.bursts.length
}

function apply(field: DotField, inputs: InfinityInputs) {
  const proliferation = Math.round(clamp(inputs.proliferation, MIN_DOTS, MAX_DOTS))
  const rows = Math.round(clamp(inputs.rows, MIN_ROWS, MAX_ROWS))
  const obliteration = clamp(inputs.obliteration, 0, 1)
  field.selected = inputs.selected
  if (proliferation === field.proliferation && rows === field.rows && obliteration === field.obliteration) return
  field.proliferation = proliferation
  field.rows = rows
  field.obliteration = obliteration
  field.coverage = coverage(obliteration)
  field.floor = layoutFloor(floorTarget(proliferation), rows, field.coverage)
  // A lower cap sheds the oldest bursts first: the field keeps what was laid down most recently.
  const room = proliferation - field.floor.count
  if (field.bursts.length > room) field.bursts.splice(0, field.bursts.length - room)
}

/** Floor point beneath the orb that has the viewer, or in front of the vanishing point. */
function actionPoint(field: DotField) {
  const orb = ORBS[field.selected]
  return orb ? { x: orb.x, z: orb.z } : { x: 0, z: 3.4 }
}

/**
 * Seeds a burst of new dots around the point of action. They accumulate until the floor reaches
 * Proliferation; after that each new dot takes the place of the oldest burst dot, so every command
 * still lands visibly and the cap still holds.
 */
export function burst(field: DotField, gain: number) {
  const count = Math.round(BURST_DOTS * gain)
  const room = field.proliferation - dotCount(field)
  const recycled = Math.min(field.bursts.length, Math.max(0, count - room))
  field.bursts.splice(0, recycled)
  const landed = Math.min(count, field.proliferation - dotCount(field))
  const centre = actionPoint(field)
  for (let i = 0; i < landed; i++) {
    const angle = field.random() * Math.PI * 2
    const reach = Math.sqrt(field.random()) * .75
    const z = Math.max(NEAR, centre.z * Math.exp(Math.sin(angle) * reach * .5))
    field.bursts.push({ x: centre.x + Math.cos(angle) * reach * z / 3, z, hue: Math.floor(field.random() * HUES.length), age: 0 })
  }
  return landed
}

export type BurstDot = { x: number; y: number; rx: number; ry: number; hue: number; depth: number }

/** Bursts in screen space; a new dot grows from nothing as it lands. */
export function burstDots(field: DotField): BurstDot[] {
  return field.bursts.map((dot) => {
    const point = project(dot.x, dot.z)
    const { rx, ry } = dotRadii(dot.z, field.floor.spacing, field.coverage)
    const grown = ease(clamp(dot.age, 0, 1))
    return { x: point.x, y: point.y, rx: rx * grown, ry: ry * grown, hue: dot.hue, depth: dot.z }
  })
}

/**
 * Radius gain of each floor row from the load pulse, which runs from the horizon toward the eye.
 * A row may swell only to just under the size of the row in front of it, so the drawn radius still
 * falls strictly with depth while the pulse passes. Every row's radius shrinks by the same ratio, so
 * one bound on the gain holds for rx and, since ry falls faster still, for ry.
 */
export function pulseGains(field: DotField) {
  const gains: number[] = []
  const shrink = ROW_RATIO ** (1 - GRADE)
  for (let row = 0; row < field.rows; row++) {
    const from = (field.rows - 1 - row) / (field.rows - 1)
    const wave = field.load > 0 ? 1 + PULSE_GAIN * field.load * Math.exp(-(((from - field.pulse) / PULSE_WIDTH) ** 2)) : 1
    gains.push(row ? Math.min(wave, gains[row - 1] * shrink * .995) : wave)
  }
  return gains
}

export type OrbView = { x: number; y: number; radius: number; depth: number; swell: number }

/** An orb on screen. A swelling orb slides to the room centre and grows until it covers the surface. */
export function orbView(field: DotField, index: number): OrbView {
  const orb = ORBS[index]
  const home = project(orb.x, orb.z, orb.h)
  const radius = FOCAL * orb.radius / orb.z
  const swell = ease(clamp(field.swell[index], 0, 1))
  return {
    x: home.x + (ROOM.x - home.x) * swell,
    y: home.y + (ROOM.y - home.y) * swell,
    radius: radius * (ROOM.radius / radius) ** swell,
    // Swallowing the viewer brings an orb in front of everything else.
    depth: orb.z * (1 - swell) + .01 * swell,
    swell,
  }
}

const GOLDEN = Math.PI * (3 - Math.sqrt(5))
/** Unit vectors of a Fibonacci lattice: ORB_DOTS points spread evenly over the sphere. */
export const LATTICE = Array.from({ length: ORB_DOTS }, (_, i) => {
  const y = 1 - 2 * (i + .5) / ORB_DOTS
  const ring = Math.sqrt(1 - y * y)
  return { x: Math.cos(i * GOLDEN) * ring, y, z: Math.sin(i * GOLDEN) * ring }
})
/** Mean distance between neighbouring lattice points on the unit sphere. */
const LATTICE_GAP = Math.sqrt(4 * Math.PI / ORB_DOTS)

export type OrbDot = { x: number; y: number; along: number; across: number; angle: number; facing: number }

/** The visible dots of one orb, back to front. `facing` is 1 at the centre of the disc and 0 at the limb. */
export function orbDots(field: DotField, index: number, view = orbView(field, index)): OrbDot[] {
  const turn = field.turn + index * 1.7
  const cos = Math.cos(turn)
  const sin = Math.sin(turn)
  const tiltCos = Math.cos(ORB_TILT)
  const tiltSin = Math.sin(ORB_TILT)
  const size = field.coverage * FILL * LATTICE_GAP * view.radius
  const dots: OrbDot[] = []
  for (const point of LATTICE) {
    const x = point.x * cos + point.z * sin
    const z = -point.x * sin + point.z * cos
    const y = point.y * tiltCos - z * tiltSin
    const depth = point.y * tiltSin + z * tiltCos
    // Only the hemisphere turned toward the eye is seen; the eye looks down +z.
    if (depth >= 0) continue
    const dx = x * view.radius
    const dy = -y * view.radius
    dots.push({ x: view.x + dx, y: view.y + dy, along: size, across: size * -depth, angle: Math.atan2(dy, dx), facing: -depth })
  }
  return dots.sort((a, b) => a.facing - b.facing)
}

export function stepDots(field: DotField, inputs: InfinityInputs, seconds: number) {
  apply(field, inputs)
  field.turn += seconds * TURN_RATE
  const settle = 1 - Math.exp(-seconds / SWELL_SECONDS)
  field.swell = field.swell.map((swell, index) => {
    const target = index === field.selected ? 1 : 0
    const next = swell + (target - swell) * settle
    return Math.abs(target - next) < 1e-4 ? target : next
  })
  for (const dot of field.bursts) dot.age = Math.min(1, dot.age + seconds / BURST_SECONDS)
  field.load = clamp(field.load + (inputs.stress ? 1 : -1) * seconds / LOAD_SECONDS, 0, 1)
  field.pulse = (field.pulse + seconds * PULSE_RATE) % 1
}

/** The resting state for the inputs: orbs at their home turn, the swallowed orb full, every burst landed. */
export function settleDots(field: DotField, inputs: InfinityInputs) {
  apply(field, inputs)
  field.turn = 0
  field.swell = ORBS.map((_, index) => index === field.selected ? 1 : 0)
  for (const dot of field.bursts) dot.age = 1
  field.load = inputs.stress ? 1 : 0
  field.pulse = .5
}
