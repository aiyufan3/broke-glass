import sheet from '../../scripts/silhouettes.json'
import type { ParadigmId } from '../data/paradigms'

/**
 * The lab's own picture of each paradigm: its home screen under grayscale(1) blur(12px), averaged
 * on a 13 x 29 raster by `npm run silhouettes`. The index and every transition are drawn from
 * these plates, the same measurement the printed specimen sheet uses.
 */
export const RASTER = sheet.grid
export const LAB_INK = '#0b0b0c'
export const LAB_BONE = '#e9e7e1'

const plates = new Map(sheet.plates.map((plate) => {
  const cells = (plate.luminance.match(/../g) ?? []).map((pair) => parseInt(pair, 16))
  // Levels are stretched per plate, as on the specimen sheet: a dark interface would otherwise print empty.
  const floor = Math.min(...cells)
  const span = Math.max(1, Math.max(...cells) - floor)
  return [plate.id, cells.map((value) => (value - floor) / span)] as const
}))

/** Stretched luminance of every cell, 0 to 1, row by row. Empty for a paradigm that has not been measured. */
export function plateLevels(id: ParadigmId): readonly number[] {
  return plates.get(id) ?? []
}

/** Side of a halftone dot as a share of its cell: dot area follows the level. */
export const dotSide = (level: number) => Math.sqrt(.03 + .97 * level)

const paths = new Map<ParadigmId, string>()

/** The plate as one SVG path of square dots, in a box of `columns` x `rows` units. */
export function platePath(id: ParadigmId) {
  const known = paths.get(id)
  if (known !== undefined) return known
  const path = plateLevels(id).map((level, cell) => {
    const side = dotSide(level)
    const left = cell % RASTER.columns + .5 - side / 2
    const top = Math.floor(cell / RASTER.columns) + .5 - side / 2
    return `M${left.toFixed(3)} ${top.toFixed(3)}h${side.toFixed(3)}v${side.toFixed(3)}h${(-side).toFixed(3)}z`
  }).join('')
  paths.set(id, path)
  return path
}

/**
 * Paints a plate on a canvas `width` x `height`. `gain` runs every dot from its measured size (0) to
 * a full cell (1). With `punch`, the dots are cut out of the ground instead of printed on it, so
 * whatever lies under the canvas shows through them; `tint` then lays the paper colour back into the holes.
 */
export function paintPlate(ctx: CanvasRenderingContext2D, levels: readonly number[], width: number, height: number, options: { gain?: number; punch?: boolean; tint?: number } = {}) {
  const { gain = 0, punch = false, tint = 1 } = options
  const pitch = { x: width / RASTER.columns, y: height / RASTER.rows }
  const squares = () => {
    ctx.beginPath()
    levels.forEach((level, cell) => {
      const side = dotSide(level)
      const share = side + (1.08 - side) * gain
      const w = pitch.x * share
      const h = pitch.y * share
      ctx.rect((cell % RASTER.columns + .5) * pitch.x - w / 2, (Math.floor(cell / RASTER.columns) + .5) * pitch.y - h / 2, w, h)
    })
  }
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = LAB_INK
  ctx.fillRect(0, 0, width, height)
  if (punch) {
    ctx.globalCompositeOperation = 'destination-out'
    squares()
    ctx.fill()
    ctx.globalCompositeOperation = 'source-over'
  }
  if (!punch || tint > 0) {
    ctx.globalAlpha = punch ? tint : 1
    ctx.fillStyle = LAB_BONE
    squares()
    ctx.fill()
    ctx.globalAlpha = 1
  }
}
