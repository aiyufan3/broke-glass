import { HORIZON, SURFACE, WAVE_FRONTS, crossings, polar, rimRadius, waveRadius, waveStrength } from './potential'
import type { FieldState, Vec } from './potential'

const INK = '#030908'
const LINE = '#34f5c5'
const PALE = '#b7f9ea'
const TAU = Math.PI * 2
const ARC_START = 150
const ARC_SWEEP = 240

export type ToolRing =
  | { kind: 'telemetry'; trace: readonly number[] }
  | { kind: 'search'; matches: readonly boolean[]; scores: readonly number[] }
  | { kind: 'media'; frequency: number; playing: boolean; progress: number }

type FieldView = { time: number; tool: ToolRing | null }

// Path2D parses the navigation arcs once; they are fixed geometry below the field.
const navigationRails = new Path2D('M3 791Q188 602 374 791M6 806Q188 629 371 806M36 806Q188 663 341 806')
const navigationArc = new Path2D('M93 735Q188 667 285 735')

function strokeSegments(ctx: CanvasRenderingContext2D, data: Float32Array, count: number) {
  ctx.beginPath()
  for (let index = 0; index < count * 4; index += 4) {
    ctx.moveTo(data[index], data[index + 1])
    ctx.lineTo(data[index + 2], data[index + 3])
  }
  ctx.stroke()
}

function circle(ctx: CanvasRenderingContext2D, center: Vec, radius: number) {
  ctx.beginPath()
  ctx.arc(center.x, center.y, radius, 0, TAU)
}

function bezel(ctx: CanvasRenderingContext2D, center: Vec, radius: number) {
  ctx.beginPath()
  for (let degrees = 0; degrees < 360; degrees += 5) {
    const from = polar(center, degrees, radius)
    const to = polar(center, degrees, radius + (degrees % 30 ? 4 : 9))
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
  }
  ctx.stroke()
}

function paintBackdrop(ctx: CanvasRenderingContext2D, state: FieldState) {
  ctx.fillStyle = INK
  ctx.fillRect(0, 0, SURFACE.width, SURFACE.height)
  const well = ctx.createRadialGradient(state.core.x, state.core.y, 0, state.core.x, state.core.y, 330)
  well.addColorStop(0, '#124f4166')
  well.addColorStop(1, '#124f4100')
  ctx.fillStyle = well
  ctx.fillRect(0, 0, SURFACE.width, SURFACE.height)

  const open = Math.min(1, Math.max(0, state.open))
  ctx.strokeStyle = PALE
  ctx.lineWidth = .5
  ctx.globalAlpha = .2
  ctx.setLineDash([2, 7])
  ctx.beginPath()
  ctx.moveTo(state.core.x, 120)
  ctx.lineTo(state.core.x, 660)
  ctx.moveTo(0, state.core.y)
  ctx.lineTo(SURFACE.width, state.core.y)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.globalAlpha = .26
  bezel(ctx, state.core, 196 - open * (196 - rimRadius(state) - 9))
}

function paintBeads(ctx: CanvasRenderingContext2D, state: FieldState) {
  ctx.strokeStyle = PALE
  ctx.fillStyle = PALE
  ctx.lineWidth = .8
  ctx.globalAlpha = .34
  ctx.beginPath()
  for (const bead of state.beads) {
    if (bead.x < -8 || bead.x > SURFACE.width + 8 || bead.y < 60 || bead.y > 760) continue
    ctx.moveTo(bead.x, bead.y)
    ctx.lineTo(bead.x - (bead.x - bead.tailX) * 9, bead.y - (bead.y - bead.tailY) * 9)
  }
  ctx.stroke()
  ctx.globalAlpha = .92
  for (const bead of state.beads) {
    if (bead.x < -8 || bead.x > SURFACE.width + 8 || bead.y < 60 || bead.y > 760) continue
    ctx.fillRect(bead.x - .9, bead.y - .9, 1.8, 1.8)
  }
}

function paintVeils(ctx: CanvasRenderingContext2D) {
  const top = ctx.createLinearGradient(0, 56, 0, 168)
  top.addColorStop(0, INK)
  top.addColorStop(1, '#03090800')
  ctx.fillStyle = top
  ctx.fillRect(0, 0, SURFACE.width, 168)
  const bottom = ctx.createLinearGradient(0, 628, 0, 742)
  bottom.addColorStop(0, '#03090800')
  bottom.addColorStop(1, INK)
  ctx.fillStyle = bottom
  ctx.fillRect(0, 628, SURFACE.width, SURFACE.height - 628)
}

