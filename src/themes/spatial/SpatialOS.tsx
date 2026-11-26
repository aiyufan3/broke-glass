import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent } from 'react'
import '@fontsource/barlow-condensed/600.css'
import { modules, searchNodes, system, tracks } from '../../data/osData'
import type { ModuleId } from '../../data/osData'
import type { ParadigmProps } from '../../data/paradigms'
import { surface, useFrameLoop } from '../../state/frameLoop'
import { useOS, useOSActions } from '../../state/osStore'
import SpatialChamber from './SpatialChamber'
import { EYE, SLABS, SURFACE, cameraTransform, createFlight, previewTilt, sendPulse, settleFlight, stepFlight } from './camera'
import { paintSpace } from './renderer'
import './spatial.css'

const MAX_TILT = 16
const FARTHEST = Math.min(...SLABS.map((slab) => slab.z))
const NEAREST = Math.max(...SLABS.map((slab) => slab.z))

export default function SpatialOS({ interactive }: ParadigmProps) {
  const host = useRef<HTMLElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const scene = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)
  const look = useRef({ x: 0, y: 0 })
  const written = useRef<Record<string, string>>({})
  const [flight] = useState(createFlight)
  const entry = useOS((state) => state.activeModule, interactive)
  const [focal, tilt, fog] = useOS((state) => state.paradigmParams.spatial, interactive)
  const stress = useOS((state) => state.telemetryState.stressMode, interactive)
  const impulse = useOS((state) => state.impulse, interactive)
  const actions = useOSActions()
  const entered = entry ? modules.findIndex((module) => module.id === entry) : -1

  const invalidate = useFrameLoop(host, interactive, ({ delta, still, ratio }) => {
    const inputs = { entered, focal, lookX: look.current.x, lookY: look.current.y, tilt, stress }
    if (still) settleFlight(flight, inputs)
    else stepFlight(flight, inputs, delta / 1000)
    const context = surface(canvas.current, SURFACE.width, SURFACE.height, ratio)
    if (context) paintSpace(context, flight, { focal, fog: fog / 100 })

    const transform = cameraTransform(flight.camera)
    if (scene.current && written.current.transform !== transform) {
      written.current.transform = transform
      scene.current.style.transform = transform
    }
    const variables = {
      '--dive': flight.dive.toFixed(3),
      '--arrive': flight.arrive.toFixed(3),
      '--yaw': flight.yaw.toFixed(2),
      '--pitch': flight.pitch.toFixed(2),
      '--look-x': (flight.yaw / MAX_TILT).toFixed(3),
      '--look-y': (flight.pitch / MAX_TILT).toFixed(3),
    }
    for (const [name, value] of Object.entries(variables)) {
      if (written.current[name] === value) continue
      written.current[name] = value
      host.current?.style.setProperty(name, value)
    }
  })

  useEffect(invalidate, [invalidate, entered, focal, tilt, fog, stress])

  const previousTilt = useRef(tilt)
  useEffect(() => {
    const before = previousTilt.current
    previousTilt.current = tilt
    if (tilt !== before) previewTilt(flight, tilt || before * .25)
  }, [flight, tilt])

  const seenImpulse = useRef(impulse.seq)
  useEffect(() => {
    if (impulse.seq === seenImpulse.current) return
    seenImpulse.current = impulse.seq
    sendPulse(flight)
  }, [flight, impulse])

  useEffect(() => {
    if (!entry) trigger.current?.focus({ preventScroll: true })
  }, [entry])

  function follow(event: PointerEvent<HTMLElement>) {
    if (!interactive || event.pointerType === 'touch') return
    const bounds = event.currentTarget.getBoundingClientRect()
    look.current = {
      x: (event.clientX - bounds.left) / bounds.width * 2 - 1,
      y: (event.clientY - bounds.top) / bounds.height * 2 - 1,
    }
  }

  function dive(destination: ModuleId, from: HTMLButtonElement) {
    if (!interactive) return
    trigger.current = from
    actions.setActiveModule(destination)
  }

  return <section ref={host} className="spatial-os" aria-label="SpatialOS dimensional interfaces" data-depth={entry ?? undefined} data-stress={stress}
    style={{ '--depth': `${focal}px`, '--fog': fog / 100 } as CSSProperties}
    onPointerMove={follow} onPointerLeave={() => { look.current = { x: 0, y: 0 } }}>
    <canvas className="spatial-corridor" ref={canvas} aria-hidden="true" />
    <div className="spatial-view" aria-label="Depth planes" inert={entry !== null}>
      <div className="spatial-scene" ref={scene}>
        {modules.map((module, index) => {
          const slab = SLABS[index]
          const style = {
            '--x': `${slab.x}px`, '--y': `${slab.y}px`, '--z': `${slab.z}px`, '--yaw': `${slab.yaw}deg`, '--k': slab.scale,
            '--far': (NEAREST - slab.z) / (NEAREST - FARTHEST),
          } as CSSProperties
          return <button key={module.id} type="button" className="spatial-plane" style={style} disabled={!interactive}
            aria-label={module.label} data-entered={entry === module.id} data-side={slab.x < EYE.x ? 'left' : 'right'}
            data-level={slab.y < EYE.y ? 'above' : 'below'} onClick={(event) => dive(module.id, event.currentTarget)}>
            <span className="spatial-face">
              <small><b>0{index + 1}</b>Z {slab.z < 0 ? '−' : '+'}{Math.abs(slab.z)}</small>
              <span className={`spatial-window spatial-window-${index}`} aria-hidden="true">
                <span className="spatial-recess"><i /><i /><i /><i /></span>
                <span className="spatial-lightbox">
                  {module.id === 'console' && <LogAperture live={interactive} />}
                  {module.id === 'telemetry' && <TraceAperture live={interactive} />}
                  {module.id === 'search' && <IndexAperture live={interactive} />}
                  {module.id === 'media' && <AudioAperture live={interactive} />}
                </span>
              </span>
              <strong>{module.label}</strong>
            </span>
          </button>
        })}
      </div>
    </div>
    <header className="spatial-header" inert={entry !== null}>
      <p>Dimensional interface</p>
      <h2>Spatial <span>OS</span></h2>
      <button type="button" onClick={(event) => dive('console', event.currentTarget)} disabled={!interactive}>{system.label}<span>{system.status}</span></button>
    </header>
    <nav className="spatial-shelf" aria-label="Architectural shelf" inert={entry !== null}>
      {modules.map((module, index) => <button type="button" key={module.id} disabled={!interactive}
        aria-label={module.label} onClick={(event) => dive(module.id, event.currentTarget)}>
        <i aria-hidden="true" /><span>0{index + 1}</span>
      </button>)}
      <button type="button" disabled={!interactive} aria-label="Open command bay"
        onClick={(event) => dive('console', event.currentTarget)}><span aria-hidden="true">⌘</span></button>
    </nav>
    {entry && <SpatialChamber active={entry} />}
  </section>
}

