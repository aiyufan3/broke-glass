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
import {
  EYE, FOCAL, HORIZON, HUES, LATTICE, MAX_DOTS, MAX_ROWS, MIN_DOTS, MIN_ROWS, NEAR, ORBS, ROOM, SEED_SHARE, SURFACE as DOT_SURFACE, VANISH,
  burst, burstDots, coverage, createDots, dotCount, latticeCount, layoutFloor, orbDots, orbView, project as projectFloor, pulseGains, rowDepth,
  settleDots, spacingFor, stepDots,
} from '../../src/themes/infinity/dots'
import type { DotField, InfinityInputs } from '../../src/themes/infinity/dots'
import { CHAMBER, CORE, NUCLEUS, ORGAN, PULSE_HOLD_MS, bezierPoint, bezierTangent, chamberSpan, createTissue, firePulse, membranePoint, organSlack, settleTissue, stepTissue, vesselCurve } from '../../src/themes/wetware/tissue'

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

  test('every row of an organ lies inside its own membrane through the whole breath, at any Membrane Pulse', () => {
    let rows = 0
    let tightest = Infinity
    for (const selected of [0, 1, 2, 3]) {
      for (const pulse of [0, 44, 100]) {
        const tissue = createTissue()
        settleTissue(tissue, { ...inputs, selected, pulse }, 0)
        const cell = tissue.cells[selected]
        expect([cell.x, cell.y, cell.rx, cell.ry]).toEqual([CHAMBER.x, CHAMBER.y, CHAMBER.rx, CHAMBER.ry])
        const slack = organSlack(cell, pulse)
        // How far inside the membrane a point is, as a share of the membrane's radius in that direction.
        const depth = (x: number, y: number, breath: number) => {
          const theta = Math.atan2((y - cell.y) / cell.ry, (x - cell.x) / cell.rx)
          const wall = membranePoint(cell, theta, breath)
          return 1 - Math.hypot(x - cell.x, y - cell.y) / Math.hypot(wall.x - cell.x, wall.y - cell.y)
        }
        for (let top = ORGAN.top; top + 12 <= ORGAN.top + ORGAN.height; top += 9) {
          for (const height of [12, 34, 60]) {
            const span = chamberSpan(slack, top, top + height)
            if (!span) continue
            rows++
            expect(span.right).toBeGreaterThan(span.left)
            expect((span.left + span.right) / 2).toBeCloseTo(CHAMBER.x, 9)
            for (let breath = 0; breath < 40; breath += 1.7) {
              for (const [x, y] of [[span.left, top], [span.right, top], [span.left, top + height], [span.right, top + height]]) {
                tightest = Math.min(tightest, depth(x, y, breath))
              }
            }
          }
        }
        // The label and the title of the organ both have room at the top of the box.
        expect(chamberSpan(slack, ORGAN.top + 12, ORGAN.top + 23)).not.toBeNull()
      }
    }
    expect(rows).toBeGreaterThan(900)
    expect(tightest).toBeGreaterThan(0)
    // A stronger pulse lets the membrane dip further in, so the usable span narrows; with no room it is null.
    const calm = chamberSpan(.02, 260, 294)
    const wild = chamberSpan(.16, 260, 294)
    expect(wild!.right - wild!.left).toBeLessThan(calm!.right - calm!.left)
    expect(chamberSpan(.16, CHAMBER.y - CHAMBER.ry, CHAMBER.y - CHAMBER.ry + 12)).toBeNull()
    const tissue = createTissue()
    expect(organSlack(tissue.cells[0], 100)).toBeGreaterThan(organSlack(tissue.cells[0], 0))
  })

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

