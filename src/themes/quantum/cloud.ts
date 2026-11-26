type Vec = { x: number; y: number }
export type Band = { x: number; y: number; width: number; height: number }

export const SURFACE = { width: 377, height: 836 } as const
export const CORE: Vec = { x: 187, y: 300 }
export const COORDINATES: readonly Vec[] = [{ x: 273, y: 201 }, { x: 105, y: 370 }, { x: 247, y: 550 }, { x: 92, y: 652 }]
export const WORKSPACE: Band = { x: 37, y: 232, width: 303, height: 416 }
export const BANDS = {
  console: { x: 52, y: 316, width: 273, height: 20 },
  telemetry: { x: 52, y: 468, width: 273, height: 112 },
  search: { x: 52, y: 536, width: 273, height: 62 },
  media: { x: 52, y: 338, width: 273, height: 116 },
} as const satisfies Record<string, Band>
/** Vertical distance from a label's centre up to its `+` mark, where the samples gather. */
export const MARK_RISE = 22
export const MAX_PARTICLES = 4200
export const CODE_MODULES = 64

const VACUUM = 0
const NUCLEUS = 1
const FIRST_COORDINATE = 2
const GOLDEN = .6180339887
const TAU = Math.PI * 2

export type Formation =
  | { kind: 'console'; bits: readonly boolean[] }
  | { kind: 'telemetry'; trace: readonly number[]; stress: boolean }
  | { kind: 'search'; matches: readonly boolean[]; scores: readonly number[] }
  | { kind: 'media'; antinodes: number; playing: boolean; progress: number }

type CloudInputs = {
  count: number
  force: number
  observed: number
  calibrating: boolean
  formation: Formation | null
  stress: boolean
}

export type Cloud = {
  ax: Float32Array
  ay: Float32Array
  bx: Float32Array
  by: Float32Array
  markX: Float32Array
  markY: Float32Array
  x: Float32Array
  y: Float32Array
  alpha: Float32Array
  energy: Float32Array
  phase: Float32Array
  spread: Float32Array
  lift: Float32Array
  sequence: Float32Array
  group: Uint8Array
  collapse: Float32Array
  measure: number
  burst: number
  seated: boolean
}

