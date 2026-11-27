import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { channels, clockText, modules, quickCommands, searchNodes, tracks } from '../../data/osData'
import type { ModuleId } from '../../data/osData'
import { useCommandLine, useOS, useOSActions, useRecentLogs } from '../../state/osStore'
import { ORGAN, chamberSpan } from './tissue'

const box: CSSProperties = { left: ORGAN.left, top: ORGAN.top, width: ORGAN.width, height: ORGAN.height }
/** The organ's name is set as large as its membrane allows, up to this size. */
const TITLE_PX = 34

/**
 * An organ's contents live inside its membrane. Each row is given the span of the cell wall at its
 * own height, taken from the tissue model, so the heading follows the shoulder of the cell and a
 * list's rows slide along the wall as they scroll. `slack` is how far the membrane can breathe inward.
 */
export default function WetwareOrgan({ active, slack, onSignal }: { active: ModuleId; slack: number; onSignal: () => void }) {
  const label = modules.find((module) => module.id === active)!.label
  const organ = useRef<HTMLElement>(null)

  const fit = useCallback(() => {
    const root = organ.current
    if (!root) return
    // `from` and `to` are the part of the row that is drawn, measured from the top of the organ's box.
    const place = (row: HTMLElement, from: number, to: number) => {
      const span = chamberSpan(slack, ORGAN.top + from, ORGAN.top + to)
      // Where the wall leaves no room at all, the row keeps a narrow column on the cell's axis.
      const left = span ? Math.max(0, span.left - ORGAN.left) : ORGAN.width * .3
      const right = span ? Math.max(0, ORGAN.left + ORGAN.width - span.right) : ORGAN.width * .3
      row.style.marginLeft = `${left.toFixed(1)}px`
      row.style.marginRight = `${right.toFixed(1)}px`
      row.style.maxWidth = `${(ORGAN.width - left - right).toFixed(1)}px`
    }
    const title = root.querySelector<HTMLElement>('h3')
    if (title) title.style.fontSize = ''
    for (const row of root.querySelectorAll<HTMLElement>(':scope > header > *, :scope > [data-fit]')) place(row, row.offsetTop, row.offsetTop + row.offsetHeight)
    for (const list of root.querySelectorAll<HTMLElement>(':scope > [data-fit-rows]')) {
      const top = list.offsetTop
      const bottom = top + list.clientHeight
      // Twice: an opened result is as tall as its width allows, so its span is taken again at the height it settles on.
      for (let pass = 0; pass < 2; pass++) {
        for (const row of list.children as HTMLCollectionOf<HTMLElement>) {
          const from = row.offsetTop - list.scrollTop
          const to = from + row.offsetHeight
          // A row is fitted to the wall over the part of it the list shows; what has scrolled out is not drawn.
          if (to > top && from < bottom) place(row, Math.max(from, top), Math.min(to, bottom))
        }
      }
    }
    // A name wider than the cell at that height is set smaller, never clipped and never across the wall.
    if (title && title.scrollWidth > title.clientWidth) title.style.fontSize = `${(TITLE_PX * title.clientWidth / title.scrollWidth).toFixed(1)}px`
  }, [slack])

  useLayoutEffect(() => {
    fit()
    // The heading is measured again once its face has loaded.
    let live = true
    void document.fonts.ready.then(() => { if (live) fit() })
    return () => { live = false }
  }, [fit, active])

  return <section key={active} ref={organ} className="wet-organ" data-organ={active} aria-label={label} style={box}>
    <header><span>Differentiated cell</span><h3>{label}</h3></header>
    {active === 'console' && <ConsoleOrgan onSignal={onSignal} />}
    {active === 'telemetry' && <TelemetryOrgan onSignal={onSignal} />}
    {active === 'search' && <SearchOrgan refit={fit} />}
    {active === 'media' && <MediaOrgan />}
  </section>
}

function ConsoleOrgan({ onSignal }: { onSignal: () => void }) {
  const logs = useRecentLogs()
  const actions = useOSActions()
  const line = useCommandLine()
  return <>
    <ol className="wet-secretions" data-fit role="log" aria-label="Console logs">
      {logs.map((log) => <li key={log.id} data-level={log.level}><time>{log.timestamp}</time>{log.input && <b>{log.input} </b>}{log.output}</li>)}
    </ol>
    <form className="wet-feed" data-fit onSubmit={(event) => {
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
    <p className="wet-metric" data-fit>{latency.toFixed(1)}<small>ms</small></p>
    <p className="wet-note" data-fit>frame {frame} · {stress ? 'inflamed' : 'homeostasis'}</p>
    <div className="wet-vesicles" role="group" aria-label="Telemetry channels">{channels.map((channel, index) =>
      <button key={channel} type="button" aria-pressed={selected === index} onClick={() => actions.setChannel(index)}>{channel}</button>)}</div>
    <button type="button" className="wet-toxin" aria-pressed={stress} onClick={() => { actions.setStress(!stress); onSignal() }}>Stress mode</button>
  </>
}

function SearchOrgan({ refit }: { refit: () => void }) {
  const actions = useOSActions()
  const query = useOS((state) => state.searchQuery)
  const results = searchNodes(query)
  const [expanded, setExpanded] = useState<string | null>(null)
  // Results change the rows, and an opened result changes their heights: each time, the rows find the wall again.
  useLayoutEffect(refit)
  return <>
    <input className="wet-query" data-fit aria-label="Search nodes" value={query} onChange={(event) => actions.setSearch(event.currentTarget.value)} placeholder="Find a specimen" />
    <ul className="wet-memories" data-fit-rows onScroll={refit}>{results.map((node) => <li key={node.coordinate}>
      <button type="button" className="wet-result" aria-expanded={expanded === node.coordinate}
        onClick={() => setExpanded(expanded === node.coordinate ? null : node.coordinate)}>
        <i aria-hidden="true" style={{ scale: String(.5 + (node.score - 80) / 36) }} /><b>{node.label}</b><span>{node.type} · {node.coordinate} · {node.score}%</span>
      </button>
      {expanded === node.coordinate && <div className="wet-detail">
        <p>{node.text}</p>
        <button type="button" onClick={() => actions.inspectNode(node)}>Send to nucleus</button>
      </div>}
    </li>)}</ul>
    {!results.length && <p className="wet-note" data-fit>No matching nodes.</p>}
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
    <p className="wet-track" data-fit>0{trackIndex + 1} / {track.title}</p>
    <p className="wet-metric" data-fit>{clockText(progress)}<small>of {clockText(track.duration)}</small></p>
    <p className="wet-note" data-fit>{track.frequency} Hz {track.wave}</p>
    <input className="wet-seek" data-fit type="range" min="0" max={track.duration} step=".1" value={progress} aria-label="Playback position" onChange={(event) => actions.seek(+event.currentTarget.value)} />
    <div className="wet-vesicles" role="group" aria-label="Transport">
      <button type="button" aria-label="Previous track" onClick={() => actions.setTrack(trackIndex - 1)}>‹</button>
      <button type="button" onClick={actions.togglePlayback}>{playing ? 'Pause' : 'Play'}</button>
      <button type="button" aria-label="Next track" onClick={() => actions.setTrack(trackIndex + 1)}>›</button>
      <button type="button" aria-pressed={sound} onClick={actions.toggleSound}>Sound</button>
    </div>
  </>
}
