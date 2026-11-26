import { ArrowLeft, Maximize2, Minimize2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import IPhoneFrame, { PHONE_HEIGHT, PHONE_WIDTH } from './components/IPhoneFrame'
import PhoneViewport from './components/PhoneViewport'
import DesignDnaPanel from './components/DesignDnaPanel'
import NativeViewport from './components/NativeViewport'
import SpecimenBoundary from './components/SpecimenBoundary'
import { modules } from './data/osData'
import type { ParadigmId } from './data/paradigms'
import { useOS, useOSActions } from './state/osStore'
import { themes } from './themes'

const two = (value: number) => String(value).padStart(2, '0')
const engineParameters = themes.reduce((total, theme) => total + theme.controls.length, 0)

function themeFromHash() {
  return themes.find(({ id }) => `#${id}` === window.location.hash)?.id ?? null
}

function LabMark() {
  return <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" aria-hidden="true">
    <circle cx="11" cy="11" r="6.5" />
    <path d="M11 0v7M11 15v7M0 11h7M15 11h7" />
  </svg>
}

export default function App() {
  const [selected, setSelected] = useState<ParadigmId | null>(themeFromHash)
  const [fullscreen, setFullscreen] = useState(false)
  const [silhouette, setSilhouette] = useState(false)
  const activeModule = useOS((state) => state.activeModule)
  const actions = useOSActions()
  const lastTheme = useRef<ParadigmId>(themeFromHash() ?? themes[0].id)
  const focusTitle = useRef<HTMLHeadingElement>(null)
  const plateButtons = useRef<Partial<Record<ParadigmId, HTMLButtonElement | null>>>({})
  const restoreFocus = useRef(false)
  const moveFocus = useRef(false)
  const focused = selected !== null
  const currentIndex = themes.findIndex((theme) => theme.id === selected)
  const current = themes[currentIndex]

  useEffect(() => { actions.setObserving(focused) }, [actions, focused])

  const navigate = useCallback((id: ParadigmId | null, focusTarget = true) => {
    if (id === selected) return
    if (id) lastTheme.current = id
    else setFullscreen(false)
    restoreFocus.current = focusTarget && id === null
    moveFocus.current = focusTarget && id !== null
    window.history.pushState(null, '', id ? `#${id}` : window.location.pathname + window.location.search)
    setSelected(id)
    window.scrollTo(0, 0)
  }, [selected])

  useEffect(() => {
    function sync() {
      const id = themeFromHash()
      if (id) lastTheme.current = id
      else setFullscreen(false)
      setSelected(id)
    }
    window.addEventListener('popstate', sync)
    window.addEventListener('hashchange', sync)
    return () => {
      window.removeEventListener('popstate', sync)
      window.removeEventListener('hashchange', sync)
    }
  }, [])

  useEffect(() => {
    if (restoreFocus.current && !selected) plateButtons.current[lastTheme.current]?.focus()
    if (moveFocus.current && selected) focusTitle.current?.focus({ preventScroll: true })
    restoreFocus.current = false
    moveFocus.current = false
  }, [selected])

  useEffect(() => {
    if (!selected) return
    function onKey(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing) return
      if (event.key === 'Escape') {
        event.preventDefault()
        if (activeModule) actions.setActiveModule(null)
        else if (fullscreen) setFullscreen(false)
        else navigate(null)
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        actions.setActiveModule('console')
        requestAnimationFrame(() => document.querySelector<HTMLInputElement>('[data-os-command]')?.focus({ preventScroll: true }))
        return
      }
      const target = event.target
      // An empty console prompt still switches paradigms; a draft keeps its digits.
      const emptyPrompt = target instanceof HTMLInputElement && target.hasAttribute('data-os-command') && !target.value
      const editing = target instanceof HTMLElement && target.closest('input,textarea,select,[contenteditable]')
      if (event.ctrlKey || event.metaKey || event.altKey || (editing && !emptyPrompt)) return
      const theme = /^[1-9]$/.test(event.key) ? themes[Number(event.key) - 1] : undefined
      if (theme) {
        event.preventDefault()
        navigate(theme.id, false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, activeModule, actions, fullscreen, navigate])

  useEffect(() => {
    if (!fullscreen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [fullscreen])

  if (current && fullscreen) {
    const base = current.colors[0]
    return <main className="native-mode" style={{ background: base }} aria-label={`${current.name} fullscreen`}>
      <nav className="native-capsule" aria-label="Fullscreen controls">
        <label>
          <span aria-hidden="true">PL. {two(currentIndex + 1)}</span>
          <select aria-label="Fullscreen theme" value={current.id} onChange={(event) => navigate(event.currentTarget.value as ParadigmId, false)}>
            {themes.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
        <button type="button" aria-label="Exit fullscreen" onClick={() => setFullscreen(false)}><Minimize2 size={14} aria-hidden="true" /><span>Exit</span></button>
      </nav>
      <NativeViewport background={base}><SpecimenBoundary key={current.id} name={current.name}><current.Component interactive /></SpecimenBoundary></NativeViewport>
    </main>
  }

  return (
    <div className="lab min-h-screen">
      <header className="lab-bar">
        <div className="lab-bar__inner page-width mx-auto flex items-center justify-between">
          <button className="lab-mark" type="button" onClick={() => navigate(null)} aria-label="Y3K Interface Lab gallery">
            <LabMark /><strong>Y3K</strong><span>Interface Lab</span>
          </button>
          <nav className="lab-views flex" aria-label="Showcase view">
            <button type="button" aria-pressed={!selected} onClick={() => navigate(null)}>Gallery</button>
            <button type="button" aria-pressed={!!selected} onClick={() => navigate(lastTheme.current)}>Focus</button>
          </nav>
        </div>
      </header>

      {!current ? <main className="gallery page-width mx-auto">
        <button className="native-banner" type="button" onClick={() => {
          navigate(lastTheme.current, false)
          setFullscreen(true)
        }}><span>Try Native Fullscreen OS</span><Maximize2 size={14} aria-hidden="true" /></button>
        <header className="gallery-head">
          <div>
            <p className="lab-kicker">Speculative mobile OS benchmark</p>
            <h1>broke-<span>glass</span></h1>
            <p className="gallery-thesis">I dropped my glass. Taste decides: {themes.length} paradigms, 1 core.</p>
          </div>
          <dl className="gallery-index">
            <div><dt>Specimens</dt><dd>{two(themes.length)}</dd></div>
            <div><dt>Shared tools</dt><dd>{two(modules.length)}</dd></div>
            <div><dt>Engine parameters</dt><dd>{engineParameters}</dd></div>
            <div><dt>Artboard</dt><dd>{PHONE_WIDTH} × {PHONE_HEIGHT}</dd></div>
          </dl>
        </header>
        <section className="plates" aria-label="Theme gallery">
          <div className="plates-bar flex items-center justify-between">
            <h2>Plates 01–{two(themes.length)}</h2>
            <button className="silhouette-toggle" type="button" aria-pressed={silhouette} onClick={() => setSilhouette((value) => !value)}>
              <i aria-hidden="true" />Silhouette test <span>grayscale · 12 px blur</span>
            </button>
          </div>
          <div className="plates-scroll">
            <div className="plates-grid" data-silhouette={silhouette} style={{ '--plate-count': themes.length } as CSSProperties}>
              {themes.map(({ id, accent, name, domain, geometry, polarity, navigation, statusBar, Component }, index) => (
                <article className="plate" key={id} style={{ '--accent': accent } as CSSProperties}>
                  <header className="plate-head"><span>PL. {two(index + 1)}</span><span>{domain}</span></header>
                  <div className="plate-device" inert><PhoneViewport><IPhoneFrame statusBar={statusBar}><SpecimenBoundary name={name}><Component interactive={false} /></SpecimenBoundary></IPhoneFrame></PhoneViewport></div>
                  <div className="plate-caption">
                    <h3>{name}</h3>
                    <dl>
                      <div><dt>Geometry</dt><dd>{geometry}</dd></div>
                      <div><dt>Polarity</dt><dd>{polarity}</dd></div>
                      <div><dt>Navigation</dt><dd>{navigation}</dd></div>
                    </dl>
                  </div>
                  <button ref={(element) => { plateButtons.current[id] = element }} className="plate-target" type="button" aria-label={`Open ${name} in focus mode`} onClick={() => navigate(id)} />
                </article>
              ))}
            </div>
          </div>
        </section>
      </main> : <main className="focus page-width mx-auto" style={{ '--accent': current.accent } as CSSProperties}>
        <div className="focus-bar flex items-center justify-between">
          <button className="focus-back" type="button" onClick={() => navigate(null)}><ArrowLeft size={15} aria-hidden="true" />All plates</button>
          <p className="focus-plate">PL. {two(currentIndex + 1)} / {two(themes.length)}<span>{current.domain}</span></p>
          <button className="native-open" type="button" onClick={() => setFullscreen(true)}><Maximize2 size={14} aria-hidden="true" />Native Fullscreen</button>
        </div>
        <div className="focus-stage">
          <DesignDnaPanel id={current.id} onSwitch={(id) => navigate(id, false)} titleRef={focusTitle} />
          <div className="focus-device" key={current.id} data-width={PHONE_WIDTH} data-height={PHONE_HEIGHT}>
            <PhoneViewport><IPhoneFrame statusBar={current.statusBar}><SpecimenBoundary name={current.name}><current.Component interactive /></SpecimenBoundary></IPhoneFrame></PhoneViewport>
          </div>
        </div>
      </main>}
    </div>
  )
}
