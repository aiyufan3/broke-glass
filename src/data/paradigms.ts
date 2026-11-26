export type ParadigmProps = { interactive: boolean }

/** The native surface every paradigm fills, in CSS pixels. Each engine's own SURFACE must match it. */
export const SURFACE = { width: 377, height: 836 } as const

type EngineControl = {
  label: string
  min: number
  max: number
  initial: number
  unit?: string
  effect: string
}

export type ParadigmSpec = {
  name: string
  domain: string
  accent: string
  statusBar: 'bone' | 'ink'
  summary: string
  lineage: string
  geometry: string
  polarity: string
  navigation: string
  rules: [string, string, string]
  bans: [string, string]
  controls: [EngineControl, EngineControl, EngineControl]
  colors: [string, string, string, string]
  type: [string, string]
  grammar: string
}

export const paradigms = {
  field: {
    name: 'FieldOS',
    domain: 'Field & Force State',
    accent: '#34F5C5',
    statusBar: 'bone',
    summary: 'Four bodies hold station around a singularity. Move the pointer to probe the potential, drag a body to bend it, and select one to condense the field into a polar workspace.',
    lineage: 'Bret Victor · Territory Studio · potential theory',
    geometry: 'Equipotential contours, four bodies, one singularity',
    polarity: 'Obsidian green, mint line, no fills',
    navigation: 'Probe, drag, condense, return along the arc',
    rules: ['Polar coordinates', 'Contours computed from mass', 'Controls ride an orbit'],
    bans: ['Rectangular containers', 'Flat tab bars'],
    controls: [
      { label: 'Gravity Warp', min: 0, max: 100, initial: 58, effect: 'Mass of the four bodies and the pointer probe relative to the singularity. At 0 every equipotential is a circle.' },
      { label: 'Field Line Density', min: 8, max: 48, initial: 30, effect: 'Number of equipotential levels contoured between the horizon and the screen edge.' },
      { label: 'Orbit Drift', min: 0, max: 100, initial: 28, effect: 'Tangential velocity of the tracer beads and their rate of infall along the contours.' },
    ],
    colors: ['#030908', '#34F5C5', '#B7F9EA', '#124F41'],
    type: ['Space Grotesk', 'System monospace'],
    grammar: 'Contour a real scalar potential: one singularity, four softened point masses and a pointer probe. Draw equipotentials only, never filled panels. Let tracer beads slide along the contours and fall toward the horizon. Dragging a body moves its well and repels its neighbours at short range. Selecting a body sends two wave fronts through the field; they interfere and condense into a ring instrument whose controls sit on the circumference.',
  },
  wetware: {
    name: 'WetwareOS',
    domain: 'Wetware & Xenobiology',
    accent: '#FF5CA8',
    statusBar: 'bone',
    summary: 'A colony of radiolarian cells exchanges signals through elastic vessels. Select a cell to differentiate it into a working organ; the nucleus rejoins the colony.',
    lineage: 'Neri Oxman · Iris van Herpen · Ernst Haeckel',
    geometry: 'Asymmetric membranes, pleated lattices, tethered vessels',
    polarity: 'Deep plum, pearl linework, coral and aqua signal',
    navigation: 'Signal a cell, differentiate, rejoin at the nucleus',
    rules: ['Asymmetric membranes', 'Vessels anchored at the hilum', 'Nucleus navigation'],
    bans: ['90° corners', 'Glossy plastic highlights'],
    controls: [
      { label: 'Membrane Pulse', min: 0, max: 100, initial: 44, effect: 'Breathing rate and amplitude of every membrane spline and its pleats.' },
      { label: 'Cytoplasm Opacity', min: 18, max: 100, initial: 65, effect: 'Density of the cytoplasm behind the lattice.' },
      { label: 'Synapse Speed', min: 15, max: 100, initial: 53, effect: 'Conduction velocity along the vessels. Every change fires a pulse from the nucleus.' },
    ],
    colors: ['#0B0714', '#FF5CA8', '#9EE6D5', '#EFCCDC'],
    type: ['Fraunces', 'Avenir Next / Inter'],
    grammar: 'Grow an asymmetric colony of cells from closed noise splines. Give each membrane concentric pleats, radial spines and pores, drawn as pearl linework over translucent cytoplasm. Tether every cell to a nucleus with cubic vessels that stay attached at the hilum while cells migrate, and send peristaltic pulses along them. Open a tool by swelling its cell into an organ; neighbours drift aside on their tethers.',
  },
  quantum: {
    name: 'QuantumOS',
    domain: 'Quantum & Point Cloud',
    accent: '#FFFFFF',
    statusBar: 'bone',
    summary: 'The system exists as a probability cloud until observed. Hover, focus or select a coordinate to collapse its samples into a registration mark, then type at the cursor.',
    lineage: 'Ryoji Ikeda · John Maeda · quantum measurement',
    geometry: 'Probability cloud, perimeter rulers, registration marks',
    polarity: 'Absolute black, white, spectral red and cyan',
    navigation: 'Observe a coordinate, type at the cursor, release',
    rules: ['Pitch-black canvas', 'Particle registration', 'Typographic coordinates'],
    bans: ['Filled cards', 'Solid panel borders'],
    controls: [
      { label: 'Particle Count', min: 600, max: 4200, initial: 2600, effect: 'Samples drawn from the probability cloud on every frame.' },
      { label: 'Collapse Force', min: 15, max: 100, initial: 67, effect: 'Rate at which observed samples converge on their registration mark.' },
      { label: 'RGB Dispersion', min: 0, max: 5, initial: 1, unit: 'px', effect: 'Red and cyan wavelength separation per particle, scaled by its energy.' },
    ],
    colors: ['#000000', '#FFFFFF', '#24E9FF', '#FF4057'],
    type: ['Inter Light', 'System monospace'],
    grammar: 'Render the system as samples of a probability density on absolute black. Place controls as typographic coordinates referenced to perimeter rulers. Observation collapses nearby samples into bracket-shaped registration marks; release lets them decohere. Encode live state as data: a barcode of the last command, digit columns, point plots. No surface is ever filled or outlined.',
  },
  telemetry: {
    name: 'TelemetryOS',
    domain: 'Sub-Atomic Telemetry',
    accent: '#FF3B00',
    statusBar: 'ink',
    summary: 'A scanning instrument on paper. The beam re-acquires the specimen on every pass; select a row or press a key to open an inspection bay inside the grid.',
    lineage: 'Teenage Engineering · Dieter Rams · SEM instrumentation',
    geometry: 'Edge-to-edge hairline grid, ridged scan, tabular traces',
    polarity: 'Alabaster paper, carbon ink, thermal orange and blue',
    navigation: 'Select a row or key, inspect, close the bay',
    rules: ['0px radius', '1px hairlines', 'Live tabular readings'],
    bans: ['Dark Bento', 'Floating dock'],
    controls: [
      { label: 'Scan Sweep Rate', min: 15, max: 100, initial: 45, effect: 'Beam velocity across the specimen. Each pass re-acquires the surface.' },
      { label: 'Signal Noise', min: 0, max: 100, initial: 26, effect: 'Shot noise added to acquired lines and the oscilloscope trace.' },
      { label: 'Thermal Gain', min: 0, max: 100, initial: 58, effect: 'Detector gain: trace amplitude, phosphor persistence and hotspot contrast.' },
    ],
    colors: ['#EAEAE5', '#0D0D0D', '#FF3B00', '#0047FF'],
    type: ['System monospace', 'Tabular numerals'],
    grammar: 'Build a light-mode scientific instrument from square cells and 1px rules. A beam sweeps a ridged specimen and redraws each line as it passes; older lines decay. Pair it with a graticule oscilloscope, a module table with live traces and a flush key strip. Tools open as an inspection bay that steps into the grid like a drawer, never as an overlay.',
  },
  spatial: {
    name: 'SpatialOS',
    domain: 'Non-Euclidean Spatial',
    accent: '#8CBEC8',
    statusBar: 'bone',
    summary: 'A concrete corridor holds four apertures of light at staggered depths. Select one and the camera travels through it into the chamber behind.',
    lineage: 'James Turrell · Tadao Ando · Monument Valley',
    geometry: 'One-point corridor, four recessed apertures, inner chambers',
    polarity: 'Petrol concrete, aqua light, amber under load',
    navigation: 'Tilt, enter through an aperture, exit along Z',
    rules: ['Preserved 3D depth', 'Recessed apertures', 'Camera fly-through'],
    bans: ['Flat stacks', 'Opaque metal plates'],
    controls: [
      { label: 'Perspective Depth', min: 500, max: 1450, initial: 900, unit: 'px', effect: 'Focal distance of the corridor camera and of every nested aperture.' },
      { label: 'Parallax Tilt', min: 0, max: 16, initial: 5, unit: '°', effect: 'Maximum camera rotation following the pointer. Each change previews the sweep.' },
      { label: 'Chamber Fog', min: 0, max: 100, initial: 35, effect: 'Density of the haze accumulated per unit of depth.' },
    ],
    colors: ['#071418', '#173641', '#8CBEC8', '#E0F1F2'],
    type: ['Barlow Condensed', 'System monospace'],
    grammar: 'Construct a concrete corridor in true one-point perspective with formwork seams and tie holes. Cut four apertures at staggered depths; each is a recess with its own vanishing point, lit from behind and carrying a live preview. Selecting one moves the camera through the opening into a chamber where the back wall is the display and a plinth holds the controls. Light shifts from aqua to amber under load.',
  },
} as const satisfies Record<string, ParadigmSpec>

