export type Vec3 = { x: number; y: number; z: number }
type Point = { x: number; y: number; scale: number }

export const SURFACE = { width: 377, height: 836 } as const
/** Vanishing point of the corridor: the CSS perspective-origin and the centre of every canvas projection. */
export const EYE = { x: 188.5, y: 385 } as const
export const CORRIDOR_DEPTH = 2400
export const ROOM_DEPTH = 520
export const SLAB = { width: 208, height: 122 } as const
export const APERTURE = { left: 14, top: 22, width: 180, height: 62 } as const
const NEAR_MARGIN = 36
const DIVE_SECONDS = .8
const SURFACE_SECONDS = .62
const ADAPT_SECONDS = .5
const PREVIEW_SECONDS = .7
const PULSE_SECONDS = 1.1

type Slab = { x: number; y: number; z: number; yaw: number; scale: number }
export const SLABS: readonly Slab[] = [
  { x: 86, y: 162, z: -420, yaw: 15, scale: 1.13 },
  { x: 283, y: 315, z: -250, yaw: -15, scale: 1.03 },
  { x: 122, y: 459, z: -90, yaw: 13, scale: 1 },
  { x: 249, y: 558, z: 40, yaw: -12, scale: .82 },
]

/** Scene transform in CSS order: translate, then yaw, then pitch, then a push along the view axis. */
export type Camera = { x: number; y: number; z: number; yaw: number; pitch: number; push: number }

export type Flight = {
  camera: Camera
  dive: number
  arrive: number
  target: number
  yaw: number
  pitch: number
  preview: { elapsed: number; amplitude: number } | null
  pulse: number | null
  warmth: number
}

type FlightInputs = {
  entered: number
  focal: number
  lookX: number
  lookY: number
  tilt: number
  stress: boolean
}

export function createFlight(): Flight {
  return {
    camera: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, push: 0 },
    dive: 0, arrive: 0, target: 0, yaw: 0, pitch: 0, preview: null, pulse: null, warmth: 0,
  }
}

export function previewTilt(flight: Flight, amplitude: number) {
  flight.preview = { elapsed: 0, amplitude }
}

export function sendPulse(flight: Flight) {
  flight.pulse = 0
}

const radians = (degrees: number) => degrees * Math.PI / 180
const clamp01 = (value: number) => Math.min(1, Math.max(0, value))
const smoothstep = (from: number, to: number, value: number) => {
  const t = clamp01((value - from) / (to - from))
  return t * t * (3 - 2 * t)
}

/** Camera pose that centres a slab's aperture on the eye, squares it up, and lets it overfill the screen. */
function diveTarget(slab: Slab, focal: number): Camera {
  const fill = SURFACE.width * 1.42 / (APERTURE.width * slab.scale)
  const apertureLift = (APERTURE.top + APERTURE.height / 2 - SLAB.height / 2) * slab.scale
  return { x: EYE.x - slab.x, y: EYE.y - slab.y - apertureLift, z: -slab.z, yaw: -slab.yaw, pitch: 0, push: focal * (1 - 1 / fill) }
}

function pose(flight: Flight, inputs: FlightInputs) {
  const target = diveTarget(SLABS[flight.target], inputs.focal)
  // Lateral motion settles early and the push accelerates late: the camera lines up, then passes through.
  const align = 1 - (1 - flight.dive) ** 3
  const thrust = flight.dive ** 2.6
  const look = 1 - smoothstep(0, .35, flight.dive)
  const { camera } = flight
  camera.x = target.x * align
  camera.y = target.y * align
  camera.z = target.z * align
  camera.yaw = target.yaw * align + flight.yaw * look
  camera.pitch = flight.pitch * look
  camera.push = target.push * thrust
}

