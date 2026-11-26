export type Vec = { x: number; y: number }

export const SURFACE = { width: 377, height: 836 } as const
export const CORE: Vec = { x: 189, y: 322 }
const WORKSPACE: Vec = { x: 188, y: 404 }
export const RIM = 168
export const HORIZON = 30
export const BODY_HOMES: readonly Vec[] = [{ x: 86, y: 236 }, { x: 279, y: 270 }, { x: 109, y: 453 }, { x: 277, y: 476 }]

const BODY_MASS = [.2, .25, .22, .18]
const BODY_SOFTENING = 8
const PROBE_MASS = .07
const PROBE_SOFTENING = 8
const CELL = 4
const COLS = Math.ceil(SURFACE.width / CELL) + 1
const ROWS = Math.ceil(SURFACE.height / CELL) + 1
const FIELD_EXTENT = 540
const MAX_LEVELS_PER_CELL = 5
const SEGMENT_CAPACITY = 26000
const BEAD_COUNT = 120
const WAVE_LIFE = .95
const RIPPLE_LIFE = 1.5
const RIPPLE_SPEED = 430
const RIPPLE_WIDTH = 58
const RIPPLE_WAVELENGTH = 44

type Body = { home: Vec; x: number; y: number; vx: number; vy: number; charge: number; mass: number }
type Bead = { x: number; y: number; tailX: number; tailY: number; ring: number; fraction: number; seated: boolean }
type Ripple = { age: number; gain: number }
type Interference = { age: number; a: Vec; b: Vec }
type Segments = { data: Float32Array; count: number }

export type FieldState = {
  bodies: Body[]
  core: Vec
  pointer: Vec
  presence: number
  pointerInside: boolean
  hover: number
  drag: number
  dragTarget: Vec
  selected: number
  open: number
  openVelocity: number
  flow: number
  spin: number
  levels: number
  spacing: number
  interference: Interference | null
  ripples: Ripple[]
  beads: Bead[]
  potential: Float32Array
  major: Segments
  minor: Segments
}

export type FieldInputs = {
  warp: number
  levels: number
  drift: number
  stress: boolean
  selected: number
}

