import { CORE_X, FAULT_X, LITHOLOGIES, METRES_PER_PX, SECTION, SURFACE, boundaryAt, deform, gallery, veneerThickness } from './sediment'
import type { Strata } from './sediment'

const WATER_TOP = '#F1EADA'
const WATER_LOW = '#E3D7BD'
const VENEER = '#F4ECD6'
// The excavated gallery: the cut face, darker than any rock.
const VOID: readonly number[] = [23, 16, 11]
const OXIDE = '#B8401E'
const INK = '#1E1610'
const CHALK = '#EDE3CF'
const MONO = '500 8px ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace'
// Colour of sediment by depth: sand at the surface, ochre at mid-depth, umber at bedrock.
const RAMP: readonly [number, [number, number, number]][] = [[0, [216, 198, 161]], [.45, [156, 128, 94]], [1, [42, 29, 20]]]
const STEP = 6.5

type View = { probe: number | null }

// Sample positions across the section, with both sides of the fault so its throw is drawn as a step.
const columns = (() => {
  const xs: number[] = []
  for (let x = 0; x < SURFACE.width; x += STEP) xs.push(x)
  xs.push(FAULT_X, FAULT_X + .01, SURFACE.width)
  return xs.sort((a, b) => a - b)
})()

function ramp(depth: number, tone: number) {
  const f = Math.min(1, Math.max(0, depth))
  let index = 1
  while (index < RAMP.length - 1 && RAMP[index][0] < f) index++
  const [from, low] = RAMP[index - 1]
  const [to, high] = RAMP[index]
  const t = (f - from) / (to - from)
  const shade = 1 + tone * .07
  return low.map((value, channel) => Math.round(Math.min(255, (value + (high[channel] - value) * t) * shade)))
}

const rgb = ([r, g, b]: number[]) => `rgb(${r} ${g} ${b})`

/**
 * Lithology symbols of a stratigraphic column: sandstone stipple, shale dashes, limestone brick,
 * siltstone fine stipple and conglomerate pebbles. Each is a small repeating tile, inked or chalked.
 */
function tile(kind: number, colour: string) {
  const size = 18
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.strokeStyle = ctx.fillStyle = colour
  ctx.lineWidth = .8
  switch (kind) {
    case 0: for (const [x, y] of [[3, 4], [11, 2], [7, 10], [15, 12], [2, 15], [12, 16]]) ctx.fillRect(x, y, 1.1, 1.1); break
    case 1: ctx.beginPath(); ctx.moveTo(1, 5); ctx.lineTo(8, 5); ctx.moveTo(10, 13); ctx.lineTo(17, 13); ctx.stroke(); break
    case 2: ctx.strokeRect(.5, .5, size, 9); ctx.beginPath(); ctx.moveTo(9.5, 9.5); ctx.lineTo(9.5, size); ctx.stroke(); break
    case 3: for (let y = 2; y < size; y += 4) for (let x = (y % 8) / 2; x < size; x += 4) ctx.fillRect(x, y, .8, .8); break
    default: for (const [x, y, r] of [[5, 5, 2.2], [13, 11, 1.6], [4, 14, 1.3]]) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke() }
  }
  return canvas
}

const patterns = new WeakMap<CanvasRenderingContext2D, { ink: CanvasPattern[]; chalk: CanvasPattern[] }>()
function patternsFor(ctx: CanvasRenderingContext2D) {
  let set = patterns.get(ctx)
  if (!set) {
    const make = (colour: string) => Array.from({ length: LITHOLOGIES }, (_, kind) => ctx.createPattern(tile(kind, colour), 'repeat')!)
    set = { ink: make('#1e161066'), chalk: make('#ede3cf4d') }
    patterns.set(ctx, set)
  }
  return set
}

function trace(ctx: CanvasRenderingContext2D, strata: Strata, index: number, reverse: boolean) {
  const xs = reverse ? [...columns].reverse() : columns
  xs.forEach((x, position) => {
    const y = boundaryAt(strata, index, x)
    if (position || reverse) ctx.lineTo(x, y)
    else ctx.moveTo(x, y)
  })
}

