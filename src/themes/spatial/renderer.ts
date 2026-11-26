import { CORRIDOR_DEPTH, EYE, ROOM_DEPTH, SURFACE, clipNear, exposure, nearPlane, toScreen, toView } from './camera'
import type { Camera, Flight, Vec3 } from './camera'

type Rgb = readonly [number, number, number]
const INK: Rgb = [7, 20, 24]
const SLATE: Rgb = [23, 54, 65]
const LIT: Rgb = [70, 124, 136]
const HAZE: Rgb = [140, 190, 200]
const LIGHT: Rgb = [224, 241, 242]
const EMBER: Rgb = [255, 163, 112]
const GLOW: Rgb = [255, 233, 216]
const SHADE: Rgb = [118, 168, 178]
const WARM_SHADE: Rgb = [214, 138, 100]

const LEFT = -EYE.x
const RIGHT = SURFACE.width - EYE.x
const TOP = -EYE.y
const BOTTOM = SURFACE.height - EYE.y
const PANEL = 300
const ROOM_PANEL = 130
const TAU = Math.PI * 2

type SpatialView = { focal: number; fog: number }

const blend = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const css = (color: Rgb, alpha = 1) => `rgb(${color[0] | 0} ${color[1] | 0} ${color[2] | 0} / ${alpha})`

type Box = { front: number; back: number }
type Shader = (depth: number) => Rgb

function tracePolygon(ctx: CanvasRenderingContext2D, camera: Camera, focal: number, corners: readonly Vec3[]) {
  const visible = clipNear(corners.map((corner) => toView(camera, corner)), focal)
  if (visible.length < 3) return false
  ctx.beginPath()
  visible.forEach((vertex, index) => {
    const point = toScreen(vertex, focal)
    if (index) ctx.lineTo(point.x, point.y)
    else ctx.moveTo(point.x, point.y)
  })
  ctx.closePath()
  return true
}

function traceSegment(ctx: CanvasRenderingContext2D, camera: Camera, focal: number, from: Vec3, to: Vec3) {
  const limit = nearPlane(focal)
  let a = toView(camera, from)
  let b = toView(camera, to)
  if (a.z > limit && b.z > limit) return
  if (a.z > limit) [a, b] = [b, a]
  if (b.z > limit) {
    const t = (limit - a.z) / (b.z - a.z)
    b = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: limit }
  }
  const start = toScreen(a, focal)
  const end = toScreen(b, focal)
  ctx.moveTo(start.x, start.y)
  ctx.lineTo(end.x, end.y)
}

/**
 * Fills one wall of a box. The gradient runs along the wall's centre line in screen space with
 * stops placed at projected depths, so shading stays correct under perspective and camera tilt.
 */
function paintWall(ctx: CanvasRenderingContext2D, camera: Camera, focal: number, box: Box, corner: (depth: number, side: 0 | 1) => Vec3, shade: Shader) {
  const corners = [corner(box.front, 0), corner(box.back, 0), corner(box.back, 1), corner(box.front, 1)]
  if (!tracePolygon(ctx, camera, focal, corners)) return
  const centre = (depth: number) => {
    const a = corner(depth, 0)
    const b = corner(depth, 1)
    return toScreen(toView(camera, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: depth }), focal)
  }
  const visibleFront = Math.min(box.front, 0)
  const near = centre(visibleFront)
  const far = centre(box.back)
  const length = Math.hypot(far.x - near.x, far.y - near.y) || 1
  const gradient = ctx.createLinearGradient(near.x, near.y, far.x, far.y)
  for (const fraction of [0, .08, .2, .4, .65, 1]) {
    const depth = visibleFront + (box.back - visibleFront) * fraction
    const point = centre(depth)
    const stop = Math.min(1, Math.max(0, ((point.x - near.x) * (far.x - near.x) + (point.y - near.y) * (far.y - near.y)) / (length * length)))
    gradient.addColorStop(stop, css(shade(fraction)))
  }
  ctx.fillStyle = gradient
  ctx.fill()
}

const walls: readonly ((depth: number, side: 0 | 1) => Vec3)[] = [
  (z, side) => ({ x: LEFT, y: side ? BOTTOM : TOP, z }),
  (z, side) => ({ x: RIGHT, y: side ? BOTTOM : TOP, z }),
  (z, side) => ({ x: side ? RIGHT : LEFT, y: TOP, z }),
  (z, side) => ({ x: side ? RIGHT : LEFT, y: BOTTOM, z }),
]