// Mulberry32 keeps every sample position reproducible, so the static gallery frame never changes.
function seeded(seed: number) {
  return () => {
    seed = seed + 0x6d2b79f5 | 0
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

export function createCloud(): Cloud {
  const random = seeded(7019)
  // Box–Muller transform: two uniform deviates give one standard normal deviate.
  const normal = () => Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(TAU * random())
  const size = MAX_PARTICLES
  const cloud: Cloud = {
    ax: new Float32Array(size), ay: new Float32Array(size), bx: new Float32Array(size), by: new Float32Array(size),
    markX: new Float32Array(size), markY: new Float32Array(size), x: new Float32Array(size), y: new Float32Array(size),
    alpha: new Float32Array(size), energy: new Float32Array(size), phase: new Float32Array(size),
    spread: new Float32Array(size), lift: new Float32Array(size), sequence: new Float32Array(size),
    group: new Uint8Array(size), collapse: new Float32Array(COORDINATES.length), measure: 0, burst: 0, seated: false,
  }

  const orbit = (index: number, center: Vec, x: number, y: number, tilt: number, turn: number, swell: number) => {
    const place = (angle: number, scale: number): Vec => ({
      x: center.x + (x * Math.cos(angle) - y * Math.sin(angle)) * scale,
      y: center.y + (x * Math.sin(angle) + y * Math.cos(angle)) * scale,
    })
    const a = place(tilt, 1)
    const b = place(tilt + turn, swell)
    cloud.ax[index] = a.x
    cloud.ay[index] = a.y
    cloud.bx[index] = b.x
    cloud.by[index] = b.y
  }

  for (let index = 0; index < size; index++) {
    const slot = index % 50
    cloud.phase[index] = random()
    cloud.spread[index] = normal()
    cloud.lift[index] = normal()
    cloud.sequence[index] = index * GOLDEN % 1
    if (slot < 9) {
      cloud.group[index] = VACUUM
      cloud.energy[index] = random() * .34
      const x = 8 + random() * 361
      const y = 112 + random() * 680
      cloud.ax[index] = x
      cloud.ay[index] = y
      cloud.bx[index] = x + normal() * 5
      cloud.by[index] = y + normal() * 5
    } else if (slot < 28) {
      cloud.group[index] = NUCLEUS
      const streak = random() < .2
      const shell = random() < .52
      const angle = random() * TAU
      const radius = streak ? normal() * 92 : shell ? Math.abs(normal()) * 17 : 60 + normal() * 9
      const x = streak ? radius : Math.cos(angle) * radius
      const y = streak ? normal() * 4.5 : Math.sin(angle) * radius * .5
      cloud.energy[index] = streak ? .3 + random() * .45 : shell ? .45 + random() * .55 : .2 + random() * .6
      orbit(index, { x: CORE.x, y: CORE.y - MARK_RISE - 6 }, x, y, -.56, streak ? .18 : 1.1, streak ? 1.08 : 1.16)
    } else {
      const coordinate = Math.floor((slot - 28) / 5.5)
      cloud.group[index] = FIRST_COORDINATE + coordinate
      const angle = random() * TAU
      const radius = 7 + Math.abs(normal()) * 25
      cloud.energy[index] = Math.max(.12, 1 - radius / 62) * (.5 + random() * .5)
      const center = COORDINATES[coordinate]
      orbit(index, { x: center.x, y: center.y - MARK_RISE }, Math.cos(angle) * radius, Math.sin(angle) * radius * .5, coordinate % 2 ? .42 : -.36, coordinate % 2 ? -.8 : .8, 1.22)
      // Registration mark: a bracket pair. Most samples land on the stems, the rest on the serifs.
      const side = random() < .5 ? -1 : 1
      const part = random()
      cloud.markX[index] = side * (part < .64 ? 66 : 66 - random() * 9)
      cloud.markY[index] = part < .64 ? (random() - .5) * 46 : part < .82 ? -23 : 23
    }
  }
  return cloud
}

export function kick(cloud: Cloud, amount: number) {
  cloud.burst = Math.max(cloud.burst, amount)
}

/** Bits of the text's bytes, most significant first, cycled to fill the barcode. */
export function encodeBits(text: string, modules = CODE_MODULES) {
  const source = text || '\u0000'
  return Array.from({ length: modules }, (_, index) => {
    const byte = source.charCodeAt(Math.floor(index / 8) % source.length) & 0xff
    return (byte >> (7 - index % 8) & 1) === 1
  })
}

type Prepared = { bars: readonly number[]; mean: number; reach: number }
const unprepared: Prepared = { bars: [], mean: 0, reach: 1 }

/** Per-frame constants of a formation: each clear module's nearest set module, or the trace statistics. */
function prepare(formation: Formation | null): Prepared {
  if (formation?.kind === 'console') {
    const set = formation.bits.flatMap((bit, index) => bit ? [index] : [])
    const bars = formation.bits.map((bit, index) => bit || !set.length ? index
      : set.reduce((best, candidate) => Math.abs(candidate - index) < Math.abs(best - index) ? candidate : best))
    return { bars, mean: 0, reach: 1 }
  }
  if (formation?.kind === 'telemetry') {
    const { trace } = formation
    const mean = trace.reduce((sum, sample) => sum + sample, 0) / trace.length
    return { bars: [], mean, reach: Math.max(1.2, ...trace.map((sample) => Math.abs(sample - mean))) }
  }
  return unprepared
}

const point = { x: 0, y: 0, alpha: 0 }
const WORKSPACE_CORNERS: readonly Vec[] = [
  { x: WORKSPACE.x, y: WORKSPACE.y },
  { x: WORKSPACE.x + WORKSPACE.width, y: WORKSPACE.y },
  { x: WORKSPACE.x, y: WORKSPACE.y + WORKSPACE.height },
  { x: WORKSPACE.x + WORKSPACE.width, y: WORKSPACE.y + WORKSPACE.height },
]

function formationTarget(cloud: Cloud, formation: Formation, prepared: Prepared, index: number, time: number) {
  const u = cloud.sequence[index]
  const role = index % 5
  if (role === 3) {
    const corner = WORKSPACE_CORNERS[index % 4]
    point.x = corner.x + cloud.spread[index] * 6
    point.y = corner.y + cloud.lift[index] * 2.2
    point.alpha = .5
    return
  }
  if (role === 4) {
    point.x = cloud.ax[index]
    point.y = cloud.ay[index]
    point.alpha = .12
    return
  }
  switch (formation.kind) {
    case 'console': {
      const band = BANDS.console
      const bar = prepared.bars[Math.floor(u * CODE_MODULES)]
      point.x = band.x + (bar + cloud.phase[index]) * band.width / CODE_MODULES
      point.y = band.y + (cloud.phase[index] * 13.7 % 1) * band.height
      point.alpha = .95
      return
    }
    case 'telemetry': {
      const band = BANDS.telemetry
      const { trace } = formation
      const position = u * (trace.length - 1)
      const left = Math.floor(position)
      const value = trace[left] + (trace[Math.min(trace.length - 1, left + 1)] - trace[left]) * (position - left)
      point.x = band.x + u * band.width
      point.y = band.y + band.height / 2 - (value - prepared.mean) / prepared.reach * band.height * .36 + cloud.spread[index] * (formation.stress ? 9 : 1.5)
      point.alpha = .55 + .45 * u
      return
    }
    case 'media': {
      const band = BANDS.media
      const swing = formation.playing ? Math.cos(time * .0052 + cloud.phase[index] * .4) : .16
      const wave = Math.sin(u * Math.PI * formation.antinodes) * Math.sin(u * Math.PI) ** .5
      point.x = band.x + u * band.width
      point.y = band.y + band.height / 2 + wave * swing * band.height * .44 + cloud.spread[index] * 1.3
      point.alpha = u <= formation.progress ? 1 : .42
      return
    }
    default: {
      const band = BANDS.search
      const node = index % formation.matches.length
      const matched = formation.matches[node]
      point.x = band.x + (node + .5) / formation.matches.length * band.width + cloud.spread[index] * (matched ? 2.6 : 11)
      point.y = band.y + band.height - (formation.scores[node] - 80) / 20 * band.height + cloud.lift[index] * (matched ? 2.6 : 7)
      point.alpha = matched ? .95 : .2
    }
  }
}

function resolve(cloud: Cloud, inputs: CloudInputs, prepared: Prepared, index: number, time: number) {
  const group = cloud.group[index]
  const energy = cloud.energy[index]
  const pace = inputs.stress ? .0021 : .00042
  const mix = .5 + .5 * Math.sin(time * pace * (.6 + energy) + cloud.phase[index] * TAU)
  let x = cloud.ax[index] + (cloud.bx[index] - cloud.ax[index]) * mix
  let y = cloud.ay[index] + (cloud.by[index] - cloud.ay[index]) * mix
  let alpha = group === VACUUM ? .1 + energy * .5 : .16 + energy * .78

  if (group >= FIRST_COORDINATE) {
    const coordinate = group - FIRST_COORDINATE
    const progress = cloud.collapse[coordinate]
    if (progress > .001) {
      const blur = (1 - inputs.force) * 7
      const center = COORDINATES[coordinate]
      x += (center.x + cloud.markX[index] + cloud.spread[index] * blur - x) * progress
      y += (center.y + cloud.markY[index] + cloud.lift[index] * blur * .5 - y) * progress
      alpha += (.95 - alpha) * progress
    }
  } else if (group === NUCLEUS && index % 4 === 0 && inputs.observed >= 0) {
    // A quarter of the nucleus threads toward the observed coordinate.
    const progress = cloud.collapse[inputs.observed] * .85
    const center = COORDINATES[inputs.observed]
    const along = cloud.sequence[index]
    x += (CORE.x + (center.x - CORE.x) * along + cloud.spread[index] * 2.2 - x) * progress
    y += (CORE.y + (center.y - CORE.y) * along - MARK_RISE + cloud.lift[index] * 2.2 - y) * progress
  }

  if (inputs.formation && cloud.measure > .001) {
    formationTarget(cloud, inputs.formation, prepared, index, time)
    // Samples arrive in order of their own phase, so the formation condenses instead of snapping.
    const arrival = Math.min(1, Math.max(0, cloud.measure * 1.7 - cloud.phase[index] * .7))
    x += (point.x - x) * arrival
    y += (point.y - y) * arrival
    alpha += (point.alpha - alpha) * arrival
  }
  point.x = x
  point.y = y
  point.alpha = alpha
}

function advance(cloud: Cloud, inputs: CloudInputs, time: number, seconds: number, immediate: boolean) {
  const ease = (rate: number) => immediate ? 1 : 1 - Math.exp(-rate * seconds)
  const collapseRate = 2.5 + inputs.force * 13
  for (let coordinate = 0; coordinate < COORDINATES.length; coordinate++) {
    const target = !inputs.formation && (inputs.calibrating || inputs.observed === coordinate) ? 1 : 0
    cloud.collapse[coordinate] += (target - cloud.collapse[coordinate]) * ease(collapseRate)
  }
  cloud.measure += ((inputs.formation ? 1 : 0) - cloud.measure) * ease(collapseRate * .55)
  cloud.burst = immediate ? 0 : cloud.burst * Math.exp(-seconds / .28)

  const prepared = prepare(inputs.formation)
  const snap = immediate || !cloud.seated
  for (let index = 0; index < inputs.count; index++) {
    resolve(cloud, inputs, prepared, index, time)
    const follow = snap ? 1 : ease(4 + inputs.force * 9 + cloud.energy[index] * 7)
    cloud.x[index] += (point.x - cloud.x[index]) * follow
    cloud.y[index] += (point.y - cloud.y[index]) * follow
    cloud.alpha[index] = point.alpha
  }
  cloud.seated = true
}

export function stepCloud(cloud: Cloud, inputs: CloudInputs, time: number, delta: number) {
  advance(cloud, inputs, time, delta / 1000, false)
}

/** Settled frame: every collapse and measurement is complete, no burst in flight. */
export function settleCloud(cloud: Cloud, inputs: CloudInputs, time: number) {
  advance(cloud, inputs, time, 0, true)
}
