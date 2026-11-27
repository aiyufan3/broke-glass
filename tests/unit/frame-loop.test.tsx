// @vitest-environment happy-dom
import { act, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import SpecimenBoundary from '../../src/components/SpecimenBoundary'
import { useFrameLoop } from '../../src/state/frameLoop'

declare global { var IS_REACT_ACT_ENVIRONMENT: boolean }
globalThis.IS_REACT_ACT_ENVIRONMENT = true

let frames = 0
let failAt = Infinity

function Engine() {
  const host = useRef<HTMLElement>(null)
  useFrameLoop(host, true, ({ still }) => {
    frames++
    if (frames >= failAt) throw new Error(`engine fault on ${still ? 'a still' : 'a running'} frame`)
  })
  return <section ref={host}>engine running</section>
}

let host: HTMLDivElement
let errors: ReturnType<typeof vi.spyOn>
let pending: FrameRequestCallback[]
const tick = () => act(() => { for (const callback of pending.splice(0)) callback(performance.now()) })

beforeEach(() => {
  frames = 0
  failAt = Infinity
  pending = []
  host = document.createElement('div')
  document.body.append(host)
  errors = vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => pending.push(callback))
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { pending[id - 1] = () => {} })
  vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} })
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
  Object.defineProperty(document, 'fonts', { configurable: true, value: { ready: new Promise(() => {}) } })
})
afterEach(() => {
  errors.mockRestore()
  vi.unstubAllGlobals()
  host.remove()
})

test('an engine that throws inside the frame loop is stopped and shown on the fault plate, then runs again when remounted', async () => {
  const root = createRoot(host)
  await act(() => root.render(<SpecimenBoundary name="FieldOS"><Engine /></SpecimenBoundary>))
  await tick()
  await tick()
  expect(frames).toBe(2)
  expect(host.textContent).toBe('engine running')

  // The third frame runs from requestAnimationFrame, outside React: an error boundary alone would never see it.
  failAt = 3
  await tick()
  const alert = host.querySelector('[role="alert"]')
  expect(alert?.querySelector('strong')?.textContent).toBe('FieldOS')
  expect(alert?.querySelector('code')?.textContent).toBe('engine fault on a running frame')
  // The loop is over: no further frame is requested or drawn.
  const drawn = frames
  await tick()
  await tick()
  expect(frames).toBe(drawn)

  failAt = Infinity
  frames = 0
  await act(() => { [...host.querySelectorAll('button')].find((button) => button.textContent === 'Remount specimen')?.click() })
  await tick()
  expect(host.querySelector('[role="alert"]')).toBeNull()
  expect(host.textContent).toBe('engine running')
  expect(frames).toBeGreaterThan(0)
  await act(() => root.unmount())
})

test('a fault on a settled frame, issued from an effect, reaches the same plate', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }))
  failAt = 1
  const root = createRoot(host)
  await act(() => root.render(<SpecimenBoundary name="StrataOS"><Engine /></SpecimenBoundary>))
  expect(host.querySelector('[role="alert"] code')?.textContent).toBe('engine fault on a still frame')
  await act(() => root.unmount())
})