function paintSingularity(ctx: CanvasRenderingContext2D, state: FieldState) {
  const scale = 1 - Math.min(1, Math.max(0, state.open))
  if (scale < .02) return
  const { core } = state
  const glow = ctx.createRadialGradient(core.x, core.y, HORIZON * scale, core.x, core.y, 86 * scale)
  glow.addColorStop(0, '#34f5c540')
  glow.addColorStop(1, '#34f5c500')
  ctx.fillStyle = glow
  circle(ctx, core, 86 * scale)
  ctx.fill()
  ctx.fillStyle = '#010504'
  circle(ctx, core, HORIZON * scale)
  ctx.fill()
  ctx.strokeStyle = LINE
  ctx.lineWidth = 1.2
  ctx.globalAlpha = .95
  ctx.stroke()
  ctx.lineWidth = .6
  ctx.globalAlpha = .45
  circle(ctx, core, 21 * scale)
  ctx.stroke()

  // The accretion orbit is a tilted ellipse; the marker's position on it is the engine's spin angle.
  const tilt = -29 * Math.PI / 180
  ctx.strokeStyle = PALE
  ctx.lineWidth = .7
  ctx.globalAlpha = .8
  ctx.beginPath()
  ctx.ellipse(core.x, core.y, 54 * scale, 19 * scale, tilt, 0, TAU)
  ctx.stroke()
  const along = Math.cos(state.spin) * 54 * scale
  const across = Math.sin(state.spin) * 19 * scale
  ctx.fillStyle = PALE
  ctx.globalAlpha = 1
  circle(ctx, { x: core.x + along * Math.cos(tilt) - across * Math.sin(tilt), y: core.y + along * Math.sin(tilt) + across * Math.cos(tilt) }, 2.1 * scale)
  ctx.fill()
}

function arcPoint(center: Vec, radius: number, t: number) {
  return polar(center, ARC_START + ARC_SWEEP * t, radius)
}

function paintToolRing(ctx: CanvasRenderingContext2D, center: Vec, radius: number, tool: ToolRing, time: number) {
  const base = radius - 13
  ctx.strokeStyle = LINE
  ctx.lineWidth = .6
  ctx.globalAlpha = .28
  ctx.beginPath()
  ctx.arc(center.x, center.y, base, ARC_START * Math.PI / 180, (ARC_START + ARC_SWEEP) * Math.PI / 180)
  ctx.stroke()

  if (tool.kind === 'telemetry') {
    const { trace } = tool
    const mean = trace.reduce((sum, value) => sum + value, 0) / trace.length
    const spread = Math.max(1.2, ...trace.map((value) => Math.abs(value - mean)))
    ctx.strokeStyle = PALE
    ctx.lineWidth = 1.2
    ctx.globalAlpha = .9
    ctx.beginPath()
    trace.forEach((value, index) => {
      const t = index / (trace.length - 1)
      const from = arcPoint(center, base, t)
      const to = arcPoint(center, base + (value - mean) / spread * 9, t)
      ctx.moveTo(from.x, from.y)
      ctx.lineTo(to.x, to.y)
    })
    ctx.stroke()
    ctx.fillStyle = PALE
    ctx.globalAlpha = 1
    circle(ctx, arcPoint(center, base + (trace[trace.length - 1] - mean) / spread * 9, 1), 2.4)
    ctx.fill()
    return
  }

  if (tool.kind === 'media') {
    const bars = 72
    ctx.strokeStyle = LINE
    ctx.lineWidth = 1.3
    ctx.globalAlpha = .85
    ctx.beginPath()
    for (let index = 0; index < bars; index++) {
      const t = index / (bars - 1)
      const harmonic = Math.sin(t * tool.frequency * .43) ** 2
      const motion = tool.playing ? .55 + .45 * Math.sin(time * .006 + index * .7) : .35
      const from = arcPoint(center, base + 6, t)
      const to = arcPoint(center, base + 6 - (2 + 11 * harmonic) * motion, t)
      ctx.moveTo(from.x, from.y)
      ctx.lineTo(to.x, to.y)
    }
    ctx.stroke()
    const head = arcPoint(center, radius, tool.progress)
    ctx.fillStyle = PALE
    ctx.globalAlpha = 1
    circle(ctx, head, 3.4)
    ctx.fill()
    return
  }

  tool.matches.forEach((matched, index) => {
    const t = (index + .5) / tool.matches.length
    const point = arcPoint(center, base, t)
    const size = 1.6 + (tool.scores[index] - 80) * .09
    ctx.globalAlpha = matched ? 1 : .32
    ctx.fillStyle = matched ? PALE : INK
    ctx.strokeStyle = matched ? PALE : LINE
    ctx.lineWidth = .8
    circle(ctx, point, size)
    ctx.fill()
    ctx.stroke()
    if (!matched) return
    const inner = arcPoint(center, base - 12, t)
    ctx.beginPath()
    ctx.moveTo(point.x, point.y)
    ctx.lineTo(inner.x, inner.y)
    ctx.stroke()
  })
}

