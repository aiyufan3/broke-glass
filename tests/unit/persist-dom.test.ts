// @vitest-environment happy-dom
import { expect, test } from 'vitest'
import { createOSStore } from '../../src/state/osStore'
import { PARAMS_KEY, browserStorage } from '../../src/state/persist'

test('the default store persists to window.localStorage', () => {
  expect(browserStorage()).toBe(window.localStorage)
  window.localStorage.clear()
  createOSStore().actions.tune('telemetry', 0, 100)
  expect(JSON.parse(window.localStorage.getItem(PARAMS_KEY)!).params.telemetry).toEqual([100, 26, 58])
  expect(createOSStore().snapshot().paradigmParams.telemetry).toEqual([100, 26, 58])
  window.localStorage.clear()
})

test('a browser that refuses access to localStorage runs without persistence', () => {
  const original = Object.getOwnPropertyDescriptor(window, 'localStorage')!
  Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('denied', 'SecurityError') } })
  try {
    expect(browserStorage()).toBeNull()
    const store = createOSStore()
    store.actions.tune('field', 0, 10)
    expect(store.snapshot().paradigmParams.field[0]).toBe(10)
  } finally {
    Object.defineProperty(window, 'localStorage', original)
  }
})
