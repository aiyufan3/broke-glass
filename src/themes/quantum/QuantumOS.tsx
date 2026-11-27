import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { modules, nodes as specimens, searchNodes, system, tracks } from '../../data/osData'
import type { ParadigmProps } from '../../data/paradigms'
import { surface, useFrameLoop } from '../../state/frameLoop'
import { useCommandLine, useOS, useOSActions, useOSSnapshot } from '../../state/osStore'
import { useToolFocus } from '../../state/toolFocus'
import type { ConsoleLog, OSState } from '../../state/osStore'
import QuantumTools from './QuantumTools'
import { COORDINATES, CORE, SURFACE, createCloud, encodeBits, kick, settleCloud, stepCloud } from './cloud'
import type { Formation } from './cloud'
import { paintCloud } from './renderer'
import './quantum.css'

const burst = { boot: 0, command: .45, inspect: .5, scan: .8, spike: 1.25 } as const
const CALIBRATION_MS = 620
const STROBE_MS = 420
const scores = specimens.map((specimen) => specimen.score)
// Standing-wave antinodes scale with pitch: 43, 65 and 87 Hz resolve to 3, 5 and 6 lobes.
const antinodes = (frequency: number) => Math.round(frequency / 14)

function createEncoder() {
  let source: ConsoleLog | undefined
  let bits = encodeBits('')
  let query: string | null = null
  let matches: boolean[] = []
  function code(state: OSState) {
    const latest = state.consoleLogs.at(-1)
    if (latest !== source) {
      source = latest
      bits = encodeBits(latest ? latest.input ?? latest.output : '')
    }
    return bits
  }
  function formation(state: OSState): Formation | null {
    switch (state.activeModule) {
      case 'console': return { kind: 'console', bits: code(state) }
      case 'telemetry': return { kind: 'telemetry', trace: state.telemetryState.trace, stress: state.telemetryState.stressMode }
      case 'media': {
        const { trackIndex, isPlaying, progress } = state.mediaState
        const track = tracks[trackIndex]
        return { kind: 'media', antinodes: antinodes(track.frequency), playing: isPlaying, progress: progress / track.duration }
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
  return { code, formation }
}

export default function QuantumOS({ interactive }: ParadigmProps) {
  const host = useRef<HTMLElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const prompt = useRef<HTMLInputElement>(null)
  const observed = useRef(-1)
  const strobe = useRef(0)
  const line = useCommandLine()
  const [cloud] = useState(createCloud)
  const [encoder] = useState(createEncoder)
  const [calibrating, setCalibrating] = useState(false)
  const active = useOS((state) => state.activeModule, interactive)
  const [count, force, dispersion] = useOS((state) => state.paradigmParams.quantum, interactive)
  const stress = useOS((state) => state.telemetryState.stressMode, interactive)
  const impulse = useOS((state) => state.impulse, interactive)
  const snapshot = useOSSnapshot(interactive)
  const actions = useOSActions()

  const invalidate = useFrameLoop(host, interactive, ({ time, delta, still, ratio }) => {
    const state = snapshot()
    const inputs = { count, force: force / 100, observed: active ? -1 : observed.current, calibrating, formation: encoder.formation(state), stress }
    if (still) settleCloud(cloud, inputs, time)
    else stepCloud(cloud, inputs, time, delta)
    strobe.current = still ? 0 : Math.max(0, strobe.current - delta / STROBE_MS)
    const ctx = surface(canvas.current, SURFACE.width, SURFACE.height, ratio)
    if (!ctx) return
    paintCloud(ctx, cloud, {
      time, count, dispersion, stress, observed: inputs.observed, strobe: strobe.current,
      code: encoder.code(state), trace: state.telemetryState.trace, frame: state.telemetryState.scanFrame,
    })
  })

  useEffect(invalidate, [invalidate, active, count, force, dispersion, stress, calibrating, impulse])

  const previousForce = useRef(force)
  useEffect(() => {
    if (previousForce.current === force) return
    previousForce.current = force
    setCalibrating(true)
    const timer = window.setTimeout(() => setCalibrating(false), CALIBRATION_MS)
    return () => clearTimeout(timer)
  }, [force])

  const seenImpulse = useRef(impulse.seq)
  useEffect(() => {
    if (impulse.seq === seenImpulse.current) return
    seenImpulse.current = impulse.seq
    kick(cloud, burst[impulse.kind])
    strobe.current = 1
  }, [cloud, impulse])

  // Declared before the prompt effect: for the console, the prompt below the workspace takes focus last.
  useToolFocus(host, active, interactive, { tool: '.quantum-workspace', launchers: '.quantum-coordinate' })
  useEffect(() => {
    if (interactive && active === 'console') prompt.current?.focus({ preventScroll: true })
  }, [active, interactive])

  function observe(index: number) {
    observed.current = index
    invalidate()
  }

  return <section className="quantum-os" aria-label="QuantumOS particle space" ref={host} data-active={active ?? undefined}
    data-stress={stress} style={{ '--rgb': `${dispersion}px` } as CSSProperties}>
    <canvas className="quantum-sky" ref={canvas} aria-hidden="true" />
    <header className="quantum-identity">
      <p>Q/OS<span>+&nbsp; Observation field</span></p>
      <h2>Quantum<span>OS</span></h2>
    </header>
    {active && <div className="quantum-live-axis"><QuantumReading index={1} live={interactive} /><QuantumReading index={2} live={interactive} /></div>}
    <button type="button" className="quantum-core" style={{ left: CORE.x, top: CORE.y }} disabled={!interactive}
      tabIndex={active ? -1 : undefined} onClick={() => actions.setActiveModule('console')}>
      <span aria-hidden="true">+</span><strong>{system.label}</strong><small>{system.status} / coherent field</small>
    </button>
    {modules.map((module, index) => <button type="button" key={module.id} className="quantum-coordinate" disabled={!interactive}
      style={{ left: COORDINATES[index].x, top: COORDINATES[index].y }} aria-label={module.label} aria-pressed={active === module.id} tabIndex={active ? -1 : undefined}
      onPointerEnter={() => observe(index)} onPointerLeave={() => observe(-1)}
      onFocus={(event) => { if (event.currentTarget.matches(':focus-visible')) observe(index) }} onBlur={() => observe(-1)}
      onClick={() => actions.setActiveModule(module.id)}>
      <span aria-hidden="true">+</span><strong>{module.label}</strong>
      <QuantumReading index={index} live={interactive} hidden />
    </button>)}
    {active && <QuantumTools active={active} />}
    <form className="quantum-command" onSubmit={(event) => {
      event.preventDefault()
      actions.execute(prompt.current!.value)
      line.resetHistory()
      prompt.current!.value = ''
    }}>
      <button type="button" disabled={!interactive} aria-label="Focus observation prompt" onClick={() => prompt.current?.focus()}>› <span>_</span></button>
      <input onKeyDown={line.onKeyDown} onInput={line.onInput} data-os-command aria-label="Console command" placeholder="Awaiting observation" ref={prompt} autoComplete="off" disabled={!interactive} />
      <button className="sr-only" type="submit" disabled={!interactive}>Run command</button>
    </form>
  </section>
}

function QuantumReading({ index, live, hidden }: { index: number; live: boolean; hidden?: boolean }) {
  const reading = useOS(({ telemetryState: telemetry, mediaState: media }) => {
    const entropy = telemetry.stressMode ? .33 : .026
    switch (index) {
      case 0: return `x: ${(.42 * Math.sin(telemetry.scanFrame * .047) + entropy * Math.sin(telemetry.scanFrame)).toFixed(3)}`
      case 1: return `τ: ${telemetry.liveLatencyMs.toFixed(1)} ms`
      case 2: return `ψ: ${(.98 - entropy * (1.1 + Math.sin(telemetry.scanFrame * .17))).toFixed(3)}`
      default: return `f: ${tracks[media.trackIndex].frequency} Hz · ${media.isPlaying ? 'emitting' : 'held'}`
    }
  }, live)
  // Inside a launcher the reading changes every tick, so it stays out of the launcher's accessible name.
  return <small aria-hidden={hidden || undefined}>{reading}</small>
}
