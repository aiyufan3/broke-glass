export const modules = [
  { id: 'console', label: 'Console', short: 'CON' },
  { id: 'telemetry', label: 'Telemetry', short: 'TEL' },
  { id: 'search', label: 'Neural Search', short: 'SRC' },
  { id: 'media', label: 'Media', short: 'MED' },
] as const

export type ModuleId = (typeof modules)[number]['id']

export const system = { label: 'Agent Core', status: 'Online' } as const
export const channels = ['Core', 'Field', 'Link', 'Audio'] as const

export const quickCommands = ['help', 'scan', 'spike', 'status', 'clear'] as const

// A single local 24-hour clock supplies both the hardware display and the event log.
export function sessionTime(date = new Date()) {
  return [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((value) => String(value).padStart(2, '0')).join(':')
}

export const tracks = [
  { title: 'SUB-HARMONIC DRIFT', frequency: 43, duration: 58, wave: 'sine' },
  { title: 'XENO-SYNAPSE', frequency: 65, duration: 62, wave: 'triangle' },
  { title: 'PLANCK NOISE', frequency: 87, duration: 54, wave: 'sine' },
] as const

export const nodes = [
  { label: 'Orbital Memory', type: 'Storage', coordinate: 'F-041', score: 98, text: 'Memory addressed by orbital phase and radius.' },
  { label: 'Mycelial Relay', type: 'Network', coordinate: 'W-116', score: 96, text: 'A living junction that routes packets along branching filaments.' },
  { label: 'Planck Registry', type: 'Index', coordinate: 'Q-008', score: 94, text: 'An observation index that resolves coordinates on demand.' },
  { label: 'Alabaster Array', type: 'Sensor', coordinate: 'T-204', score: 92, text: 'A four-channel surface scanner with an electron-beam trace.' },
  { label: 'Janus Aperture', type: 'Portal', coordinate: 'S-019', score: 89, text: 'Paired chambers sharing a single vanishing point.' },
  { label: 'Gravity Bus', type: 'Network', coordinate: 'F-093', score: 88, text: 'A magnetic transport layer for orbital devices.' },
  { label: 'Chitin Archive', type: 'Storage', coordinate: 'W-337', score: 85, text: 'An iridescent membrane encoding a local specimen catalog.' },
  { label: 'Spectral Beacon', type: 'Signal', coordinate: 'Q-072', score: 82, text: 'A low-frequency, three-band navigation reference.' },
] as const

export function searchNodes(query: string) {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
  return nodes.filter((node) => {
    const index = `${node.label} ${node.type} ${node.coordinate} ${node.text}`.toLowerCase()
    return terms.every((term) => index.includes(term))
  })
}

export function clockText(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}
