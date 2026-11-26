export type Vec = { x: number; y: number }

export const SURFACE = { width: 377, height: 836 } as const
/** The section: the ground surface at the top, bedrock at the bottom. Above it is the water column. */
export const SECTION = { top: 214, bottom: 812 } as const
const HEIGHT = SECTION.bottom - SECTION.top
/** Height of an excavated gallery and the least rock left above and below it. */
export const GALLERY = 344
const GALLERY_MARGIN = 24
export const CORE_X = 346
export const FAULT_X = 262
export const MODULE_BEDS = 4
export const MIN_BEDS = 6
export const MAX_BEDS = 30
/** The section spans a fixed interval; Deposition Rate decides how many beds record it. */
export const SPAN_KA = 120
export const METRES_PER_PX = .25
export const LITHOLOGIES = 5
const FOLD_PX = 30
const FOLD_CENTRE = 150
const FOLD_WIDTH = 132
const THROW_PX = 16
const WAVE_SPEED = 520
const WAVE_LIFE = 1.4
const WAVE_WIDTH = 46
const WAVE_AMPLITUDE = 7
const WAVE_LENGTH = 92
const VENEER_PX = 11
const VENEER_LIFE = 3.2
const SETTLE_SECONDS = .24
const DRILL_SECONDS = .12
const GRAINS = 72
const TREMOR_SECONDS = 1.3

type Wave = { age: number; gain: number }

export type Strata = {
  beds: number
  compaction: number
  selected: number
  /** Undeformed depth of every bed boundary, surface first. beds + 1 entries, strictly increasing. */
  base: number[]
  drill: number
  fold: number
  fault: number
  veneer: { age: number; gain: number } | null
  waves: Wave[]
  tremor: number
  lithology: Uint8Array
  tone: Float32Array
  grainX: Float32Array
  grainY: Float32Array
  grainRate: Float32Array
}

export type StrataInputs = {
  /** Deposition Rate: number of beds between the surface and bedrock. */
  beds: number
  /** Compaction, 0 to 1. */
  compaction: number
  /** Tectonic Fold, 0 to 1. */
  fold: number
  stress: boolean
  /** Module whose bed is excavated, or -1. */
  selected: number
}

