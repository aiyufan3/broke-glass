import { useEffect, useRef, useState } from 'react'
import { channels, clockText, modules, quickCommands, searchNodes, tracks } from '../../data/osData'
import type { ModuleId } from '../../data/osData'
import { surface } from '../../state/frameLoop'
import { useCommandLine, useOS, useOSActions, useRecentLogs } from '../../state/osStore'
import { paintWellLog } from './renderer'

/** Formations from youngest to oldest: depth is time, so the shallowest bed holds the console. */
export const FORMATIONS = ['Holocene', 'Pleistocene', 'Pliocene', 'Miocene'] as const
const WELL_LOG = { width: 96, height: 168 } as const

export default function StrataTools({ active, closing }: { active: ModuleId; closing: boolean }) {
  const actions = useOSActions()
  const index = modules.findIndex((module) => module.id === active)
  const { label } = modules[index]
  return <section className="strata-gallery" data-tool={active} aria-label={label} key={active} inert={closing}>
    <div className="strata-face">
      <header className="strata-gallery-head">
        <p>Gallery 0{index + 1} · {FORMATIONS[index]}</p>
        <h3>{label}</h3>
        <button type="button" onClick={() => actions.setActiveModule(null)}>Backfill</button>
      </header>
      {active === 'console' && <StrataConsole />}
      {active === 'telemetry' && <StrataTelemetry />}
      {active === 'search' && <StrataSearch />}
      {active === 'media' && <StrataMedia />}
    </div>
  </section>
}

function StrataConsole() {
  const logs = useRecentLogs()
  const actions = useOSActions()
  const line = useCommandLine()
  return <>
    <ol className="strata-log" role="log" aria-label="Console logs">
      {logs.map((log) => <li key={log.id} data-level={log.level}><time>{log.timestamp}</time><span>{log.input && <b>› {log.input} </b>}{log.output}</span></li>)}
    </ol>
    <form className="strata-prompt" onSubmit={(event) => {
      event.preventDefault()
      const input = event.currentTarget.elements.namedItem('command') as HTMLInputElement
      actions.execute(input.value)
      line.resetHistory()
      input.value = ''
    }}>
      <span aria-hidden="true">›</span>
      <input autoFocus onKeyDown={line.onKeyDown} onInput={line.onInput} data-os-command name="command" aria-label="Console command" placeholder="Log a command" autoComplete="off" />
      <button type="submit" aria-label="Run command">Deposit</button>
    </form>
    <div className="strata-quick" role="group" aria-label="Quick commands">
      {quickCommands.map((command) => <button type="button" key={command} onClick={() => actions.execute(command)}>{command}</button>)}
    </div>
  </>
}

function StrataTelemetry() {
  const actions = useOSActions()
  const log = useRef<HTMLCanvasElement>(null)
  const latency = useOS((state) => state.telemetryState.liveLatencyMs)
  const frame = useOS((state) => state.telemetryState.scanFrame)
  const selected = useOS((state) => state.telemetryState.selectedChannel)
  const stress = useOS((state) => state.telemetryState.stressMode)
  const trace = useOS((state) => state.telemetryState.trace)

  useEffect(() => {
    const context = surface(log.current, WELL_LOG.width, WELL_LOG.height, 2)
    if (context) paintWellLog(context, trace, stress, WELL_LOG.width, WELL_LOG.height)
  }, [trace, stress])

  return <div className="strata-telemetry">
    <div className="strata-gauge">
      <p><strong>{latency.toFixed(1)}</strong><span>ms latency</span></p>
      <dl>
        <div><dt>Frame</dt><dd>{frame}</dd></div>
        <div><dt>Low</dt><dd>{Math.min(...trace).toFixed(1)}</dd></div>
        <div><dt>High</dt><dd>{Math.max(...trace).toFixed(1)}</dd></div>
      </dl>
      <div className="strata-channels" role="group" aria-label="Telemetry channels">
        {channels.map((channel, index) => <button type="button" key={channel} aria-pressed={selected === index} onClick={() => actions.setChannel(index)}>{channel}</button>)}
      </div>
      <button type="button" className="strata-stress" aria-pressed={stress} onClick={() => actions.setStress(!stress)}>Stress mode · {stress ? 'faulted' : 'stable'}</button>
    </div>
    <figure className="strata-well">
      <canvas ref={log} aria-hidden="true" />
      <figcaption>Well log · 48 samples, newest at the top</figcaption>
    </figure>
  </div>
}

function StrataSearch() {
  const actions = useOSActions()
  const query = useOS((state) => state.searchQuery)
  const results = searchNodes(query)
  const [expanded, setExpanded] = useState<string | null>(null)
  return <>
    <input className="strata-query" aria-label="Search nodes" value={query} onChange={(event) => actions.setSearch(event.currentTarget.value)} placeholder="Core sample index" />
    <ul className="strata-results">{results.map((node) => <li key={node.coordinate}>
      <button type="button" className="strata-result" aria-expanded={expanded === node.coordinate}
        onClick={() => setExpanded(expanded === node.coordinate ? null : node.coordinate)}>
        <span>{node.coordinate}</span><strong>{node.label}</strong><span>{node.type} · {node.score}%</span>
      </button>
      {expanded === node.coordinate && <div className="strata-detail">
        <p>{node.text}</p>
        <button type="button" onClick={() => actions.inspectNode(node)}>Log to core</button>
      </div>}
    </li>)}</ul>
    {!results.length && <p className="strata-empty">No matching nodes.</p>}
  </>
}

function StrataMedia() {
  const actions = useOSActions()
  const trackIndex = useOS((state) => state.mediaState.trackIndex)
  const progress = useOS((state) => state.mediaState.progress)
  const playing = useOS((state) => state.mediaState.isPlaying)
  const sound = useOS((state) => state.mediaState.soundEnabled)
  const track = tracks[trackIndex]
  return <div className="strata-media">
    <p className="strata-track"><span>Layer 0{trackIndex + 1} of 0{tracks.length}</span><strong>{track.title}</strong><span>{track.frequency} Hz {track.wave}</span></p>
    <p className="strata-time"><strong>{clockText(progress)}</strong><span>/ {clockText(track.duration)}</span></p>
    <input className="strata-seek" type="range" min="0" max={track.duration} step=".1" value={progress} aria-label="Playback position" onChange={(event) => actions.seek(+event.currentTarget.value)} />
    <div className="strata-transport" role="group" aria-label="Transport">
      <button type="button" aria-label="Previous track" onClick={() => actions.setTrack(trackIndex - 1)}>Shallower</button>
      <button type="button" onClick={actions.togglePlayback}>{playing ? 'Pause' : 'Play'}</button>
      <button type="button" aria-label="Next track" onClick={() => actions.setTrack(trackIndex + 1)}>Deeper</button>
      <button type="button" aria-pressed={sound} onClick={actions.toggleSound}>Sound</button>
    </div>
  </div>
}