export function stepFlight(flight: Flight, inputs: FlightInputs, seconds: number) {
  const entering = inputs.entered >= 0
  if (entering) flight.target = inputs.entered
  flight.dive = clamp01(flight.dive + (entering ? seconds / DIVE_SECONDS : -seconds / SURFACE_SECONDS))
  flight.arrive = entering && flight.dive === 1 ? clamp01(flight.arrive + seconds / ADAPT_SECONDS) : 0

  let aimYaw = inputs.lookX * inputs.tilt
  let aimPitch = -inputs.lookY * inputs.tilt
  if (flight.preview) {
    const t = (flight.preview.elapsed += seconds) / PREVIEW_SECONDS
    if (t >= 1) flight.preview = null
    else {
      // One damped sweep left, right and back to rest shows the full range of the new tilt.
      const swing = Math.sin(t * Math.PI * 2) * (1 - t)
      aimYaw = flight.preview.amplitude * swing
      aimPitch = -flight.preview.amplitude * .35 * swing
    }
  }
  const follow = 1 - Math.exp(-seconds / .11)
  flight.yaw += (aimYaw - flight.yaw) * follow
  flight.pitch += (aimPitch - flight.pitch) * follow
  flight.warmth += ((inputs.stress ? 1 : 0) - flight.warmth) * (1 - Math.exp(-seconds / .7))
  if (flight.pulse !== null && (flight.pulse += seconds / PULSE_SECONDS) >= 1) flight.pulse = null
  pose(flight, inputs)
}

/** Settled pose for a still frame: the dive is complete or absent and nothing is in motion. */
export function settleFlight(flight: Flight, inputs: FlightInputs) {
  const entering = inputs.entered >= 0
  if (entering) flight.target = inputs.entered
  flight.dive = entering ? 1 : 0
  flight.arrive = entering ? 1 : 0
  flight.yaw = 0
  flight.pitch = 0
  flight.preview = null
  flight.pulse = null
  flight.warmth = inputs.stress ? 1 : 0
  pose(flight, inputs)
}

/** How far the corridor has dissolved into the light of the aperture the camera is passing through. */
export function exposure(flight: Flight) {
  return smoothstep(.7, .97, flight.dive)
}

export function cameraTransform(camera: Camera) {
  return `translateZ(${camera.push.toFixed(2)}px) rotateX(${camera.pitch.toFixed(3)}deg) rotateY(${camera.yaw.toFixed(3)}deg) translate3d(${camera.x.toFixed(2)}px, ${camera.y.toFixed(2)}px, ${camera.z.toFixed(2)}px)`
}

/** Applies the scene transform to a point given relative to the eye, using the CSS rotation conventions. */
export function toView(camera: Camera, point: Vec3): Vec3 {
  const x = point.x + camera.x
  const y = point.y + camera.y
  const z = point.z + camera.z
  const yaw = radians(camera.yaw)
  const pitch = radians(camera.pitch)
  const yawedX = x * Math.cos(yaw) + z * Math.sin(yaw)
  const yawedZ = -x * Math.sin(yaw) + z * Math.cos(yaw)
  return {
    x: yawedX,
    y: y * Math.cos(pitch) - yawedZ * Math.sin(pitch),
    z: y * Math.sin(pitch) + yawedZ * Math.cos(pitch) + camera.push,
  }
}

export function nearPlane(focal: number) {
  return focal - NEAR_MARGIN
}

export function toScreen(view: Vec3, focal: number): Point {
  const scale = focal / (focal - view.z)
  return { x: EYE.x + view.x * scale, y: EYE.y + view.y * scale, scale }
}

/** Clips a view-space polygon against the near plane (Sutherland–Hodgman, one plane). */
export function clipNear(polygon: readonly Vec3[], focal: number): Vec3[] {
  const limit = nearPlane(focal)
  const visible: Vec3[] = []
  polygon.forEach((current, index) => {
    const previous = polygon[(index + polygon.length - 1) % polygon.length]
    const currentInside = current.z <= limit
    if (currentInside !== previous.z <= limit) {
      const t = (limit - previous.z) / (current.z - previous.z)
      visible.push({ x: previous.x + (current.x - previous.x) * t, y: previous.y + (current.y - previous.y) * t, z: limit })
    }
    if (currentInside) visible.push(current)
  })
  return visible
}