function traceSeams(ctx: CanvasRenderingContext2D, camera: Camera, focal: number, box: Box, panel: number) {
  for (let z = 0; z >= box.back; z -= panel) {
    traceSegment(ctx, camera, focal, { x: LEFT, y: TOP, z }, { x: RIGHT, y: TOP, z })
    traceSegment(ctx, camera, focal, { x: RIGHT, y: TOP, z }, { x: RIGHT, y: BOTTOM, z })
    traceSegment(ctx, camera, focal, { x: RIGHT, y: BOTTOM, z }, { x: LEFT, y: BOTTOM, z })
    traceSegment(ctx, camera, focal, { x: LEFT, y: BOTTOM, z }, { x: LEFT, y: TOP, z })
  }
  for (const fraction of [.25, .5, .75]) {
    const y = TOP + (BOTTOM - TOP) * fraction
    traceSegment(ctx, camera, focal, { x: LEFT, y, z: box.front }, { x: LEFT, y, z: box.back })
    traceSegment(ctx, camera, focal, { x: RIGHT, y, z: box.front }, { x: RIGHT, y, z: box.back })
  }
  for (const fraction of [1 / 3, 2 / 3]) {
    const x = LEFT + (RIGHT - LEFT) * fraction
    traceSegment(ctx, camera, focal, { x, y: TOP, z: box.front }, { x, y: TOP, z: box.back })
    traceSegment(ctx, camera, focal, { x, y: BOTTOM, z: box.front }, { x, y: BOTTOM, z: box.back })
  }
}

/** Formwork tie holes: four per panel on both side walls, drawn at their projected size. */
function paintTieHoles(ctx: CanvasRenderingContext2D, camera: Camera, focal: number, box: Box, panel: number) {
  const limit = nearPlane(focal)
  const band = (BOTTOM - TOP) / 4
  ctx.beginPath()
  for (let z = -panel / 4; z > box.back; z -= panel / 2) {
    for (let row = 0; row < 8; row++) {
      const y = TOP + band * (row / 2 + .25)
      for (const x of [LEFT, RIGHT]) {
        const view = toView(camera, { x, y, z })
        if (view.z > limit) continue
        const point = toScreen(view, focal)
        const radius = 2.6 * point.scale
        if (radius < .45) continue
        ctx.moveTo(point.x + radius, point.y)
        ctx.arc(point.x, point.y, radius, 0, TAU)
      }
    }
  }
  ctx.fill()
}