describe('InfinityOS · dots', () => {
  const rest: InfinityInputs = { proliferation: 900, obliteration: .35, rows: 12, stress: false, selected: -1 }
  const settled = (inputs: Partial<InfinityInputs> = {}, seed?: number) => {
    const field = createDots(seed)
    settleDots(field, { ...rest, ...inputs })
    return field
  }
  const run = (field: DotField, inputs: InfinityInputs, seconds: number) => {
    for (let step = 0; step < steps(seconds); step++) stepDots(field, inputs, FRAME)
  }
  const snapshot = (field: DotField) => ({
    floor: [...field.floor.x, ...field.floor.y, ...field.floor.rx, ...field.floor.ry, ...field.floor.hue],
    bursts: field.bursts.map((dot) => ({ ...dot })),
    turn: field.turn, swell: [...field.swell], load: field.load, pulse: field.pulse, coverage: field.coverage,
  })

  test('the same seed and the same commands reproduce the field exactly; another seed scatters bursts elsewhere', () => {
    const play = (seed: number) => {
      const field = createDots(seed)
      settleDots(field, rest)
      burst(field, 1)
      run(field, { ...rest, selected: 2, stress: true }, .4)
      burst(field, 1.3)
      settleDots(field, { ...rest, selected: 2 })
      return field
    }
    expect(snapshot(play(11))).toEqual(snapshot(play(11)))
    expect(snapshot(play(11)).bursts).not.toEqual(snapshot(play(12)).bursts)
    // The lattice itself does not depend on the seed: it is the floor, not a scatter.
    expect(snapshot(settled({}, 1)).floor).toEqual(snapshot(settled({}, 2)).floor)
  })

  test('every dot shrinks strictly with depth and every row sits below the one horizon, centred on the vanishing point', () => {
    for (const proliferation of [MIN_DOTS, 900, MAX_DOTS]) {
      for (const obliteration of [0, .35, 1]) {
        for (const rows of [MIN_ROWS, 12, MAX_ROWS]) {
          const { floor } = settled({ proliferation, obliteration, rows })
          expect(floor.rows).toBe(rows)
          let previous = { rx: Infinity, ry: Infinity, y: Infinity }
          for (let row = 0; row < rows; row++) {
            const from = floor.rowStart[row]
            const to = floor.rowStart[row + 1]
            expect(to - from).toBeGreaterThan(0)
            expect(to - from).toBe(2 * Math.floor((to - from) / 2) + 1)
            expect(floor.rx[from]).toBeLessThan(previous.rx)
            expect(floor.ry[from]).toBeLessThan(previous.ry)
            expect(floor.y[from]).toBeLessThan(previous.y)
            expect(floor.y[from]).toBeGreaterThan(HORIZON)
            // Symmetric about the vanishing point: column -j mirrors column j.
            for (let i = from; i < to; i++) expect(floor.x[i] + floor.x[to - 1 - (i - from)]).toBeCloseTo(2 * VANISH.x, 3)
            previous = { rx: floor.rx[from], ry: floor.ry[from], y: floor.y[from] }
          }
        }
      }
    }
    // Projection: the nearest row stands on the bottom edge and depth runs to the horizon.
    expect(projectFloor(0, NEAR).y).toBeCloseTo(DOT_SURFACE.height - 12, 6)
    expect(projectFloor(0, 1e9).y).toBeCloseTo(HORIZON, 4)
    expect(projectFloor(1, 2, EYE)).toEqual({ x: VANISH.x + FOCAL / 2, y: HORIZON })
    expect(rowDepth(MAX_ROWS - 1)).toBeGreaterThan(rowDepth(MIN_ROWS - 1) * 100)
  })

  test('Obliteration coverage rises monotonically and never leaves [0, 1]; at 100 neighbours merge', () => {
    let previous = -1
    for (let step = -20; step <= 120; step++) {
      const value = coverage(step / 100)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(1)
      if (step > 0 && step <= 100) expect(value).toBeGreaterThan(previous)
      else expect(value).toBeGreaterThanOrEqual(previous)
      previous = value
    }
    expect(coverage(-5)).toBe(coverage(0))
    expect(coverage(5)).toBe(1)
    // At full Obliteration a dot reaches past half the gap to its neighbour on either side: the row is solid.
    const { floor } = settled({ obliteration: 1 })
    for (let row = 0; row < floor.rows; row++) {
      const i = floor.rowStart[row]
      if (floor.rowStart[row + 1] - i < 2) continue
      expect(floor.rx[i] * 2).toBeGreaterThan(floor.x[i + 1] - floor.x[i])
    }
    // And coverage is what the floor draws with: more Obliteration, larger dots on the same lattice.
    const bare = settled({ obliteration: 0 }).floor
    const full = settled({ obliteration: 1 }).floor
    expect(full.count).toBe(bare.count)
    expect(full.rx[0]).toBeGreaterThan(bare.rx[0] * 3)
  })

  test('Proliferation caps every dot on the floor, lattice and bursts together, and commands accumulate up to it', () => {
    for (const proliferation of [MIN_DOTS, 900, MAX_DOTS]) {
      for (const rows of [MIN_ROWS, MAX_ROWS]) {
        const field = settled({ proliferation, rows })
        expect(field.floor.count).toBeLessThanOrEqual(Math.round(proliferation * SEED_SHARE))
        let total = dotCount(field)
        for (let command = 0; command < 60; command++) {
          burst(field, 1.3)
          expect(dotCount(field)).toBeGreaterThanOrEqual(total)
          expect(dotCount(field)).toBeLessThanOrEqual(proliferation)
          total = dotCount(field)
        }
        expect(total).toBe(proliferation)
        // At the cap a command still lands: its dots take the place of the oldest burst dots.
        const oldest = field.bursts[0]
        const newest = field.bursts.at(-1)
        expect(burst(field, 1)).toBe(60)
        expect(dotCount(field)).toBe(proliferation)
        expect(field.bursts).not.toContain(oldest)
        expect(field.bursts).toContain(newest)
        expect(field.bursts.slice(-60).every((dot) => dot.age === 0)).toBe(true)
      }
    }
    // Lowering the cap sheds the oldest bursts and keeps the newest.
    const field = settled({ proliferation: 2000 })
    for (let command = 0; command < 10; command++) burst(field, 1)
    const newest = field.bursts.at(-1)
    settleDots(field, { ...rest, proliferation: 500 })
    expect(dotCount(field)).toBeLessThanOrEqual(500)
    expect(field.bursts.at(-1)).toBe(newest)
    // Out-of-range settings are held to the control ranges.
    const wild = settled({ proliferation: 99999, rows: 2.6, obliteration: 7 })
    expect([wild.proliferation, wild.rows, wild.obliteration]).toEqual([MAX_DOTS, MIN_ROWS, 1])
  })

  test('Proliferation sets the spacing and Infinity Depth only how far the rows reach toward the horizon', () => {
    for (const target of [24, 124, 558, 1488]) {
      const spacing = spacingFor(target, MAX_ROWS)
      expect(latticeCount(spacing, MAX_ROWS)).toBeLessThanOrEqual(target)
      expect(latticeCount(spacing * .97, MAX_ROWS)).toBeGreaterThan(latticeCount(spacing, MAX_ROWS))
    }
    const sparse = settled({ proliferation: MIN_DOTS }).floor
    const dense = settled({ proliferation: MAX_DOTS }).floor
    expect(dense.count).toBeGreaterThan(sparse.count * 5)
    expect(dense.rx[0]).toBeLessThan(sparse.rx[0])
    const shallow = settled({ rows: MIN_ROWS }).floor
    const deep = settled({ rows: MAX_ROWS }).floor
    expect(deep.spacing).toBe(shallow.spacing)
    expect(deep.rx[0]).toBe(shallow.rx[0])
    expect(deep.y[deep.rowStart[MAX_ROWS - 1]]).toBeLessThan(HORIZON + 2)
    expect(shallow.y[shallow.rowStart[MIN_ROWS - 1]]).toBeGreaterThan(HORIZON + 150)
    // A tinted lattice keeps its geometry and takes one hue.
    const tinted = layoutFloor(558, 12, .5, 3)
    expect([...new Set(tinted.hue)]).toEqual([3])
    expect([...new Set(settled().floor.hue)].sort()).toEqual([0, 1, 2, 3, 4])
    expect(HUES).toHaveLength(5)
  })

  test('the settled frame is a fixed point of the inputs, whatever ran before it', () => {
    const fresh = snapshot(settled({ selected: 1, stress: true }))
    const used = createDots()
    settleDots(used, rest)
    run(used, { ...rest, selected: 3, stress: false }, .7)
    run(used, { ...rest, selected: 1, stress: true }, .2)
    settleDots(used, { ...rest, selected: 1, stress: true })
    expect(snapshot(used)).toEqual(fresh)
    settleDots(used, { ...rest, selected: 1, stress: true })
    expect(snapshot(used)).toEqual(fresh)
  })

  test('a selected orb swells smoothly into the room and shrinks back out of it', () => {
    const field = settled()
    const home = orbView(field, 2)
    const swell: number[] = []
    // One shared time constant of .22 s: within 1e-4 of the target, and snapped to it, after about two seconds.
    for (let step = 0; step < steps(2.5); step++) {
      stepDots(field, { ...rest, selected: 2 }, FRAME)
      swell.push(field.swell[2])
    }
    swell.slice(1).forEach((value, step) => expect(value).toBeGreaterThanOrEqual(swell[step]))
    expect(field.swell[2]).toBe(1)
    expect(field.swell.filter((_, index) => index !== 2)).toEqual([0, 0, 0])
    const room = orbView(field, 2)
    expect([room.x, room.y]).toEqual([ROOM.x, ROOM.y])
    expect(room.radius).toBeGreaterThan(Math.hypot(DOT_SURFACE.width, DOT_SURFACE.height) / 2 + 20)
    expect(room.depth).toBeLessThan(Math.min(...ORBS.map((orb) => orb.z)))
    run(field, rest, 2.5)
    expect(field.swell[2]).toBe(0)
    expect(orbView(field, 2)).toEqual(home)
    // Orbs float at staggered depths, nearer ones larger for their size.
    expect(new Set(ORBS.map((orb) => orb.z)).size).toBe(4)
    for (const [index, orb] of ORBS.entries()) expect(orbView(settled(), index).radius).toBeCloseTo(FOCAL * orb.radius / orb.z, 6)
  })

  test('each orb shows the near half of its Fibonacci lattice, back to front, and turns while the field runs', () => {
    expect(LATTICE).toHaveLength(140)
    for (const point of LATTICE) expect(Math.hypot(point.x, point.y, point.z)).toBeCloseTo(1, 9)
    const field = settled()
    for (const index of ORBS.keys()) {
      const view = orbView(field, index)
      const dots = orbDots(field, index)
      expect(dots.length).toBeGreaterThan(55)
      expect(dots.length).toBeLessThan(85)
      dots.slice(1).forEach((dot, i) => expect(dot.facing).toBeGreaterThanOrEqual(dots[i].facing))
      for (const dot of dots) {
        expect(Math.hypot(dot.x - view.x, dot.y - view.y)).toBeLessThanOrEqual(view.radius + 1e-6)
        expect(dot.across).toBeLessThanOrEqual(dot.along)
        expect(dot.facing).toBeGreaterThan(0)
      }
    }
    const before = orbDots(field, 0)
    run(field, rest, .5)
    expect(field.turn).toBeGreaterThan(0)
    expect(orbDots(field, 0)).not.toEqual(before)
    settleDots(field, rest)
    expect(orbDots(field, 0)).toEqual(before)
  })

  test('a burst lands around the point of action and grows from nothing', () => {
    const field = settled({ proliferation: MAX_DOTS, selected: 3 })
    expect(burst(field, 1)).toBe(60)
    for (const dot of field.bursts) {
      expect(dot.z).toBeGreaterThanOrEqual(NEAR)
      expect(Math.abs(dot.x - ORBS[3].x)).toBeLessThan(1)
    }
    expect(burstDots(field).every((dot) => dot.rx === 0)).toBe(true)
    run(field, { ...rest, proliferation: MAX_DOTS, selected: 3 }, .6)
    const landed = burstDots(field)
    expect(landed.every((dot) => dot.rx > 0 && dot.ry > 0)).toBe(true)
    for (const dot of landed) expect(dot.y).toBeGreaterThan(HORIZON)
    // With no orb open, commands land in front of the vanishing point.
    const open = settled({ proliferation: MAX_DOTS })
    burst(open, .5)
    for (const dot of open.bursts) expect(Math.abs(dot.x)).toBeLessThan(1)
  })

  test('under load a pulse runs outward from the horizon and dies away when the load lifts', () => {
    const peakOf = (field: DotField) => {
      const gains = pulseGains(field)
      return gains.indexOf(Math.max(...gains))
    }
    const field = settled({ rows: MAX_ROWS, stress: true })
    expect(field.load).toBe(1)
    const gains = pulseGains(field)
    expect(Math.max(...gains)).toBeGreaterThan(1.2)
    const peak = peakOf(field)
    expect(Math.abs((field.rows - 1 - peak) / (field.rows - 1) - .5)).toBeLessThan(.15)
    // The pulse travels toward the eye: a moment later the peak is on a nearer row.
    run(field, { ...rest, rows: MAX_ROWS, stress: true }, .2)
    expect(peakOf(field)).toBeLessThan(peak)
    run(field, { ...rest, rows: MAX_ROWS }, .5)
    expect(field.load).toBe(0)
    expect(pulseGains(field).every((gain) => gain === 1)).toBe(true)
  })

  test('the pulse never lets a farther row draw as large as a nearer one', () => {
    for (const rows of [MIN_ROWS, 12, MAX_ROWS]) {
      for (const obliteration of [0, .35, 1]) {
        const field = settled({ rows, obliteration, stress: true })
        let swelled = 0
        for (let step = 0; step < steps(1.5); step++) {
          stepDots(field, { ...rest, rows, obliteration, stress: true }, FRAME)
          const gains = pulseGains(field)
          swelled = Math.max(swelled, ...gains)
          const { floor } = field
          for (let row = 1; row < rows; row++) {
            const near = floor.rowStart[row - 1]
            const far = floor.rowStart[row]
            expect(floor.rx[far] * gains[row]).toBeLessThan(floor.rx[near] * gains[row - 1])
            expect(floor.ry[far] * gains[row]).toBeLessThan(floor.ry[near] * gains[row - 1])
          }
        }
        expect(swelled).toBeGreaterThan(1.2)
      }
    }
  })
})
