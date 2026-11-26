export const SCAN = { width: 377, height: 164 } as const
const SCAN_DESIGN_HEIGHT = 126
const DATUM = 4
export const SCOPE = { width: 377, height: 52 } as const
export const SPARK = { width: 64, height: 28 } as const
export const STRIP = { width: 357, height: 62 } as const
export const LINES = 32
export const SAMPLES = 87
export const LINES_PER_CHANNEL = 8
const MICRONS_PER_UNIT = 1.6
const REST_BEAM = .5

export type Sweep = { beam: number; pass: number }

export function createSweep(): Sweep {
  return { beam: REST_BEAM, pass: 0 }
}

/** Seconds per pass. The stress penalty and the floor match the range of the Scan Sweep Rate control. */
export function sweepSeconds(rate: number, stress: boolean) {
  return Math.max(.5, 6 - rate * .046 - (stress ? .7 : 0))
}

export function advanceSweep(sweep: Sweep, seconds: number, period: number) {
  sweep.beam += seconds / period
  if (sweep.beam < 1) return
  sweep.beam %= 1
  sweep.pass++
}

export function restSweep(sweep: Sweep) {
  sweep.beam = REST_BEAM
}

export function retrigger(sweep: Sweep) {
  sweep.beam = 0
  sweep.pass++
}

/**
 * Specimen height at normalized scan position `u` and depth `depth`. Two Gaussian ridges sit on
 * fine roughness; every pass shifts the ridges slightly, so a new pass never repeats the last.
 */
export function relief(u: number, depth: number, pass: number) {
  const ridgeA = Math.exp(-((u - .37 - .11 * depth - .03 * Math.sin(pass * .9)) ** 2 / .021 + (depth - .49) ** 2 / .12))
  const ridgeB = Math.exp(-((u - .68 + .08 * depth - .025 * Math.cos(pass * 1.3)) ** 2 / .015 + (depth - .67) ** 2 / .09))
  const roughness = Math.sin(u * 65 + depth * 4 + pass * .6) * Math.sin(depth * 26 + u * 11) * 3.5
  return ridgeA * 49 + ridgeB * 31 + roughness
}

/** Oblique projection of a specimen point onto a scan canvas of the given height. */
export function project(u: number, depth: number, height: number, canvasHeight: number): [number, number] {
  return [8 + u * 322 + depth * 40, (50 + depth * 62 - height * .9) * canvasHeight / SCAN_DESIGN_HEIGHT]
}

/** Deterministic shot noise in [-1, 1] for one acquired sample. */
export function shot(u: number, line: number, pass: number) {
  const value = Math.sin(u * 917.3 + line * 37.1 + pass * 11.7) * 43758.5453
  return (value - Math.floor(value)) * 2 - 1
}

/** Samples left of the beam belong to the current pass; samples it has not reached are from the last one. */
export function acquiredPass(u: number, sweep: Sweep) {
  return u <= sweep.beam ? sweep.pass : sweep.pass - 1
}

export function channelLine(channel: number) {
  return channel * LINES_PER_CHANNEL + LINES_PER_CHANNEL / 2 - 1
}

export function lineDepth(line: number) {
  return line / (LINES - 1)
}

export function profile(channel: number, sweep: Sweep, u: number) {
  return relief(u, lineDepth(channelLine(channel)), acquiredPass(u, sweep))
}

/** Heights are reported above a datum just below the deepest roughness, so readings stay positive. */
export function microns(height: number) {
  return (height + DATUM) * MICRONS_PER_UNIT
}

export function beamHeight(channel: number, sweep: Sweep) {
  return microns(relief(sweep.beam, lineDepth(channelLine(channel)), sweep.pass))
}

/** Extremes of the selected line, used to normalize its trace to the full scale of a display. */
export function profileRange(channel: number, sweep: Sweep) {
  let low = Infinity
  let high = -Infinity
  for (let sample = 0; sample < SAMPLES; sample++) {
    const height = profile(channel, sweep, sample / (SAMPLES - 1))
    low = Math.min(low, height)
    high = Math.max(high, height)
  }
  return { low, span: Math.max(4, high - low) }
}

export function findPeak(channel: number, sweep: Sweep) {
  let best = { u: 0, height: -Infinity }
  for (let sample = 0; sample < SAMPLES; sample++) {
    const u = sample / (SAMPLES - 1)
    const height = profile(channel, sweep, u)
    if (height > best.height) best = { u, height }
  }
  return best
}

export function traceStats(trace: readonly number[]) {
  const min = Math.min(...trace)
  const max = Math.max(...trace)
  return { min, max, mean: trace.reduce((sum, value) => sum + value, 0) / trace.length }
}

export function oscillator(wave: 'sine' | 'triangle', phase: number) {
  return wave === 'sine' ? Math.sin(phase) : 2 / Math.PI * Math.asin(Math.sin(phase))
}
