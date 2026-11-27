import { Check, Clipboard, RotateCcw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, Ref } from 'react'
import { paradigmPrompt, paradigms } from '../data/paradigms'
import type { EngineSlot, ParadigmId } from '../data/paradigms'
import { useOS, useOSActions } from '../state/osStore'
import { themes } from '../themes'
import { accentText } from './accentText'
import { RASTER, platePath } from './plates'

const shortcuts = [
  [`1–${themes.length}`, 'Switch paradigm'],
  ['⌘K', 'Console prompt'],
  ['↑ ↓', 'Command history'],
  ['Esc', 'Step back'],
] as const

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value)
      return true
    } catch { /* Embedded previews deny the async clipboard; the selection path below still works there. */ }
  }
  const before = document.activeElement
  const field = document.createElement('textarea')
  field.value = value
  field.style.cssText = 'position:fixed;left:0;top:0;opacity:0;pointer-events:none'
  document.body.append(field)
  field.select()
  let copied: boolean
  try { copied = document.execCommand('copy') } catch { copied = false }
  field.remove()
  if (before instanceof HTMLElement) before.focus({ preventScroll: true })
  return copied
}

export default function DesignDnaPanel({ id, onSwitch, titleRef }: {
  id: ParadigmId
  onSwitch: (id: ParadigmId) => void
  titleRef: Ref<HTMLHeadingElement>
}) {
  const spec = paradigms[id]
  const plate = themes.findIndex((theme) => theme.id === id) + 1
  const values = useOS((state) => state.paradigmParams[id])
  const actions = useOSActions()
  const [feedback, setFeedback] = useState({ key: '', text: '' })
  const timer = useRef(0)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  async function copy(key: string, value: string) {
    const copied = await copyText(value)
    setFeedback({ key, text: copied ? 'Copied' : 'Copy unavailable' })
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setFeedback({ key: '', text: '' }), 1800)
  }

  return <aside className="dna" aria-label="Design DNA inspector">
    <header className="dna-head">
      <p className="lab-kicker">Design DNA · PL. {String(plate).padStart(2, '0')}</p>
      <h1 ref={titleRef} tabIndex={-1}>{spec.name}</h1>
      <p className="dna-summary">{spec.summary}</p>
      <p className="dna-lineage">{spec.lineage}</p>
    </header>
    <section className="dna-block" aria-label="Paradigm switcher">
      <h2>Paradigm <kbd>1–{themes.length}</kbd></h2>
      <nav className="dna-switch" aria-label="Switch theme" style={{ '--switch-count': themes.length } as CSSProperties}>
        {themes.map(({ id: candidate, name, accent }, index) => <button type="button" key={candidate}
          aria-keyshortcuts={String(index + 1)} aria-pressed={id === candidate} onClick={() => onSwitch(candidate)}
          style={{ '--switch-accent': accent, '--switch-accent-text': accentText(accent) } as CSSProperties}>
          <span>{String(index + 1).padStart(2, '0')}</span><span className="sr-only"> {name}</span>
          <svg viewBox={`0 0 ${RASTER.columns} ${RASTER.rows}`} preserveAspectRatio="none" aria-hidden="true"><path d={platePath(candidate)} fill="currentColor" /></svg>
        </button>)}
      </nav>
    </section>
    <section className="dna-block">
      <h2>Live engine <button type="button" className="dna-reset" onClick={() => actions.reset(id)}><RotateCcw size={11} aria-hidden="true" />Reset</button></h2>
      <div className="dna-faders">
        {spec.controls.map((control, index) => <label className="dna-fader" key={control.label}>
          <span className="dna-fader__head"><b>{control.label}</b><output>{values[index]}{'unit' in control ? control.unit : ''}</output></span>
          <input type="range" aria-label={control.label} min={control.min} max={control.max} value={values[index]}
            onChange={(event) => actions.tune(id, index as EngineSlot, +event.currentTarget.value)}
            style={{ '--fill': `${(values[index] - control.min) / (control.max - control.min) * 100}%` } as CSSProperties} />
          <span className="dna-fader__scale" aria-hidden="true"><i>{control.min}</i><i>{control.max}</i></span>
          <small>{control.effect}</small>
        </label>)}
      </div>
    </section>
    <section className="dna-block">
      <h2>Grammar</h2>
      <ol className="dna-rules">{spec.rules.map((rule) => <li key={rule}>{rule}</li>)}</ol>
      <ul className="dna-bans">{spec.bans.map((ban) => <li key={ban}><b>Banned</b><span>{ban}</span></li>)}</ul>
    </section>
    <section className="dna-block">
      <h2>Tokens</h2>
      <div className="dna-swatches">
        {spec.colors.map((color) => <button type="button" key={color} aria-label={`Copy color ${color}`} onClick={() => void copy(color, color)}>
          <i aria-hidden="true" style={{ background: color }} /><span>{feedback.key === color ? feedback.text : color}</span>
        </button>)}
      </div>
      <div className="dna-types">
        {spec.type.map((face) => <button type="button" key={face} aria-label={`Copy typography ${face}`} onClick={() => void copy(face, face)}>
          {feedback.key === face ? feedback.text : face}
        </button>)}
      </div>
      <button type="button" className="dna-copy" onClick={() => void copy('prompt', paradigmPrompt(id, values))}>
        {feedback.key === 'prompt' && feedback.text === 'Copied' ? <Check size={14} aria-hidden="true" /> : <Clipboard size={14} aria-hidden="true" />}
        {feedback.key === 'prompt' ? feedback.text : 'Copy Paradigm Prompt'}
      </button>
      <span className="sr-only" role="status">{feedback.text}</span>
    </section>
    <dl className="dna-keys">{shortcuts.map(([key, action]) => <div key={key}><dt><kbd>{key}</kbd></dt><dd>{action}</dd></div>)}</dl>
  </aside>
}