export type ParadigmId = keyof typeof paradigms
export type EngineParams = [number, number, number]
export type EngineSlot = 0 | 1 | 2

export const paradigmIds = Object.keys(paradigms) as ParadigmId[]

function defaults(id: ParadigmId): EngineParams {
  const [a, b, c] = paradigms[id].controls
  return [a.initial, b.initial, c.initial]
}

// Object.fromEntries widens keys to string; the ids come from the checked registry above.
export const initialParams = Object.fromEntries(paradigmIds.map((id) => [id, defaults(id)])) as Record<ParadigmId, EngineParams>

export function paradigmPrompt(id: ParadigmId, values: EngineParams) {
  const spec = paradigms[id]
  const engine = spec.controls.map((control, index) => `${control.label} ${values[index]}${'unit' in control ? control.unit : ''}`).join(', ')
  return [
    `You are designing ${spec.name}, an interactive ${SURFACE.width} × ${SURFACE.height} mobile computing interface.`,
    spec.grammar,
    `Palette in order from base to accent: ${spec.colors.join(', ')}. Typography: ${spec.type.join(' and ')}.`,
    `Required rules: ${spec.rules.join(', ')}. Explicitly banned: ${spec.bans.join(', ')}.`,
    `Current engine settings: ${engine}.`,
    'Provide Console, Telemetry, Neural Search, and Media in the native geometry. Keep navigation keyboard-accessible, support reduced motion, and render visuals using CSS, inline SVG, and Canvas.',
  ].join('\n\n')
}
