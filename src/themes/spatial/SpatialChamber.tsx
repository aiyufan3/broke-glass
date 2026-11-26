import { useId, useState } from 'react'
import type { CSSProperties } from 'react'
import { channels, clockText, modules, quickCommands, searchNodes, tracks } from '../../data/osData'
import type { ModuleId } from '../../data/osData'
import { useCommandLine, useOS, useOSActions, useRecentLogs } from '../../state/osStore'

export default function SpatialChamber({ active }: { active: ModuleId }) {
  const id = useId()
  const actions = useOSActions()
  const index = modules.findIndex((module) => module.id === active)
  return <div className="spatial-chamber" key={active}>
    <button type="button" className="spatial-exit" onClick={() => actions.setActiveModule(null)}>‹ Exit chamber <span>Z +0</span></button>
    <div className="spatial-room">
      <section className="spatial-wall" aria-labelledby={`${id}-title`}>
        <small>Inner chamber / 0{index + 1}</small>
        <h3 id={`${id}-title`}>{modules[index].label}</h3>
        {active === 'console' && <ConsoleWall />}
        {active === 'telemetry' && <TelemetryWall />}
        {active === 'search' && <SearchWall />}
        {active === 'media' && <MediaWall />}
      </section>
    </div>
    <div className="spatial-plinth">
      {active === 'console' && <ConsolePlinth />}
      {active === 'telemetry' && <TelemetryPlinth />}
      {active === 'search' && <SearchPlinth />}
      {active === 'media' && <MediaPlinth />}
    </div>
  </div>
}

function ConsoleWall() {
  const logs = useRecentLogs()
  return <div className="spatial-log" role="log" aria-label="Console logs">
    {logs.map((log) => <p key={log.id} data-level={log.level}><time>{log.timestamp}</time>{log.input && <b>› {log.input} </b>}{log.output}</p>)}
  </div>
}

function ConsolePlinth() {
  const actions = useOSActions()
  const line = useCommandLine()
  return <>
    <form className="spatial-entry" onSubmit={(event) => {
      event.preventDefault()
      const command = event.currentTarget.elements.namedItem('command') as HTMLInputElement
      actions.execute(command.value)
      line.resetHistory()
      command.value = ''
    }}>
      <input autoFocus onKeyDown={line.onKeyDown} onInput={line.onInput} data-os-command name="command" aria-label="Console command" placeholder="Enter command" autoComplete="off" /><button type="submit">Run</button>
    </form>
    <div className="spatial-keys" role="group" aria-label="Quick commands">
      {quickCommands.map((command) => <button type="button" key={command} onClick={() => actions.execute(command)}>{command}</button>)}
    </div>
  </>
}

function TelemetryWall() {
  const latency = useOS((state) => state.telemetryState.liveLatencyMs)
  const frame = useOS((state) => state.telemetryState.scanFrame)
  const trace = useOS((state) => state.telemetryState.trace)
  const low = Math.min(...trace)
  const high = Math.max(...trace)
  const span = Math.max(.6, high - low)
  const points = trace.map((value, index) => `${(index * 300 / (trace.length - 1)).toFixed(1)},${(104 - (value - low) / span * 96).toFixed(1)}`)
  return <>
    <p className="spatial-reading"><strong>{latency.toFixed(1)}</strong><span>ms</span></p>
    <svg className="spatial-trace" viewBox="0 0 300 112" aria-hidden="true">
      <path d="M0 8.5h300M0 104.5h300" />
      <polyline points={points.join(' ')} />
    </svg>
    <dl className="spatial-figures">
      <div><dt>Frame</dt><dd>{frame}</dd></div>
      <div><dt>Low</dt><dd>{low.toFixed(1)}</dd></div>
      <div><dt>High</dt><dd>{high.toFixed(1)}</dd></div>
    </dl>
  </>
}

