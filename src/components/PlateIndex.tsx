import type { CSSProperties } from 'react'
import type { ParadigmId } from '../data/paradigms'
import { themes } from '../themes'
import { accentText } from './accentText'
import { RASTER, platePath } from './plates'

const two = (value: number) => String(value).padStart(2, '0')
const CONTRIBUTE = 'https://github.com/aiyufan3/broke-glass#readme'

/**
 * The index. Every paradigm is shown as the lab measures it: its home screen in grey under a 12 px
 * blur, printed as a halftone. There are no names and no descriptions, only plate numbers. A
 * paradigm that cannot be told from its neighbour by its distribution of mass alone is a theme, and
 * this page is where that rule is put to the visitor.
 */
export default function PlateIndex({ onOpen, register }: {
  onOpen: (id: ParadigmId) => void
  register: (id: ParadigmId, element: HTMLButtonElement | null) => void
}) {
  return <div className="plates-grid" style={{ '--plate-count': themes.length + 1 } as CSSProperties}>
    {/* A plate's name starts with the number it shows, so the label spoken to it is the label seen on it. */}
    {themes.map(({ id, name, accent }, index) => <button key={id} ref={(element) => register(id, element)} className="plate" type="button"
      data-plate={id} aria-keyshortcuts={String(index + 1)} onClick={() => onOpen(id)}
      style={{ '--accent': accent, '--accent-text': accentText(accent) } as CSSProperties}>
      <span className="plate-number">PL. {two(index + 1)}</span><span className="sr-only"> {name}, open in focus mode</span>
      <svg className="plate-raster" viewBox={`0 0 ${RASTER.columns} ${RASTER.rows}`} preserveAspectRatio="none" aria-hidden="true">
        <path d={platePath(id)} fill="currentColor" />
      </svg>
    </button>)}
    <a className="plate plate--open" href={CONTRIBUTE}>
      <span className="plate-number">PL. {two(themes.length + 1)}</span>
      <span className="plate-raster plate-void"><b>Open</b><span className="sr-only">: read how to contribute a paradigm</span></span>
    </a>
  </div>
}
