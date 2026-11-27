import { useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { PHONE_HEIGHT, PHONE_WIDTH } from './IPhoneFrame'

export default function PhoneViewport({ children }: { children: ReactNode }) {
  const container = useRef<HTMLDivElement>(null)
  // Unmeasured until the first layout: the specimen mounts once, at the scale it will be shown at,
  // so its engine sizes its canvas for that scale and not for a full-size phone.
  const [width, setWidth] = useState<number | null>(null)

  useLayoutEffect(() => {
    const element = container.current!
    const update = () => setWidth(element.clientWidth)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const scale = (width ?? PHONE_WIDTH) / PHONE_WIDTH
  const style = { '--phone-scale': scale, height: PHONE_HEIGHT * scale } as CSSProperties
  return <div className="phone-viewport" ref={container} style={style}>
    {width !== null && <div className="phone-viewport__native">{children}</div>}
  </div>
}
