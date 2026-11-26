import { CODE_MODULES, COORDINATES, MARK_RISE, MAX_PARTICLES, SURFACE } from './cloud'
import type { Cloud } from './cloud'

const WHITE = '#ffffff'
const RED = '#ff4057'
const CYAN = '#24e9ff'
const RULER = '#c7e1e9'
const MONO = '6px ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace'
const TAU = Math.PI * 2
const ENERGETIC = .58
const CODE = { x: 24, y: 150, width: 329, height: 7 }

type QuantumView = {
  time: number
  count: number
  dispersion: number
  stress: boolean
  observed: number
  code: readonly boolean[]
  trace: readonly number[]
  frame: number
  strobe: number
}

const screenX = new Float32Array(MAX_PARTICLES)
const screenY = new Float32Array(MAX_PARTICLES)

function paintRulers(ctx: CanvasRenderingContext2D) {
  ctx.strokeStyle = RULER
  ctx.lineWidth = 1
  for (const major of [false, true]) {
    ctx.globalAlpha = major ? .46 : .2
    ctx.beginPath()
    for (let tick = 0; tick < 68; tick++) {
      if (tick % 5 === 0 !== major) continue
      const y = 105.5 + tick * 10
      const length = major ? 9 : 5
      ctx.moveTo(3, y)
      ctx.lineTo(3 + length, y)
      ctx.moveTo(SURFACE.width - 3 - length, y)
      ctx.lineTo(SURFACE.width - 3, y)
    }
    for (let tick = 0; tick < 34; tick++) {
      if (tick % 5 === 0 !== major) continue
      const x = 23.5 + tick * 10
      ctx.moveTo(x, 821)
      ctx.lineTo(x, 821 + (major ? 7 : 4))
    }
    ctx.stroke()
  }
}

function paintData(ctx: CanvasRenderingContext2D, view: QuantumView) {
  const invert = view.strobe > .55
  ctx.fillStyle = WHITE
  ctx.globalAlpha = .86
  const module = CODE.width / CODE_MODULES
  view.code.forEach((bit, index) => {
    if (bit !== invert) ctx.fillRect(CODE.x + index * module, CODE.y, module - .8, CODE.height)
  })

  ctx.font = MONO
  ctx.textBaseline = 'middle'
  ctx.fillStyle = RULER
  ctx.globalAlpha = .46
  ctx.textAlign = 'right'
  const rows = Math.min(view.trace.length, 46)
  for (let row = 0; row < rows; row++) {
    const sample = view.trace[view.trace.length - 1 - row]
    ctx.fillText((Math.round(sample * 10) & 0xfff).toString(16).padStart(3, '0').toUpperCase(), 361, 238 + row * 11)
  }
  ctx.textAlign = 'left'
  for (let bit = 0; bit < 16; bit++) ctx.fillText(view.frame >> (15 - bit) & 1 ? '1' : '0', 16, 238 + bit * 11)
}

function paintReferences(ctx: CanvasRenderingContext2D, cloud: Cloud, view: QuantumView) {
  ctx.font = MONO
  ctx.textBaseline = 'middle'
  ctx.lineWidth = 1
  COORDINATES.forEach((coordinate, index) => {
    const strength = view.observed === index ? cloud.collapse[index] : 0
    const y = coordinate.y - MARK_RISE + .5
    const x = coordinate.x + .5
    const leftward = coordinate.x < SURFACE.width / 2
    const fade = 1 - cloud.measure
    ctx.strokeStyle = RULER
    ctx.fillStyle = RULER
    ctx.globalAlpha = .2 * fade
    ctx.beginPath()
    ctx.moveTo(leftward ? 12 : SURFACE.width - 12, y)
    ctx.lineTo(x + (leftward ? -9 : 9), y)
    ctx.stroke()
    ctx.globalAlpha = .6 * fade
    ctx.textAlign = leftward ? 'left' : 'right'
    ctx.fillText(`Y ${String(coordinate.y).padStart(3, '0')}`, leftward ? 28 : SURFACE.width - 28, y - 6)
    if (strength < .02) return

    ctx.strokeStyle = CYAN
    ctx.fillStyle = CYAN
    ctx.globalAlpha = .46 * strength
    ctx.beginPath()
    ctx.moveTo(12, y)
    ctx.lineTo(SURFACE.width - 12, y)
    ctx.moveTo(x, 168)
    ctx.lineTo(x, 818)
    ctx.stroke()
    ctx.globalAlpha = strength
    ctx.fillRect(0, y - 1.5, 12, 3)
    ctx.fillRect(SURFACE.width - 12, y - 1.5, 12, 3)
    ctx.fillRect(x - 1.5, 818, 3, 10)
    ctx.textAlign = 'left'
    ctx.fillText(`X ${String(coordinate.x).padStart(3, '0')}`, x + 6, 811)
  })
}

function paintSamples(ctx: CanvasRenderingContext2D, cloud: Cloud, view: QuantumView) {
  const { count, time, stress } = view
  const amplitude = stress ? 5.5 : 1.5
  const pace = stress ? .0064 : .0017
  for (let index = 0; index < count; index++) {
    const phase = cloud.phase[index]
    const wobble = Math.sin(time * pace + phase * 40) * amplitude
    const scatter = cloud.burst * (10 + 46 * cloud.energy[index])
    screenX[index] = cloud.x[index] + wobble + Math.cos(phase * TAU * 3) * scatter
    screenY[index] = cloud.y[index] + wobble * .5 + Math.sin(phase * TAU * 3) * scatter
  }

  ctx.fillStyle = WHITE
  for (const [floor, ceiling, alpha, size] of [[0, .25, .22, .8], [.25, .6, .46, 1], [.6, 2, .86, 1.2]] as const) {
    ctx.globalAlpha = alpha
    for (let index = 0; index < count; index++) {
      const value = cloud.alpha[index]
      if (cloud.energy[index] > ENERGETIC || value < floor || value >= ceiling) continue
      ctx.fillRect(screenX[index], screenY[index], size, size)
    }
  }

  // Energetic samples are drawn as a red and a cyan component. With no separation the two add up to white.
  const separation = view.dispersion * (stress ? 1.75 : .92) * (1 + cloud.burst * 1.5)
  ctx.globalCompositeOperation = 'lighter'
  for (const [color, side] of [[RED, -1], [CYAN, 1]] as const) {
    ctx.fillStyle = color
    for (const [floor, ceiling, alpha] of [[0, .6, .62], [.6, 2, 1]] as const) {
      ctx.globalAlpha = alpha
      for (let index = 0; index < count; index++) {
        const energy = cloud.energy[index]
        const value = cloud.alpha[index]
        if (energy <= ENERGETIC || value < floor || value >= ceiling) continue
        ctx.fillRect(screenX[index] + side * separation * energy, screenY[index], 1.5, 1.5)
      }
    }
  }
  ctx.globalCompositeOperation = 'source-over'
}

export function paintCloud(ctx: CanvasRenderingContext2D, cloud: Cloud, view: QuantumView) {
  ctx.globalAlpha = 1
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, SURFACE.width, SURFACE.height)
  paintRulers(ctx)
  paintData(ctx, view)
  paintReferences(ctx, cloud, view)
  paintSamples(ctx, cloud, view)
  if (view.strobe > 0) {
    ctx.fillStyle = WHITE
    ctx.globalAlpha = view.strobe * .7
    ctx.fillRect(0, 105 + (1 - view.strobe) * 716, SURFACE.width, 1)
  }
  ctx.globalAlpha = 1
}
