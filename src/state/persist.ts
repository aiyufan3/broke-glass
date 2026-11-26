import { initialParams, paradigmIds, paradigms } from '../data/paradigms'
import type { EngineParams, ParadigmId } from '../data/paradigms'

/**
 * Only the Design DNA settings outlive a reload. Logs, the active tool, telemetry and media are
 * session state and start fresh. Bump the version whenever the stored shape changes meaning.
 */
export const PARAMS_KEY = 'broke-glass/paradigm-params'
export const PARAMS_VERSION = 1

type Params = Record<ParadigmId, EngineParams>

/** localStorage, or null where it is unavailable: blocked cookies, sandboxed frames, no window. */
export function browserStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * The stored settings, checked against the registry. A paradigm is restored only when all three values
 * are finite numbers inside its control ranges; anything else, including unparseable JSON or another
 * schema version, falls back to the registry defaults. Paradigms added since the save get defaults too.
 */
export function readParams(storage: Pick<Storage, 'getItem'> | null): Params {
  const params = { ...initialParams }
  let stored: unknown
  try {
    const raw = storage?.getItem(PARAMS_KEY)
    if (!raw) return params
    stored = JSON.parse(raw)
  } catch {
    return params
  }
  if (!isRecord(stored) || stored.version !== PARAMS_VERSION || !isRecord(stored.params)) return params
  for (const id of paradigmIds) {
    const values = stored.params[id]
    const { controls } = paradigms[id]
    if (!Array.isArray(values) || values.length !== controls.length) continue
    const valid = values.every((value, slot) => typeof value === 'number' && Number.isFinite(value) && value >= controls[slot].min && value <= controls[slot].max)
    if (valid) params[id] = [values[0], values[1], values[2]]
  }
  return params
}

/** Saves the settings. A full or refused store is ignored: persistence is a convenience, never a failure. */
export function writeParams(storage: Pick<Storage, 'setItem'> | null, params: Params) {
  try {
    storage?.setItem(PARAMS_KEY, JSON.stringify({ version: PARAMS_VERSION, params }))
  } catch { /* Quota exceeded or storage disabled: the session keeps its settings in memory. */ }
}