function paintWorkspace(ctx: CanvasRenderingContext2D, state: FieldState, view: FieldView) {
  const radius = rimRadius(state)
  if (radius < 6) return
  const presence = Math.min(1, state.open * 1.4)
  ctx.globalAlpha = .62 * presence
  ctx.fillStyle = '#020a08'
  circle(ctx, state.core, radius)
  ctx.fill()
  ctx.strokeStyle = LINE
  ctx.lineWidth = 1.3
  ctx.globalAlpha = .92 * presence
  ctx.stroke()
  ctx.lineWidth = .6
  ctx.globalAlpha = .34 * presence
  circle(ctx, state.core, radius + 5)
  ctx.stroke()
  if (view.tool && state.open > .86) paintToolRing(ctx, state.core, radius, view.tool, view.time)
}

function paintInterference(ctx: CanvasRenderingContext2D, state: FieldState) {
  const wave = state.interference
  if (!wave) return
  const strength = waveStrength(wave.age)
  const radii = Array.from({ length: WAVE_FRONTS }, (_, front) => waveRadius(wave.age, front))
  ctx.lineWidth = 1.2
  for (const [source, color] of [[wave.a, LINE], [wave.b, PALE]] as const) {
    ctx.strokeStyle = color
    radii.forEach((radius, front) => {
      if (!radius) return
      ctx.globalAlpha = strength * (1 - front * .15)
      circle(ctx, source, radius)
      ctx.stroke()
    })
  }
  ctx.fillStyle = PALE
  ctx.globalAlpha = strength
  for (const radiusA of radii) {
    for (const radiusB of radii) {
      const points = radiusA && radiusB ? crossings(wave.a, radiusA, wave.b, radiusB) : null
      if (!points) continue
      for (const point of points) ctx.fillRect(point.x - 1.3, point.y - 1.3, 2.6, 2.6)
    }
  }
}

function paintProbe(ctx: CanvasRenderingContext2D, state: FieldState) {
  if (state.presence < .04) return
  const { pointer, core } = state
  ctx.strokeStyle = PALE
  ctx.lineWidth = .6
  ctx.globalAlpha = .42 * state.presence
  ctx.setLineDash([3, 5])
  ctx.beginPath()
  ctx.moveTo(core.x, core.y)
  ctx.lineTo(pointer.x, pointer.y)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.globalAlpha = .9 * state.presence
  ctx.beginPath()
  ctx.moveTo(pointer.x - 9, pointer.y)
  ctx.lineTo(pointer.x - 3, pointer.y)
  ctx.moveTo(pointer.x + 3, pointer.y)
  ctx.lineTo(pointer.x + 9, pointer.y)
  ctx.moveTo(pointer.x, pointer.y - 9)
  ctx.lineTo(pointer.x, pointer.y - 3)
  ctx.moveTo(pointer.x, pointer.y + 3)
  ctx.lineTo(pointer.x, pointer.y + 9)
  ctx.stroke()
}

export function paintField(ctx: CanvasRenderingContext2D, state: FieldState, view: FieldView) {
  ctx.globalAlpha = 1
  paintBackdrop(ctx, state)

  ctx.strokeStyle = LINE
  ctx.lineWidth = .6
  ctx.globalAlpha = .36
  strokeSegments(ctx, state.minor.data, state.minor.count)
  ctx.lineWidth = 1
  ctx.globalAlpha = .74
  strokeSegments(ctx, state.major.data, state.major.count)

  paintBeads(ctx, state)
  ctx.globalAlpha = 1
  paintVeils(ctx)
  paintSingularity(ctx, state)
  paintWorkspace(ctx, state, view)
  paintInterference(ctx, state)
  paintProbe(ctx, state)

  ctx.strokeStyle = LINE
  ctx.lineWidth = .7
  ctx.globalAlpha = .36
  ctx.stroke(navigationRails)
  ctx.lineWidth = 1.3
  ctx.globalAlpha = .7
  ctx.stroke(navigationArc)
  ctx.globalAlpha = 1
}
