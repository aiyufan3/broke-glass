import { useState } from 'react'
import { channels, clockText, modules, quickCommands, searchNodes, tracks } from '../../data/osData'
import type { ModuleId } from '../../data/osData'
import { useCommandLine, useOS, useOSActions, useRecentLogs } from '../../state/osStore'

export default function WetwareOrgan({ active, onSignal }: { active: ModuleId; onSignal: () => void }) {
  const label = modules.find((module) => module.id === active)!.label
  return <section key={active} className="wet-organ" data-organ={active} aria-label={label}>
    <header><span>Differentiated cell</span><h3>{label}</h3></header>
    {active === 'console' && <ConsoleOrgan onSignal={onSignal} />}
    {active === 'telemetry' && <TelemetryOrgan onSignal={onSignal} />}
    {active === 'search' && <SearchOrgan />}
    {active === 'media' && <MediaOrgan />}
  </section>
}

function ConsoleOrgan({ onSignal }: { onSignal: () => void }) {
  const logs = useRecentLogs()
  const actions = useOSActions()
  const line = useCommandLine()
  return <>
    <ol className="wet-secretions" role="log" aria-label="Console logs">
      {logs.map((log) => <li key={log.id} data-level={log.level}><time>{log.timestamp}</time>{log.input && <b>{log.input} </b>}{log.output}</li>)}
    </ol>
    <form className="wet-feed" onSubmit={(event) => {
      event.preventDefault()
      const feed = event.currentTarget.elements.namedItem('feed') as HTMLInputElement
      actions.execute(feed.value)
      line.resetHistory()
      feed.value = ''
      onSignal()
    }}><input autoFocus onKeyDown={line.onKeyDown} onInput={line.onInput} data-os-command name="feed" aria-label="Console command" placeholder="Feed the nucleus" autoComplete="off" /><button type="submit">Send</button></form>
    <div className="wet-vesicles" role="group" aria-label="Quick commands">
      {quickCommands.map((command) => <button type="button" key={command} onClick={() => { actions.execute(command); onSignal() }}>{command}</button>)}
    </div>
  </>
}

function TelemetryOrgan({ onSignal }: { onSignal: () => void }) {
  const actions = useOSActions()
  const latency = useOS((state) => state.telemetryState.liveLatencyMs)
  const frame = useOS((state) => state.telemetryState.scanFrame)
  const selected = useOS((state) => state.telemetryState.selectedChannel)
  const stress = useOS((state) => state.telemetryState.stressMode)
  return <>
    <p className="wet-metric">{latency.toFixed(1)}<small>ms</small></p>
    <p className="wet-note">frame {frame} · {stress ? 'inflamed' : 'homeostasis'}</p>
    <div className="wet-vesicles" role="group" aria-label="Telemetry channels">{channels.map((channel, index) =>
      <button key={channel} type="button" aria-pressed={selected === index} onClick={() => actions.setChannel(index)}>{channel}</button>)}</div>
    <button type="button" className="wet-toxin" aria-pressed={stress} onClick={() => { actions.setStress(!stress); onSignal() }}>Stress mode</button>
  </>
}

function SearchOrgan() {
  const actions = useOSActions()
  const query = useOS((state) => state.searchQuery)
  const results = searchNodes(query)
  const [expanded, setExpanded] = useState<string | null>(null)
  return <>
    <input className="wet-query" aria-label="Search nodes" value={query} onChange={(event) => actions.setSearch(event.currentTarget.value)} placeholder="Find a specimen" />
    <ul className="wet-memories">{results.map((node) => <li key={node.coordinate}>
      <button type="button" className="wet-result" aria-expanded={expanded === node.coordinate}
        onClick={() => setExpanded(expanded === node.coordinate ? null : node.coordinate)}>
        <i aria-hidden="true" style={{ scale: String(.5 + (node.score - 80) / 36) }} /><b>{node.label}</b><span>{node.type} · {node.coordinate} · {node.score}%</span>
      </button>
      {expanded === node.coordinate && <div className="wet-detail">
        <p>{node.text}</p>
        <button type="button" onClick={() => actions.inspectNode(node)}>Send to nucleus</button>
      </div>}
    </li>)}</ul>
    {!results.length && <p className="wet-note">No matching nodes.</p>}
  </>
}

function MediaOrgan() {
  const actions = useOSActions()
  const trackIndex = useOS((state) => state.mediaState.trackIndex)
  const progress = useOS((state) => state.mediaState.progress)
  const playing = useOS((state) => state.mediaState.isPlaying)
  const sound = useOS((state) => state.mediaState.soundEnabled)
  const track = tracks[trackIndex]
  return <>
    <p className="wet-track">0{trackIndex + 1} / {track.title}</p>
    <p className="wet-metric">{clockText(progress)}<small>of {clockText(track.duration)}</small></p>
    <p className="wet-note">{track.frequency} Hz {track.wave}</p>
    <input className="wet-seek" type="range" min="0" max={track.duration} step=".1" value={progress} aria-label="Playback position" onChange={(event) => actions.seek(+event.currentTarget.value)} />
    <div className="wet-vesicles" role="group" aria-label="Transport">
      <button type="button" aria-label="Previous track" onClick={() => actions.setTrack(trackIndex - 1)}>‹</button>
      <button type="button" onClick={actions.togglePlayback}>{playing ? 'Pause' : 'Play'}</button>
      <button type="button" aria-label="Next track" onClick={() => actions.setTrack(trackIndex + 1)}>›</button>
      <button type="button" aria-pressed={sound} onClick={actions.toggleSound}>Sound</button>
    </div>
  </>
}
