import { CORE, FIRST_BUD, NUCLEUS, OUTLINE_POINTS, SURFACE, bezierPoint, bezierTangent, membranePoint, vesselCurve } from './tissue'
import type { Bezier, Cell, Tint, Tissue, Vec } from './tissue'

const PLUM = '#0b0714'
const PEARL = '#efccdc'
const CORAL = '#ff5ca8'
const AQUA = '#9ee6d5'
const TAU = Math.PI * 2
const VESSEL_STEPS = 26
const tints: Record<Tint, string> = { coral: '#b3477c', aqua: '#4f8f8c', violet: '#7a62a8', rose: '#a05a7e' }
const PLEATS = [.93, .86, .79, .72, .65] as const

export type Organ =
  | { kind: 'telemetry'; trace: readonly number[] }
  | { kind: 'media'; frequency: number; playing: boolean; progress: number }

type TissueView = { time: number; cytoplasm: number; stress: boolean; organ: Organ | null }

function traceOutline(ctx: CanvasRenderingContext2D, cell: Cell, breath: number, scale: number, lag: number) {
  ctx.beginPath()
  for (let step = 0; step < OUTLINE_POINTS; step++) {
    const point = membranePoint(cell, step / OUTLINE_POINTS * TAU, breath, scale, lag)
    if (step) ctx.lineTo(point.x, point.y)
    else ctx.moveTo(point.x, point.y)
  }
  ctx.closePath()
}

function paintBackdrop(ctx: CanvasRenderingContext2D, breath: number) {
  ctx.fillStyle = PLUM
  ctx.fillRect(0, 0, SURFACE.width, SURFACE.height)
  for (const [x, y, radius, color] of [[271, 150, 300, '#3a2450'], [38, 443, 330, '#4a2c46'], [313, 602, 300, '#24414a']] as const) {
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius)
    glow.addColorStop(0, `${color}a6`)
    glow.addColorStop(1, `${color}00`)
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, SURFACE.width, SURFACE.height)
  }
  paintHostMembrane(ctx, breath)
  paintMotes(ctx, breath)
}

function paintHostMembrane(ctx: CanvasRenderingContext2D, breath: number) {
  ctx.strokeStyle = PEARL
  ctx.lineWidth = .8
  for (const [scale, alpha, lag] of [[1, .17, 0], [.955, .1, 1.4]] as const) {
    ctx.globalAlpha = alpha
    ctx.beginPath()
    for (let step = 0; step <= 96; step++) {
      const theta = step / 96 * TAU
      const radius = scale * (1 + .06 * Math.sin(2 * theta + 1.1 + (breath - lag) * .31) + .045 * Math.sin(3 * theta + 4 + (breath - lag) * .23) + .03 * Math.sin(5 * theta + 2.2))
      const x = 190 + Math.cos(theta) * 176 * radius + Math.sin(theta * 2) * 14
      const y = 462 + Math.sin(theta) * 338 * radius
      if (step) ctx.lineTo(x, y)
      else ctx.moveTo(x, y)
    }
    ctx.stroke()
  }
}

function paintMotes(ctx: CanvasRenderingContext2D, breath: number) {
  ctx.fillStyle = '#f4caec'
  for (let mote = 0; mote < 53; mote++) {
    const sway = breath * .18 + mote
    ctx.globalAlpha = .2 + (mote % 5) * .06
    const size = mote % 10 === 0 ? 1.8 : .8
    ctx.fillRect(39 + (mote * 134.72) % 300 + Math.sin(sway) * 3, 156 + (mote * 133.3) % 476 + Math.cos(sway * .8) * 3, size, size)
  }
}

