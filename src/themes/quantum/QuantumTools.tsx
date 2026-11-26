import { useEffect, useState } from 'react'
import { channels, clockText, modules, nodes as specimens, quickCommands, searchNodes, tracks } from '../../data/osData'
import type { ModuleId } from '../../data/osData'
import { useOS, useOSActions, useRecentLogs } from '../../state/osStore'
import { BANDS, WORKSPACE } from './cloud'
import type { Band } from './cloud'

const GLYPHS = '0123456789ABCDEF+/'
const RESOLVE_MS = 340

const below = (band: Band, gap: number) => band.y + band.height + gap - WORKSPACE.y
const above = (band: Band, gap: number) => WORKSPACE.y + WORKSPACE.height - band.y + gap

function Resolved({ text }: { text: string }) {
  const [shown, setShown] = useState(text)
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let frame = 0
    const start = performance.now()
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / RESOLVE_MS)
      const settled = Math.floor(progress * text.length)
      const noise = Array.from(text.slice(settled), (character, index) =>
        character === ' ' ? ' ' : GLYPHS[(index * 7 + Math.floor(now / 38)) % GLYPHS.length])
      setShown(text.slice(0, settled) + noise.join(''))
      if (progress < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [text])
  return <span aria-hidden="true">{shown}</span>
}

export default function QuantumTools({ active }: { active: ModuleId }) {
  const actions = useOSActions()
  const label = modules.find((module) => module.id === active)!.label
  return <section className="quantum-workspace" key={active} aria-label={label}
    style={{ left: WORKSPACE.x, top: WORKSPACE.y, width: WORKSPACE.width, height: WORKSPACE.height }}>
    <i aria-hidden="true">+</i><i aria-hidden="true">+</i><i aria-hidden="true">+</i><i aria-hidden="true">+</i>
    <small>Observation / {active}</small>
    <h3 aria-label={label}><Resolved text={label} /></h3>
    {active === 'console' && <QuantumConsole />}
    {active === 'telemetry' && <QuantumTelemetry />}
    {active === 'search' && <QuantumSearch />}
    {active === 'media' && <QuantumMedia />}
    <button type="button" className="quantum-release" onClick={() => actions.setActiveModule(null)}>− Release observation</button>
  </section>
}

function QuantumConsole() {
  const logs = useRecentLogs()
  const actions = useOSActions()
  return <>
    <div className="quantum-log" role="log" aria-label="Console logs" style={{ top: below(BANDS.console, 18) }}>
      {logs.map(({ id, input, output, level, timestamp }) => <p key={id} data-level={level}><time>{timestamp}</time><span>{input && <b>› {input}<br /></b>}{output}</span></p>)}
    </div>
    <div className="quantum-quick" role="group" aria-label="Quick commands">
      {quickCommands.map((command) => <button type="button" key={command} aria-label={command} onClick={() => actions.execute(command)}>{command}</button>)}
    </div>
  </>
}

function QuantumTelemetry() {
  const actions = useOSActions()
  const latency = useOS((state) => state.telemetryState.liveLatencyMs)
  const frame = useOS((state) => state.telemetryState.scanFrame)
  const selected = useOS((state) => state.telemetryState.selectedChannel)
  const stress = useOS((state) => state.telemetryState.stressMode)
  return <div className="quantum-telemetry" style={{ bottom: above(BANDS.telemetry, 6) }}>
    <p>{latency.toFixed(1)}<span>ms</span></p>
    <small>FRAME {frame} · σ {stress ? '9.0' : '1.5'} px</small>
    <div className="quantum-actions" role="group" aria-label="Telemetry channels">
      {channels.map((channel, index) => <button type="button" key={channel} aria-label={channel} aria-pressed={selected === index} onClick={() => actions.setChannel(index)}>{channel}</button>)}
    </div>
    <div className="quantum-actions"><button type="button" aria-pressed={stress} onClick={() => actions.setStress(!stress)}>Stress mode · {stress ? 'ON' : 'OFF'}</button></div>
  </div>
}

function QuantumSearch() {
  const actions = useOSActions()
  const query = useOS((state) => state.searchQuery)
  const results = searchNodes(query)
  const [expanded, setExpanded] = useState<string | null>(null)
  return <>
    <input className="quantum-query" aria-label="Search nodes" placeholder="+ Resolve an index" value={query} onChange={(event) => actions.setSearch(event.currentTarget.value)} />
    <ol className="quantum-hits" style={{ bottom: above(BANDS.search, 10) }}>{results.map((hit) => <li key={hit.coordinate}>
      <button type="button" className="quantum-result" aria-expanded={expanded === hit.coordinate}
        onClick={() => setExpanded(expanded === hit.coordinate ? null : hit.coordinate)}>
        <span>{hit.coordinate}</span><strong>{hit.label}<small>{hit.type}</small></strong><span>{hit.score}%</span>
      </button>
      {expanded === hit.coordinate && <div className="quantum-detail">
        <p>{hit.text}</p>
        <button type="button" onClick={() => actions.inspectNode(hit)}>Observe in Console</button>
      </div>}
    </li>)}</ol>
    {!results.length && <p className="quantum-empty">No matching nodes.</p>}
    <p className="quantum-scale" aria-hidden="true" style={{ top: below(BANDS.search, 4) }}>{specimens.map((specimen) => <span key={specimen.coordinate}>{specimen.coordinate}</span>)}</p>
  </>
}

function QuantumMedia() {
  const actions = useOSActions()
  const trackIndex = useOS((state) => state.mediaState.trackIndex)
  const progress = useOS((state) => state.mediaState.progress)
  const playing = useOS((state) => state.mediaState.isPlaying)
  const sound = useOS((state) => state.mediaState.soundEnabled)
  const track = tracks[trackIndex]
  return <>
    <p className="quantum-track">0{trackIndex + 1} / {track.title}<span>{track.frequency} Hz · {track.wave}</span></p>
    <div className="quantum-media" style={{ top: below(BANDS.media, 10) }}>
      <label><input type="range" min="0" max={track.duration} step=".1" value={progress} aria-label="Playback position" onChange={(event) => actions.seek(+event.currentTarget.value)} /><span>{clockText(progress)} / {clockText(track.duration)}</span></label>
      <div className="quantum-actions" role="group" aria-label="Transport">
        <button type="button" aria-label="Previous track" onClick={() => actions.setTrack(trackIndex - 1)}>‹</button>
        <button type="button" onClick={actions.togglePlayback}>{playing ? 'Pause' : 'Play'}</button>
        <button type="button" aria-label="Next track" onClick={() => actions.setTrack(trackIndex + 1)}>›</button>
        <button type="button" aria-label="Sound" aria-pressed={sound} onClick={actions.toggleSound}>Sound</button>
      </div>
    </div>
  </>
}
