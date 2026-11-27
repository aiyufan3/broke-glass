import { HORIZON, HUES, ORBS, SURFACE, burstDots, orbDots, orbView, pulseGains, rowDepth } from './dots'
import type { BurstDot, DotField, Floor, OrbView } from './dots'

const WHITE = '#FFFFFF'
const INK = '#0B0B0B'
const TAU = Math.PI * 2

/** Fills every dot of one hue in a single path: the floor is drawn hue by hue, row by row. */
function fillDots(ctx: CanvasRenderingContext2D, floor: Floor, from: number, to: number, gain: number, mirror: boolean, hueOverride = -1) {
  for (let hue = 0; hue < HUES.length; hue++) {
    if (hueOverride >= 0 && hue !== hueOverride) continue
    ctx.beginPath()
    let any = false
    for (let i = from; i < to; i++) {
      if (hueOverride < 0 && floor.hue[i] !== hue) continue
      const y = mirror ? 2 * HORIZON - floor.y[i] : floor.y[i]
      const rx = floor.rx[i] * gain
      ctx.moveTo(floor.x[i] + rx, y)
      ctx.ellipse(floor.x[i], y, rx, floor.ry[i] * gain, 0, 0, TAU)
      any = true
    }
    if (any) {
      ctx.fillStyle = HUES[hue]
      ctx.fill()
    }
  }
}

function fillBurst(ctx: CanvasRenderingContext2D, dot: BurstDot) {
  if (dot.rx <= 0) return
  ctx.beginPath()
  ctx.ellipse(dot.x, dot.y, dot.rx, dot.ry, 0, 0, TAU)
  ctx.fillStyle = HUES[dot.hue]
  ctx.fill()
}

function horizon(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = INK
  ctx.fillRect(0, HORIZON - .75, SURFACE.width, 1.5)
}

/**
 * Inside a swallowed orb the room is the field turned inward: the same lattice on the floor and,
 * mirrored, on the ceiling, all in the orb's own hue and all receding to the same horizon. The
 * pulse runs through it under load, and the bursts that commands land lie on its floor in their
 * own colours, so whatever happens in the field is visible from inside.
 */
function paintRoom(ctx: CanvasRenderingContext2D, field: DotField, index: number, view: OrbView, gains: number[], bursts: BurstDot[]) {
  ctx.save()
  ctx.beginPath()
  ctx.arc(view.x, view.y, view.radius, 0, TAU)
  ctx.clip()
  ctx.fillStyle = WHITE
  ctx.fillRect(0, 0, SURFACE.width, SURFACE.height)
  horizon(ctx)
  const { floor } = field
  const hue = ORBS[index].hue
  for (let row = floor.rows - 1; row >= 0; row--) {
    fillDots(ctx, floor, floor.rowStart[row], floor.rowStart[row + 1], gains[row], false, hue)
    fillDots(ctx, floor, floor.rowStart[row], floor.rowStart[row + 1], gains[row], true, hue)
  }
  for (const dot of [...bursts].sort((a, b) => b.depth - a.depth)) fillBurst(ctx, dot)
  ctx.restore()
}

function paintOrb(ctx: CanvasRenderingContext2D, field: DotField, index: number, view: OrbView, gains: number[], bursts: BurstDot[]) {
  ctx.beginPath()
  ctx.arc(view.x, view.y, view.radius, 0, TAU)
  ctx.fillStyle = WHITE
  ctx.fill()
  if (view.swell > .001) paintRoom(ctx, field, index, view, gains, bursts)
  // The orb's own skin thins away as the viewer passes through it.
  const skin = 1 - view.swell * view.swell
  if (skin <= .002) return
  ctx.globalAlpha = skin
  ctx.beginPath()
  for (const dot of orbDots(field, index, view)) {
    ctx.moveTo(dot.x + Math.cos(dot.angle) * dot.across, dot.y + Math.sin(dot.angle) * dot.across)
    ctx.ellipse(dot.x, dot.y, dot.across, dot.along, dot.angle, 0, TAU)
  }
  ctx.fillStyle = HUES[ORBS[index].hue]
  ctx.fill()
  ctx.globalAlpha = 1
}

/**
 * Paints the infinity room: white, one horizon, the floor of dots receding to the vanishing point,
 * landed bursts, and the four orbs. Everything is drawn far to near, so an orb hangs in front of
 * the rows behind it and behind the rows in front of it.
 */
export function paintInfinity(ctx: CanvasRenderingContext2D, field: DotField) {
  ctx.fillStyle = WHITE
  ctx.fillRect(0, 0, SURFACE.width, SURFACE.height)
  horizon(ctx)

  const layers: { depth: number; paint: () => void }[] = []
  const { floor } = field
  const gains = pulseGains(field)
  const bursts = burstDots(field)
  for (let row = 0; row < floor.rows; row++) {
    layers.push({ depth: rowDepth(row), paint: () => fillDots(ctx, floor, floor.rowStart[row], floor.rowStart[row + 1], gains[row], false) })
  }
  for (const dot of bursts) layers.push({ depth: dot.depth, paint: () => fillBurst(ctx, dot) })
  ORBS.forEach((_, index) => {
    const view = orbView(field, index)
    layers.push({ depth: view.depth, paint: () => paintOrb(ctx, field, index, view, gains, bursts) })
  })
  layers.sort((a, b) => b.depth - a.depth)
  for (const layer of layers) layer.paint()
}

/** Telemetry as a dot matrix: one column per band of the trace, one dot per step of latency. */
export function paintDotHistogram(ctx: CanvasRenderingContext2D, trace: readonly number[], stress: boolean, width: number, height: number) {
  const bands = 16
  const steps = 9
  const low = Math.min(...trace)
  const high = Math.max(...trace)
  const pitch = width / bands
  const rise = height / steps
  const radius = Math.min(pitch, rise) * .36
  ctx.clearRect(0, 0, width, height)
  for (let band = 0; band < bands; band++) {
    const from = Math.floor(band * trace.length / bands)
    const to = Math.max(from + 1, Math.floor((band + 1) * trace.length / bands))
    const value = trace.slice(from, to).reduce((sum, sample) => sum + sample, 0) / (to - from)
    const lit = 1 + Math.round((steps - 1) * (high > low ? (value - low) / (high - low) : .5))
    const x = (band + .5) * pitch
    for (let step = 0; step < steps; step++) {
      const y = height - (step + .5) * rise
      ctx.beginPath()
      ctx.arc(x, y, step < lit ? radius : radius * .32, 0, TAU)
      ctx.fillStyle = step < lit ? HUES[stress && step >= lit - 2 ? 0 : (band + step) % HUES.length] : '#0B0B0B33'
      ctx.fill()
    }
  }
}