// Mulberry32: every bed's lithology and every settling grain is reproducible, so the gallery plate never changes.
function seeded(seed: number) {
  return () => {
    seed = seed + 0x6d2b79f5 | 0
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

const GRAIN_SEED = 6006
function seatGrains(strata: Strata) {
  const random = seeded(GRAIN_SEED)
  for (let index = 0; index < GRAINS; index++) {
    strata.grainX[index] = 6 + random() * (SURFACE.width - 12)
    strata.grainY[index] = 48 + random() * (SECTION.top - 52)
    strata.grainRate[index] = .55 + random() * .9
  }
}

export function createStrata(): Strata {
  const random = seeded(1859)
  const strata: Strata = {
    beds: 0, compaction: 0, selected: -1, base: [], drill: SECTION.top, fold: 0, fault: 0, veneer: null, waves: [], tremor: TREMOR_SECONDS,
    lithology: Uint8Array.from({ length: MAX_BEDS }, () => Math.floor(random() * LITHOLOGIES)),
    tone: Float32Array.from({ length: MAX_BEDS }, () => random() * 2 - 1),
    grainX: new Float32Array(GRAINS), grainY: new Float32Array(GRAINS), grainRate: new Float32Array(GRAINS),
  }
  seatGrains(strata)
  return strata
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))

/**
 * Bed boundaries at rest. Every bed is deposited with the same thickness; compaction then thins each
 * one in proportion to the overburden above its midpoint, and the column is rescaled to the section.
 */
export function restBoundaries(beds: number, compaction: number) {
  const weights = Array.from({ length: beds }, (_, bed) => 1 - .62 * compaction * (bed + .5) / beds)
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  const boundaries: number[] = [SECTION.top]
  for (const weight of weights) boundaries.push(boundaries[boundaries.length - 1] + HEIGHT * weight / total)
  boundaries[beds] = SECTION.bottom
  return boundaries
}

/** The bed that records a module: four formations at the quarter depths of the section. */
export function moduleBed(beds: number, module: number) {
  return clamp(Math.round((module + .5) / MODULE_BEDS * beds - .5), 0, beds - 1)
}

/** Where the gallery for a bed opens: centred on the bed, kept inside the section. */
export function galleryFor(rest: readonly number[], bed: number) {
  const centre = (rest[bed] + rest[bed + 1]) / 2
  const top = clamp(centre - GALLERY / 2, SECTION.top + GALLERY_MARGIN, SECTION.bottom - GALLERY_MARGIN - GALLERY)
  return { top, bottom: top + GALLERY }
}

/**
 * Boundaries with a bed excavated: the overburden is lifted into the rock above the gallery and the
 * beds below are pressed toward bedrock. Both maps are linear in depth, so the order of beds holds.
 */
export function excavated(rest: readonly number[], bed: number) {
  const gallery = galleryFor(rest, bed)
  const last = rest.length - 1
  return rest.map((depth, index) => {
    // The ground surface and bedrock never move; a gallery in the first or last bed reaches them.
    if (index === 0 || index === last) return depth
    if (index <= bed) return SECTION.top + (depth - SECTION.top) * (gallery.top - SECTION.top) / (rest[bed] - SECTION.top)
    return gallery.bottom + (depth - rest[bed + 1]) * (SECTION.bottom - gallery.bottom) / (SECTION.bottom - rest[bed + 1])
  })
}

function targets(strata: Strata, compaction: number) {
  const rest = restBoundaries(strata.beds, compaction)
  return strata.selected >= 0 ? excavated(rest, moduleBed(strata.beds, strata.selected)) : rest
}

/** The core is drilled through the floor of the excavated bed, or withdrawn to the surface. */
function drillTarget(strata: Strata, compaction: number) {
  if (strata.selected < 0) return SECTION.top
  return targets(strata, compaction)[moduleBed(strata.beds, strata.selected) + 1]
}

/** Anticline over the left of the section, a shallow syncline beneath the core. Bounded by 1. */
function foldShape(x: number) {
  return Math.exp(-(((x - FOLD_CENTRE) / FOLD_WIDTH) ** 2)) - .38 * Math.exp(-(((x - 330) / 64) ** 2))
}

/**
 * Deformed depth of a horizon at `x`. Each term is a map of depth onto depth whose slope stays well
 * below 1, so it can never carry one horizon past another: deeper beds always stay deeper.
 */
export function deform(strata: Strata, depth: number, x: number) {
  const age = (depth - SECTION.top) / HEIGHT
  let y = depth - strata.fold * FOLD_PX * foldShape(x) * (.3 + .7 * age)
  for (const wave of strata.waves) {
    const front = SECTION.top + wave.age * WAVE_SPEED
    const envelope = Math.exp(-(((depth - front) / WAVE_WIDTH) ** 2))
    y += WAVE_AMPLITUDE * wave.gain * (1 - wave.age / WAVE_LIFE) * envelope * Math.sin(x * Math.PI * 2 / WAVE_LENGTH - wave.age * 9)
  }
  if (x > FAULT_X) y += THROW_PX * strata.fault
  return y
}

export function boundaryAt(strata: Strata, index: number, x: number) {
  return deform(strata, strata.base[index], x)
}

/** Thickness of fresh sediment above the surface, in px: it lands quickly and consolidates slowly. */
export function veneerThickness(strata: Strata) {
  const veneer = strata.veneer
  if (!veneer) return 0
  return VENEER_PX * veneer.gain * Math.min(1, veneer.age / .22) * Math.exp(-Math.max(0, veneer.age - .22) / 1.05)
}

/** A command, scan, spike or inspection lands fresh sediment and sends a shear wave down the column. */
export function deposit(strata: Strata, gain: number) {
  strata.veneer = { age: 0, gain }
  strata.waves.push({ age: 0, gain })
}

/**
 * How far a bed is excavated, read from the geometry itself: 0 at its rest thickness, 1 once it spans a
 * full gallery. A bed being backfilled, or one closing while another opens, reports its true state.
 */
export function excavation(strata: Strata, bed: number) {
  const rest = restBoundaries(strata.beds, strata.compaction)
  const full = excavated(rest, bed)
  const resting = rest[bed + 1] - rest[bed]
  const span = full[bed + 1] - full[bed] - resting
  const top = strata.base[bed]
  const bottom = strata.base[bed + 1]
  return { bed, top, bottom, open: span > 0 ? clamp((bottom - top - resting) / span, 0, 1) : 0 }
}

/** The gallery of the selected formation, or null when no formation is selected. */
export function gallery(strata: Strata) {
  return strata.selected < 0 ? null : excavation(strata, moduleBed(strata.beds, strata.selected))
}

function relayout(strata: Strata, inputs: StrataInputs) {
  const opened = strata.base.length && strata.selected >= 0 ? excavation(strata, moduleBed(strata.beds, strata.selected)).open : 0
  strata.selected = inputs.selected
  strata.fold = inputs.fold
  strata.compaction = inputs.compaction
  if (inputs.beds === strata.beds) return
  strata.beds = inputs.beds
  // A new bed count is a new section: it is laid down at once, keeping the excavation as far open as it was.
  const closed = restBoundaries(strata.beds, inputs.compaction)
  const target = targets(strata, inputs.compaction)
  strata.base = closed.map((depth, index) => depth + (target[index] - depth) * opened)
}

export function stepStrata(strata: Strata, inputs: StrataInputs, seconds: number) {
  relayout(strata, inputs)
  // One time constant for every boundary: each step is a convex blend of two ordered columns, so it is ordered.
  const settle = 1 - Math.exp(-seconds / SETTLE_SECONDS)
  const target = targets(strata, inputs.compaction)
  strata.base = strata.base.map((depth, index) => depth + (target[index] - depth) * settle)
  strata.drill += (drillTarget(strata, inputs.compaction) - strata.drill) * (1 - Math.exp(-seconds / DRILL_SECONDS))
  strata.fault += ((inputs.stress ? 1 : 0) - strata.fault) * (1 - Math.exp(-seconds / .35))

  if (strata.veneer && (strata.veneer.age += seconds) > VENEER_LIFE) strata.veneer = null
  for (const wave of strata.waves) wave.age += seconds
  strata.waves = strata.waves.filter((wave) => wave.age < WAVE_LIFE)
  if (inputs.stress && (strata.tremor -= seconds) <= 0) {
    strata.waves.push({ age: 0, gain: .55 })
    strata.tremor = TREMOR_SECONDS
  }

  // Grains settle through the water column faster as the deposition rate rises, and land on the surface.
  const fall = 14 + (inputs.beds - MIN_BEDS) * 2.4
  for (let index = 0; index < GRAINS; index++) {
    strata.grainY[index] += fall * strata.grainRate[index] * seconds
    if (strata.grainY[index] > SECTION.top - 2) strata.grainY[index] -= SECTION.top - 50
  }
}

/** Settled state for a still frame: the gallery fully open or closed, no wave or fresh sediment in flight. */
export function settleStrata(strata: Strata, inputs: StrataInputs) {
  relayout(strata, inputs)
  strata.base = targets(strata, inputs.compaction)
  strata.drill = drillTarget(strata, inputs.compaction)
  strata.fault = inputs.stress ? 1 : 0
  strata.veneer = null
  strata.waves = []
  strata.tremor = TREMOR_SECONDS
  seatGrains(strata)
}

/**
 * The undeformed depth drawn at screen height `y` in column `x`: the inverse of deform. Every term of
 * deform increases with depth, so bisection converges on the one depth that lands there.
 */
export function undeform(strata: Strata, y: number, x: number) {
  let low = SECTION.top - HEIGHT
  let high = SECTION.bottom + HEIGHT
  for (let pass = 0; pass < 48; pass++) {
    const middle = (low + high) / 2
    if (deform(strata, middle, x) < y) low = middle
    else high = middle
  }
  return (low + high) / 2
}

/** Depth below the surface in metres, and the age of the sediment there in thousands of years. */
export function reading(strata: Strata, depth: number) {
  const below = Math.max(0, depth - SECTION.top)
  // A depth on a horizon belongs to the bed above it: the core bit resting on a gallery floor is in that gallery.
  const next = strata.base.findIndex((boundary) => boundary >= depth)
  const bed = next < 0 ? strata.beds - 1 : Math.max(0, next - 1)
  const top = strata.base[bed] ?? SECTION.top
  const bottom = strata.base[bed + 1] ?? SECTION.bottom
  const within = bottom > top ? clamp((depth - top) / (bottom - top), 0, 1) : 0
  return { metres: below * METRES_PER_PX, ka: (bed + within) * SPAN_KA / Math.max(1, strata.beds), bed }
}