function paintVessel(ctx: CanvasRenderingContext2D, curve: Bezier, pulses: readonly number[], breath: number, index: number, alpha: number) {
  const gradient = ctx.createLinearGradient(curve[0].x, curve[0].y, curve[3].x, curve[3].y)
  gradient.addColorStop(0, CORAL)
  gradient.addColorStop(.5, '#c2a1d7')
  gradient.addColorStop(1, AQUA)
  ctx.strokeStyle = gradient
  ctx.lineCap = 'round'
  let previous = curve[0]
  for (let step = 1; step <= VESSEL_STEPS; step++) {
    const t = step / VESSEL_STEPS
    const point = bezierPoint(curve, t)
    // Peristalsis: the wall dilates in a short Gaussian band around each pulse.
    let dilation = 0
    for (const pulse of pulses) dilation += Math.exp(-(((t - pulse) / .07) ** 2))
    ctx.lineWidth = 2.3 - t * 1.25 + dilation * 3
    ctx.globalAlpha = alpha * Math.min(1, .62 + dilation * .5)
    ctx.beginPath()
    ctx.moveTo(previous.x, previous.y)
    ctx.lineTo(point.x, point.y)
    ctx.stroke()
    previous = point
  }

  ctx.lineWidth = .7
  ctx.globalAlpha = alpha * .42
  ctx.beginPath()
  for (const [t, side] of [[.3, 1], [.52, -1], [.74, 1]] as const) {
    const origin = bezierPoint(curve, t)
    const tangent = bezierTangent(curve, t)
    const sway = Math.sin(breath * .7 + index * 1.7 + t * 9) * 4
    const reach = 15 + ((index * 7 + t * 31) % 11)
    const normal: Vec = { x: -tangent.y * side, y: tangent.x * side }
    ctx.moveTo(origin.x, origin.y)
    ctx.quadraticCurveTo(
      origin.x + normal.x * reach * .7 + tangent.x * reach * .5, origin.y + normal.y * reach * .7 + tangent.y * reach * .5,
      origin.x + normal.x * reach + tangent.x * (reach * .2 + sway), origin.y + normal.y * reach + tangent.y * (reach * .2 + sway),
    )
  }
  ctx.stroke()

  ctx.fillStyle = '#d6fff0'
  for (const pulse of pulses) {
    const point = bezierPoint(curve, pulse)
    ctx.globalAlpha = alpha * Math.min(1, (1 - pulse) * 6)
    ctx.beginPath()
    ctx.arc(point.x, point.y, 3.1, 0, TAU)
    ctx.fill()
  }
}

function paintCell(ctx: CanvasRenderingContext2D, cell: Cell, breath: number, view: TissueView, role: 'cell' | 'nucleus' | 'bud') {
  const alpha = 1 - cell.dim * .68
  const swollen = Math.min(1, cell.swell)
  const reach = Math.max(cell.rx, cell.ry)

  traceOutline(ctx, cell, breath, 1, 0)
  const body = ctx.createRadialGradient(cell.x - cell.rx * .18, cell.y + cell.ry * .22, 0, cell.x, cell.y, reach * 1.05)
  const density = Math.round((.2 + view.cytoplasm * .62) * (1 - swollen * .12) * 255).toString(16).padStart(2, '0')
  body.addColorStop(0, `${tints[cell.spec.tint]}${density}`)
  body.addColorStop(1, swollen > .2 ? `#1d1229${density}` : `${tints[cell.spec.tint]}26`)
  ctx.globalAlpha = alpha
  ctx.fillStyle = swollen > .5 ? '#170e22' : PLUM
  ctx.fill()
  ctx.fillStyle = body
  ctx.fill()

  // Pleats lag the membrane's breath, so the ripple travels inward. A swollen organ keeps them near the rim.
  ctx.strokeStyle = PEARL
  ctx.lineWidth = .6
  PLEATS.forEach((depth, index) => {
    const scale = 1 - (1 - depth) * (role === 'bud' ? .8 : 1 - swollen * .72)
    ctx.globalAlpha = alpha * (.36 - index * .055)
    traceOutline(ctx, cell, breath, scale, (index + 1) * .42)
    ctx.stroke()
  })

  if (role !== 'bud') {
    const inner = .56 + swollen * .36
    ctx.globalAlpha = alpha * .34
    ctx.beginPath()
    for (const theta of cell.spines) {
      const from = membranePoint(cell, theta, breath, inner, 1.6)
      const to = membranePoint(cell, theta, breath, 1.05)
      ctx.moveTo(from.x, from.y)
      ctx.lineTo(to.x, to.y)
    }
    ctx.stroke()
    ctx.fillStyle = PEARL
    ctx.globalAlpha = alpha * .8
    for (const theta of cell.spines) {
      const tip = membranePoint(cell, theta, breath, 1.05)
      const pore = membranePoint(cell, theta, breath, (inner + 1) / 2, .8)
      ctx.fillRect(tip.x - .9, tip.y - .9, 1.8, 1.8)
      ctx.fillRect(pore.x - .6, pore.y - .6, 1.2, 1.2)
    }
  }

  ctx.strokeStyle = cell.flash > .05 ? AQUA : PEARL
  ctx.lineWidth = 1.2 + cell.flash * 1.4
  ctx.globalAlpha = alpha * (.82 + cell.flash * .18)
  traceOutline(ctx, cell, breath, 1, 0)
  ctx.stroke()
  ctx.lineWidth = .6
  ctx.globalAlpha = alpha * .42
  traceOutline(ctx, cell, breath, 1.045, .2)
  ctx.stroke()

  if (role === 'nucleus') {
    ctx.strokeStyle = AQUA
    ctx.lineWidth = .8
    for (const scale of [.2, .31, .42]) {
      ctx.globalAlpha = .7 - scale
      ctx.beginPath()
      ctx.ellipse(cell.x, cell.y - cell.ry * .34, cell.rx * scale, cell.ry * scale * .8, .3, 0, TAU)
      ctx.stroke()
    }
  }
  if (view.stress && role === 'cell') {
    ctx.strokeStyle = CORAL
    ctx.lineWidth = .8
    ctx.globalAlpha = alpha * (.35 + .3 * Math.sin(view.time * .012))
    traceOutline(ctx, cell, breath * 1.7, 1.09 + .012 * Math.sin(view.time * .009), 0)
    ctx.stroke()
  }
}

