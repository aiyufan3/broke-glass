import { describe, expect, test } from 'vitest'
import { BODY_HOMES, RIM, bodyReading, createField, crossings, emitRipple, polar, probeReading, rimRadius, settleField, stepField, totalMass, waveRadius, waveStrength } from '../../src/themes/field/potential'
import type { FieldInputs } from '../../src/themes/field/potential'
import { BANDS, COORDINATES, CODE_MODULES, createCloud, encodeBits, kick, settleCloud, stepCloud } from '../../src/themes/quantum/cloud'
import type { Formation } from '../../src/themes/quantum/cloud'
import { clipNear, createFlight, exposure, nearPlane, previewTilt, sendPulse, settleFlight, stepFlight } from '../../src/themes/spatial/camera'
import type { Vec3 } from '../../src/themes/spatial/camera'
import {
  LINES, LINES_PER_CHANNEL, SAMPLES, acquiredPass, beamHeight, channelLine, createSweep, findPeak, lineDepth, microns, oscillator,
  profile, profileRange, project, relief, restSweep, retrigger, shot, traceStats,
} from '../../src/themes/telemetry/signal'
import {
  CORE_X, FAULT_X, GALLERY, LITHOLOGIES, MAX_BEDS, METRES_PER_PX, MIN_BEDS, MODULE_BEDS, SECTION, SPAN_KA, boundaryAt, createStrata, deform, deposit,
  excavation, gallery, moduleBed, reading, restBoundaries, settleStrata, stepStrata, undeform, veneerThickness,
} from '../../src/themes/strata/sediment'
import type { Strata, StrataInputs } from '../../src/themes/strata/sediment'
import { CORE, NUCLEUS, PULSE_HOLD_MS, bezierPoint, bezierTangent, createTissue, firePulse, settleTissue, stepTissue, vesselCurve } from '../../src/themes/wetware/tissue'

const FRAME = 1 / 60
const steps = (seconds: number) => Math.round(seconds / FRAME)