function LogAperture({ live }: { live: boolean }) {
  const logs = useOS((state) => state.consoleLogs, live)
  return <span className="spatial-microlog">{logs.length ? logs.slice(-3).map((log) =>
    <i key={log.id}>› {log.output}</i>) : <i>Buffer clear</i>}</span>
}

function TraceAperture({ live }: { live: boolean }) {
  const latency = useOS((state) => state.telemetryState.liveLatencyMs, live)
  const trace = useOS((state) => state.telemetryState.trace, live)
  const low = Math.min(...trace)
  const span = Math.max(.6, Math.max(...trace) - low)
  const points = trace.slice(-32).map((value, index) => `${(index * 80 / 31).toFixed(1)},${(31 - (value - low) / span * 26).toFixed(1)}`)
  return <><svg viewBox="0 0 80 36"><polyline points={points.join(' ')} fill="none" stroke="currentColor" /></svg>
    <i className="spatial-inset-label">{latency.toFixed(1)} MS</i></>
}

function IndexAperture({ live }: { live: boolean }) {
  const query = useOS((state) => state.searchQuery, live)
  const matches = searchNodes(query)
  return <><svg viewBox="0 0 80 36"><g stroke="currentColor" fill="none" strokeWidth=".7">
    <ellipse cx="40" cy="18" rx="22" ry="12" /><ellipse cx="40" cy="18" rx="11" ry="6" />
    {matches.map((node, index) => <circle key={node.coordinate} cx={40 + 22 * Math.cos(index * 2.4)} cy={18 + 12 * Math.sin(index * 2.4)} r="1.7" fill="currentColor" />)}
  </g></svg><i className="spatial-inset-label">{matches.length} / {query || 'INDEX'}</i></>
}

function AudioAperture({ live }: { live: boolean }) {
  const trackIndex = useOS((state) => state.mediaState.trackIndex, live)
  const playing = useOS((state) => state.mediaState.isPlaying, live)
  const progress = useOS((state) => state.mediaState.progress, live)
  const { frequency } = tracks[trackIndex]
  return <><svg viewBox="0 0 80 36">{Array.from({ length: 15 }, (_, index) => {
    const level = Math.sin(index * frequency * .011 + (playing ? progress * 4 : 0)) ** 2
    return <path key={index} d={`M${5 + index * 5} 31v-${3 + level * (playing ? 25 : 7)}`} stroke="currentColor" strokeWidth="1.6" />
  })}</svg><i className="spatial-inset-label">0{trackIndex + 1} / {playing ? 'PLAY' : 'HOLD'}</i></>
}
