import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { channels, clockText, modules, quickCommands, searchNodes, tracks } from '../../data/osData'
import type { ModuleId } from '../../data/osData'
import { surface } from '../../state/frameLoop'
import { useCommandLine, useOS, useOSActions, useRecentLogs } from '../../state/osStore'
import { paintStrip } from './renderer'
import { STRIP } from './signal'

const STRIP_RATIO = 2

export default function TelemetryBay({ active }: { active: ModuleId }) {
  const actions = useOSActions()
  const name = modules.find((module) => module.id === active)?.label
  return <section key={active} className="tel-bay" aria-label={name}>
    <div className="tel-bay-head"><h3>{name} / Inspection</h3><button type="button" onClick={() => actions.setActiveModule(null)}>Close bay</button></div>
    {active === 'console' && <BayConsole />}
    {active === 'telemetry' && <BayTelemetry />}
    {active === 'search' && <BaySearch />}
    {active === 'media' && <BayMedia />}
  </section>
}

function BayConsole() {
  const logs = useRecentLogs()
  const actions = useOSActions()
  const line = useCommandLine()
  return <>
    <ol className="tel-records" role="log" aria-label="Console logs">
      {logs.map((log) => <li key={log.id} data-level={log.level}><time>{log.timestamp}</time><span>{log.input && <b>› {log.input} </b>}{log.output}</span></li>)}
    </ol>
    <form className="tel-bay-command" onSubmit={(event) => {
      event.preventDefault()
      const entry = event.currentTarget.elements.namedItem('command') as HTMLInputElement
      actions.execute(entry.value)
      line.resetHistory()
      entry.value = ''
    }}><label>CMD <input autoFocus onKeyDown={line.onKeyDown} onInput={line.onInput} data-os-command name="command" aria-label="Console command" autoComplete="off" placeholder="help" /></label><button type="submit" aria-label="Run command">↵</button></form>
    <div className="tel-quick" role="group" aria-label="Quick commands">
      {quickCommands.map((command) => <button type="button" key={command} onClick={() => actions.execute(command)}>{command}</button>)}
    </div>
  </>
}

function BayTelemetry() {
  const actions = useOSActions()
  const strip = useRef<HTMLCanvasElement>(null)
  const latency = useOS((state) => state.telemetryState.liveLatencyMs)
  const frame = useOS((state) => state.telemetryState.scanFrame)
  const selected = useOS((state) => state.telemetryState.selectedChannel)
  const stress = useOS((state) => state.telemetryState.stressMode)
  const trace = useOS((state) => state.telemetryState.trace)

  useEffect(() => {
    const context = surface(strip.current, STRIP.width, STRIP.height, STRIP_RATIO)
    if (context) paintStrip(context, trace, stress)
  }, [trace, stress])

  return <div className="tel-bay-telemetry">
    <p className="tel-meter"><strong>{latency.toFixed(1)} ms</strong><span>Frame {frame}</span></p>
    <canvas className="tel-strip" ref={strip} aria-hidden="true" />
    <div className="tel-keys">
      <div className="tel-controls" role="group" aria-label="Telemetry channels">{channels.map((channel, index) => <button key={channel} type="button" aria-pressed={selected === index} onClick={() => actions.setChannel(index)}>{channel}</button>)}</div>
      <button type="button" className="tel-stress" aria-pressed={stress} onClick={() => actions.setStress(!stress)}>Stress mode · {stress ? 'ON' : 'OFF'}</button>
    </div>
  </div>
}

function BaySearch() {
  const actions = useOSActions()
  const query = useOS((state) => state.searchQuery)
  const results = searchNodes(query)
  const [expanded, setExpanded] = useState<string | null>(null)
  return <>
    <input className="tel-query" aria-label="Search nodes" value={query} onChange={(event) => actions.setSearch(event.currentTarget.value)} placeholder="Filter specimen index" />
    <ul className="tel-index">{results.map((node) => <li key={node.coordinate}>
      <button type="button" className="tel-result" aria-expanded={expanded === node.coordinate}
        onClick={() => setExpanded(expanded === node.coordinate ? null : node.coordinate)}>
        <span>{node.coordinate}</span><b>{node.label}</b><span>{node.type}</span><strong>{node.score}%</strong>
      </button>
      {expanded === node.coordinate && <div className="tel-detail">
        <p>{node.text}</p>
        <button type="button" onClick={() => actions.inspectNode(node)}>Log specimen</button>
      </div>}
    </li>)}</ul>
    {!results.length && <p className="tel-empty">No matching nodes.</p>}
  </>
}

function BayMedia() {
  const actions = useOSActions()
  const trackIndex = useOS((state) => state.mediaState.trackIndex)
  const progress = useOS((state) => state.mediaState.progress)
  const playing = useOS((state) => state.mediaState.isPlaying)
  const sound = useOS((state) => state.mediaState.soundEnabled)
  const track = tracks[trackIndex]
  return <div className="tel-bay-media">
    <p className="tel-tape"><strong>{clockText(progress)}</strong><span>0{trackIndex + 1} / {track.title}<br />{track.frequency} Hz {track.wave} · {clockText(track.duration)}</span></p>
    <div className="tel-meter-bars" data-playing={playing} aria-hidden="true">
      {Array.from({ length: 28 }, (_, index) => <i key={index} style={{ '--bar': .15 + Math.sin(index * .8 + trackIndex) ** 2 * .85, '--shift': `${-index * .036}s` } as CSSProperties} />)}
    </div>
    <input type="range" min="0" max={track.duration} step=".1" value={progress} aria-label="Playback position" onChange={(event) => actions.seek(+event.currentTarget.value)} />
    <div className="tel-controls" role="group" aria-label="Transport">
      <button type="button" aria-label="Previous track" onClick={() => actions.setTrack(trackIndex - 1)}>−</button>
      <button type="button" onClick={actions.togglePlayback}>{playing ? 'Pause' : 'Play'}</button>
      <button type="button" aria-label="Next track" onClick={() => actions.setTrack(trackIndex + 1)}>+</button>
      <button type="button" aria-pressed={sound} onClick={actions.toggleSound}>Sound</button>
    </div>
  </div>
}