describe('FieldOS · potential', () => {
  const rest: FieldInputs = { warp: .58, levels: 30, drift: 0, stress: false, selected: -1 }

  test('a condensed workspace clears every contour inside the rim and parks the selected body on the core', () => {
    const field = createField()
    settleField(field, { ...rest, selected: 1 }, 0)
    expect(rimRadius(field)).toBe(RIM)
    expect(field.bodies[1]).toMatchObject({ x: field.core.x, y: field.core.y })
    expect(field.bodies[0]).toMatchObject(BODY_HOMES[0])
    let nearest = Infinity
    for (const { data, count } of [field.major, field.minor]) {
      for (let index = 0; index < count * 4; index += 2) nearest = Math.min(nearest, Math.hypot(data[index] - field.core.x, data[index + 1] - field.core.y))
    }
    expect(field.major.count + field.minor.count).toBeGreaterThan(500)
    expect(nearest).toBeGreaterThan(RIM - .5)
  })

  test('total mass scales linearly with Gravity Warp and stress only ever adds load', () => {
    const massAt = (warp: number, stress: boolean, time: number) => {
      const field = createField()
      settleField(field, { ...rest, warp, stress }, time)
      return totalMass(field)
    }
    expect(massAt(.5, false, 0) / massAt(1, false, 0)).toBeCloseTo(.5, 12)
    expect(massAt(0, false, 0)).toBe(0)
    for (const time of [0, 120, 240, 360, 480]) expect(massAt(.58, true, time)).toBeGreaterThan(massAt(.58, false, time))
  })

  test('two wave fronts cross on both circles, and separated or nested circles never cross', () => {
    const a = { x: 40, y: 60 }
    const b = { x: 130, y: 20 }
    const points = crossings(a, 80, b, 70)
    expect(points).not.toBeNull()
    for (const point of points!) {
      expect(Math.hypot(point.x - a.x, point.y - a.y)).toBeCloseTo(80, 9)
      expect(Math.hypot(point.x - b.x, point.y - b.y)).toBeCloseTo(70, 9)
    }
    expect(crossings(a, 10, b, 10)).toBeNull()
    expect(crossings(a, 200, { x: 45, y: 60 }, 20)).toBeNull()
    expect(crossings(a, 50, a, 50)).toBeNull()
  })

  test('each wave front leaves after its stagger, grows at a constant speed and fades to nothing', () => {
    expect(waveRadius(0, 2)).toBe(0)
    const radii = [.2, .4, .6, .8].map((age) => waveRadius(age, 1))
    radii.slice(1).forEach((radius, index) => expect(radius - radii[index]).toBeCloseTo(radii[1] - radii[0], 9))
    expect(waveStrength(0)).toBe(1)
    expect(waveStrength(.5)).toBeLessThan(1)
    expect(waveStrength(5)).toBe(0)
    const point = polar({ x: 10, y: 10 }, 90, 30)
    expect(point.x).toBeCloseTo(10, 9)
    expect(point.y).toBeCloseTo(40, 9)
  })

  test('a ripple bends the field while it travels and is gone after its lifetime', () => {
    const field = createField()
    settleField(field, rest, 0)
    const before = Float32Array.from(field.potential)
    emitRipple(field, 6)
    for (let step = 0; step < 12; step++) stepField(field, rest, step * 1000 * FRAME, 1000 * FRAME)
    expect(field.ripples).toHaveLength(1)
    expect(field.potential.some((value, index) => Math.abs(value - before[index]) > 1)).toBe(true)
    for (let step = 12; step < steps(1.6); step++) stepField(field, rest, step * 1000 * FRAME, 1000 * FRAME)
    expect(field.ripples).toHaveLength(0)
  })

  test('closing the workspace releases every body from the core and springs it back home', () => {
    const field = createField()
    settleField(field, { ...rest, selected: 2 }, 0)
    const origin = { ...field.core }
    stepField(field, rest, 0, 1)
    for (const body of field.bodies) expect(Math.hypot(body.x - origin.x, body.y - origin.y)).toBeLessThan(.5)
    for (let step = 1; step < steps(2.5); step++) stepField(field, rest, step * 1000 * FRAME, 1000 * FRAME)
    expect(field.open).toBeCloseTo(0, 3)
    field.bodies.forEach((body, index) => expect(Math.hypot(body.x - BODY_HOMES[index].x, body.y - BODY_HOMES[index].y)).toBeLessThan(.5))
  })

  test('readings report the probe radius and bearings inside one turn', () => {
    const field = createField()
    field.pointer = { x: field.core.x + 30, y: field.core.y - 40 }
    settleField(field, rest, 0)
    const probe = probeReading(field)
    expect(probe.radius).toBeCloseTo(50, 9)
    expect(probe.bearing).toBeCloseTo(Math.atan2(40, 30) * 180 / Math.PI, 9)
    field.bodies.forEach((_, index) => {
      const reading = bodyReading(field, index)
      expect(reading.bearing).toBeGreaterThanOrEqual(0)
      expect(reading.bearing).toBeLessThan(360)
      expect(Number.isFinite(reading.potential)).toBe(true)
    })
  })
})

