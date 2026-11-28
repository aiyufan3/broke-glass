import { useState } from 'react'
import type { CSSProperties } from 'react'
import { channels, clockText, modules, quickCommands, searchNodes, tracks } from '../../data/osData'
import type { ModuleId } from '../../data/osData'
import { useCommandLine, useOS, useOSActions, useRecentLogs } from '../../state/osStore'
import { RIM, polar } from './potential'

const hub = { x: RIM, y: RIM }

function onRim(degrees: number): CSSProperties {
  const { x, y } = polar(hub, degrees, RIM)
  return { left: x, top: y }
}

export default function FieldTools({ active }: { active: ModuleId }) {
  const actions = useOSActions()
  const index = modules.findIndex((module) => module.id === active)
  const { label } = modules[index]
  return <section className="field-workspace" data-tool={active} aria-label={label} key={active}>
    <button type="button" className="field-return" onClick={() => actions.setActiveModule(null)}><span>Return to orbit</span><i aria-hidden="true" /></button>
    <div className="field-tool">
      <header className="field-tool-head"><span>Polar workspace · 0{index + 1}</span><h3>{label}</h3></header>
      {active === 'console' && <FieldConsole />}
      {active === 'telemetry' && <FieldTelemetry />}
      {active === 'search' && <FieldSearch />}
      {active === 'media' && <FieldMedia />}
    </div>
    {active === 'console' && <ConsoleOrbit />}
    {active === 'telemetry' && <TelemetryOrbit />}
    {active === 'media' && <MediaOrbit />}
  </section>
}

function FieldConsole() {
  const logs = useRecentLogs()
  const actions = useOSActions()
  const line = useCommandLine()
  return <>
    <div className="field-log" role="log" aria-label="Console logs">
      {logs.map((log) => <p key={log.id} data-level={log.level}><time>{log.timestamp}</time>{log.input && <b>› {log.input} </b>}{log.output}</p>)}
    </div>
    <form className="field-prompt" onSubmit={(event) => {
      event.preventDefault()
      const input = event.currentTarget.elements.namedItem('command') as HTMLInputElement
      actions.execute(input.value)
      line.resetHistory()
      input.value = ''
    }}>
      <span aria-hidden="true">›</span>
      <input ref={line.takeFocus} onKeyDown={line.onKeyDown} onInput={line.onInput} data-os-command name="command" aria-label="Console command" placeholder="Enter command" autoComplete="off" />
      <button type="submit" aria-label="Run command">⏎</button>
    </form>
  </>
}

function ConsoleOrbit() {
  const actions = useOSActions()
  return <div role="group" aria-label="Quick commands">
    {quickCommands.map((command, index) => <button type="button" className="field-satellite" key={command}
      style={onRim(130 - index * 20)} onClick={() => actions.execute(command)}>{command}</button>)}
  </div>
}

function FieldTelemetry() {
  const latency = useOS((state) => state.telemetryState.liveLatencyMs)
  const frame = useOS((state) => state.telemetryState.scanFrame)
  const trace = useOS((state) => state.telemetryState.trace)
  return <>
    <p className="field-gauge"><strong>{latency.toFixed(1)}</strong><span>ms</span></p>
    <dl className="field-stats">
      <div><dt>Min</dt><dd>{Math.min(...trace).toFixed(1)}</dd></div>
      <div><dt>Max</dt><dd>{Math.max(...trace).toFixed(1)}</dd></div>
      <div><dt>Φ frame</dt><dd>{frame}</dd></div>
    </dl>
  </>
}

function TelemetryOrbit() {
  const actions = useOSActions()
  const selected = useOS((state) => state.telemetryState.selectedChannel)
  const stress = useOS((state) => state.telemetryState.stressMode)
  return <>
    <div role="group" aria-label="Telemetry channels">
      {channels.map((channel, index) => <button type="button" className="field-satellite" key={channel}
        style={onRim(134 - index * 20)} aria-pressed={selected === index} onClick={() => actions.setChannel(index)}>{channel}</button>)}
    </div>
    <button type="button" className="field-satellite" style={onRim(44)} aria-label="Stress mode" aria-pressed={stress}
      onClick={() => actions.setStress(!stress)}>Stress</button>
  </>
}

function FieldSearch() {
  const actions = useOSActions()
  const query = useOS((state) => state.searchQuery)
  const results = searchNodes(query)
  const [expanded, setExpanded] = useState<string | null>(null)
  return <>
    <input className="field-query" aria-label="Search nodes" value={query} onChange={(event) => actions.setSearch(event.currentTarget.value)} placeholder="Find an orbital coordinate" />
    <ul className="field-results">{results.map((node) => <li key={node.coordinate}>
      <button type="button" className="field-result" aria-expanded={expanded === node.coordinate}
        onClick={() => setExpanded(expanded === node.coordinate ? null : node.coordinate)}>
        <strong>{node.label}</strong><span>{node.coordinate} / {node.type} / {node.score}%</span>
      </button>
      {expanded === node.coordinate && <div className="field-detail">
        <p>{node.text}</p>
        <button type="button" onClick={() => actions.inspectNode(node)}>Trace in Console</button>
      </div>}
    </li>)}</ul>
    {!results.length && <p className="field-empty">No matching nodes.</p>}
  </>
}

function FieldMedia() {
  const actions = useOSActions()
  const trackIndex = useOS((state) => state.mediaState.trackIndex)
  const progress = useOS((state) => state.mediaState.progress)
  const track = tracks[trackIndex]
  return <>
    <p className="field-track">0{trackIndex + 1} / {track.title}</p>
    <p className="field-time"><strong>{clockText(progress)}</strong>{clockText(track.duration)} · {track.frequency} Hz {track.wave}</p>
    <input className="field-seek" type="range" min="0" max={track.duration} step=".1" value={progress} aria-label="Playback position" onChange={(event) => actions.seek(+event.currentTarget.value)} />
  </>
}

function MediaOrbit() {
  const actions = useOSActions()
  const trackIndex = useOS((state) => state.mediaState.trackIndex)
  const playing = useOS((state) => state.mediaState.isPlaying)
  const sound = useOS((state) => state.mediaState.soundEnabled)
  return <div role="group" aria-label="Transport">
    <button type="button" className="field-satellite" style={onRim(123)} aria-label="Previous track" onClick={() => actions.setTrack(trackIndex - 1)}>‹</button>
    <button type="button" className="field-satellite" style={onRim(101)} onClick={actions.togglePlayback}>{playing ? 'Pause' : 'Play'}</button>
    <button type="button" className="field-satellite" style={onRim(79)} aria-label="Next track" onClick={() => actions.setTrack(trackIndex + 1)}>›</button>
    <button type="button" className="field-satellite" style={onRim(57)} aria-pressed={sound} onClick={actions.toggleSound}>Sound</button>
  </div>
}
