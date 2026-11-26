import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import '@fontsource-variable/fraunces/full.css'
import { modules, system, tracks } from '../../data/osData'
import type { ModuleId } from '../../data/osData'
import type { ParadigmProps } from '../../data/paradigms'
import { surface, useFrameLoop } from '../../state/frameLoop'
import { useOS, useOSActions, useOSSnapshot } from '../../state/osStore'
import type { OSState } from '../../state/osStore'
import WetwareOrgan from './WetwareOrgan'
import { paintTissue } from './renderer'
import type { Organ } from './renderer'
import { CELL_HOMES, CELL_RADII, CORE, FIRST_BUD, NUCLEUS, PULSE_HOLD_MS, SURFACE, createTissue, firePulse, settleTissue, stepTissue } from './tissue'
import './wetware.css'

const roles = ['Nerve center', 'Sensory stream', 'Memory colony', 'Resonance cell']

function organOf(state: OSState): Organ | null {
  if (state.activeModule === 'telemetry') return { kind: 'telemetry', trace: state.telemetryState.trace }
  if (state.activeModule !== 'media') return null
  const { trackIndex, isPlaying, progress } = state.mediaState
  return { kind: 'media', frequency: tracks[trackIndex].frequency, playing: isPlaying, progress: progress / tracks[trackIndex].duration }
}

function box(index: number): CSSProperties {
  return { left: CELL_HOMES[index].x, top: CELL_HOMES[index].y, width: CELL_RADII[index].x * 2, height: CELL_RADII[index].y * 2 }
}

export default function WetwareOS({ interactive }: ParadigmProps) {
  const host = useRef<HTMLElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const anchored = useRef<(HTMLButtonElement | null)[]>([])
  const written = useRef<string[]>([])
  const hold = useRef(0)
  const [tissue] = useState(createTissue)
  const active = useOS((state) => state.activeModule, interactive)
  const stress = useOS((state) => state.telemetryState.stressMode, interactive)
  const [pulse, cytoplasm, speed] = useOS((state) => state.paradigmParams.wetware, interactive)
  const impulse = useOS((state) => state.impulse, interactive)
  const snapshot = useOSSnapshot(interactive)
  const actions = useOSActions()
  const selected = active ? modules.findIndex((module) => module.id === active) : -1

  const invalidate = useFrameLoop(host, interactive, ({ time, delta, still, ratio }) => {
    const inputs = { selected, pulse, speed, stress }
    if (still) settleTissue(tissue, inputs, performance.now())
    else stepTissue(tissue, inputs, delta / 1000)
    const context = surface(canvas.current, SURFACE.width, SURFACE.height, ratio)
    if (context) paintTissue(context, tissue, { time, cytoplasm: cytoplasm / 100, stress, organ: organOf(snapshot()) })

    for (let index = 0; index <= CORE; index++) {
      const cell = tissue.cells[index]
      const offset = `${(cell.x - cell.spec.x).toFixed(1)}px ${(cell.y - cell.spec.y).toFixed(1)}px`
      const element = anchored.current[index]
      if (!element || written.current[index] === offset) continue
      written.current[index] = offset
      element.style.translate = offset
    }
    const swell = tissue.swell.toFixed(3)
    if (written.current[CORE + 1] !== swell) {
      written.current[CORE + 1] = swell
      host.current?.style.setProperty('--swell', swell)
    }
  })

  useEffect(invalidate, [invalidate, selected, pulse, cytoplasm, speed, stress])
  useEffect(() => () => clearTimeout(hold.current), [])

  function signal(cell: number | 'all') {
    if (!interactive) return
    firePulse(tissue, cell, performance.now())
    invalidate()
    clearTimeout(hold.current)
    hold.current = window.setTimeout(invalidate, PULSE_HOLD_MS + 40)
  }
  const fire = useRef(signal)
  useEffect(() => { fire.current = signal })

  const previousSpeed = useRef(speed)
  useEffect(() => {
    if (previousSpeed.current === speed) return
    previousSpeed.current = speed
    fire.current(selected >= 0 ? selected : Math.floor(speed / 8) % CORE)
  }, [speed, selected])

  const seenImpulse = useRef(impulse.seq)
  useEffect(() => {
    if (impulse.seq === seenImpulse.current) return
    seenImpulse.current = impulse.seq
    fire.current('all')
  }, [impulse])

  function open(target: ModuleId) {
    if (!interactive) return
    actions.setActiveModule(target)
    signal(modules.findIndex((module) => module.id === target))
  }

  return <section className="wet-os" aria-label="WetwareOS living membrane" ref={host} data-active={active ?? undefined} data-stress={stress}>
    <canvas className="wet-tissue" ref={canvas} aria-hidden="true" />
    <header className="wet-words">
      <p>Symbiotic interface</p>
      <h2>Wetware<span>OS</span></h2>
    </header>
    <button type="button" className="wet-core" style={box(CORE)} ref={(element) => { anchored.current[CORE] = element }}
      aria-label={system.label} disabled={!interactive} tabIndex={active ? -1 : undefined} onClick={() => open('console')}>
      <strong>{system.label}</strong><span>{system.status}</span>
    </button>
    <div role="group" aria-label="Connected cells">
      {modules.map((module, index) => <button type="button" className="wet-cell" key={module.id} style={box(index)}
        ref={(element) => { anchored.current[index] = element }} aria-pressed={active === module.id} disabled={!interactive}
        tabIndex={active ? -1 : undefined} onClick={() => open(module.id)}>
        <strong>{module.label}</strong><span>{roles[index]}</span>
      </button>)}
    </div>
    {active && <WetwareOrgan active={active} onSignal={() => signal(selected)} />}
    <button type="button" className="wet-nucleus" style={box(NUCLEUS)} aria-label={active ? 'Return to membrane' : 'Open nucleus command'}
      disabled={!interactive} onClick={() => active ? actions.setActiveModule(null) : open('console')}>
      <strong>{active ? 'Rejoin' : 'Nucleus'}</strong>
    </button>
    <nav aria-label="Nucleus buds">
      {modules.map((module, index) => <button type="button" className="wet-bud" key={module.id} style={box(FIRST_BUD + index)}
        aria-label={module.label} aria-pressed={active === module.id} disabled={!interactive} onClick={() => open(module.id)}>{module.short.toLowerCase()}</button>)}
    </nav>
  </section>
}
