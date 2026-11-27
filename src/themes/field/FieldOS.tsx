import { useEffect, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { modules, nodes as specimens, searchNodes, system, tracks } from '../../data/osData'
import type { ModuleId } from '../../data/osData'
import type { ParadigmProps } from '../../data/paradigms'
import { surface, useFrameLoop } from '../../state/frameLoop'
import { useOS, useOSActions, useOSSnapshot } from '../../state/osStore'
import { useToolFocus } from '../../state/toolFocus'
import type { OSState } from '../../state/osStore'
import FieldTools from './FieldTools'
import { BODY_HOMES, CORE, SURFACE, bodyReading, createField, droppedSegments, emitRipple, probeReading, settleField, stepField, totalMass } from './potential'
import type { Vec } from './potential'
import { paintField } from './renderer'
import type { ToolRing } from './renderer'
import './field.css'

const anchors = [[63, 754], [130, 713], [247, 713], [314, 754]] as const
const rippleGain = { boot: 0, command: 5, inspect: 6, scan: 10, spike: 15 } as const
const DRAG_THRESHOLD = 8
const DRAG_BOUNDS = { left: 34, right: SURFACE.width - 34, top: 168, bottom: 610 }
const scores = specimens.map((specimen) => specimen.score)

type Gesture = { origin: Vec; grab: Vec; moved: boolean }

function createToolRing() {
  let query: string | null = null
  let matches: boolean[] = []
  return (state: OSState): ToolRing | null => {
    switch (state.activeModule) {
      case 'telemetry': return { kind: 'telemetry', trace: state.telemetryState.trace }
      case 'media': {
        const { trackIndex, isPlaying, progress } = state.mediaState
        return { kind: 'media', frequency: tracks[trackIndex].frequency, playing: isPlaying, progress: progress / tracks[trackIndex].duration }
      }
      case 'search': {
        if (state.searchQuery !== query) {
          query = state.searchQuery
          const found = searchNodes(query)
          matches = specimens.map((specimen) => found.includes(specimen))
        }
        return { kind: 'search', matches, scores }
      }
      default: return null
    }
  }
}

const degrees = (value: number) => String(Math.round(value) % 360).padStart(3, '0')

export default function FieldOS({ interactive }: ParadigmProps) {
  const host = useRef<HTMLElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const bodyElements = useRef<(HTMLButtonElement | null)[]>([])
  const vectorElements = useRef<(HTMLElement | null)[]>([])
  const probe = useRef<HTMLPreElement>(null)
  const written = useRef<string[]>([])
  const gesture = useRef<Gesture | null>(null)
  const reportedOverflow = useRef(false)
  const [field] = useState(createField)
  const [toolRing] = useState(createToolRing)
  const active = useOS((state) => state.activeModule, interactive)
  const [warp, levels, drift] = useOS((state) => state.paradigmParams.field, interactive)
  const stress = useOS((state) => state.telemetryState.stressMode, interactive)
  const impulse = useOS((state) => state.impulse, interactive)
  const snapshot = useOSSnapshot(interactive)
  const actions = useOSActions()
  const selected = active ? modules.findIndex((module) => module.id === active) : -1

  function write(slot: number, element: HTMLElement | null, text: string) {
    if (!element || written.current[slot] === text) return
    written.current[slot] = text
    element.textContent = text
  }

  const invalidate = useFrameLoop(host, interactive, ({ time, delta, still, ratio }) => {
    const inputs = { warp: warp / 100, levels, drift: drift / 100, stress, selected }
    if (still) settleField(field, inputs, time)
    else stepField(field, inputs, time, delta)
    // A full contour buffer drops segments; in development that is a warning, which fails the release suite.
    if (import.meta.env.DEV && !reportedOverflow.current && droppedSegments(field)) {
      reportedOverflow.current = true
      console.warn(`FieldOS dropped ${droppedSegments(field)} contour segments: the segment buffer is full.`)
    }
    const ctx = surface(canvas.current, SURFACE.width, SURFACE.height, ratio)
    if (ctx) paintField(ctx, field, { time, tool: toolRing(snapshot()) })

    field.bodies.forEach((body, index) => {
      const element = bodyElements.current[index]
      const offset = `${(body.x - body.home.x).toFixed(1)}px ${(body.y - body.home.y).toFixed(1)}px`
      if (element && written.current[index] !== offset) {
        written.current[index] = offset
        element.style.translate = offset
      }
      const reading = bodyReading(field, index)
      write(4 + index, vectorElements.current[index], `Δg ${reading.potential.toFixed(2)} · ${degrees(reading.bearing)}°`)
    })
    if (field.presence > .05) {
      const reading = probeReading(field)
      write(8, probe.current, `Φ ${reading.potential.toFixed(3)}\nr ${reading.radius.toFixed(0).padStart(3, '0')} px\nθ ${degrees(reading.bearing)}°`)
    } else {
      write(8, probe.current, `Σm ${totalMass(field).toFixed(3)}\nlevels ${levels}\ndrift ${drift}`)
    }
  })

  useEffect(invalidate, [invalidate, warp, levels, drift, stress, selected])
  useToolFocus(host, active, interactive, { tool: '.field-workspace', launchers: '.field-node' })

  const seenImpulse = useRef(impulse.seq)
  useEffect(() => {
    if (impulse.seq === seenImpulse.current) return
    seenImpulse.current = impulse.seq
    emitRipple(field, rippleGain[impulse.kind])
  }, [field, impulse])

  function locate(event: PointerEvent): Vec {
    const bounds = host.current!.getBoundingClientRect()
    return {
      x: (event.clientX - bounds.left) * SURFACE.width / bounds.width,
      y: (event.clientY - bounds.top) * SURFACE.height / bounds.height,
    }
  }

  function excite(index: number) {
    field.hover = index
    invalidate()
  }

  function calm(index: number) {
    if (field.hover === index) field.hover = -1
    invalidate()
  }

  function release() {
    field.drag = -1
  }

  function select(moduleId: ModuleId) {
    if (interactive) actions.setActiveModule(moduleId)
  }

  return <section className="field-os" aria-label="FieldOS orbital interface" ref={host} data-active={active ?? undefined} data-stress={stress}
    onPointerMove={(event) => {
      if (!interactive) return
      field.pointer = locate(event)
      field.pointerInside = true
    }}
    onPointerLeave={() => { field.pointerInside = false }}>
    <canvas className="field-map" ref={canvas} aria-hidden="true" />
    <header className="field-identity">
      <span>Gravitational interface</span>
      <h2>Field<span>OS</span></h2>
    </header>
    <pre className="field-probe" ref={probe} aria-hidden="true" />
    <button type="button" className="field-core" style={{ left: CORE.x, top: CORE.y }} aria-label={system.label}
      onClick={() => select('console')} disabled={!interactive} tabIndex={active ? -1 : undefined}>
      <span>{system.label}<small>{system.status}</small></span>
    </button>
    {modules.map((module, index) => <button type="button" key={module.id} className="field-node"
      style={{ left: BODY_HOMES[index].x, top: BODY_HOMES[index].y }}
      ref={(element) => { bodyElements.current[index] = element }}
      disabled={!interactive} tabIndex={active ? -1 : undefined} aria-label={module.label} aria-pressed={active === module.id}
      onPointerEnter={() => excite(index)} onPointerLeave={() => calm(index)}
      onFocus={(event) => { if (event.currentTarget.matches(':focus-visible')) excite(index) }} onBlur={() => calm(index)}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        const origin = locate(event)
        const body = field.bodies[index]
        gesture.current = { origin, grab: { x: body.x - origin.x, y: body.y - origin.y }, moved: false }
        field.dragTarget = { x: body.x, y: body.y }
        field.drag = index
      }}
      onPointerMove={(event) => {
        const held = gesture.current
        if (!held || field.drag !== index || !event.currentTarget.hasPointerCapture(event.pointerId)) return
        const point = locate(event)
        if (Math.hypot(point.x - held.origin.x, point.y - held.origin.y) > DRAG_THRESHOLD) held.moved = true
        field.dragTarget = {
          x: Math.min(DRAG_BOUNDS.right, Math.max(DRAG_BOUNDS.left, point.x + held.grab.x)),
          y: Math.min(DRAG_BOUNDS.bottom, Math.max(DRAG_BOUNDS.top, point.y + held.grab.y)),
        }
      }}
      onPointerUp={release}
      onPointerCancel={() => { gesture.current = null; release() }}
      onClick={(event) => {
        // Keyboard activation reports detail 0; a pointer click only selects when it was not a drag.
        if (!event.detail || !gesture.current?.moved) select(module.id)
        gesture.current = null
      }}>
      <i aria-hidden="true" /><span>{module.label}<small aria-hidden="true" ref={(element) => { vectorElements.current[index] = element }} /></span>
    </button>)}
    {active ? <FieldTools active={active} /> : <FieldReading live={interactive} />}
    <nav className="field-arc" aria-label="Magnetic navigation">
      {modules.map((module, index) => <button key={module.id} type="button" disabled={!interactive}
        aria-label={module.label} aria-pressed={active === module.id} onClick={() => select(module.id)}
        style={{ left: anchors[index][0], top: anchors[index][1] }}>
        <span>0{index + 1}</span><small>{module.short}</small>
      </button>)}
    </nav>
  </section>
}

function FieldReading({ live }: { live: boolean }) {
  const stress = useOS((state) => state.telemetryState.stressMode, live)
  const latency = useOS((state) => state.telemetryState.liveLatencyMs, live)
  return <output className="field-response" aria-live="off">{stress ? 'Gravitational stress' : 'Field stable'} · {latency.toFixed(1)} ms</output>
}
