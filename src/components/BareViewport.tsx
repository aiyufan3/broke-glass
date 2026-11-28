import { useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode, Ref } from 'react'
import { SURFACE } from '../data/paradigms'
import type { ParadigmSpec } from '../data/paradigms'

/**
 * The smallest share of its size a specimen is drawn at on a phone: its own size. An OS is drawn 1:1
 * on its screen, and the paradigms' controls are drawn at the size they were designed to be touched
 * at; every one of them that works at its own size keeps working on a phone. A screen too short for
 * the surface scrolls; only a screen narrower than the surface draws it smaller.
 */
export const FLOOR = 1

/**
 * A phone shows the specimen itself: the surface at its own size, or larger to fill a larger screen,
 * set on the paradigm's own ground with no device drawn around it. `strip` is laid in the band the
 * paradigm keeps clear at its top, in the ink that paradigm's status bar would use. The ground runs
 * under the phone's own notch and home indicator; the surface and the strip stay clear of them.
 *
 * While the lab's layer covers the surface (a plate arriving, the core held bare) the ground and the
 * strip take the lab's own colours by the same amount, `--veil`, which the layer sets: nothing of the
 * paradigm shows around a specimen that is not yet, or no longer, on show.
 */
export default function BareViewport({ children, strip, ground, ink, label, veiled, stageRef }: {
  children: ReactNode
  strip: ReactNode
  /** The paradigm's own ground, laid around the surface. */
  ground: string
  ink: ParadigmSpec['statusBar']
  /** The specimen's name, for the region that a change of view moves focus to. */
  label: string
  /** Mounted under the layer's veil: a plate is on its way. */
  veiled: boolean
  stageRef: Ref<HTMLElement>
}) {
  const box = useRef<HTMLDivElement>(null)
  // Unmeasured until the first layout, so the specimen mounts once, at its real scale.
  const [scale, setScale] = useState<number | null>(null)

  useLayoutEffect(() => {
    // The box is one screen less the phone's insets, whatever the stage has grown to, so a surface held
    // at the floor never feeds back into the next measurement.
    const element = box.current!
    const fit = () => {
      const across = element.clientWidth / SURFACE.width
      const whole = Math.min(across, element.clientHeight / SURFACE.height)
      setScale(Math.min(across, Math.max(FLOOR, whole)))
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const style = {
    '--ground': ground,
    '--veil': veiled ? 1 : 0,
    '--surface-scale': scale ?? 1,
    '--surface-height': `${SURFACE.height * (scale ?? 0)}px`,
  } as CSSProperties
  // The strip comes first: it is first on screen, and the first thing reached from the region.
  return <section ref={stageRef} tabIndex={-1} className="bare-stage" style={style} data-ink={ink} aria-label={label}>
    <div ref={box} className="bare-fit">
      {scale !== null && strip}
      {scale !== null && <div className="bare-surface" data-specimen-screen>{children}</div>}
    </div>
  </section>
}
