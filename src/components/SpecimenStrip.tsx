import type { ParadigmId } from '../data/paradigms'
import { themes } from '../themes'

const two = (value: number) => String(value).padStart(2, '0')

/**
 * The lab's strip on a phone. It lies in the band at the top of the surface that every paradigm keeps
 * clear for a status bar, in that paradigm's status ink: the lab speaks where a fake clock and battery
 * used to be drawn. Back to the index, the plates either side, and the Design DNA printed below.
 */
export default function SpecimenStrip({ id, onIndex, onSwitch, onDna }: {
  id: ParadigmId
  onIndex: () => void
  onSwitch: (id: ParadigmId) => void
  onDna: () => void
}) {
  const index = themes.findIndex((theme) => theme.id === id)
  const previous = (index - 1 + themes.length) % themes.length
  const next = (index + 1) % themes.length
  return <nav className="specimen-strip" aria-label="Specimen controls">
    <button type="button" onClick={onIndex}><span aria-hidden="true">←</span>Index</button>
    <span className="specimen-strip__step">
      <button type="button" aria-label={`Previous plate, ${two(previous + 1)} ${themes[previous].name}`} onClick={() => onSwitch(themes[previous].id)}>‹</button>
      {/* Read out whenever the plate changes, from the strip or from anywhere else. */}
      <span aria-live="polite">PL. {two(index + 1)} / {two(themes.length)}<span className="sr-only"> {themes[index].name}</span></span>
      <button type="button" aria-label={`Next plate, ${two(next + 1)} ${themes[next].name}`} onClick={() => onSwitch(themes[next].id)}>›</button>
    </span>
    <button type="button" onClick={onDna}>DNA<span aria-hidden="true">↓</span></button>
  </nav>
}
