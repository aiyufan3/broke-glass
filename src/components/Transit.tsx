import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from 'react'
import { SURFACE } from '../data/paradigms'
import { LAB_BONE, LAB_INK, paintPlate } from './plates'

/** What the one live core holds at the moment of a switch: the only things every paradigm shares. */
export type Core = { trace: readonly number[]; log: string; media: string; progress: number; from: string; to: string }

export type TransitHandle = {
  /** Covers the specimen with the lab's ground while its plate is still on the way. */
  veil: () => void
  /** Halftone to picture: the plate's dots gain until they close over into the live specimen. */
  develop: (levels: readonly number[]) => Promise<boolean>
  /** Picture to halftone: the specimen is screened back down to its plate, which is left standing. */
  screen: (levels: readonly number[]) => Promise<boolean>
  /** One paradigm to another by way of the core: its samples leave the first geometry and seat in the second. */
  migrate: (core: Core, commit: () => void) => Promise<boolean>
  clear: () => void
}

const SAMPLES = 48
/** A layer mounted veiled for a plate that never arrives clears itself after this long, so a device is never left black. */
const ORPHAN_MS = 1600
/** How long a plate stands on the device before it leaves, when the layer already covers the specimen. */
const STAND_MS = 110
const DEVELOP_MS = 560
const SCREEN_MS = 340
const LEAVE_MS = 260
const HOLD_MS = 220
const SEAT_MS = 360
/**
 * Gain at which every hole of a plate overlaps its neighbours, so a punched plate with no paper left
 * is clear: the smallest dot, sqrt(.03) of its cell, reaches a full cell at (1 - .173) / (1.08 - .173).
 */
const OPEN = .92
const MONO = '600 9px ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace'
/** The trace as the core holds it: a row of samples across the middle of the surface. */
const ROW = { left: 44, right: SURFACE.width - 44, y: 404, swing: 64 }

type Seat = { x: number; y: number; colour: [number, number, number] }

const clamp = (value: number) => Math.min(1, Math.max(0, value))
const ease = (t: number) => t * t * (3 - 2 * t)
const bone: [number, number, number] = [0xe9, 0xe7, 0xe1]

/**
 * Where a paradigm's picture carries its marks: the cells of its largest canvas that stand furthest
 * from that canvas's own ground, spread apart, in surface coordinates and in the colour painted there.
 * Read from the pixels, so no paradigm has to say where its geometry is.
 */
function seats(surface: Element, count: number): Seat[] {
  const frame = surface.getBoundingClientRect()
  const source = [...surface.querySelectorAll('canvas')]
    .filter((canvas) => !canvas.classList.contains('transit') && canvas.width > 0 && canvas.offsetWidth > 0)
    .sort((a, b) => b.offsetWidth * b.offsetHeight - a.offsetWidth * a.offsetHeight)[0]
  if (!source || !frame.width) return []
  const box = source.getBoundingClientRect()
  const columns = 72
  const rows = Math.max(1, Math.round(columns * box.height / box.width))
  const copy = new OffscreenCanvas(columns, rows)
  const context = copy.getContext('2d', { willReadFrequently: true })
  if (!context) return []
  context.drawImage(source, 0, 0, columns, rows)
  const { data } = context.getImageData(0, 0, columns, rows)
  const light = new Float32Array(columns * rows)
  for (let cell = 0; cell < light.length; cell++) light[cell] = .2126 * data[cell * 4] + .7152 * data[cell * 4 + 1] + .0722 * data[cell * 4 + 2]
  const ground = [...light].sort((a, b) => a - b)[light.length >> 1]
  const ranked = [...light.keys()].filter((cell) => data[cell * 4 + 3] > 8).sort((a, b) => Math.abs(light[b] - ground) - Math.abs(light[a] - ground))
  const picked: number[] = []
  // Spread first; if the picture has few marks, let later seats sit closer together.
  for (let gap = 8; gap >= 2 && picked.length < count; gap -= 2) {
    for (const cell of ranked) {
      if (picked.length >= count) break
      const x = cell % columns
      const y = Math.floor(cell / columns)
      if (picked.every((other) => Math.hypot(other % columns - x, Math.floor(other / columns) - y) >= gap)) picked.push(cell)
    }
  }
  return picked.map((cell): Seat => ({
    x: (box.left - frame.left + (cell % columns + .5) / columns * box.width) / frame.width * SURFACE.width,
    y: (box.top - frame.top + (Math.floor(cell / columns) + .5) / rows * box.height) / frame.height * SURFACE.height,
    colour: [data[cell * 4], data[cell * 4 + 1], data[cell * 4 + 2]],
  })).sort((a, b) => a.x - b.x)
}