function TelemetryPlinth() {
  const actions = useOSActions()
  const selected = useOS((state) => state.telemetryState.selectedChannel)
  const stress = useOS((state) => state.telemetryState.stressMode)
  return <>
    <div className="spatial-keys" role="group" aria-label="Telemetry channels">{channels.map((channel, index) =>
      <button type="button" key={channel} aria-pressed={selected === index} onClick={() => actions.setChannel(index)}>{channel}</button>)}</div>
    <div className="spatial-keys"><button type="button" className="spatial-stress" aria-pressed={stress} onClick={() => actions.setStress(!stress)}>Stress mode · {stress ? 'ON' : 'OFF'}</button></div>
  </>
}

function SearchWall() {
  const actions = useOSActions()
  const query = useOS((state) => state.searchQuery)
  const results = searchNodes(query)
  const [expanded, setExpanded] = useState<string | null>(null)
  return <>
    <ol className="spatial-locations">{results.map((node) => <li key={node.coordinate}>
      <button type="button" className="spatial-result" aria-expanded={expanded === node.coordinate}
        onClick={() => setExpanded(expanded === node.coordinate ? null : node.coordinate)}>
        <span>{node.coordinate}</span><strong>{node.label}<small>{node.type}</small></strong><span>{node.score}%</span>
      </button>
      {expanded === node.coordinate && <div className="spatial-detail">
        <p>{node.text}</p>
        <button type="button" onClick={() => actions.inspectNode(node)}>Inspect in Console</button>
      </div>}
    </li>)}</ol>
    {!results.length && <p className="spatial-empty">No matching nodes.</p>}
  </>
}

function SearchPlinth() {
  const actions = useOSActions()
  const query = useOS((state) => state.searchQuery)
  return <label className="spatial-entry">
    <input aria-label="Search nodes" placeholder="Locate an aperture" value={query} onChange={(event) => actions.setSearch(event.currentTarget.value)} />
    <span>{searchNodes(query).length} found</span>
  </label>
}

function MediaWall() {
  const trackIndex = useOS((state) => state.mediaState.trackIndex)
  const progress = useOS((state) => state.mediaState.progress)
  const playing = useOS((state) => state.mediaState.isPlaying)
  const track = tracks[trackIndex]
  return <>
    <p className="spatial-track">0{trackIndex + 1} / {track.title}</p>
    <div className="spatial-slits" data-playing={playing} aria-hidden="true">{Array.from({ length: 16 }, (_, index) =>
      <i key={index} style={{ '--level': .2 + Math.sin(index * track.frequency * .013 + trackIndex) ** 2 * .8, '--phase': `${-index * .051}s` } as CSSProperties} />)}</div>
    <p className="spatial-reading"><strong>{clockText(progress)}</strong><span>of {clockText(track.duration)} · {track.frequency} Hz {track.wave}</span></p>
  </>
}

function MediaPlinth() {
  const actions = useOSActions()
  const trackIndex = useOS((state) => state.mediaState.trackIndex)
  const progress = useOS((state) => state.mediaState.progress)
  const playing = useOS((state) => state.mediaState.isPlaying)
  const sound = useOS((state) => state.mediaState.soundEnabled)
  return <>
    <input className="spatial-seek" type="range" min="0" max={tracks[trackIndex].duration} step=".1" aria-label="Playback position" value={progress} onChange={(event) => actions.seek(+event.currentTarget.value)} />
    <div className="spatial-keys" role="group" aria-label="Transport">
      <button type="button" aria-label="Previous track" onClick={() => actions.setTrack(trackIndex - 1)}>‹</button>
      <button type="button" onClick={actions.togglePlayback}>{playing ? 'Pause' : 'Play'}</button>
      <button type="button" aria-label="Next track" onClick={() => actions.setTrack(trackIndex + 1)}>›</button>
      <button type="button" aria-pressed={sound} onClick={actions.toggleSound}>Sound</button>
    </div>
  </>
}