function paintCorridor(ctx: CanvasRenderingContext2D, flight: Flight, view: SpatialView) {
  const { camera, warmth } = flight
  const { focal, fog } = view
  const box: Box = { front: focal * .9, back: -CORRIDOR_DEPTH }
  const light = blend(LIGHT, GLOW, warmth)
  const haze = blend(HAZE, EMBER, warmth)
  const lit = blend(LIT, blend(EMBER, SLATE, .5), warmth)
  const shade: Shader = (depth) => blend(blend(INK, lit, depth ** 1.35), haze, fog * depth * .62)

  ctx.fillStyle = css(INK)
  ctx.fillRect(0, 0, SURFACE.width, SURFACE.height)
  for (const wall of walls) paintWall(ctx, camera, focal, box, wall, shade)

  const end = [{ x: LEFT, y: TOP, z: box.back }, { x: RIGHT, y: TOP, z: box.back }, { x: RIGHT, y: BOTTOM, z: box.back }, { x: LEFT, y: BOTTOM, z: box.back }]
  const centre = toScreen(toView(camera, { x: 0, y: 0, z: box.back }), focal)
  if (tracePolygon(ctx, camera, focal, end)) {
    const reach = (BOTTOM - TOP) * centre.scale
    const aperture = ctx.createRadialGradient(centre.x, centre.y, 0, centre.x, centre.y, reach * .6)
    aperture.addColorStop(0, css(light))
    aperture.addColorStop(1, css(blend(light, haze, .55)))
    ctx.fillStyle = aperture
    ctx.fill()
  }

  const sheen = [{ x: -62, y: BOTTOM, z: box.back }, { x: 62, y: BOTTOM, z: box.back }, { x: 62, y: BOTTOM, z: box.back * .16 }, { x: -62, y: BOTTOM, z: box.back * .16 }]
  if (tracePolygon(ctx, camera, focal, sheen)) {
    const far = toScreen(toView(camera, { x: 0, y: BOTTOM, z: box.back }), focal)
    const near = toScreen(toView(camera, { x: 0, y: BOTTOM, z: box.back * .16 }), focal)
    const reflection = ctx.createLinearGradient(far.x, far.y, near.x, near.y)
    reflection.addColorStop(0, css(light, .34))
    reflection.addColorStop(1, css(light, 0))
    ctx.fillStyle = reflection
    ctx.fill()
  }

  ctx.strokeStyle = css(blend(HAZE, light, .4), .2)
  ctx.lineWidth = 1
  ctx.beginPath()
  traceSeams(ctx, camera, focal, box, PANEL)
  ctx.stroke()
  ctx.fillStyle = css(INK, .55)
  paintTieHoles(ctx, camera, focal, box, PANEL)

  if (flight.pulse !== null) {
    const z = box.back * flight.pulse
    ctx.strokeStyle = css(light, (1 - flight.pulse) * .95)
    ctx.lineWidth = 1.6
    ctx.beginPath()
    traceSegment(ctx, camera, focal, { x: LEFT, y: TOP, z }, { x: RIGHT, y: TOP, z })
    traceSegment(ctx, camera, focal, { x: RIGHT, y: TOP, z }, { x: RIGHT, y: BOTTOM, z })
    traceSegment(ctx, camera, focal, { x: RIGHT, y: BOTTOM, z }, { x: LEFT, y: BOTTOM, z })
    traceSegment(ctx, camera, focal, { x: LEFT, y: BOTTOM, z }, { x: LEFT, y: TOP, z })
    ctx.stroke()
  }

  // Scattering: the end wall blooms into the haze in proportion to its density.
  const bloom = ctx.createRadialGradient(centre.x, centre.y, 0, centre.x, centre.y, 90 + fog * 300)
  bloom.addColorStop(0, css(haze, fog * .62))
  bloom.addColorStop(1, css(haze, 0))
  ctx.fillStyle = bloom
  ctx.fillRect(0, 0, SURFACE.width, SURFACE.height)

  const veil = exposure(flight)
  if (veil > 0) {
    ctx.fillStyle = css(light, veil)
    ctx.fillRect(0, 0, SURFACE.width, SURFACE.height)
  }
}

function paintRoom(ctx: CanvasRenderingContext2D, flight: Flight, view: SpatialView) {
  const { focal, fog } = view
  const { warmth } = flight
  const camera: Camera = { x: 0, y: 0, z: 0, yaw: flight.yaw, pitch: flight.pitch, push: 0 }
  const box: Box = { front: focal * .9, back: -ROOM_DEPTH }
  const light = blend(LIGHT, GLOW, warmth)
  const shadow = blend(SHADE, WARM_SHADE, warmth)
  const shade: Shader = (depth) => blend(blend(shadow, light, .1 + depth * .78), light, fog * .3)

  ctx.fillStyle = css(light)
  ctx.fillRect(0, 0, SURFACE.width, SURFACE.height)
  for (const wall of walls) paintWall(ctx, camera, focal, box, wall, shade)
  const back = [{ x: LEFT, y: TOP, z: box.back }, { x: RIGHT, y: TOP, z: box.back }, { x: RIGHT, y: BOTTOM, z: box.back }, { x: LEFT, y: BOTTOM, z: box.back }]
  if (tracePolygon(ctx, camera, focal, back)) {
    ctx.fillStyle = css(blend(light, [255, 255, 255], .35))
    ctx.fill()
  }
  ctx.strokeStyle = css(INK, .16)
  ctx.lineWidth = 1
  ctx.beginPath()
  traceSeams(ctx, camera, focal, box, ROOM_PANEL)
  ctx.stroke()
  ctx.fillStyle = css(INK, .22)
  paintTieHoles(ctx, camera, focal, box, ROOM_PANEL)

  if (flight.arrive < 1) {
    ctx.fillStyle = css(light, 1 - flight.arrive)
    ctx.fillRect(0, 0, SURFACE.width, SURFACE.height)
  }
}

export function paintSpace(ctx: CanvasRenderingContext2D, flight: Flight, view: SpatialView) {
  if (flight.dive === 1) paintRoom(ctx, flight, view)
  else paintCorridor(ctx, flight, view)
}
