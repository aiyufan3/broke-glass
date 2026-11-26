import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { channels, modules, nodes, sessionTime, tracks } from '../data/osData'
import type { ModuleId } from '../data/osData'
import { initialParams } from '../data/paradigms'
import type { EngineParams, EngineSlot, ParadigmId } from '../data/paradigms'
import { browserStorage, readParams, writeParams } from './persist'

type LogLevel = 'info' | 'ok' | 'warn'
export type ConsoleLog = { id: number; timestamp: string; input?: string; output: string; level: LogLevel }
type ImpulseKind = 'boot' | 'command' | 'scan' | 'spike' | 'inspect'
type Impulse = { seq: number; kind: ImpulseKind }
type Telemetry = { stressMode: boolean; selectedChannel: number; liveLatencyMs: number; scanFrame: number; trace: readonly number[] }
type Media = { isPlaying: boolean; trackIndex: number; progress: number; soundEnabled: boolean }

export type OSState = {
  activeModule: ModuleId | null
  commandHistory: string[]
  consoleLogs: ConsoleLog[]
  impulse: Impulse
  telemetryState: Telemetry
  searchQuery: string
  mediaState: Media
  paradigmParams: Record<ParadigmId, EngineParams>
}

const TICK_MS = 220
const LOG_LIMIT = 60
const BOOT_FRAME = 28
const TRACE_LENGTH = 48

// Deterministic jitter in [-1, 1]: the simulated link is reproducible from its frame number alone.
function jitter(frame: number) {
  const value = Math.sin(frame * 127.1 + 311.7) * 43758.5453
  return (value - Math.floor(value)) * 2 - 1
}

function latencyAt(frame: number, channel: number, stress: boolean) {
  return stress
    ? 44 + 9 * Math.sin(frame * .85) + 3 * Math.sin(frame * 2.3) + 1.5 * jitter(frame) + channel * 2
    : 12 + 1.15 * Math.sin(frame * .49 + channel) + .46 * Math.sin(frame * 1.31 + channel * 2.1) + .3 * jitter(frame) + channel * .24
}

const initial: OSState = {
  commandHistory: [],
  activeModule: null,
  consoleLogs: [{ id: 0, timestamp: sessionTime(), output: 'Agent core online. Four modules available.', level: 'ok' }],
  impulse: { seq: 0, kind: 'boot' },
  telemetryState: {
    stressMode: false,
    selectedChannel: 0,
    liveLatencyMs: latencyAt(BOOT_FRAME, 0, false),
    scanFrame: BOOT_FRAME,
    trace: Array.from({ length: TRACE_LENGTH }, (_, index) => latencyAt(BOOT_FRAME - TRACE_LENGTH + 1 + index, 0, false)),
  },
  searchQuery: '',
  mediaState: { isPlaying: false, trackIndex: 0, progress: 0, soundEnabled: false },
  paradigmParams: initialParams,
}