describe('WetwareOS · tissue', () => {
  const inputs = { selected: -1, pulse: 44, speed: 53, stress: false }

  test('the colony is reproducible: two seeded tissues are identical', () => {
    const [a, b] = [createTissue(), createTissue()]
    expect(a.cells.map((cell) => [cell.amplitudes, cell.phases, cell.spines])).toEqual(b.cells.map((cell) => [cell.amplitudes, cell.phases, cell.spines]))
  })

  test('a pulse fired from the nucleus travels its vessel and flashes the cell it reaches', () => {
    const tissue = createTissue()
    settleTissue(tissue, inputs, 0)
    firePulse(tissue, 'all', 0)
    expect(tissue.pulses).toHaveLength(CORE)
    expect(tissue.pulses.every((pulse) => tissue.vessels[pulse.vessel].from === NUCLEUS)).toBe(true)
    expect(tissue.heldUntil).toBe(PULSE_HOLD_MS)
    for (let step = 0; step < steps(.6) && tissue.pulses.length; step++) stepTissue(tissue, inputs, FRAME)
    expect(tissue.pulses).toHaveLength(0)
    for (let cell = 0; cell < CORE; cell++) expect(tissue.cells[cell].flash).toBeGreaterThan(.5)
  })

  test('Synapse Speed raises conduction velocity and Membrane Pulse quickens the breath', () => {
    const travelled = (speed: number) => {
      const tissue = createTissue()
      firePulse(tissue, 0, 0)
      for (let step = 0; step < 12; step++) stepTissue(tissue, { ...inputs, speed }, FRAME)
      return tissue.pulses[0].t
    }
    expect(travelled(100)).toBeGreaterThan(travelled(53))
    expect(travelled(53)).toBeGreaterThan(travelled(15))
    const breath = (pulse: number) => {
      const tissue = createTissue()
      stepTissue(tissue, { ...inputs, pulse }, 1)
      return tissue.breath
    }
    expect(breath(100)).toBeGreaterThan(breath(44))
    expect(breath(44)).toBeGreaterThan(breath(0))
  })

  test('a still frame holds a fresh pulse mid-vessel, then clears it once the hold has passed', () => {
    const tissue = createTissue()
    firePulse(tissue, 2, 1000)
    settleTissue(tissue, inputs, 1000 + PULSE_HOLD_MS - 1)
    expect(tissue.pulses.map((pulse) => pulse.t)).toEqual([.75])
    settleTissue(tissue, inputs, 1000 + PULSE_HOLD_MS)
    expect(tissue.pulses).toEqual([])
  })

  test('a differentiated organ fills the chamber and dims every other module cell', () => {
    const tissue = createTissue()
    settleTissue(tissue, { ...inputs, selected: 1 }, 0)
    expect(tissue.swell).toBeCloseTo(1, 9)
    for (let cell = 0; cell <= CORE; cell++) expect(tissue.cells[cell].dim).toBe(cell === 1 ? 0 : 1)
  })

  test('vessel curves start and end on their anchors with a unit tangent everywhere', () => {
    const tissue = createTissue()
    tissue.vessels.forEach((_, index) => {
      const curve = vesselCurve(tissue, index)
      expect(bezierPoint(curve, 0)).toEqual(curve[0])
      expect(bezierPoint(curve, 1)).toMatchObject({ x: expect.closeTo(curve[3].x, 9), y: expect.closeTo(curve[3].y, 9) })
      for (const t of [0, .25, .5, .75, 1]) {
        const tangent = bezierTangent(curve, t)
        expect(Math.hypot(tangent.x, tangent.y)).toBeCloseTo(1, 9)
      }
    })
  })
})

