import { useEffect, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { modules, system } from '../../data/osData'
import type { ModuleId } from '../../data/osData'
import type { ParadigmProps } from '../../data/paradigms'
import { surface, useFrameLoop } from '../../state/frameLoop'
import { useOS, useOSActions } from '../../state/osStore'
import { useToolFocus } from '../../state/toolFocus'
import StrataTools, { FORMATIONS } from './StrataTools'
import { inkOn } from '../../data/contrast'
import { bedRock, paintStrata } from './renderer'
import { CORE_X, SECTION, SPAN_KA, SURFACE, createStrata, deposit, excavation, moduleBed, reading, settleStrata, stepStrata, undeform } from './sediment'
import './strata.css'

/** `--strata-ink` and `--strata-chalk`: the two inks a formation label is set in. */
const INK = '#1E1610'
const CHALK = '#EDE3CF'

// How much sediment each kind of event lands on the surface, and how hard its shear wave shakes the column.
const load = { boot: 0, command: .55, inspect: .7, scan: .95, spike: 1.3 } as const

export default function StrataOS({ interactive }: ParadigmProps) {
  const host = useRef<HTMLElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const launchers = useRef<(HTMLButtonElement | null)[]>([])
  const readout = useRef<HTMLOutputElement>(null)
  /** Screen height of the operator's probe, or null when the pointer is outside the section. */
  const probeY = useRef<number | null>(null)
  const written = useRef<Record<string, string>>({})
  const [strata] = useState(createStrata)
  const active = useOS((state) => state.activeModule, interactive)
  const [beds, compaction, fold] = useOS((state) => state.paradigmParams.strata, interactive)
  const stress = useOS((state) => state.telemetryState.stressMode, interactive)
  const impulse = useOS((state) => state.impulse, interactive)
  const actions = useOSActions()
  const selected = active ? modules.findIndex((module) => module.id === active) : -1
  // A backfilled gallery keeps its tool, inert, until the rock has closed over it.
  const [backfilling, setBackfilling] = useState<ModuleId | null>(null)
  const shown = active ?? backfilling
  const shownIndex = shown ? modules.findIndex((module) => module.id === shown) : -1
  // Each drilling is a new visit: reopening a gallery that is still backfilling mounts its tool afresh.
  const [entry, setEntry] = useState({ active, visit: 0 })
  if (entry.active !== active) setEntry({ active, visit: entry.visit + (active ? 1 : 0) })
  useEffect(() => { if (active) setBackfilling(active) }, [active])

  function write(key: string, value: string, apply: (value: string) => void) {
    if (written.current[key] === value) return
    written.current[key] = value
    apply(value)
  }

  const invalidate = useFrameLoop(host, interactive, ({ delta, still, ratio }) => {
    const inputs = { beds, compaction: compaction / 100, fold: fold / 100, stress, selected }
    if (still) settleStrata(strata, inputs)
    else stepStrata(strata, inputs, delta / 1000)
    const context = surface(canvas.current, SURFACE.width, SURFACE.height, ratio)
    if (context) paintStrata(context, strata, { probe: probeY.current })

    // Each formation's label rides the middle of its own bed.
    modules.forEach((_, index) => {
      const bed = moduleBed(strata.beds, index)
      const centre = (strata.base[bed] + strata.base[bed + 1]) / 2
      const element = launchers.current[index]
      if (!element) return
      write(`bed${index}`, `0 ${centre.toFixed(1)}px`, (value) => { element.style.translate = value })
      // The label takes the ink that reads on the rock it is lying on now, as galleries move the beds.
      write(`ink${index}`, inkOn(bedRock(strata, bed), [INK, CHALK]) === INK ? 'shallow' : 'deep', (value) => { element.dataset.depth = value })
    })
    // The gallery element follows the bed of the tool on show, open or closing, as the model reports it.
    const opened = shownIndex >= 0 ? excavation(strata, moduleBed(strata.beds, shownIndex)) : null
    const style = host.current?.style
    if (style) {
      write('top', `${(opened?.top ?? SECTION.top).toFixed(1)}px`, (value) => style.setProperty('--strata-top', value))
      write('height', `${Math.max(0, (opened?.bottom ?? SECTION.top) - (opened?.top ?? SECTION.top)).toFixed(1)}px`, (value) => style.setProperty('--strata-height', value))
      write('open', (opened?.open ?? 0).toFixed(3), (value) => style.setProperty('--strata-open', value))
    }
    if (!active && opened && opened.open < .01) setBackfilling(null)

    // The probe reads the depth scale where it is drawn, at the core, through the fold and the fault.
    const probing = probeY.current === null ? null : undeform(strata, probeY.current, CORE_X)
    const at = reading(strata, probing ?? strata.drill)
    const source = probing === null ? 'Core' : 'Probe'
    const element = readout.current
    if (element) write('readout', `${source} ${at.metres.toFixed(1).padStart(5, '0')} m · ${at.ka.toFixed(1)} ka · bed ${String(at.bed + 1).padStart(2, '0')}/${strata.beds}`, (value) => { element.textContent = value })
  })

  useEffect(invalidate, [invalidate, beds, compaction, fold, stress, selected, shownIndex])

  const seenImpulse = useRef(impulse.seq)
  useEffect(() => {
    if (impulse.seq === seenImpulse.current) return
    seenImpulse.current = impulse.seq
    if (load[impulse.kind]) deposit(strata, load[impulse.kind])
  }, [strata, impulse])

  // Drilling moves focus into the gallery; backfilling returns it to the formation that was drilled.
  useToolFocus(host, active, interactive, { tool: '.strata-gallery', launchers: '.strata-bed' })

  function drill(module: ModuleId) {
    if (interactive) actions.setActiveModule(module)
  }

  function probe(event: PointerEvent<HTMLElement>) {
    if (!interactive || event.pointerType === 'touch') return
    const bounds = event.currentTarget.getBoundingClientRect()
    const y = (event.clientY - bounds.top) * SURFACE.height / bounds.height
    const depth = undeform(strata, y, CORE_X)
    probeY.current = depth > SECTION.top && depth < SECTION.bottom ? y : null
    invalidate()
  }

  return <section ref={host} className="strata-os" aria-label="StrataOS geological section" data-active={active ?? undefined} data-stress={stress}
    onPointerMove={probe} onPointerLeave={() => { probeY.current = null; invalidate() }}>
    <canvas className="strata-section" ref={canvas} aria-hidden="true" />
    <header className="strata-head">
      <p><span>Lab / 06 · Stratigraphic section</span><span>{SPAN_KA} ka · {beds} beds</span></p>
      <h2>Strata<span>OS</span></h2>
      <output className="strata-readout" aria-live="off" ref={readout} />
      <button type="button" className="strata-core" disabled={!interactive} aria-pressed={active === 'console'}
        onClick={() => drill('console')}>
        <span>{system.label}</span><b>{stress ? 'Faulted' : system.status}</b>
      </button>
    </header>
    <nav className="strata-formations" aria-label="Formations">
      {modules.map((module, index) => <button key={module.id} type="button" className="strata-bed"
        ref={(element) => { launchers.current[index] = element }} disabled={!interactive}
        data-depth={index < 2 ? 'shallow' : 'deep'} aria-label={module.label} aria-pressed={active === module.id}
        onClick={() => drill(module.id)}>
        <small>0{index + 1} · {FORMATIONS[index]}</small><strong>{module.label}</strong>
      </button>)}
    </nav>
    {shown && <StrataTools key={`${shown}-${entry.visit}`} active={shown} closing={!active} />}
  </section>
}
