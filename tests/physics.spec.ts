import { expect, test } from '@playwright/test'
import { BODY_HOMES, CORE, HORIZON, createField, probeReading, settleField, stepField } from '../src/themes/field/potential'
import type { FieldInputs } from '../src/themes/field/potential'
import { COORDINATES, createCloud, encodeBits, settleCloud } from '../src/themes/quantum/cloud'
import { APERTURE, EYE, SLAB, SLABS, SURFACE, createFlight, settleFlight, toScreen, toView } from '../src/themes/spatial/camera'
import { acquiredPass, advanceSweep, createSweep, sweepSeconds } from '../src/themes/telemetry/signal'
import { createTissue, membranePoint, stepTissue, vesselCurve } from '../src/themes/wetware/tissue'
import type { Cell, Vec } from '../src/themes/wetware/tissue'

const FRAME_MS = 1000 / 60
const rest: FieldInputs = { warp: .58, levels: 30, drift: 0, stress: false, selected: -1 }

test('with no mass every equipotential is a circle around the singularity', () => {
  const field = createField()
  settleField(field, { ...rest, warp: 0 }, 0)
  let worst = 0
  for (const { data, count } of [field.major, field.minor]) {
    for (let index = 0; index < count * 4; index += 2) {
      const radius = Math.hypot(data[index] - CORE.x, data[index + 1] - CORE.y)
      const ring = Math.round((radius - HORIZON) / field.spacing)
      worst = Math.max(worst, Math.abs(radius - HORIZON - ring * field.spacing))
    }
  }
  expect(field.major.count + field.minor.count).toBeGreaterThan(2000)
  expect(worst).toBeLessThan(.5)
})

test('Gravity Warp raises the probed potential monotonically from the bare singularity', () => {
  const probe = { x: 150, y: 300 }
  const readings = [0, .25, .5, .75, 1].map((warp) => {
    const field = createField()
    field.pointer = probe
    settleField(field, { ...rest, warp }, 0)
    return probeReading(field).potential
  })
  expect(readings[0]).toBeCloseTo(100 / Math.hypot(probe.x - CORE.x, probe.y - CORE.y), 6)
  readings.slice(1).forEach((value, index) => expect(value).toBeGreaterThan(readings[index]))
})

test('an excited body repels its neighbours at short range, and nothing moves without mass', () => {
  const displacement = (warp: number) => {
    const field = createField()
    settleField(field, { ...rest, warp }, 0)
    field.hover = 0
    for (let step = 0; step < 120; step++) stepField(field, { ...rest, warp }, step * FRAME_MS, FRAME_MS)
    const neighbour = field.bodies[1]
    const away = { x: BODY_HOMES[1].x - BODY_HOMES[0].x, y: BODY_HOMES[1].y - BODY_HOMES[0].y }
    return ((neighbour.x - BODY_HOMES[1].x) * away.x + (neighbour.y - BODY_HOMES[1].y) * away.y) / Math.hypot(away.x, away.y)
  }
  expect(displacement(.58)).toBeGreaterThan(2)
  expect(displacement(1)).toBeGreaterThan(displacement(.58))
  expect(Math.abs(displacement(0))).toBeLessThan(1e-6)
})

function gapToMembrane(cell: Cell, point: Vec, breath: number) {
  let nearest = Infinity
  for (let step = 0; step < 2880; step++) {
    const sample = membranePoint(cell, step / 2880 * Math.PI * 2, breath)
    nearest = Math.min(nearest, Math.hypot(sample.x - point.x, sample.y - point.y))
  }
  return nearest
}

test('every vessel stays attached to both membranes while a cell differentiates', () => {
  const tissue = createTissue()
  const inputs = { selected: 2, pulse: 44, speed: 53, stress: false }
  const initial = vesselCurve(tissue, 2)
  let worst = 0
  for (let step = 0; step < 150; step++) {
    stepTissue(tissue, inputs, 1 / 60)
    tissue.vessels.forEach((vessel, index) => {
      const curve = vesselCurve(tissue, index)
      worst = Math.max(worst, gapToMembrane(tissue.cells[vessel.from], curve[0], tissue.breath), gapToMembrane(tissue.cells[vessel.to], curve[3], tissue.breath))
    })
  }
  const final = vesselCurve(tissue, 2)
  expect(tissue.swell).toBeGreaterThan(.95)
  expect(worst).toBeLessThan(.6)
  expect(Math.hypot(final[3].x - initial[3].x, final[3].y - initial[3].y)).toBeGreaterThan(40)
})

test('observation moves a coordinate\'s samples onto its bracket marks', () => {
  const inside = (observed: number) => {
    const cloud = createCloud()
    settleCloud(cloud, { count: 2600, force: 1, observed, calibrating: false, formation: null, stress: false }, 0)
    const centre = COORDINATES[2]
    let count = 0
    for (let index = 0; index < 2600; index++) {
      const dx = Math.abs(cloud.x[index] - centre.x)
      if (dx >= 56 && dx <= 67 && Math.abs(cloud.y[index] - centre.y) <= 24) count++
    }
    return count
  }
  expect(inside(2)).toBeGreaterThan(inside(-1) + 200)
})

test('the barcode encodes text bytes most significant bit first', () => {
  expect(encodeBits('A', 8)).toEqual([false, true, false, false, false, false, false, true])
  expect(encodeBits('', 8)).toEqual(Array(8).fill(false))
})

test('the sweep period falls with rate and each wrap starts a new pass', () => {
  expect(sweepSeconds(100, false)).toBeLessThan(sweepSeconds(15, false))
  expect(sweepSeconds(45, true)).toBeLessThan(sweepSeconds(45, false))
  const sweep = createSweep()
  const period = sweepSeconds(100, false)
  advanceSweep(sweep, period * .75, period)
  expect(sweep.pass).toBe(1)
  expect(sweep.beam).toBeCloseTo(.25, 6)
  expect(acquiredPass(.1, sweep)).toBe(1)
  expect(acquiredPass(.9, sweep)).toBe(0)
})

test('the resting camera matches CSS perspective and every dive centres its aperture on the eye', () => {
  const focal = 900
  const inputs = { entered: -1, focal, lookX: 0, lookY: 0, tilt: 5, stress: false }
  const flight = createFlight()
  settleFlight(flight, inputs)
  const projected = toScreen(toView(flight.camera, { x: 100, y: -50, z: -400 }), focal)
  expect(projected.x).toBeCloseTo(EYE.x + 100 * focal / (focal + 400), 6)
  expect(projected.y).toBeCloseTo(EYE.y - 50 * focal / (focal + 400), 6)

  SLABS.forEach((slab, index) => {
    settleFlight(flight, { ...inputs, entered: index })
    const lift = (APERTURE.top + APERTURE.height / 2 - SLAB.height / 2) * slab.scale
    const centre = { x: slab.x - EYE.x, y: slab.y + lift - EYE.y, z: slab.z }
    const yaw = slab.yaw * Math.PI / 180
    const half = APERTURE.width / 2 * slab.scale
    const edge = { x: centre.x + Math.cos(yaw) * half, y: centre.y, z: centre.z - Math.sin(yaw) * half }
    const eye = toScreen(toView(flight.camera, centre), focal)
    const rim = toScreen(toView(flight.camera, edge), focal)
    expect(eye.x).toBeCloseTo(EYE.x, 4)
    expect(eye.y).toBeCloseTo(EYE.y, 4)
    expect(rim.x - eye.x).toBeCloseTo(SURFACE.width * 1.42 / 2, 2)
  })
})