// Mulberry32: a deterministic generator keeps the static gallery frame identical between renders.
function seeded(seed: number) {
  return () => {
    seed = seed + 0x6d2b79f5 | 0
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

export function createField(): FieldState {
  const random = seeded(3000)
  return {
    bodies: BODY_HOMES.map((home) => ({ home, x: home.x, y: home.y, vx: 0, vy: 0, charge: 0, mass: 0 })),
    core: { ...CORE },
    pointer: { ...CORE },
    presence: 0,
    pointerInside: false,
    hover: -1,
    drag: -1,
    dragTarget: { ...CORE },
    selected: -1,
    open: 0,
    openVelocity: 0,
    flow: 0,
    spin: 0,
    levels: 0,
    spacing: 14,
    interference: null,
    ripples: [],
    beads: Array.from({ length: BEAD_COUNT }, () => {
      const angle = random() * Math.PI * 2
      return { x: Math.cos(angle), y: Math.sin(angle), tailX: 0, tailY: 0, ring: 0, fraction: random(), seated: false }
    }),
    potential: new Float32Array(COLS * ROWS),
    major: { data: new Float32Array(SEGMENT_CAPACITY * 4), count: 0 },
    minor: { data: new Float32Array(SEGMENT_CAPACITY * 4), count: 0 },
  }
}

export function emitRipple(state: FieldState, gain: number) {
  state.ripples.push({ age: 0, gain })
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))
const smooth = (value: number) => value * value * (3 - 2 * value)

/** Radius of the cleared workspace disc, including the spring overshoot of the condensation. */
export function rimRadius(state: FieldState) {
  return RIM * Math.max(0, state.open)
}

function loadMasses(state: FieldState, inputs: FieldInputs, time: number) {
  const settle = (1 - clamp01(state.open)) ** 2
  const throb = inputs.stress ? 1.32 * (1 + .16 * Math.sin(time * .0132)) : 1
  state.bodies.forEach((body, index) => {
    body.mass = BODY_MASS[index] * inputs.warp * throb * (1 + .9 * body.charge) * settle
  })
  return PROBE_MASS * inputs.warp * state.presence * settle
}

/**
 * Equivalent radius U = 1 / Φ: the distance at which the bare singularity alone would produce
 * the same potential. With every other mass at zero U is the plain distance to the core, so
 * integer steps of U are concentric circles; added mass can only pull those circles inward.
 */
function equivalentRadius(state: FieldState, probeMass: number, x: number, y: number) {
  let phi = 1 / Math.max(1, Math.hypot(x - state.core.x, y - state.core.y))
  for (const body of state.bodies) {
    if (body.mass) phi += body.mass / Math.sqrt((x - body.x) ** 2 + (y - body.y) ** 2 + BODY_SOFTENING ** 2)
  }
  if (probeMass) phi += probeMass / Math.sqrt((x - state.pointer.x) ** 2 + (y - state.pointer.y) ** 2 + PROBE_SOFTENING ** 2)
  return 1 / phi
}

const gradient = { u: 0, x: 0, y: 0 }
function equivalentGradient(state: FieldState, probeMass: number, x: number, y: number) {
  const dx = x - state.core.x
  const dy = y - state.core.y
  const distance = Math.max(1, Math.hypot(dx, dy))
  let phi = 1 / distance
  let gx = -dx / distance ** 3
  let gy = -dy / distance ** 3
  const add = (mass: number, sx: number, sy: number, softening: number) => {
    const square = (x - sx) ** 2 + (y - sy) ** 2 + softening ** 2
    const root = Math.sqrt(square)
    phi += mass / root
    gx -= mass * (x - sx) / (square * root)
    gy -= mass * (y - sy) / (square * root)
  }
  for (const body of state.bodies) if (body.mass) add(body.mass, body.x, body.y, BODY_SOFTENING)
  if (probeMass) add(probeMass, state.pointer.x, state.pointer.y, PROBE_SOFTENING)
  gradient.u = 1 / phi
  gradient.x = -gx / (phi * phi)
  gradient.y = -gy / (phi * phi)
  return gradient
}

function samplePotential(state: FieldState, probeMass: number) {
  const { potential, core, ripples } = state
  for (let row = 0, index = 0; row < ROWS; row++) {
    const y = row * CELL
    for (let column = 0; column < COLS; column++, index++) {
      const x = column * CELL
      let u = equivalentRadius(state, probeMass, x, y)
      if (ripples.length) {
        const distance = Math.hypot(x - core.x, y - core.y)
        for (const ripple of ripples) {
          const offset = distance - ripple.age * RIPPLE_SPEED
          u += ripple.gain * (1 - ripple.age / RIPPLE_LIFE) * Math.sin(offset * (Math.PI * 2 / RIPPLE_WAVELENGTH)) * Math.exp(-((offset / RIPPLE_WIDTH) ** 2))
        }
      }
      potential[index] = u
    }
  }
}

function push(segments: Segments, x1: number, y1: number, x2: number, y2: number) {
  if (segments.count === SEGMENT_CAPACITY) return
  const offset = segments.count++ * 4
  segments.data[offset] = x1
  segments.data[offset + 1] = y1
  segments.data[offset + 2] = x2
  segments.data[offset + 3] = y2
}

/** Marching squares over U for the levels HORIZON + (j + flow) · spacing that lie outside `inner`. */
function contour(state: FieldState, inner: number) {
  const { potential, spacing, flow, major, minor } = state
  major.count = 0
  minor.count = 0
  for (let row = 0; row < ROWS - 1; row++) {
    const top = row * CELL
    for (let column = 0; column < COLS - 1; column++) {
      const index = row * COLS + column
      const a = potential[index]
      const b = potential[index + 1]
      const c = potential[index + COLS + 1]
      const d = potential[index + COLS]
      const low = Math.max(inner, Math.min(a, b, c, d))
      const high = Math.max(a, b, c, d)
      const first = Math.ceil((low - HORIZON) / spacing - flow)
      const last = Math.floor((high - HORIZON) / spacing - flow)
      if (last < first || last - first >= MAX_LEVELS_PER_CELL) continue
      const left = column * CELL
      for (let ring = first; ring <= last; ring++) {
        const level = HORIZON + (ring + flow) * spacing
        const mask = (a > level ? 8 : 0) | (b > level ? 4 : 0) | (c > level ? 2 : 0) | (d > level ? 1 : 0)
        if (mask === 0 || mask === 15) continue
        const topX = left + CELL * (level - a) / (b - a)
        const bottomX = left + CELL * (level - d) / (c - d)
        const leftY = top + CELL * (level - a) / (d - a)
        const rightY = top + CELL * (level - b) / (c - b)
        const right = left + CELL
        const bottom = top + CELL
        const target = ((ring % 5) + 5) % 5 === 0 ? major : minor
        switch (mask) {
          case 1: case 14: push(target, left, leftY, bottomX, bottom); break
          case 2: case 13: push(target, bottomX, bottom, right, rightY); break
          case 3: case 12: push(target, left, leftY, right, rightY); break
          case 4: case 11: push(target, topX, top, right, rightY); break
          case 6: case 9: push(target, topX, top, bottomX, bottom); break
          case 7: case 8: push(target, left, leftY, topX, top); break
          default: {
            // Saddle: the cell centre decides which pair of corners the level separates.
            const joined = (a + b + c + d) / 4 > level === (mask === 5)
            if (joined) {
              push(target, left, leftY, topX, top)
              push(target, bottomX, bottom, right, rightY)
            } else {
              push(target, left, leftY, bottomX, bottom)
              push(target, topX, top, right, rightY)
            }
          }
        }
      }
    }
  }
}

function assignRings(state: FieldState) {
  const rings = Math.ceil(FIELD_EXTENT / state.spacing)
  for (const bead of state.beads) {
    bead.ring = Math.floor(bead.fraction * rings) - Math.floor(state.flow)
    if (bead.seated) continue
    bead.seated = true
    const level = HORIZON + (bead.ring + state.flow) * state.spacing
    bead.x = state.core.x + bead.x * level
    bead.y = state.core.y + bead.y * level
    bead.tailX = bead.x
    bead.tailY = bead.y
  }
}

function stepBeads(state: FieldState, probeMass: number, inner: number, orbit: number, seconds: number) {
  const rings = Math.ceil(FIELD_EXTENT / state.spacing)
  for (const bead of state.beads) {
    let level = HORIZON + (bead.ring + state.flow) * state.spacing
    if (level < Math.max(HORIZON, inner) + 2) {
      bead.ring += rings
      level += rings * state.spacing
      const angle = Math.atan2(bead.y - state.core.y, bead.x - state.core.x)
      bead.x = state.core.x + Math.cos(angle) * level
      bead.y = state.core.y + Math.sin(angle) * level
      bead.tailX = bead.x
      bead.tailY = bead.y
    }
    let field = equivalentGradient(state, probeMass, bead.x, bead.y)
    let slope = Math.hypot(field.x, field.y) || 1
    const speed = orbit * Math.sqrt(140 / Math.max(40, field.u)) * seconds
    bead.tailX = bead.x
    bead.tailY = bead.y
    bead.x -= field.y / slope * speed
    bead.y += field.x / slope * speed
    // One Newton step back onto the bead's own equipotential; the clamp lets it glide when the field is edited.
    field = equivalentGradient(state, probeMass, bead.x, bead.y)
    slope = Math.hypot(field.x, field.y) || 1
    const correction = Math.max(-12, Math.min(12, (field.u - level) / slope))
    bead.x -= field.x / slope * correction
    bead.y -= field.y / slope * correction
  }
}

function stepBodies(state: FieldState, inputs: FieldInputs, seconds: number) {
  const { bodies } = state
  const excite = 1 - Math.exp(-seconds / .11)
  bodies.forEach((body, index) => {
    const excited = state.selected < 0 && (index === state.drag || index === state.hover)
    body.charge += ((excited ? 1 : 0) - body.charge) * excite
  })
  bodies.forEach((body, index) => {
    const dragged = index === state.drag
    const target = dragged ? state.dragTarget : index === state.selected ? state.core : body.home
    const stiffness = dragged ? 320 : 118
    const damping = dragged ? 27 : 13.5
    let ax = stiffness * (target.x - body.x) - damping * body.vx
    let ay = stiffness * (target.y - body.y) - damping * body.vy
    if (!dragged && state.selected < 0) {
      bodies.forEach((other, otherIndex) => {
        if (otherIndex === index || !other.charge) return
        const dx = body.x - other.x
        const dy = body.y - other.y
        const distance = Math.hypot(dx, dy) || 1
        const range = 130 + 150 * other.charge
        if (distance >= range) return
        const force = 9600 * inputs.warp * other.charge * (1 - distance / range) ** 2
        ax += dx / distance * force
        ay += dy / distance * force
      })
    }
    body.vx += ax * seconds
    body.vy += ay * seconds
    body.x += body.vx * seconds
    body.y += body.vy * seconds
  })
}

function placeCore(state: FieldState) {
  const travel = smooth(clamp01(state.open))
  state.core.x = CORE.x + (WORKSPACE.x - CORE.x) * travel
  state.core.y = CORE.y + (WORKSPACE.y - CORE.y) * travel
}

function select(state: FieldState, inputs: FieldInputs, animate: boolean) {
  if (inputs.selected === state.selected) return
  const opening = inputs.selected >= 0
  if (opening && state.selected < 0 && animate) {
    const source = state.bodies[inputs.selected]
    state.interference = { age: 0, a: { x: source.x, y: source.y }, b: { ...state.core } }
  }
  if (!opening && animate) {
    for (const body of state.bodies) {
      body.x = state.core.x
      body.y = state.core.y
      body.vx = 0
      body.vy = 0
    }
    assignRings(state)
  }
  state.selected = inputs.selected
}

function relayout(state: FieldState, inputs: FieldInputs) {
  if (inputs.levels === state.levels) return
  state.levels = inputs.levels
  state.spacing = (FIELD_EXTENT - HORIZON) / inputs.levels
  assignRings(state)
}

export function stepField(state: FieldState, inputs: FieldInputs, time: number, delta: number) {
  const seconds = delta / 1000
  relayout(state, inputs)
  select(state, inputs, true)

  const target = state.selected >= 0 ? 1 : 0
  state.openVelocity += (66 * (target - state.open) - 11.5 * state.openVelocity) * seconds
  state.open += state.openVelocity * seconds
  placeCore(state)

  const present = state.pointerInside && state.selected < 0 && state.hover < 0 && state.drag < 0 ? 1 : 0
  state.presence += (present - state.presence) * (1 - Math.exp(-seconds / .14))
  stepBodies(state, inputs, seconds)

  const pace = inputs.drift * (inputs.stress ? 2.3 : 1)
  state.flow -= pace * 1.25 * seconds
  state.spin += pace * 2.6 * seconds
  if (state.interference && (state.interference.age += seconds) > WAVE_LIFE) state.interference = null
  for (const ripple of state.ripples) ripple.age += seconds
  state.ripples = state.ripples.filter((ripple) => ripple.age < RIPPLE_LIFE)

  const probeMass = loadMasses(state, inputs, time)
  const inner = rimRadius(state)
  stepBeads(state, probeMass, inner, pace * 90, seconds)
  samplePotential(state, probeMass)
  contour(state, inner)
}

/** Settled state for a still frame: no springs in flight, no transient waves. */
export function settleField(state: FieldState, inputs: FieldInputs, time: number) {
  relayout(state, inputs)
  select(state, inputs, false)
  state.open = state.selected >= 0 ? 1 : 0
  state.openVelocity = 0
  state.presence = 0
  state.interference = null
  state.ripples = []
  placeCore(state)
  state.bodies.forEach((body, index) => {
    const target = index === state.selected ? state.core : body.home
    body.x = target.x
    body.y = target.y
    body.vx = 0
    body.vy = 0
    body.charge = state.selected < 0 && index === state.hover ? 1 : 0
  })
  const probeMass = loadMasses(state, inputs, time)
  const inner = rimRadius(state)
  for (let pass = 0; pass < 8; pass++) stepBeads(state, probeMass, inner, 0, 0)
  samplePotential(state, probeMass)
  contour(state, inner)
}

type Reading = { potential: number; radius: number; bearing: number }

const bearing = (dx: number, dy: number) => (Math.atan2(-dy, dx) * 180 / Math.PI + 360) % 360

export function probeReading(state: FieldState): Reading {
  const { pointer, core } = state
  const probeMass = PROBE_MASS * state.presence
  return {
    potential: 100 / equivalentRadius(state, probeMass, pointer.x, pointer.y),
    radius: Math.hypot(pointer.x - core.x, pointer.y - core.y),
    bearing: bearing(pointer.x - core.x, pointer.y - core.y),
  }
}

/** Field strength at a body from every other mass, and the body's bearing around the singularity. */
export function bodyReading(state: FieldState, index: number): Reading {
  const body = state.bodies[index]
  const dx = body.x - state.core.x
  const dy = body.y - state.core.y
  const distance = Math.max(1, Math.hypot(dx, dy))
  let gx = -dx / distance ** 3
  let gy = -dy / distance ** 3
  state.bodies.forEach((other, otherIndex) => {
    if (otherIndex === index || !other.mass) return
    const square = (body.x - other.x) ** 2 + (body.y - other.y) ** 2 + BODY_SOFTENING ** 2
    gx -= other.mass * (body.x - other.x) / square ** 1.5
    gy -= other.mass * (body.y - other.y) / square ** 1.5
  })
  return { potential: 2600 * Math.hypot(gx, gy), radius: distance, bearing: bearing(dx, dy) }
}

export function totalMass(state: FieldState) {
  return state.bodies.reduce((sum, body) => sum + body.mass, 0)
}

export const WAVE_FRONTS = 5
const WAVE_SPEED = 470
const WAVE_STAGGER = .075

export function waveRadius(age: number, front: number) {
  return Math.max(0, (age - front * WAVE_STAGGER) * WAVE_SPEED)
}

export function waveStrength(age: number) {
  return Math.max(0, 1 - age / WAVE_LIFE)
}

/** Intersections of two circles: the points where two wave fronts reinforce. */
export function crossings(a: Vec, radiusA: number, b: Vec, radiusB: number): [Vec, Vec] | null {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const separation = Math.hypot(dx, dy)
  if (!separation || separation > radiusA + radiusB || separation < Math.abs(radiusA - radiusB)) return null
  const along = (radiusA ** 2 - radiusB ** 2 + separation ** 2) / (2 * separation)
  const height = Math.sqrt(Math.max(0, radiusA ** 2 - along ** 2))
  const baseX = a.x + dx * along / separation
  const baseY = a.y + dy * along / separation
  return [
    { x: baseX - dy * height / separation, y: baseY + dx * height / separation },
    { x: baseX + dy * height / separation, y: baseY - dx * height / separation },
  ]
}

export function polar(center: Vec, degrees: number, radius: number): Vec {
  const angle = degrees * Math.PI / 180
  return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius }
}
