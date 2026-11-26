import type { ComponentType } from 'react'
import { paradigmIds, paradigms } from '../data/paradigms'
import type { ParadigmId, ParadigmProps } from '../data/paradigms'
import FieldOS from './field/FieldOS'
import WetwareOS from './wetware/WetwareOS'
import QuantumOS from './quantum/QuantumOS'
import TelemetryOS from './telemetry/TelemetryOS'
import SpatialOS from './spatial/SpatialOS'
import StrataOS from './strata/StrataOS'

const surfaces: Record<ParadigmId, ComponentType<ParadigmProps>> = {
  field: FieldOS,
  wetware: WetwareOS,
  quantum: QuantumOS,
  telemetry: TelemetryOS,
  spatial: SpatialOS,
  strata: StrataOS,
}

export const themes = paradigmIds.map((id) => ({ id, ...paradigms[id], Component: surfaces[id] }))