/** The session store. `storage` holds the Design DNA settings across reloads; pass null to keep them in memory. */
export function createOSStore(storage: Storage | null = browserStorage()) {
  // Boot from the saved engine settings; the boot snapshot used by static plates keeps the defaults.
  let state: OSState = { ...initial, paradigmParams: readParams(storage) }
  let logId = 0
  const listeners = new Set<() => void>()
  let audio: AudioContext | undefined
  let oscillator: OscillatorNode | undefined
  let gain: GainNode | undefined
  let started = false
  let observing = false
  let timer: number | undefined

  function commit(patch: Partial<OSState>) {
    state = { ...state, ...patch }
    listeners.forEach((listener) => listener())
  }

  function emit(kind: ImpulseKind): Impulse {
    return { seq: state.impulse.seq + 1, kind }
  }

  function append(output: string, level: LogLevel, kind: ImpulseKind, input?: string) {
    const log: ConsoleLog = { id: ++logId, timestamp: sessionTime(), input, output, level }
    commit({ consoleLogs: [...state.consoleLogs.slice(1 - LOG_LIMIT), log], impulse: emit(kind) })
  }

  function setActiveModule(activeModule: ModuleId | null) {
    if (activeModule !== state.activeModule) commit({ activeModule })
  }

  function setStress(stressMode: boolean) {
    const telemetry = state.telemetryState
    if (stressMode === telemetry.stressMode) return
    commit({
      telemetryState: { ...telemetry, stressMode, liveLatencyMs: latencyAt(telemetry.scanFrame, telemetry.selectedChannel, stressMode) },
      impulse: emit('spike'),
    })
  }

  function setChannel(selectedChannel: number) {
    if (selectedChannel !== state.telemetryState.selectedChannel && selectedChannel >= 0 && selectedChannel < channels.length) {
      commit({ telemetryState: { ...state.telemetryState, selectedChannel } })
    }
  }

  function execute(raw: string) {
    const input = raw.trim()
    if (!input) return
    commit({ commandHistory: [...state.commandHistory.slice(1 - LOG_LIMIT), input] })
    const command = input.toLowerCase()
    const name = command.replace(/^open\s+/, '')
    const target = command === 'scan' ? undefined : modules.find((module) =>
      module.id === name || module.label.toLowerCase() === name || module.short.toLowerCase() === name)
    if (target) {
      append(`Opening ${target.label}.`, 'ok', 'command', input)
      setActiveModule(target.id)
      return
    }
    setActiveModule('console')
    switch (command) {
      case 'help': append('help · status · scan · spike · clear · open <module>', 'info', 'command', input); break
      case 'status': append(`Core online. ${state.telemetryState.liveLatencyMs.toFixed(1)} ms · ${state.telemetryState.stressMode ? 'stress active' : 'nominal'}.`, 'ok', 'command', input); break
      case 'scan': {
        const scanFrame = state.telemetryState.scanFrame + 1
        commit({ telemetryState: { ...state.telemetryState, scanFrame } })
        append(`Scan complete. Frame ${scanFrame} · ${nodes.length} indexed nodes.`, 'ok', 'scan', input)
        break
      }
      case 'spike': {
        const enabled = !state.telemetryState.stressMode
        setStress(enabled)
        append(enabled ? 'Stress injection active across all paradigms.' : 'Stress injection cleared.', enabled ? 'warn' : 'ok', 'spike', input)
        break
      }
      case 'clear': commit({ consoleLogs: [], impulse: emit('command') }); break
      default: append(`Echo: ${input}`, 'info', 'command', input)
    }
  }

  function applyAudio(media: Media) {
    if (!audio || !oscillator || !gain) return
    const track = tracks[media.trackIndex]
    oscillator.type = track.wave
    oscillator.frequency.setTargetAtTime(track.frequency, audio.currentTime, .09)
    gain.gain.setTargetAtTime(media.soundEnabled && media.isPlaying ? .022 : 0, audio.currentTime, .06)
  }

  function setMedia(mediaState: Media) {
    applyAudio(mediaState)
    commit({ mediaState })
    syncTimer()
  }

  function toggleSound() {
    const enabled = !state.mediaState.soundEnabled
    if (enabled) {
      if (!window.AudioContext) {
        append('This browser does not support audio output.', 'warn', 'command')
        return
      }
      try {
        if (!audio) {
          audio = new AudioContext()
          oscillator = audio.createOscillator()
          gain = audio.createGain()
          gain.gain.value = 0
          oscillator.connect(gain).connect(audio.destination)
          oscillator.start()
        }
        void audio.resume().catch(() => {
          if (state.mediaState.soundEnabled) setMedia({ ...state.mediaState, soundEnabled: false })
        })
      } catch {
        append('Audio output is unavailable.', 'warn', 'command')
        return
      }
    }
    setMedia({ ...state.mediaState, soundEnabled: enabled })
  }

  function setTrack(trackIndex: number) {
    setMedia({ ...state.mediaState, trackIndex: (trackIndex + tracks.length) % tracks.length, progress: 0 })
  }

  function tick(seconds: number) {
    const telemetry = state.telemetryState
    const scanFrame = telemetry.scanFrame + 1
    const liveLatencyMs = latencyAt(scanFrame, telemetry.selectedChannel, telemetry.stressMode)
    let media = state.mediaState
    if (media.isPlaying) {
      let { trackIndex, progress } = media
      const cycle = tracks.reduce((duration, track) => duration + track.duration, 0)
      progress += seconds % cycle
      while (progress >= tracks[trackIndex].duration) {
        progress -= tracks[trackIndex].duration
        trackIndex = (trackIndex + 1) % tracks.length
      }
      media = { ...media, progress, trackIndex }
      if (trackIndex !== state.mediaState.trackIndex) applyAudio(media)
    }
    commit({
      telemetryState: { ...telemetry, scanFrame, liveLatencyMs, trace: [...telemetry.trace.slice(1), liveLatencyMs] },
      mediaState: media,
    })
  }

  function syncTimer() {
    const needed = started && (observing || state.mediaState.isPlaying)
    if (needed && timer === undefined) {
      let last = performance.now()
      timer = window.setInterval(() => {
        if (document.hidden) return
        const now = performance.now()
        tick((now - last) / 1000)
        last = now
      }, TICK_MS)
    } else if (!needed && timer !== undefined) {
      window.clearInterval(timer)
      timer = undefined
    }
  }

  const actions = {
    setObserving: (value: boolean) => { observing = value; syncTimer() },
    setActiveModule,
    execute,
    setStress,
    inspectNode: (node: (typeof nodes)[number]) => {
      append(`${node.coordinate} · ${node.label} [${node.type}, ${node.score}%] — ${node.text}`, 'ok', 'inspect')
      setActiveModule('console')
    },
    setChannel,
    setSearch: (searchQuery: string) => commit({ searchQuery }),
    togglePlayback: () => setMedia({ ...state.mediaState, isPlaying: !state.mediaState.isPlaying }),
    toggleSound,
    setTrack,
    seek: (progress: number) => setMedia({ ...state.mediaState, progress: Math.max(0, Math.min(progress, tracks[state.mediaState.trackIndex].duration)) }),
    tune: (id: ParadigmId, slot: EngineSlot, value: number) => {
      const values: EngineParams = [...state.paradigmParams[id]]
      values[slot] = value
      commit({ paradigmParams: { ...state.paradigmParams, [id]: values } })
      writeParams(storage, state.paradigmParams)
    },
    reset: (id: ParadigmId) => {
      commit({ paradigmParams: { ...state.paradigmParams, [id]: initialParams[id] } })
      writeParams(storage, state.paradigmParams)
    },
  }

  return {
    actions,
    snapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    start() {
      started = true
      syncTimer()
      return () => {
        started = false
        syncTimer()
        oscillator?.stop()
        if (audio && audio.state !== 'closed') void audio.close()
        audio = undefined
        oscillator = undefined
        gain = undefined
      }
    },
  }
}