/**
 * The layer every change of view passes through. It sits over the specimen inside the device and
 * draws the two transitions the lab has: a plate developing into its paradigm (and back), and the
 * core's samples migrating from one paradigm's geometry to the next.
 */
const Transit = forwardRef<TransitHandle, {
  veiled?: boolean
  /**
   * Told how much of the surface the lab's ground covers, 0 to 1, as it changes: a viewport that shows
   * ground around the surface lays the same amount of the lab's own there.
   */
  onVeil?: (amount: number) => void
}>(function Transit({ veiled = false, onVeil }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const turn = useRef(0)
  const veiledAtMount = useRef(veiled)
  /** Whether the layer hides the specimen, wholly or partly: every movement starts from what is on it, never from a guess. */
  const covered = useRef(false)
  const report = useRef(onVeil)
  useLayoutEffect(() => { report.current = onVeil })
  const veilBy = (amount: number) => report.current?.(amount)

  // Sized, and veiled when a plate is on its way, before the specimen under it is first painted.
  useLayoutEffect(() => {
    const element = canvas.current
    if (!element) return
    const ratio = Math.min(2, Math.max(1, devicePixelRatio))
    element.width = Math.round(SURFACE.width * ratio)
    element.height = Math.round(SURFACE.height * ratio)
    const context = element.getContext('2d')
    context?.setTransform(ratio, 0, 0, ratio, 0, 0)
    let orphan = 0
    if (context && veiledAtMount.current) {
      context.fillStyle = LAB_INK
      context.fillRect(0, 0, SURFACE.width, SURFACE.height)
      covered.current = true
      veilBy(1)
      const waiting = turn.current
      orphan = window.setTimeout(() => {
        if (turn.current !== waiting) return
        context.clearRect(0, 0, SURFACE.width, SURFACE.height)
        covered.current = false
        veilBy(0)
      }, ORPHAN_MS)
    }
    // Unmounting takes the layer away from whatever transition is running.
    const counter = turn
    return () => {
      clearTimeout(orphan)
      counter.current++
    }
  }, [])

  useImperativeHandle(ref, () => {
    const context = () => canvas.current?.getContext('2d') ?? null
    const wipe = () => {
      context()?.clearRect(0, 0, SURFACE.width, SURFACE.height)
      covered.current = false
      veilBy(0)
    }

    // Runs `frame` from 0 to 1 over `ms`. Resolves false if another transition has taken the layer.
    // A timer backs the animation frames up, so a view change still completes in a hidden tab.
    const play = (ms: number, frame: (t: number) => void) => {
      const mine = ++turn.current
      return new Promise<boolean>((resolve) => {
        const start = performance.now()
        let settled = false
        const finish = (ok: boolean) => {
          if (settled) return
          settled = true
          clearTimeout(backstop)
          resolve(ok)
        }
        const step = (now: number) => {
          if (settled) return
          if (mine !== turn.current) return finish(false)
          const t = clamp((now - start) / ms)
          frame(t)
          if (t < 1) requestAnimationFrame(step)
          else finish(true)
        }
        const backstop = window.setTimeout(() => {
          if (mine === turn.current) frame(1)
          finish(mine === turn.current)
        }, ms + 120)
        requestAnimationFrame(step)
      })
    }

    const plate = (levels: readonly number[], gain: number, tint: number) => {
      const ctx = context()
      if (ctx) paintPlate(ctx, levels, SURFACE.width, SURFACE.height, { punch: true, gain, tint })
      covered.current = !(tint <= 0 && gain >= OPEN)
      // The plate's ground gives way as its holes open.
      veilBy(clamp(1 - gain))
    }

    return {
      veil() {
        turn.current++
        const ctx = context()
        if (!ctx) return
        ctx.fillStyle = LAB_INK
        ctx.fillRect(0, 0, SURFACE.width, SURFACE.height)
        covered.current = true
        veilBy(1)
      },
      async develop(levels) {
        covered.current = true
        // The paper leaves the dots first, so the picture is seen through its own halftone before the dots close.
        const done = await play(DEVELOP_MS, (t) => plate(levels, ease(clamp((t - .18) / .82)), 1 - clamp(t / .3)))
        if (done) wipe()
        return done
      },
      screen(levels) {
        // A layer that already hides the specimen (a plate still landing, a core still held) does not open
        // it again to screen it down: the plate is printed at once and stands for a moment.
        if (covered.current) return play(STAND_MS, () => plate(levels, 0, 1))
        covered.current = true
        return play(SCREEN_MS, (t) => plate(levels, 1 - ease(clamp(t / .78)), clamp((t - .55) / .45)))
      },
      async migrate(core, commit) {
        const surface = canvas.current?.parentElement
        const ctx = context()
        if (!surface || !ctx) {
          commit()
          return false
        }
        const trace = core.trace.slice(-SAMPLES)
        const low = Math.min(...trace)
        const span = Math.max(.001, Math.max(...trace) - low)
        const weight = trace.map((value) => (value - low) / span)
        const row = trace.map((_, index): Seat => ({
          x: ROW.left + index * (ROW.right - ROW.left) / Math.max(1, trace.length - 1),
          y: ROW.y + (.5 - weight[index]) * ROW.swing,
          colour: bone,
        }))
        // A paradigm with fewer marks than samples lends the row's own places for the rest.
        const seated = (found: Seat[]) => row.map((place, index) => found[Math.round(index * (found.length - 1) / Math.max(1, row.length - 1))] ?? place)

        const draw = (from: Seat[], to: Seat[], travel: number, veil: number, legend: number, presence: number) => {
          covered.current = veil > .01
          veilBy(veil)
          ctx.clearRect(0, 0, SURFACE.width, SURFACE.height)
          ctx.globalAlpha = veil
          ctx.fillStyle = LAB_INK
          ctx.fillRect(0, 0, SURFACE.width, SURFACE.height)
          if (legend > 0) {
            ctx.globalAlpha = legend * .3
            ctx.strokeStyle = LAB_BONE
            ctx.lineWidth = .75
            ctx.beginPath()
            row.forEach((place, index) => index ? ctx.lineTo(place.x, place.y) : ctx.moveTo(place.x, place.y))
            ctx.stroke()
            ctx.globalAlpha = legend
            ctx.fillStyle = LAB_BONE
            ctx.font = MONO
            ctx.textBaseline = 'alphabetic'
            ctx.textAlign = 'left'
            ctx.fillText(`PL. ${core.from}  →  ${core.to}`, ROW.left, ROW.y - ROW.swing - 22)
            ctx.fillText(core.log, ROW.left, ROW.y + ROW.swing + 30, ROW.right - ROW.left)
            ctx.textAlign = 'right'
            ctx.fillText(`${trace.length} SAMPLES · ${trace[trace.length - 1].toFixed(1)} MS`, ROW.right, ROW.y - ROW.swing - 22)
            ctx.fillText(core.media, ROW.right, ROW.y + ROW.swing + 54)
            ctx.globalAlpha = legend * .45
            ctx.fillRect(ROW.left, ROW.y + ROW.swing + 44, ROW.right - ROW.left, .75)
            ctx.globalAlpha = legend
            ctx.fillRect(ROW.left + (ROW.right - ROW.left) * clamp(core.progress) - .5, ROW.y + ROW.swing + 40, 1.5, 9)
          }
          ctx.globalAlpha = presence
          row.forEach((_, index) => {
            const a = from[index]
            const b = to[index]
            // Samples leave in order, the oldest first, so the trace is seen to pour across.
            const local = ease(clamp(travel * 1.6 - index / row.length * .6))
            ctx.fillStyle = `rgb(${a.colour.map((value, channel) => Math.round(value + (b.colour[channel] - value) * local)).join(' ')})`
            ctx.beginPath()
            ctx.arc(a.x + (b.x - a.x) * local, a.y + (b.y - a.y) * local, 1.5 + weight[index] * 2.4, 0, Math.PI * 2)
            ctx.fill()
          })
          ctx.globalAlpha = 1
        }

        // From a layer that already hides the specimen, the samples are already the bare core: no specimen
        // is uncovered on the way, the veil and the row are simply there.
        const fromCovered = covered.current
        covered.current = true
        const left = fromCovered ? row : seated(seats(surface, SAMPLES))
        const leave = fromCovered
          ? play(LEAVE_MS * .5, (t) => draw(row, row, 1, 1, Math.max(.6, ease(t)), 1))
          : play(LEAVE_MS, (t) => draw(left, row, t, ease(t), ease(clamp((t - .4) / .6)), 1))
        if (!await leave) return false
        commit()
        // The next paradigm mounts and paints its first frame under the veil while the core is held bare.
        if (!await play(HOLD_MS, () => draw(row, row, 1, 1, 1, 1))) return false
        const arrived = seated(seats(surface, SAMPLES))
        const done = await play(SEAT_MS, (t) => draw(row, arrived, t, 1 - ease(clamp(t / .9)), 1 - ease(clamp(t / .45)), 1 - clamp((t - .72) / .28)))
        if (done) wipe()
        return done
      },
      clear() {
        turn.current++
        wipe()
      },
    }
  }, [])

  return <canvas ref={canvas} className="transit" aria-hidden="true" />
})

