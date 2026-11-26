import { useEffect, useRef, useState } from 'react'
import { channels, modules, nodes as specimens, searchNodes, system, tracks } from '../../data/osData'
import type { ParadigmProps } from '../../data/paradigms'
import { surface, useFrameLoop } from '../../state/frameLoop'
import { useOS, useOSActions, useOSSnapshot } from '../../state/osStore'
import type { OSState } from '../../state/osStore'
import { useWallClock } from '../../state/wallClock'
import TelemetryBay from './TelemetryBay'
import { paintScan, paintScope, paintSpark } from './renderer'
import type { Spark } from './renderer'
import { SCAN, SCOPE, SPARK, advanceSweep, beamHeight, createSweep, restSweep, retrigger, sweepSeconds } from './signal'
import type { Sweep } from './signal'
import './telemetry.css'

const READOUT_INTERVAL_MS = 120

function createSparks(sweep: Sweep) {
  let query: string | null = null
  let matches: boolean[] = []
  return (state: OSState): Spark[] => {
    if (state.searchQuery !== query) {
      query = state.searchQuery
      const found = searchNodes(query)
      matches = specimens.map((specimen) => found.includes(specimen))
    }
    const track = tracks[state.mediaState.trackIndex]
    return [
      { kind: 'latency', trace: state.telemetryState.trace },
      { kind: 'profile', channel: state.telemetryState.selectedChannel, sweep },
      { kind: 'index', matches },
      { kind: 'audio', wave: track.wave, frequency: track.frequency, playing: state.mediaState.isPlaying },
    ]
  }
}