describe('QuantumOS · cloud', () => {
  const observe = { count: 2600, force: .67, observed: -1, calibrating: false, formation: null, stress: false }

  test('the cloud is reproducible: two seeded clouds draw identical samples', () => {
    const [a, b] = [createCloud(), createCloud()]
    settleCloud(a, observe, 1234)
    settleCloud(b, observe, 1234)
    expect(Array.from(a.x)).toEqual(Array.from(b.x))
    expect(Array.from(a.y)).toEqual(Array.from(b.y))
  })

  test('a stronger Collapse Force converges on the observed coordinate faster', () => {
    const progress = (force: number) => {
      const cloud = createCloud()
      settleCloud(cloud, observe, 0)
      for (let step = 0; step < 6; step++) stepCloud(cloud, { ...observe, force, observed: 2 }, step * 1000 * FRAME, 1000 * FRAME)
      return cloud.collapse[2]
    }
    expect(progress(1)).toBeGreaterThan(progress(.67))
    expect(progress(.67)).toBeGreaterThan(progress(.15))
    expect(progress(1)).toBeLessThan(1)
  })

  test('calibration collapses all four coordinates and a formation releases them', () => {
    const cloud = createCloud()
    settleCloud(cloud, { ...observe, calibrating: true }, 0)
    expect(Array.from(cloud.collapse)).toEqual(COORDINATES.map(() => 1))
    settleCloud(cloud, { ...observe, calibrating: true, formation: { kind: 'console', bits: encodeBits('scan') } }, 0)
    expect(Array.from(cloud.collapse)).toEqual(COORDINATES.map(() => 0))
    expect(cloud.measure).toBe(1)
  })

  test('a console formation prints the barcode: every carrier sample lands on a set module inside its band', () => {
    const bits = encodeBits('spike')
    const formation: Formation = { kind: 'console', bits }
    const cloud = createCloud()
    settleCloud(cloud, { ...observe, formation }, 0)
    const band = BANDS.console
    let carriers = 0
    for (let index = 0; index < observe.count; index++) {
      if (index % 5 > 2) continue
      carriers++
      const module = Math.floor((cloud.x[index] - band.x) / band.width * CODE_MODULES)
      expect(bits[module], `sample ${index}`).toBe(true)
      expect(cloud.y[index]).toBeGreaterThanOrEqual(band.y)
      expect(cloud.y[index]).toBeLessThan(band.y + band.height)
    }
    expect(carriers).toBeGreaterThan(1500)
  })

  test('the text barcode has one module per bit and repeats with the text', () => {
    const bits = encodeBits('ab', 64)
    expect(bits).toHaveLength(64)
    expect(bits.slice(16, 32)).toEqual(bits.slice(0, 16))
  })

  test('a search formation draws matched nodes as tight clusters and the rest as haze', () => {
    const matches = [false, true, false, false, false, false, false, false]
    const scores = [98, 96, 94, 92, 89, 88, 85, 82]
    const cloud = createCloud()
    settleCloud(cloud, { ...observe, formation: { kind: 'search', matches, scores } }, 0)
    const spread = (node: number) => {
      const xs: number[] = []
      for (let index = 0; index < observe.count; index++) if (index % 5 < 3 && index % matches.length === node) xs.push(cloud.x[index])
      const mean = xs.reduce((sum, x) => sum + x, 0) / xs.length
      return Math.sqrt(xs.reduce((sum, x) => sum + (x - mean) ** 2, 0) / xs.length)
    }
    expect(spread(1) * 3).toBeLessThan(spread(0))
  })

  test('a telemetry formation plots the latency trace across its band and load scatters it', () => {
    const trace = Array.from({ length: 48 }, (_, index) => 12 + Math.sin(index / 4))
    const scatter = (stress: boolean) => {
      const cloud = createCloud()
      settleCloud(cloud, { ...observe, formation: { kind: 'telemetry', trace, stress } }, 0)
      const band = BANDS.telemetry
      let error = 0
      let carriers = 0
      for (let index = 0; index < observe.count; index++) {
        if (index % 5 > 2) continue
        expect(cloud.x[index]).toBeGreaterThanOrEqual(band.x)
        expect(cloud.x[index]).toBeLessThanOrEqual(band.x + band.width)
        error += Math.abs(cloud.y[index] - (band.y + band.height / 2))
        carriers++
      }
      return error / carriers
    }
    expect(scatter(true)).toBeGreaterThan(scatter(false))
  })

  test('a media formation lights the elapsed part of the standing wave', () => {
    const cloud = createCloud()
    settleCloud(cloud, { ...observe, formation: { kind: 'media', antinodes: 5, playing: false, progress: .5 } }, 0)
    const band = BANDS.media
    for (let index = 0; index < observe.count; index++) {
      if (index % 5 > 2) continue
      const u = (cloud.x[index] - band.x) / band.width
      expect(cloud.alpha[index]).toBeCloseTo(u <= .5 ? 1 : .42, 5)
    }
  })

  test('a kick never lowers the burst already in flight and decays on the next step', () => {
    const cloud = createCloud()
    kick(cloud, 1.25)
    kick(cloud, .45)
    expect(cloud.burst).toBe(1.25)
    stepCloud(cloud, observe, 0, 1000 * FRAME)
    expect(cloud.burst).toBeLessThan(1.25)
    settleCloud(cloud, observe, 0)
    expect(cloud.burst).toBe(0)
  })
})

