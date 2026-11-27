import { ArrowLeft, Maximize2, Minimize2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type { CSSProperties } from 'react'
import IPhoneFrame, { PHONE_HEIGHT, PHONE_WIDTH } from './components/IPhoneFrame'
import PhoneViewport from './components/PhoneViewport'
import { accentText } from './components/accentText'
import DesignDnaPanel from './components/DesignDnaPanel'
import PlateIndex from './components/PlateIndex'
import Transit, { flyPlate } from './components/Transit'
import type { Core, TransitHandle } from './components/Transit'
import { RASTER, plateLevels } from './components/plates'
import NativeViewport from './components/NativeViewport'
import SpecimenBoundary from './components/SpecimenBoundary'
import { clockText, modules, tracks } from './data/osData'
import { SURFACE } from './data/paradigms'
import type { ParadigmId } from './data/paradigms'
import { useOS, useOSActions, useOSSnapshot } from './state/osStore'
import type { OSState } from './state/osStore'
import { themes } from './themes'

const two = (value: number) => String(value).padStart(2, '0')
const engineParameters = themes.reduce((total, theme) => total + theme.controls.length, 0)
const plateNumber = (id: ParadigmId) => two(themes.findIndex((theme) => theme.id === id) + 1)

/** The session as the core holds it, with no paradigm's geometry on it: what a switch carries across. */
function coreOf(state: OSState, from: ParadigmId, to: ParadigmId): Core {
  const last = state.consoleLogs[state.consoleLogs.length - 1]
  const { trackIndex, progress } = state.mediaState
  const track = tracks[trackIndex]
  return {
    trace: state.telemetryState.trace,
    log: last ? `${last.timestamp}  ${last.input ? `${last.input} · ` : ''}${last.output}` : 'Buffer clear',
    media: `${track.title} · ${clockText(progress)} / ${clockText(track.duration)}`,
    progress: progress / track.duration,
    from: plateNumber(from),
    to: plateNumber(to),
  }
}

const frames = (count: number) => new Promise<void>((resolve) => {
  const wait = (left: number) => left ? requestAnimationFrame(() => wait(left - 1)) : resolve()
  wait(count)
})

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
  const activeModule = useOS((state) => state.activeModule)
  const actions = useOSActions()
  const snapshot = useOSSnapshot()
  const transit = useRef<TransitHandle>(null)
  /** The view change in progress; a newer one takes over from an older one. */
  const turn = useRef(0)
  /** Where the view change in progress is going; undefined when none is running. */
  const heading = useRef<ParadigmId | null | undefined>(undefined)
  /** The paradigm a plate is flying to: its device mounts veiled, so nothing shows before the plate lands. */
  const [arriving, setArriving] = useState<ParadigmId | null>(null)
  const inFlight = useRef<(() => void) | null>(null)
  const shown = useRef({ selected, fullscreen })
  useEffect(() => { shown.current = { selected, fullscreen } })
  const lastTheme = useRef<ParadigmId>(themeFromHash() ?? themes[0].id)
  const focusTitle = useRef<HTMLHeadingElement>(null)
  const plateButtons = useRef<Partial<Record<ParadigmId, HTMLButtonElement | null>>>({})
  const restoreFocus = useRef(false)
  const nativeExit = useRef<HTMLButtonElement>(null)
  const nativeOpen = useRef<HTMLButtonElement>(null)
  const wasFullscreen = useRef(false)
  const moveFocus = useRef(false)
  const focused = selected !== null
  const currentIndex = themes.findIndex((theme) => theme.id === selected)
  const current = themes[currentIndex]

  useEffect(() => { actions.setObserving(focused) }, [actions, focused])

  const commit = useCallback((id: ParadigmId | null, focusTarget: boolean) => {
    // What is on show changes now, not when React next renders: a key pressed in between must see it.
    shown.current = { selected: id, fullscreen: id ? shown.current.fullscreen : false }
    if (id) lastTheme.current = id
    else setFullscreen(false)
    restoreFocus.current = focusTarget && id === null
    moveFocus.current = focusTarget && id !== null
    window.history.pushState(null, '', id ? `#${id}` : window.location.pathname + window.location.search)
    setSelected(id)
    window.scrollTo(0, 0)
  }, [])

  /**
   * Every change of view is one of three movements. From the index, a plate flies to the device and
   * develops into its paradigm. Between paradigms, the core's samples leave one geometry and seat in
   * the next. Back to the index, the specimen is screened down to its plate and the plate goes home.
   * With reduced motion, and in fullscreen where there is no device to fly to, the view simply changes.
   */
  const navigate = useCallback((id: ParadigmId | null, focusTarget = true) => {
    const from = shown.current.selected
    const going = heading.current === undefined ? from : heading.current
    if (id === going) return
    inFlight.current?.()
    inFlight.current = null
    // Asked for the view that is still showing while a change is under way: the change is called off.
    if (id === from) {
      turn.current++
      heading.current = undefined
      setArriving(null)
      transit.current?.clear()
      return
    }
    const mine = ++turn.current
    heading.current = id
    const layer = transit.current
    const current = () => mine === turn.current
    const settled = () => { if (current()) heading.current = undefined }
    const screenElement = () => document.querySelector<HTMLElement>('.focus-device .iphone-screen')
    const screenBox = () => screenElement()?.getBoundingClientRect() ?? null
    // The screen's corner radius as drawn, after the device has been scaled to fit.
    const screenRadius = () => {
      const screen = screenElement()
      return screen ? parseFloat(getComputedStyle(screen).borderTopLeftRadius) * screen.getBoundingClientRect().width / screen.offsetWidth : 0
    }
    const raster = (plate: ParadigmId) => plateButtons.current[plate]?.querySelector<HTMLElement>('.plate-raster') ?? null

    if (matchMedia('(prefers-reduced-motion: reduce)').matches || shown.current.fullscreen) {
      layer?.clear()
      setArriving(null)
      commit(id, focusTarget)
      settled()
      return
    }
    setArriving(null)
    if (from && id) {
      if (!layer) {
        commit(id, focusTarget)
        settled()
        return
      }
      void layer.migrate(coreOf(snapshot(), from, id), () => { if (current()) commit(id, focusTarget) }).then((done) => {
        if (!current()) return
        // The layer went away before the switch was committed under it: the switch is still made.
        if (!done && shown.current.selected !== id) commit(id, focusTarget)
        settled()
      })
      return
    }
    if (id) {
      const origin = raster(id)?.getBoundingClientRect()
      // The focus view is rendered within this task, so the plate leaves the index in the frame it was
      // touched in: the device has mounted veiled and the ghost is in the air before anything is painted.
      flushSync(() => {
        setArriving(origin ? id : null)
        commit(id, focusTarget)
      })
      const target = screenBox()
      const arrival = transit.current
      if (!origin || !target || !arrival) {
        // Nowhere to fly from or to: the device is shown as it is.
        arrival?.clear()
        setArriving(null)
        settled()
        return
      }
      arrival.veil()
      const flight = flyPlate(plateLevels(id), origin, target, 380, { to: screenRadius() })
      inFlight.current = flight.cancel
      void (async () => {
        if (!await flight.landed || !current()) return
        // The first frame of the development is the plate itself, so the ghost can be lifted off it unseen.
        const developed = transit.current?.develop(plateLevels(id))
        await frames(2)
        flight.remove()
        if (inFlight.current === flight.cancel) inFlight.current = null
        await developed
        if (!current()) return
        // The next device to mount is not waiting for a plate.
        setArriving(null)
        settled()
      })()
      return
    }
    if (!from) {
      settled()
      return
    }
    void (async () => {
      const screened = layer ? await layer.screen(plateLevels(from)) : false
      if (!current()) return
      // Without its screen-down (the layer went away under it) the view still changes, with nothing to fly.
      const origin = screened ? screenBox() : null
      const corner = screenRadius()
      // The index is rendered within this task, so its plate is hidden and the ghost is placed over the
      // device before the index is first painted: no frame shows the plate home before it has flown.
      flushSync(() => commit(null, focusTarget))
      const home = raster(from)
      if (!origin || !home) {
        settled()
        return
      }
      // The plate in the index stays empty until its own halftone has flown back onto it.
      home.style.visibility = 'hidden'
      const flight = flyPlate(plateLevels(from), origin, home.getBoundingClientRect(), 360, { from: corner })
      const land = () => {
        home.style.visibility = ''
        flight.cancel()
      }
      inFlight.current = land
      await flight.landed
      land()
      if (inFlight.current === land) inFlight.current = null
      settled()
    })()
  }, [commit, snapshot])

  /**
   * Fullscreen has no device to fly to and no layer to draw on, so whatever movement is under way ends
   * here: a switch that was asked for is made at once, a plate in flight is put down, and a return to the
   * index gives way to the paradigm the operator has just asked to see at full size.
   */
  const enterFullscreen = useCallback(() => {
    const pending = heading.current
    turn.current++
    heading.current = undefined
    inFlight.current?.()
    inFlight.current = null
    setArriving(null)
    transit.current?.clear()
    if (pending && pending !== shown.current.selected) commit(pending, false)
    shown.current = { ...shown.current, fullscreen: true }
    setFullscreen(true)
  }, [commit])

  useEffect(() => {
    function sync() {
      const id = themeFromHash()
      // History moves the view at once: whatever transition was running gives way.
      turn.current++
      heading.current = undefined
      inFlight.current?.()
      inFlight.current = null
      transit.current?.clear()
      setArriving(null)
      // As with any other change of view, focus goes to the new view's title, or back to its plate.
      restoreFocus.current = id === null
      moveFocus.current = id !== null
      shown.current = { selected: id, fullscreen: id ? shown.current.fullscreen : false }
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
    // The specimen mounts one commit after the view (its viewport measures itself first) and an open
    // console prompt focuses itself as it mounts; the title is focused after that, so it keeps the focus.
    const toTitle = moveFocus.current && selected
    const frame = toTitle ? requestAnimationFrame(() => focusTitle.current?.focus({ preventScroll: true })) : 0
    restoreFocus.current = false
    moveFocus.current = false
    return () => cancelAnimationFrame(frame)
  }, [selected])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing) return
      // On the index the number keys are the only keys: each opens the plate it numbers.
      if (!selected) {
        const plate = /^[1-9]$/.test(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey ? themes[Number(event.key) - 1] : undefined
        if (plate) {
          event.preventDefault()
          navigate(plate.id)
        }
        return
      }
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

  // Entering or leaving fullscreen replaces the whole tree, so the control that was pressed is gone.
  // Focus goes to its counterpart, unless the specimen has already taken it (an open console prompt).
  useEffect(() => {
    if (fullscreen === wasFullscreen.current) return
    wasFullscreen.current = fullscreen
    if (document.activeElement && document.activeElement !== document.body) return
    ;(fullscreen ? nativeExit : nativeOpen).current?.focus({ preventScroll: true })
  }, [fullscreen])

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
        <button ref={nativeExit} type="button" aria-label="Exit fullscreen" onClick={() => setFullscreen(false)}><Minimize2 size={14} aria-hidden="true" /><span>Exit</span></button>
      </nav>
      <NativeViewport background={base}><SpecimenBoundary key={current.id} name={current.name}><current.Component interactive /></SpecimenBoundary></NativeViewport>
    </main>
  }

  return (
    <div className="lab min-h-screen">
      <header className="lab-bar">
        <div className="lab-bar__inner page-width mx-auto flex items-center justify-between">
          <button className="lab-mark" type="button" onClick={() => navigate(null)} aria-label="Y3K Interface Lab index">
            <LabMark /><strong>Y3K</strong><span>Interface Lab</span>
          </button>
          <nav className="lab-views flex" aria-label="Showcase view">
            <button type="button" aria-pressed={!selected} onClick={() => navigate(null)}>Index</button>
            <button type="button" aria-pressed={!!selected} onClick={() => { if (!selected) navigate(lastTheme.current) }}>Focus</button>
          </nav>
        </div>
      </header>

      {!current ? <main className="gallery page-width mx-auto">
        <button className="native-banner" type="button" onClick={() => {
          navigate(lastTheme.current, false)
          enterFullscreen()
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
            <div><dt>Artboard</dt><dd>{SURFACE.width} × {SURFACE.height}</dd></div>
          </dl>
        </header>
        <section className="plates" aria-label="Plate index">
          <div className="plates-bar flex items-center justify-between">
            <h2>Plates 01–{two(themes.length)}</h2>
            <p className="plates-spec">Grayscale · 12 px blur · {RASTER.columns} × {RASTER.rows} raster</p>
          </div>
          <div className="plates-scroll">
            <PlateIndex onOpen={(id) => navigate(id)} register={(id, element) => { plateButtons.current[id] = element }} />
          </div>
        </section>
      </main> : <main className="focus page-width mx-auto" style={{ '--accent': current.accent, '--accent-text': accentText(current.accent) } as CSSProperties}>
        <div className="focus-bar flex items-center justify-between">
          <button className="focus-back" type="button" onClick={() => navigate(null)}><ArrowLeft size={15} aria-hidden="true" />All plates</button>
          <p className="focus-plate">PL. {two(currentIndex + 1)} / {two(themes.length)}<span>{current.domain}</span></p>
          <button ref={nativeOpen} className="native-open" type="button" onClick={enterFullscreen}><Maximize2 size={14} aria-hidden="true" />Native Fullscreen</button>
        </div>
        <div className="focus-stage">
          <DesignDnaPanel id={current.id} onSwitch={(id) => navigate(id, false)} titleRef={focusTitle} />
          <div className="focus-device" data-width={PHONE_WIDTH} data-height={PHONE_HEIGHT}>
            <PhoneViewport><IPhoneFrame statusBar={current.statusBar}>
              <SpecimenBoundary key={current.id} name={current.name}><current.Component interactive /></SpecimenBoundary>
              <Transit ref={transit} veiled={arriving === current.id} />
            </IPhoneFrame></PhoneViewport>
          </div>
        </div>
      </main>}
    </div>
  )
}