function paintFilament(ctx: CanvasRenderingContext2D, cell: Cell, trace: readonly number[], breath: number) {
  const low = Math.min(...trace)
  const span = Math.max(.6, Math.max(...trace) - low)
  const left = cell.x - cell.rx * .76
  const width = cell.rx * 1.52
  const base = cell.y + cell.ry * .2
  ctx.strokeStyle = AQUA
  ctx.fillStyle = AQUA
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  let previous: Vec | null = null
  for (let index = 0; index < trace.length; index++) {
    const t = index / (trace.length - 1)
    const point: Vec = { x: left + t * width, y: base - ((trace[index] - low) / span - .5) * 62 + Math.sin(breath * .6 + t * 5) * 2.5 }
    if (previous) {
      ctx.lineWidth = .7 + t * 2
      ctx.globalAlpha = .35 + t * .65
      ctx.beginPath()
      ctx.moveTo(previous.x, previous.y)
      ctx.lineTo(point.x, point.y)
      ctx.stroke()
    }
    previous = point
  }
  if (!previous) return
  ctx.globalAlpha = 1
  ctx.beginPath()
  ctx.arc(previous.x, previous.y, 3.6, 0, TAU)
  ctx.fill()
}

/** Resonance rings: closed curves whose standing-wave order follows the track's pitch. */
function paintResonance(ctx: CanvasRenderingContext2D, cell: Cell, organ: Extract<Organ, { kind: 'media' }>, time: number) {
  const centre = { x: cell.x + cell.rx * .4, y: cell.y - cell.ry * .1 }
  const order = Math.round(organ.frequency / 11)
  const drive = organ.playing ? Math.sin(time * .0052) : .22
  ctx.strokeStyle = AQUA
  ctx.lineWidth = .9
  for (let ring = 0; ring < 6; ring++) {
    const radius = 11 + ring * 8
    ctx.globalAlpha = .82 - ring * .11
    ctx.beginPath()
    for (let step = 0; step <= 90; step++) {
      const theta = step / 90 * TAU
      const wobble = 1 + .09 * drive * Math.sin(order * theta + ring * .9) * (ring + 1) / 4
      const x = centre.x + Math.cos(theta) * radius * wobble
      const y = centre.y + Math.sin(theta) * radius * wobble * .82
      if (step) ctx.lineTo(x, y)
      else ctx.moveTo(x, y)
    }
    ctx.stroke()
  }
  const angle = organ.progress * TAU - Math.PI / 2
  ctx.fillStyle = CORAL
  ctx.globalAlpha = 1
  ctx.beginPath()
  ctx.arc(centre.x + Math.cos(angle) * 58, centre.y + Math.sin(angle) * 58 * .82, 3.4, 0, TAU)
  ctx.fill()
}

export function paintTissue(ctx: CanvasRenderingContext2D, tissue: Tissue, view: TissueView) {
  const { breath, cells } = tissue
  ctx.globalAlpha = 1
  paintBackdrop(ctx, breath)

  tissue.vessels.forEach((vessel, index) => {
    const pulses = tissue.pulses.filter((pulse) => pulse.vessel === index).map((pulse) => pulse.t)
    const alpha = (1 - cells[vessel.to].dim * .5) * (vessel.from === CORE ? .7 : 1)
    paintVessel(ctx, vesselCurve(tissue, index), pulses, breath, index, alpha)
  })

  // The swollen organ is drawn last so that it lies over the cells it has pushed aside.
  const order = cells.map((_, index) => index).sort((a, b) => cells[a].swell - cells[b].swell)
  for (const index of order) paintCell(ctx, cells[index], breath, view, index === NUCLEUS ? 'nucleus' : index >= FIRST_BUD ? 'bud' : 'cell')

  if (view.organ && tissue.selected >= 0 && tissue.swell > .8) {
    const organCell = cells[tissue.selected]
    if (view.organ.kind === 'telemetry') paintFilament(ctx, organCell, view.organ.trace, breath)
    else paintResonance(ctx, organCell, view.organ, view.time)
  }
  ctx.globalAlpha = 1
}
