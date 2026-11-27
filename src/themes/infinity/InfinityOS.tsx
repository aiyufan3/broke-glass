import { useEffect, useRef, useState } from 'react'
import { modules, system } from '../../data/osData'
import type { ModuleId } from '../../data/osData'
import type { ParadigmProps } from '../../data/paradigms'
import { surface, useFrameLoop } from '../../state/frameLoop'
import { useOS, useOSActions } from '../../state/osStore'
import InfinityTools from './InfinityTools'
import { ORBS, SURFACE, burst, createDots, dotCount, orbView, settleDots, stepDots } from './dots'
import { paintInfinity } from './renderer'
import './infinity.css'

// How many dots each kind of event seeds around the point of action, relative to one burst.
const load = { boot: 0, command: .55, inspect: .7, scan: .95, spike: 1.3 } as const

export default function InfinityOS({ interactive }: ParadigmProps) {
  const host = useRef<HTMLElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const launchers = useRef<(HTMLButtonElement | null)[]>([])
  const readout = useRef<HTMLOutputElement>(null)
  /** The orb the viewer is inside, or was last inside: stepping out returns focus to it. */
  const entered = useRef(-1)
  const written = useRef<Record<string, string>>({})
  const [field] = useState(() => createDots())
  const active = useOS((state) => state.activeModule, interactive)
  const [proliferation, obliteration, rows] = useOS((state) => state.paradigmParams.infinity, interactive)
  const stress = useOS((state) => state.telemetryState.stressMode, interactive)
  const impulse = useOS((state) => state.impulse, interactive)
  const actions = useOSActions()
  const selected = active ? modules.findIndex((module) => module.id === active) : -1
  // Stepping back out keeps the tool, inert, until the orb has shrunk back into the field.
  const [leaving, setLeaving] = useState<ModuleId | null>(null)
  const shown = active ?? leaving
  const shownIndex = shown ? modules.findIndex((module) => module.id === shown) : -1
  // Each entry is a new visit: re-entering an orb that is still closing remounts its tool, so focus lands in it again.
  const [visit, setVisit] = useState(0)
  useEffect(() => {
    if (!active) return
    setLeaving(active)
    setVisit((count) => count + 1)
  }, [active])

  function write(key: string, value: string, apply: (value: string) => void) {
    if (written.current[key] === value) return
    written.current[key] = value
    apply(value)
  }

  const invalidate = useFrameLoop(host, interactive, ({ delta, still, ratio }) => {
    const inputs = { proliferation, obliteration: obliteration / 100, rows, stress, selected }
    if (still) settleDots(field, inputs)
    else stepDots(field, inputs, delta / 1000)
    const context = surface(canvas.current, SURFACE.width, SURFACE.height, ratio)
    if (context) paintInfinity(context, field)

    // Each launcher is the orb itself: a round hit area laid over the sphere the renderer drew.
    ORBS.forEach((_, index) => {
      const view = orbView(field, index)
      const element = launchers.current[index]
      if (!element) return
      write(`orb${index}`, `${view.x.toFixed(1)}px ${view.y.toFixed(1)}px`, (value) => { element.style.translate = value })
      write(`size${index}`, `${(view.radius * 2).toFixed(1)}px`, (value) => element.style.setProperty('--infinity-orb', value))
    })
    const swell = shownIndex >= 0 ? field.swell[shownIndex] : 0
    const style = host.current?.style
    if (style) write('swell', swell.toFixed(3), (value) => style.setProperty('--infinity-swell', value))
    if (!active && swell < .01) setLeaving(null)

    const element = readout.current
    if (element) write('readout', `${dotCount(field)} dots · ${Math.round(field.coverage * 100)}% obliterated · ${field.rows} rows`, (value) => { element.textContent = value })
  })

  useEffect(invalidate, [invalidate, proliferation, obliteration, rows, stress, selected, shownIndex])

  const seenImpulse = useRef(impulse.seq)
  useEffect(() => {
    if (impulse.seq === seenImpulse.current) return
    seenImpulse.current = impulse.seq
    if (load[impulse.kind]) burst(field, load[impulse.kind])
    invalidate()
  }, [field, impulse, invalidate])

  // Stepping out of an orb returns focus to that orb, however the viewer got inside it.
  useEffect(() => {
    if (selected >= 0) entered.current = selected
    else if (entered.current >= 0) launchers.current[entered.current]?.focus({ preventScroll: true })
  }, [selected])

  function enter(module: ModuleId) {
    if (interactive) actions.setActiveModule(module)
  }

  return <section ref={host} className="infinity-os" aria-label="InfinityOS infinity room" data-active={active ?? undefined} data-stress={stress}>
    <canvas className="infinity-field" ref={canvas} aria-hidden="true" />
    <header className="infinity-head">
      <p><span>Lab / 07 · Infinity room</span><span>{system.label} · {stress ? 'Obliterating' : system.status}</span></p>
      <h2>Infinity<span>OS</span></h2>
      <output className="infinity-readout" ref={readout} />
    </header>
    <nav className="infinity-orbs" aria-label="Orbs">
      {modules.map((module, index) => <button key={module.id} type="button" className="infinity-orb"
        ref={(element) => { launchers.current[index] = element }} disabled={!interactive}
        aria-label={module.label} aria-pressed={active === module.id}
        onClick={() => enter(module.id)}>
        <span>{module.label}</span>
      </button>)}
    </nav>
    {shown && <InfinityTools key={`${shown}-${visit}`} active={shown} closing={!active} hue={ORBS[shownIndex].hue} />}
  </section>
}