const Context = createContext<ReturnType<typeof createOSStore> | null>(null)
export function OSProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => createOSStore())
  useEffect(() => store.start(), [store])
  return <Context.Provider value={store}>{children}</Context.Provider>
}

function useStore() {
  const store = useContext(Context)
  if (!store) throw new Error('OS state is available inside OSProvider.')
  return store
}

const neverNotify = () => () => {}
const bootState = () => initial

/** Reactive slice. With `live` false the caller renders the boot state and never subscribes. */
export function useOS<T>(select: (state: OSState) => T, live = true) {
  const store = useStore()
  return useSyncExternalStore(live ? store.subscribe : neverNotify, () => select(live ? store.snapshot() : initial), () => select(initial))
}

/** Non-reactive getter for render loops that read state once per frame. */
export function useOSSnapshot(live = true) {
  const store = useStore()
  return live ? store.snapshot : bootState
}

export function useOSActions() {
  return useStore().actions
}

export function useRecentLogs() {
  const logs = useOS((state) => state.consoleLogs)
  return useMemo(() => [...logs].reverse(), [logs])
}

export function useCommandLine() {
  const store = useStore()
  const cursor = useRef<number | null>(null)
  const draft = useRef('')
  const previousList = useRef(store.snapshot().commandHistory)
  function resetHistory() { cursor.current = null }
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
    const items = store.snapshot().commandHistory
    if (items !== previousList.current) { cursor.current = null; previousList.current = items }
    if (!items.length || (cursor.current === null && event.key === 'ArrowDown')) return
    event.preventDefault()
    const input = event.currentTarget
    if (cursor.current === null) draft.current = input.value
    const index = Math.max(0, Math.min(items.length, (cursor.current ?? items.length) + (event.key === 'ArrowUp' ? -1 : 1)))
    cursor.current = index === items.length ? null : index
    input.value = items[index] ?? draft.current
    input.setSelectionRange(input.value.length, input.value.length)
  }
  return { onKeyDown, onInput: resetHistory, resetHistory }
}
