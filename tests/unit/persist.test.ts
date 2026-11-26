import { describe, expect, test } from 'vitest'
import { initialParams } from '../../src/data/paradigms'
import { createOSStore } from '../../src/state/osStore'
import { PARAMS_KEY, PARAMS_VERSION, browserStorage, readParams, writeParams } from '../../src/state/persist'

class MemoryStorage implements Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  items = new Map<string, string>()
  getItem(key: string) { return this.items.get(key) ?? null }
  setItem(key: string, value: string) { this.items.set(key, String(value)) }
  removeItem(key: string) { this.items.delete(key) }
}
const storage = () => new MemoryStorage() as unknown as Storage

describe('engine settings persist across a reload', () => {
  test('a store booted from the same storage restores every tuned paradigm and keeps the rest at defaults', () => {
    const shared = storage()
    const before = createOSStore(shared)
    before.actions.tune('field', 0, 0)
    before.actions.tune('field', 2, 100)
    before.actions.tune('strata', 1, 7)
    before.actions.tune('wetware', 1, 20)
    before.actions.reset('wetware')

    const after = createOSStore(shared)
    expect(after.snapshot().paradigmParams).toEqual({ ...initialParams, field: [0, 30, 100], strata: [16, 7, 32] })
  })

  test('only the settings are stored: logs, tools, telemetry and media start fresh', () => {
    const shared = storage()
    const before = createOSStore(shared)
    before.actions.execute('spike')
    before.actions.execute('open media')
    before.actions.setSearch('mycelial')
    before.actions.tune('quantum', 2, 5)

    const stored = JSON.parse(shared.getItem(PARAMS_KEY)!)
    expect(Object.keys(stored).sort()).toEqual(['params', 'version'])
    expect(stored.version).toBe(PARAMS_VERSION)

    const after = createOSStore(shared).snapshot()
    expect(after.paradigmParams.quantum).toEqual([2600, 67, 5])
    expect(after.activeModule).toBeNull()
    expect(after.searchQuery).toBe('')
    expect(after.telemetryState.stressMode).toBe(false)
    expect(after.consoleLogs).toHaveLength(1)
    expect(after.commandHistory).toEqual([])
  })

  test('without storage the store still tunes in memory', () => {
    const store = createOSStore(null)
    store.actions.tune('spatial', 1, 12)
    expect(store.snapshot().paradigmParams.spatial).toEqual([900, 12, 35])
    expect(readParams(null)).toEqual(initialParams)
    // Outside a browser there is no window, so the default store keeps settings in memory.
    expect(browserStorage()).toBeNull()
    expect(createOSStore().snapshot().paradigmParams).toEqual(initialParams)
  })
})

describe('bad stored data falls back to the registry defaults', () => {
  const restored = (raw: string) => {
    const shared = storage()
    shared.setItem(PARAMS_KEY, raw)
    return createOSStore(shared).snapshot().paradigmParams
  }
  const save = (params: unknown, version: unknown = PARAMS_VERSION) => JSON.stringify({ version, params })

  test.each([
    ['unparseable JSON', '{"version":1,"params":{"field":[0,'],
    ['JSON null', 'null'],
    ['an array', '[1,2,3]'],
    ['a newer schema version', save({ field: [0, 30, 28] }, 2)],
    ['a missing version', JSON.stringify({ params: { field: [0, 30, 28] } })],
    ['params that are not an object', save([[0, 30, 28]])],
    ['a value below its range', save({ field: [-1, 30, 28] })],
    ['a value above its range', save({ strata: [31, 45, 32] })],
    ['a string value', save({ field: ['0', 30, 28] })],
    ['a non-finite value', '{"version":1,"params":{"field":[1e999,30,28]}}'],
    ['too few values', save({ field: [0, 30] })],
    ['too many values', save({ field: [0, 30, 28, 1] })],
  ])('%s', (_, raw) => {
    expect(restored(raw)).toEqual(initialParams)
  })

  test('one corrupt paradigm does not cost the others their settings, and unknown ids are ignored', () => {
    expect(restored(save({ field: [0, 30, 28], wetware: [44, 'x', 53], retired: [1, 2, 3] }))).toEqual({ ...initialParams, field: [0, 30, 28] })
  })

  test('a store that throws on read or write is treated as absent', () => {
    const hostile = {
      getItem: () => { throw new DOMException('denied', 'SecurityError') },
      setItem: () => { throw new DOMException('full', 'QuotaExceededError') },
    } as unknown as Storage
    expect(readParams(hostile)).toEqual(initialParams)
    expect(() => writeParams(hostile, initialParams)).not.toThrow()
    const store = createOSStore(hostile)
    expect(() => store.actions.tune('field', 1, 48)).not.toThrow()
    expect(store.snapshot().paradigmParams.field).toEqual([58, 48, 28])
  })
})