export default function TelemetryOS({ interactive }: ParadigmProps) {
  const host = useRef<HTMLElement>(null)
  const scan = useRef<HTMLCanvasElement>(null)
  const scope = useRef<HTMLCanvasElement>(null)
  const sparkCanvases = useRef<(HTMLCanvasElement | null)[]>([])
  const height = useRef<HTMLSpanElement>(null)
  const readoutAt = useRef(-READOUT_INTERVAL_MS)
  const scanHeight = useRef<number>(SCAN.height)
  const [sweep] = useState(createSweep)
  const [sparks] = useState(() => createSparks(sweep))
  const active = useOS((state) => state.activeModule, interactive)
  const stress = useOS((state) => state.telemetryState.stressMode, interactive)
  const channel = useOS((state) => state.telemetryState.selectedChannel, interactive)
  const [rate, noise, gain] = useOS((state) => state.paradigmParams.telemetry, interactive)
  const latestLog = useOS((state) => state.consoleLogs.at(-1), interactive)
  const impulse = useOS((state) => state.impulse, interactive)
  const snapshot = useOSSnapshot(interactive)
  const clock = useWallClock('second', interactive)
  const actions = useOSActions()
  const period = sweepSeconds(rate, stress)

  const invalidate = useFrameLoop(host, interactive, ({ time, delta, still, ratio }) => {
    if (still) restSweep(sweep)
    else advanceSweep(sweep, delta / 1000, period)
    const view = { sweep, channel, noise: noise / 100, gain: gain / 100, stress }
    const scanContext = surface(scan.current, SCAN.width, scanHeight.current, ratio)
    if (scanContext) paintScan(scanContext, view, scanHeight.current)
    const scopeContext = surface(scope.current, SCOPE.width, SCOPE.height, ratio)
    if (scopeContext) paintScope(scopeContext, view, time / 1000)
    sparks(snapshot()).forEach((spark, index) => {
      const context = surface(sparkCanvases.current[index], SPARK.width, SPARK.height, ratio)
      if (context) paintSpark(context, spark, time / 1000)
    })
    // The height readout follows the beam; a slower cadence keeps the digits legible.
    if (height.current && (still || time - readoutAt.current >= READOUT_INTERVAL_MS)) {
      readoutAt.current = time
      height.current.textContent = `${beamHeight(channel, sweep).toFixed(2)} μm`
    }
  })

  useEffect(invalidate, [invalidate, rate, noise, gain, stress, channel, active])

  // The scan area follows the grid as the inspection bay steps open; its canvas is redrawn at each new height.
  useEffect(() => {
    const element = scan.current
    if (!element) return
    const observer = new ResizeObserver(() => {
      if (!element.clientHeight || element.clientHeight === scanHeight.current) return
      scanHeight.current = element.clientHeight
      invalidate()
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [invalidate])

  const seenImpulse = useRef(impulse.seq)
  useEffect(() => {
    if (impulse.seq === seenImpulse.current) return
    seenImpulse.current = impulse.seq
    retrigger(sweep)
  }, [sweep, impulse])

  const current = modules.find((module) => module.id === active)
  const position = modules.findIndex((module) => module.id === active) + 1
  return <section className="telemetry-os" aria-label="TelemetryOS scanning instrument" ref={host}
    data-active={active ?? undefined} data-stress={stress}>
    <header className="tel-head">
      <div className="tel-mark"><span>LAB / 04 · SIM</span><span>SEM–00{channel + 1}</span></div>
      <h2>Telemetry<span>OS</span></h2>
      <div className="tel-head-foot"><span>Scanning instrument</span><time dateTime={clock}>{clock}</time></div>
    </header>
    <div className="tel-metadata">
      <button type="button" disabled={!interactive} onClick={() => actions.setActiveModule(active ? null : 'console')}>
        <span>{system.label}</span><strong><i />{system.status}</strong>
      </button>
      <div><span>Latency</span><strong><Reading live={interactive} index={0} /></strong></div>
      <div><span>Scan frame</span><strong><Reading live={interactive} index={4} /></strong></div>
    </div>
    <figure className="tel-scan" data-channel={channel}>
      <figcaption><span>01 / Surface profile · <span className="tel-period">{period.toFixed(2)} s/pass</span></span><span className="tel-channel-label">CH 0{channel + 1} / {channels[channel].toUpperCase()}</span></figcaption>
      <canvas className="tel-surface" ref={scan} aria-hidden="true" />
      <div className="tel-wave">
        <canvas ref={scope} aria-hidden="true" />
        <span>−1 V</span><span>+1 V</span>
      </div>
    </figure>
    <div className="tel-table" role="group" aria-label="Module readouts">
      <div className="tel-columns" aria-hidden="true"><span>#</span><span>Module</span><span>Value</span><span>Trace</span></div>
      {modules.map((module, index) => <button className="tel-row" key={module.id} type="button"
        disabled={!interactive} onClick={() => actions.setActiveModule(module.id)} aria-pressed={active === module.id}
        aria-label={module.label}>
        <span>{String(index + 1).padStart(2, '0')}</span><strong>{module.label}</strong>
        <output aria-hidden="true">{index === 1 ? <span ref={height} /> : <Reading live={interactive} index={index} />}</output>
        <canvas ref={(element) => { sparkCanvases.current[index] = element }} aria-hidden="true" />
      </button>)}
    </div>
    <output className="tel-inspection"><span>Log</span><span>{current ? `0${position} / ${current.label.toUpperCase()} · ${active === 'console' ? latestLog?.output ?? 'BUFFER CLEAR' : 'INSPECTION OPEN'}` : 'Awaiting operator input.'}</span></output>
    {active ? <TelemetryBay active={active} /> : <div className="tel-command"><span>Cmd</span><button type="button" disabled={!interactive} onClick={() => actions.setActiveModule('console')}>Open instrument console</button></div>}
    <nav className="tel-keystrip" aria-label="Instrument keys">
      {modules.map((module, index) => <button type="button" key={module.id} disabled={!interactive}
        aria-label={module.label} aria-pressed={active === module.id} onClick={() => actions.setActiveModule(module.id)}>
        <small>0{index + 1}</small><strong>{module.short}</strong>
      </button>)}
    </nav>
  </section>
}

function Reading({ index, live }: { index: number; live: boolean }) {
  const value = useOS(({ telemetryState: telemetry, mediaState: media, searchQuery }) => {
    switch (index) {
      case 0: return `${telemetry.liveLatencyMs.toFixed(2)} ms`
      case 2: return `${searchNodes(searchQuery).length} NODES`
      case 3: return `${tracks[media.trackIndex].frequency} Hz ${media.isPlaying ? 'ON' : 'HOLD'}`
      default: return String(telemetry.scanFrame).padStart(5, '0')
    }
  }, live)
  return <>{value}</>
}