describe('TelemetryOS · signal', () => {
  test('readings stay above the datum everywhere on the specimen, on every pass', () => {
    for (let pass = 0; pass < 12; pass++) {
      for (let line = 0; line < LINES; line++) {
        for (let sample = 0; sample < SAMPLES; sample++) expect(microns(relief(sample / (SAMPLES - 1), lineDepth(line), pass))).toBeGreaterThan(0)
      }
    }
  })

  test('each channel reads the centre of its own band of scan lines', () => {
    for (let channel = 0; channel < LINES / LINES_PER_CHANNEL; channel++) {
      expect(Math.floor(channelLine(channel) / LINES_PER_CHANNEL)).toBe(channel)
    }
    expect(lineDepth(0)).toBe(0)
    expect(lineDepth(LINES - 1)).toBe(1)
  })

  test('a profile is acquired from the current pass behind the beam and the previous pass ahead of it', () => {
    const sweep = { beam: .4, pass: 7 }
    const depth = lineDepth(channelLine(2))
    expect(profile(2, sweep, .2)).toBe(relief(.2, depth, 7))
    expect(profile(2, sweep, .8)).toBe(relief(.8, depth, 6))
    expect(acquiredPass(.4, sweep)).toBe(7)
    expect(beamHeight(2, sweep)).toBe(microns(relief(.4, depth, 7)))
  })

  test('the peak finder returns the maximum of the acquired line and the range brackets every sample', () => {
    const sweep = { beam: .63, pass: 3 }
    for (let channel = 0; channel < 4; channel++) {
      const peak = findPeak(channel, sweep)
      const range = profileRange(channel, sweep)
      expect(range.span).toBeGreaterThanOrEqual(4)
      for (let sample = 0; sample < SAMPLES; sample++) {
        const height = profile(channel, sweep, sample / (SAMPLES - 1))
        expect(height).toBeLessThanOrEqual(peak.height)
        expect(height).toBeGreaterThanOrEqual(range.low)
      }
      expect(profile(channel, sweep, peak.u)).toBe(peak.height)
    }
  })

  test('a retrigger restarts the beam on a new pass and rest parks it without one', () => {
    const sweep = createSweep()
    retrigger(sweep)
    expect(sweep).toEqual({ beam: 0, pass: 1 })
    restSweep(sweep)
    expect(sweep).toEqual({ beam: .5, pass: 1 })
  })

  test('the oblique projection moves right with depth and up with height', () => {
    const [x0, y0] = project(.5, .2, 0, 126)
    const [x1] = project(.5, .8, 0, 126)
    const [, y2] = project(.5, .2, 30, 126)
    expect(x1).toBeGreaterThan(x0)
    expect(y2).toBeLessThan(y0)
    expect(project(.5, .2, 0, 252)[1]).toBeCloseTo(y0 * 2, 9)
  })

  test('shot noise is deterministic and bounded, trace statistics bracket the mean, oscillators stay in ±1', () => {
    expect(shot(.31, 4, 9)).toBe(shot(.31, 4, 9))
    for (let index = 0; index < 500; index++) expect(Math.abs(shot(index / 499, index % LINES, index))).toBeLessThanOrEqual(1)
    const stats = traceStats([12.1, 11.4, 13.9, 12.6])
    expect(stats).toEqual({ min: 11.4, max: 13.9, mean: expect.closeTo(12.5, 9) })
    for (let phase = 0; phase < Math.PI * 4; phase += .1) {
      expect(Math.abs(oscillator('sine', phase))).toBeLessThanOrEqual(1)
      expect(Math.abs(oscillator('triangle', phase))).toBeLessThanOrEqual(1 + 1e-12)
    }
    expect(oscillator('triangle', Math.PI / 2)).toBeCloseTo(1, 12)
    expect(oscillator('triangle', Math.PI / 4)).toBeCloseTo(.5, 12)
  })
})