export default Transit

/**
 * A plate in flight between the index and the device: the same halftone, carried from one frame to
 * the other. Resolves when it lands; `cancel` removes it at once.
 */
export function flyPlate(levels: readonly number[], from: DOMRect, to: DOMRect, ms = 380, radius: { from?: number; to?: number } = {}) {
  const ghost = document.createElement('canvas')
  const ratio = Math.min(2, Math.max(1, devicePixelRatio))
  ghost.className = 'plate-ghost'
  ghost.width = Math.round(to.width * ratio)
  ghost.height = Math.round(to.height * ratio)
  Object.assign(ghost.style, { left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px` })
  const context = ghost.getContext('2d')
  if (context) paintPlate(context, levels, ghost.width, ghost.height)
  document.body.append(ghost)
  // Corners travel with the plate: square in the index, the screen's own curve on the device. The
  // radius is set in the ghost's frame, so the scale it starts at is divided out.
  const sx = from.width / to.width
  const sy = from.height / to.height
  const start = radius.from ?? 0
  const flight = ghost.animate([
    { transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${sx}, ${sy})`, borderRadius: `${start / sx}px / ${start / sy}px` },
    { transform: 'none', borderRadius: `${radius.to ?? 0}px` },
  ], { duration: ms, easing: 'cubic-bezier(.2, .7, .2, 1)', fill: 'both' })
  const landed = flight.finished.then(() => true, () => false)
  return { landed, cancel: () => { flight.cancel(); ghost.remove() }, remove: () => ghost.remove() }
}
