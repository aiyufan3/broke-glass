import { ArrowLeft, Maximize2, Minimize2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type { CSSProperties } from 'react'
import IPhoneFrame, { PHONE_HEIGHT, PHONE_WIDTH } from './components/IPhoneFrame'
import PhoneViewport from './components/PhoneViewport'
import { accentText } from './components/accentText'
import BareViewport from './components/BareViewport'
import DesignDnaPanel from './components/DesignDnaPanel'
import PlateIndex from './components/PlateIndex'
import Transit, { flyPlate } from './components/Transit'
import type { Core, TransitHandle } from './components/Transit'
import { RASTER, plateLevels } from './components/plates'
import { usePhone } from './components/usePhone'
import NativeViewport from './components/NativeViewport'
import SpecimenBoundary from './components/SpecimenBoundary'
import SpecimenStrip from './components/SpecimenStrip'
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
  const phone = usePhone()
  /** On a phone, the Design DNA printed below the specimen. */
  const dna = useRef<HTMLDivElement>(null)
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
  /** On a phone, the specimen's own region: a change of view lands there, above the Design DNA. */
  const focusStage = useRef<HTMLElement>(null)
  /** Where the page was read when a movement brought its specimen into view: a switch called off goes back there. */
  const scrolledFrom = useRef<number | null>(null)
  /** The movement whose hold at the top the reader let go of, by asking to read the Design DNA. */
  const released = useRef<number | null>(null)
  /** On a phone the ground around the surface follows the lab's layer over it. */
  const stageVeil = useCallback((amount: number) => focusStage.current?.style.setProperty('--veil', amount.toFixed(3)), [])
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
    // The entry left behind keeps the place it was being read at, which the movement scrolled away from:
    // Back returns there. Scrolled to it and back within this task, so it is never drawn. A reader who
    // asked for the Design DNA during this movement is reading it, and the page stays theirs.
    const reading = id !== null && released.current === turn.current
    const readAt = scrolledFrom.current
    scrolledFrom.current = null
    if (readAt && !reading) window.scrollTo(0, readAt)
    window.history.pushState(null, '', id ? `#${id}` : window.location.pathname + window.location.search)
    setSelected(id)
    if (!reading) window.scrollTo(0, 0)
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
      // Nothing was changed, so nothing is left changed: the page goes back to where it was being read.
      if (scrolledFrom.current) window.scrollTo(0, scrolledFrom.current)
      scrolledFrom.current = null
      return
    }
    const mine = ++turn.current
    heading.current = id
    const layer = transit.current
    const current = () => mine === turn.current
    const settled = () => { if (current()) heading.current = undefined }
    // While a movement is under way on a paradigm, the page is held at its top, so nothing (a smooth
    // scroll still landing, a stray touch) carries the specimen off mid-movement; unless the reader has
    // asked to read the Design DNA.
    const holdTop = () => {
      if (!current() || heading.current === undefined || !shown.current.selected || released.current === mine) return
      if (window.scrollY) window.scrollTo(0, 0)
      requestAnimationFrame(holdTop)
    }
    // The surface the specimen is drawn on: the device's screen on a desktop, the bare surface on a phone.
    const screenElement = () => document.querySelector<HTMLElement>('main.focus [data-specimen-screen]')
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
    // A movement out of a paradigm is played where it can be seen: the specimen may have been scrolled
    // away (on a phone, under its Design DNA), and its screen-down or migration would happen out of sight.
    if (from) {
      scrolledFrom.current ??= window.scrollY
      window.scrollTo(0, 0)
      holdTop()
    }
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
      // Held from before the plate's landing place is measured, so the plate lands at the top.
      holdTop()
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
    scrolledFrom.current = null
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
      scrolledFrom.current = null
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
    // On a phone the title is printed below the specimen, so the specimen's region takes it, unless the
    // page is being read further down (Back can return to a place in the Design DNA): then the title.
    const toTitle = moveFocus.current && selected
    const target = () => {
      const stage = focusStage.current
      return stage && stage.getBoundingClientRect().bottom > 0 ? stage : focusTitle.current
    }
    const frame = toTitle ? requestAnimationFrame(() => target()?.focus({ preventScroll: true })) : 0
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
    // A foldable closed while in fullscreen comes back to a phone, which has no fullscreen control: its specimen takes the focus.
    ;(fullscreen ? nativeExit.current : nativeOpen.current ?? focusStage.current)?.focus({ preventScroll: true })
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
      {/* On a phone the specimen is the whole first screen: the lab's own bar gives way to its strip. */}
      {!(phone && current) && <header className="lab-bar">
        <div className="lab-bar__inner page-width mx-auto flex items-center justify-between">
          <button className="lab-mark" type="button" onClick={() => navigate(null)} aria-label="Y3K Interface Lab index">
            <LabMark /><strong>Y3K</strong><span>Interface Lab</span>
          </button>
          <nav className="lab-views flex" aria-label="Showcase view">
            <button type="button" aria-pressed={!selected} onClick={() => navigate(null)}>Index</button>
            <button type="button" aria-pressed={!!selected} onClick={() => { if (!selected) navigate(lastTheme.current) }}>Focus</button>
          </nav>
        </div>
      </header>}

      {!current ? <main className="gallery page-width mx-auto">
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
      </main> : phone ? <main className="focus focus--phone" style={{ '--accent': current.accent, '--accent-text': accentText(current.accent) } as CSSProperties}>
        <BareViewport stageRef={focusStage} label={`${current.name} specimen`} ground={current.colors[0]} ink={current.statusBar} veiled={arriving === current.id} strip={<SpecimenStrip id={current.id}
          onIndex={() => navigate(null)} onSwitch={(id) => navigate(id, false)}
          onDna={() => {
            // Asked for during a movement, the DNA is read at once: the hold at the top lets go.
            released.current = turn.current
            dna.current?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
            // Reading goes on from the Design DNA: the next Tab, or swipe, is not back in the specimen.
            focusTitle.current?.focus({ preventScroll: true })
          }} />}>
          <SpecimenBoundary key={current.id} name={current.name}><current.Component interactive /></SpecimenBoundary>
          <Transit ref={transit} veiled={arriving === current.id} onVeil={stageVeil} />
        </BareViewport>
        <div ref={dna} className="focus-dna page-width mx-auto">
          <div className="focus-bar flex items-center justify-between">
            <button className="focus-back" type="button" onClick={() => navigate(null)}><ArrowLeft size={15} aria-hidden="true" />All plates</button>
            <p className="focus-plate">PL. {two(currentIndex + 1)} / {two(themes.length)}</p>
          </div>
          <DesignDnaPanel id={current.id} onSwitch={(id) => navigate(id, false)} titleRef={focusTitle} />
        </div>
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