describe('SpatialOS · camera', () => {
  const inputs = { entered: -1, focal: 900, lookX: 0, lookY: 0, tilt: 5, stress: false }

  test('a dive rises monotonically to arrival and surfaces back to the corridor', () => {
    const flight = createFlight()
    settleFlight(flight, inputs)
    let previous = 0
    for (let step = 0; step < steps(1.4); step++) {
      stepFlight(flight, { ...inputs, entered: 2 }, FRAME)
      expect(flight.dive).toBeGreaterThanOrEqual(previous)
      previous = flight.dive
    }
    expect(flight.dive).toBe(1)
    expect(flight.arrive).toBe(1)
    expect(exposure(flight)).toBe(1)
    for (let step = 0; step < steps(.7); step++) stepFlight(flight, inputs, FRAME)
    expect(flight.dive).toBe(0)
    expect(flight.arrive).toBe(0)
    expect(exposure(flight)).toBe(0)
  })

  test('the Parallax Tilt preview sweeps within its amplitude and comes back to rest', () => {
    const flight = createFlight()
    settleFlight(flight, inputs)
    previewTilt(flight, 16)
    let widest = 0
    for (let step = 0; step < steps(.7); step++) {
      stepFlight(flight, { ...inputs, tilt: 16 }, FRAME)
      widest = Math.max(widest, Math.abs(flight.yaw))
      expect(Math.abs(flight.yaw)).toBeLessThanOrEqual(16)
    }
    expect(widest).toBeGreaterThan(4)
    for (let step = 0; step < steps(1); step++) stepFlight(flight, { ...inputs, tilt: 16 }, FRAME)
    expect(flight.preview).toBeNull()
    expect(Math.abs(flight.yaw)).toBeLessThan(.01)
  })

  test('load warms the light gradually and a pulse expires on its own', () => {
    const flight = createFlight()
    sendPulse(flight)
    let previous = 0
    for (let step = 0; step < steps(1.2); step++) {
      stepFlight(flight, { ...inputs, stress: true }, FRAME)
      expect(flight.warmth).toBeGreaterThan(previous)
      expect(flight.warmth).toBeLessThan(1)
      previous = flight.warmth
    }
    expect(flight.pulse).toBeNull()
    settleFlight(flight, { ...inputs, stress: true })
    expect(flight.warmth).toBe(1)
  })

  test('near-plane clipping keeps visible polygons, drops hidden ones and cuts straddling ones on the plane', () => {
    const focal = 900
    const limit = nearPlane(focal)
    const square = (z: number): Vec3[] => [{ x: -1, y: -1, z }, { x: 1, y: -1, z }, { x: 1, y: 1, z }, { x: -1, y: 1, z }]
    expect(clipNear(square(limit - 10), focal)).toEqual(square(limit - 10))
    expect(clipNear(square(limit + 10), focal)).toEqual([])
    const straddle: Vec3[] = [{ x: 0, y: 0, z: limit - 20 }, { x: 10, y: 0, z: limit + 20 }, { x: 0, y: 10, z: limit - 20 }]
    const clipped = clipNear(straddle, focal)
    expect(clipped.length).toBe(4)
    expect(clipped.every((point) => point.z <= limit + 1e-9)).toBe(true)
    expect(clipped.filter((point) => Math.abs(point.z - limit) < 1e-9)).toHaveLength(2)
  })
})