export function paintStrata(ctx: CanvasRenderingContext2D, strata: Strata, view: View) {
  const height = SECTION.bottom - SECTION.top
  const opened = gallery(strata)
  const { ink, chalk } = patternsFor(ctx)

  // Water column, with grains settling onto the surface.
  const water = ctx.createLinearGradient(0, 0, 0, SECTION.top)
  water.addColorStop(0, WATER_TOP)
  water.addColorStop(1, WATER_LOW)
  ctx.fillStyle = water
  ctx.fillRect(0, 0, SURFACE.width, SURFACE.height)
  ctx.fillStyle = '#4a3a2b59'
  for (let index = 0; index < strata.grainX.length; index++) ctx.fillRect(strata.grainX[index], strata.grainY[index], 1.3, 1.3)

  // Basement below the deepest horizon, wherever the fold lifts it or the fault drops it.
  ctx.fillStyle = rgb(ramp(1, -.6))
  ctx.fillRect(0, SECTION.top + height * .6, SURFACE.width, SURFACE.height)

  // Beds: filled between their two horizons, coloured by depth, patterned by lithology.
  for (let bed = 0; bed < strata.beds; bed++) {
    ctx.beginPath()
    trace(ctx, strata, bed, false)
    trace(ctx, strata, bed + 1, true)
    ctx.closePath()
    const depth = ((strata.base[bed] + strata.base[bed + 1]) / 2 - SECTION.top) / height
    const excavated = opened?.bed === bed ? opened.open : 0
    const rock = ramp(depth, strata.tone[bed])
    ctx.fillStyle = excavated ? rgb(rock.map((value, channel) => value + (VOID[channel] - value) * excavated)) : rgb(rock)
    ctx.fill()
    if (excavated < .5) {
      ctx.globalAlpha = 1 - excavated * 2
      ctx.fillStyle = (depth < .5 ? ink : chalk)[strata.lithology[bed]]
      ctx.fill()
      ctx.globalAlpha = 1
    }
  }

  // Fresh sediment above the surface after every command.
  const veneer = veneerThickness(strata)
  if (veneer > .2) {
    ctx.beginPath()
    columns.forEach((x, position) => position ? ctx.lineTo(x, boundaryAt(strata, 0, x) - veneer) : ctx.moveTo(x, boundaryAt(strata, 0, x) - veneer))
    trace(ctx, strata, 0, true)
    ctx.closePath()
    ctx.fillStyle = VENEER
    ctx.fill()
    ctx.strokeStyle = '#8a6f5280'
    ctx.lineWidth = .6
    ctx.stroke()
  }

  // Horizons: inked in the pale upper section, chalked in the dark lower one; the surface is heaviest.
  ctx.lineJoin = 'round'
  for (let index = 0; index <= strata.beds; index++) {
    const depth = (strata.base[index] - SECTION.top) / height
    const cut = opened && opened.open > .02 && (index === opened.bed || index === opened.bed + 1)
    ctx.beginPath()
    trace(ctx, strata, index, false)
    ctx.strokeStyle = cut ? OXIDE : depth < .55 ? `rgb(30 22 16 / ${.62 - depth * .5})` : `rgb(237 227 207 / ${.12 + depth * .22})`
    ctx.lineWidth = index === 0 ? 1.4 : cut ? 1.2 : .7
    ctx.stroke()
  }

  if (strata.fault > .02) {
    ctx.save()
    ctx.setLineDash([5, 4])
    ctx.strokeStyle = OXIDE
    ctx.globalAlpha = strata.fault
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(FAULT_X, deform(strata, SECTION.top, FAULT_X) - 10)
    ctx.lineTo(FAULT_X, SURFACE.height)
    ctx.stroke()
    ctx.restore()
  }

  // The core: one drilled line from a collar above the surface to the bit, with a depth scale.
  const collar = deform(strata, SECTION.top, CORE_X) - 28
  const bit = deform(strata, strata.drill, CORE_X)
  ctx.fillStyle = OXIDE
  ctx.fillRect(CORE_X - 1.5, collar, 3, bit - collar)
  ctx.beginPath()
  ctx.moveTo(CORE_X - 5, bit)
  ctx.lineTo(CORE_X + 5, bit)
  ctx.lineTo(CORE_X, bit + 8)
  ctx.closePath()
  ctx.fill()
  ctx.font = MONO
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  const metres = 25
  for (let depth = metres; SECTION.top + depth / METRES_PER_PX < SECTION.bottom; depth += metres) {
    const y = deform(strata, SECTION.top + depth / METRES_PER_PX, CORE_X)
    const dark = (y - SECTION.top) / height > .5
    ctx.fillStyle = dark ? CHALK : INK
    ctx.fillRect(CORE_X - (depth % 50 ? 5 : 9), y - .5, depth % 50 ? 4 : 8, 1)
    if (!(depth % 50)) ctx.fillText(`${depth}`, CORE_X - 12, y)
  }

  // The operator's probe: a level line across the section at the pointer depth.
  if (view.probe !== null && view.probe > SECTION.top && view.probe < SECTION.bottom) {
    ctx.strokeStyle = OXIDE
    ctx.globalAlpha = .75
    ctx.lineWidth = .8
    ctx.setLineDash([2, 3])
    ctx.beginPath()
    ctx.moveTo(0, view.probe)
    ctx.lineTo(CORE_X - 14, view.probe)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.globalAlpha = 1
  }
}

/** A well log of the latency trace: the newest sample at the top, older samples deeper, like a core. */
export function paintWellLog(ctx: CanvasRenderingContext2D, trace: readonly number[], stress: boolean, width: number, height: number) {
  ctx.clearRect(0, 0, width, height)
  const low = Math.min(...trace)
  const high = Math.max(...trace)
  const span = Math.max(1, high - low)
  ctx.strokeStyle = '#ede3cf33'
  ctx.lineWidth = 1
  for (let x = .5; x < width; x += width / 4) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, height)
    ctx.stroke()
  }
  ctx.beginPath()
  trace.forEach((value, index) => {
    const y = (trace.length - 1 - index) / (trace.length - 1) * (height - 2) + 1
    const x = 4 + (value - low) / span * (width - 8)
    if (index) ctx.lineTo(x, y)
    else ctx.moveTo(x, y)
  })
  ctx.strokeStyle = stress ? OXIDE : CHALK
  ctx.lineWidth = 1.2
  ctx.stroke()
}
