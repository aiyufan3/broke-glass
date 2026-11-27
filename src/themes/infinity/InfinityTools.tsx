import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { channels, clockText, modules, quickCommands, searchNodes, tracks } from '../../data/osData'
import type { ModuleId } from '../../data/osData'
import { surface } from '../../state/frameLoop'
import { useCommandLine, useOS, useOSActions, useRecentLogs } from '../../state/osStore'
import { HUES, INKS } from './dots'
import { paintDotHistogram } from './renderer'

const HISTOGRAM = { width: 272, height: 150 } as const
type Hued = CSSProperties & Record<'--infinity-hue' | '--infinity-on-hue', string>
/** A dot's hue with the ink that reads on it. */
const hued = (index: number): Hued => ({ '--infinity-hue': HUES[index % HUES.length], '--infinity-on-hue': INKS[index % HUES.length] })

/** The tool is furniture inside the swallowed orb: every piece is a dot, a ring of dots or a pill. */
export default function InfinityTools({ active, closing, hue }: { active: ModuleId; closing: boolean; hue: number }) {
  const actions = useOSActions()
  const index = modules.findIndex((module) => module.id === active)
  const { label } = modules[index]
  const style = hued(hue)
  return <section className="infinity-room" data-tool={active} aria-label={label} inert={closing} style={style}>
    <header className="infinity-room-head">
      <p>Orb 0{index + 1} · inside</p>
      <h3>{label}</h3>
      <button type="button" onClick={() => actions.setActiveModule(null)}>Step out</button>
    </header>
    {active === 'console' && <InfinityConsole />}
    {active === 'telemetry' && <InfinityTelemetry />}
    {active === 'search' && <InfinitySearch />}
    {active === 'media' && <InfinityMedia />}
  </section>
}

function InfinityConsole() {
  const logs = useRecentLogs()
  const actions = useOSActions()
  const line = useCommandLine()
  return <>
    <div className="infinity-ring">
      <ol className="infinity-log" role="log" aria-label="Console logs">
        {logs.map((log, index) => <li key={log.id} data-level={log.level} style={hued(index)}>
          <time>{log.timestamp}</time><span>{log.input && <b>{log.input} · </b>}{log.output}</span>
        </li>)}
      </ol>
    </div>
    <form className="infinity-prompt" onSubmit={(event) => {
      event.preventDefault()
      const input = event.currentTarget.elements.namedItem('command') as HTMLInputElement
      actions.execute(input.value)
      line.resetHistory()
      input.value = ''
    }}>
      <input autoFocus onKeyDown={line.onKeyDown} onInput={line.onInput} data-os-command name="command" aria-label="Console command" placeholder="Seed a command" autoComplete="off" />
      <button type="submit" aria-label="Run command">Seed</button>
    </form>
    <div className="infinity-quick" role="group" aria-label="Quick commands">
      {quickCommands.map((command, index) => <button type="button" key={command} style={hued(index)}
        onClick={() => actions.execute(command)}>{command}</button>)}
    </div>
  </>
}

function InfinityTelemetry() {
  const actions = useOSActions()
  const matrix = useRef<HTMLCanvasElement>(null)
  const latency = useOS((state) => state.telemetryState.liveLatencyMs)
  const selected = useOS((state) => state.telemetryState.selectedChannel)
  const stress = useOS((state) => state.telemetryState.stressMode)
  const trace = useOS((state) => state.telemetryState.trace)

  useEffect(() => {
    const context = surface(matrix.current, HISTOGRAM.width, HISTOGRAM.height, 2)
    if (context) paintDotHistogram(context, trace, stress, HISTOGRAM.width, HISTOGRAM.height)
  }, [trace, stress])

  return <div className="infinity-telemetry">
    <p className="infinity-latency"><strong>{latency.toFixed(1)}</strong><span>ms</span></p>
    <figure className="infinity-matrix">
      <canvas ref={matrix} aria-hidden="true" />
      <figcaption>48 samples in 16 bands, one dot per step</figcaption>
    </figure>
    <div className="infinity-channels" role="group" aria-label="Telemetry channels">
      {channels.map((channel, index) => <button type="button" key={channel} aria-pressed={selected === index}
        style={hued(index)} onClick={() => actions.setChannel(index)}>{channel}</button>)}
    </div>
    <button type="button" className="infinity-stress" aria-pressed={stress} onClick={() => actions.setStress(!stress)}>Stress mode · {stress ? 'obliterating' : 'calm'}</button>
  </div>
}

function InfinitySearch() {
  const actions = useOSActions()
  const query = useOS((state) => state.searchQuery)
  const results = searchNodes(query)
  const [expanded, setExpanded] = useState<string | null>(null)
  return <>
    <input className="infinity-query" aria-label="Search nodes" value={query} onChange={(event) => actions.setSearch(event.currentTarget.value)} placeholder="Call an orb from the horizon" />
    <ul className="infinity-results">{results.map((node, index) => <li key={node.coordinate} style={{ ...hued(index), '--infinity-order': index } as Hued}>
      <button type="button" className="infinity-result" aria-expanded={expanded === node.coordinate}
        onClick={() => setExpanded(expanded === node.coordinate ? null : node.coordinate)}>
        <i aria-hidden="true" /><strong>{node.label}</strong><span>{node.coordinate} · {node.score}%</span>
      </button>
      {expanded === node.coordinate && <div className="infinity-detail">
        <p>{node.text}</p>
        <button type="button" onClick={() => actions.inspectNode(node)}>Seed in Console</button>
      </div>}
    </li>)}</ul>
    {!results.length && <p className="infinity-empty">No orb answers.</p>}
  </>
}

function InfinityMedia() {
  const actions = useOSActions()
  const trackIndex = useOS((state) => state.mediaState.trackIndex)
  const progress = useOS((state) => state.mediaState.progress)
  const playing = useOS((state) => state.mediaState.isPlaying)
  const sound = useOS((state) => state.mediaState.soundEnabled)
  const track = tracks[trackIndex]
  // The sun dot swells with the track: a quarter of its size at the start, full at the end.
  const sun = { ...hued(1), '--infinity-sun': (.25 + .75 * progress / track.duration).toFixed(3) } as Hued
  return <div className="infinity-media" data-playing={playing}>
    <div className="infinity-sun" style={sun} aria-hidden="true" />
    <p className="infinity-track"><span>Track 0{trackIndex + 1} of 0{tracks.length}</span><strong>{track.title}</strong><span>{track.frequency} Hz {track.wave} · {clockText(progress)} / {clockText(track.duration)}</span></p>
    <input className="infinity-seek" type="range" min="0" max={track.duration} step=".1" value={progress} aria-label="Playback position" onChange={(event) => actions.seek(+event.currentTarget.value)} />
    <div className="infinity-transport" role="group" aria-label="Transport">
      <button type="button" aria-label="Previous track" onClick={() => actions.setTrack(trackIndex - 1)}>Nearer</button>
      <button type="button" onClick={actions.togglePlayback}>{playing ? 'Pause' : 'Play'}</button>
      <button type="button" aria-label="Next track" onClick={() => actions.setTrack(trackIndex + 1)}>Farther</button>
      <button type="button" aria-pressed={sound} onClick={actions.toggleSound}>Sound</button>
    </div>
  </div>
}