describe('StrataOS · sediment', () => {
  const rest: StrataInputs = { beds: 16, compaction: .45, fold: .32, stress: false, selected: -1 }
  const settled = (inputs: Partial<StrataInputs> = {}) => {
    const strata = createStrata()
    settleStrata(strata, { ...rest, ...inputs })
    return strata
  }
  const run = (strata: Strata, inputs: StrataInputs, seconds: number) => {
    for (let step = 0; step < steps(seconds); step++) stepStrata(strata, inputs, FRAME)
  }

  test('with no fold every horizon is level, and the fold lifts horizons over the anticline', () => {
    const flat = settled({ fold: 0 })
    for (let index = 0; index <= flat.beds; index++) {
      for (const x of [0, 90, 150, 262, 377]) expect(boundaryAt(flat, index, x)).toBe(flat.base[index])
    }
    const folded = settled({ fold: 1 })
    for (let index = 0; index <= folded.beds; index++) expect(boundaryAt(folded, index, 150)).toBeLessThan(boundaryAt(folded, index, 20))
  })

  test('Deposition Rate sets the bed count and Compaction thins deep beds without losing the section', () => {
    for (const beds of [MIN_BEDS, 16, MAX_BEDS]) {
      for (const compaction of [0, .45, 1]) {
        const boundaries = restBoundaries(beds, compaction)
        expect(boundaries).toHaveLength(beds + 1)
        expect(boundaries[0]).toBe(SECTION.top)
        expect(boundaries[beds]).toBe(SECTION.bottom)
        const thickness = boundaries.slice(1).map((depth, bed) => depth - boundaries[bed])
        thickness.slice(1).forEach((value, bed) => {
          if (compaction === 0) expect(value).toBeCloseTo(thickness[bed], 9)
          else expect(value).toBeLessThan(thickness[bed])
        })
      }
    }
    const deepest = (compaction: number) => SECTION.bottom - restBoundaries(16, compaction)[15]
    expect(deepest(1)).toBeLessThan(deepest(.45))
    expect(deepest(.45)).toBeLessThan(deepest(0))
  })

  test('the four formations sit in distinct beds, in module order, at every deposition rate', () => {
    for (let beds = MIN_BEDS; beds <= MAX_BEDS; beds++) {
      const formations = Array.from({ length: MODULE_BEDS }, (_, module) => moduleBed(beds, module))
      formations.slice(1).forEach((bed, module) => expect(bed).toBeGreaterThan(formations[module]))
      expect(formations[0]).toBeGreaterThanOrEqual(0)
      expect(formations[3]).toBeLessThan(beds)
    }
  })

  test('excavating a formation opens a full gallery at its depth and keeps the surface and bedrock in place', () => {
    for (const beds of [MIN_BEDS, 16, MAX_BEDS]) {
      const tops = [0, 1, 2, 3].map((selected) => {
        const strata = settled({ beds, selected })
        const opened = gallery(strata)!
        expect(opened.bed).toBe(moduleBed(beds, selected))
        expect(opened.bottom - opened.top).toBeGreaterThanOrEqual(GALLERY - 1e-9)
        expect(strata.base[0]).toBe(SECTION.top)
        expect(strata.base[beds]).toBe(SECTION.bottom)
        expect(strata.drill).toBe(opened.bottom)
        return opened.top
      })
      // Deeper formations open deeper; the two deepest can share the floor of the section.
      tops.slice(1).forEach((top, module) => expect(top).toBeGreaterThanOrEqual(tops[module]))
      expect(tops[3]).toBeGreaterThan(tops[0])
    }
    expect(gallery(settled())).toBeNull()
  })

  test('backfill returns every bed to rest and withdraws the core to the surface', () => {
    const strata = settled({ selected: 2 })
    run(strata, rest, 2.5)
    restBoundaries(16, .45).forEach((depth, index) => expect(strata.base[index]).toBeCloseTo(depth, 2))
    expect(excavation(strata, moduleBed(16, 2)).open).toBeLessThan(1e-3)
    expect(strata.drill).toBeCloseTo(SECTION.top, 2)
  })

  test('backfill and a switch of formation close the old gallery continuously, never in one step', () => {
    const strata = settled({ selected: 0 })
    const first = moduleBed(16, 0)
    const second = moduleBed(16, 3)
    expect(excavation(strata, first).open).toBe(1)
    let previous = { first: 1, second: 0 }
    for (let step = 0; step < steps(1.5); step++) {
      stepStrata(strata, { ...rest, selected: 3 }, FRAME)
      const now = { first: excavation(strata, first).open, second: excavation(strata, second).open }
      expect(now.first).toBeLessThanOrEqual(previous.first)
      expect(previous.first - now.first).toBeLessThan(.12)
      expect(now.second).toBeGreaterThanOrEqual(previous.second)
      expect(now.second - previous.second).toBeLessThan(.12)
      previous = now
    }
    expect(previous).toEqual({ first: 0, second: expect.closeTo(1, 2) })
    stepStrata(strata, rest, FRAME)
    expect(excavation(strata, second).open).toBeGreaterThan(.9)
  })

  test('the core reading names the formation the bit rests in', () => {
    for (const beds of [MIN_BEDS, 16, MAX_BEDS]) {
      for (let module = 0; module < MODULE_BEDS; module++) {
        const strata = settled({ beds, selected: module })
        expect(reading(strata, strata.drill).bed).toBe(moduleBed(beds, module))
      }
    }
  })

  test('the probe reads the depth scale as it is drawn, through the fold and the fault', () => {
    const strata = settled({ fold: 1, stress: true })
    deposit(strata, 1)
    stepStrata(strata, { ...rest, fold: 1, stress: true }, .2)
    for (const depth of [SECTION.top + 20, 400, 650, SECTION.bottom - 5]) {
      for (const x of [10, 150, CORE_X]) expect(undeform(strata, deform(strata, depth, x), x)).toBeCloseTo(depth, 6)
    }
    for (const metres of [25, 50, 100]) {
      const tick = deform(strata, SECTION.top + metres / METRES_PER_PX, CORE_X)
      expect(reading(strata, undeform(strata, tick, CORE_X)).metres).toBeCloseTo(metres, 6)
    }
  })

  test('a new bed count lays down a new section without losing the excavation in progress', () => {
    const strata = settled({ selected: 1 })
    stepStrata(strata, { ...rest, beds: 24, selected: 1 }, FRAME)
    expect(strata.base).toHaveLength(25)
    const opened = gallery(strata)!
    expect(opened.bed).toBe(moduleBed(24, 1))
    expect(opened.bottom - opened.top).toBeGreaterThan(GALLERY * .95)
  })

  test('fresh sediment lands, consolidates and is gone; shear waves expire; stress keeps the column trembling', () => {
    const strata = settled()
    deposit(strata, 1)
    run(strata, rest, .3)
    expect(veneerThickness(strata)).toBeGreaterThan(5)
    expect(strata.waves).toHaveLength(1)
    run(strata, rest, 1.3)
    expect(strata.waves).toHaveLength(0)
    run(strata, rest, 2)
    expect(strata.veneer).toBeNull()
    expect(veneerThickness(strata)).toBe(0)
    run(strata, { ...rest, stress: true }, 2.8)
    expect(strata.waves.length).toBeGreaterThan(0)
    settleStrata(strata, { ...rest, stress: true })
    expect(strata.waves).toEqual([])
  })

  test('under load the block beyond the fault is thrown down by a fixed distance', () => {
    const strata = settled({ fold: 0, stress: true })
    for (let index = 0; index <= strata.beds; index++) {
      expect(boundaryAt(strata, index, FAULT_X + 1) - boundaryAt(strata, index, FAULT_X - 1)).toBeCloseTo(16, 9)
    }
    expect(boundaryAt(settled({ fold: 0 }), 4, FAULT_X + 1)).toBe(boundaryAt(settled({ fold: 0 }), 4, FAULT_X - 1))
  })

  test('readings deepen and age monotonically from the surface to bedrock', () => {
    const strata = settled()
    expect(reading(strata, SECTION.top)).toMatchObject({ metres: 0, ka: 0, bed: 0 })
    const bottom = reading(strata, SECTION.bottom)
    expect(bottom.metres).toBeCloseTo((SECTION.bottom - SECTION.top) * METRES_PER_PX, 9)
    expect(bottom.ka).toBeCloseTo(SPAN_KA, 9)
    expect(bottom.bed).toBe(15)
    let previous = -1
    for (let depth = SECTION.top; depth <= SECTION.bottom; depth += 7) {
      const { ka } = reading(strata, depth)
      expect(ka).toBeGreaterThanOrEqual(previous)
      previous = ka
    }
  })

  test('the section is reproducible and its grains settle faster with the deposition rate, inside the water column', () => {
    const [a, b] = [createStrata(), createStrata()]
    expect(Array.from(a.lithology)).toEqual(Array.from(b.lithology))
    expect(Array.from(a.grainY)).toEqual(Array.from(b.grainY))
    expect(a.lithology.every((value) => value < LITHOLOGIES)).toBe(true)
    const fallen = (beds: number) => {
      const strata = settled({ beds })
      const before = Float32Array.from(strata.grainY)
      stepStrata(strata, { ...rest, beds }, .02)
      // Grains that reached the surface wrap to the top of the column; measure the ones still falling.
      return before.reduce((sum, y, index) => sum + Math.max(0, strata.grainY[index] - y), 0)
    }
    expect(fallen(MAX_BEDS)).toBeGreaterThan(fallen(MIN_BEDS))
    const strata = settled()
    run(strata, rest, 6)
    for (const y of strata.grainY) {
      expect(y).toBeGreaterThanOrEqual(40)
      expect(y).toBeLessThanOrEqual(SECTION.top)
    }
  })
})
