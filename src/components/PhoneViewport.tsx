import { useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { PHONE_HEIGHT, PHONE_WIDTH } from './IPhoneFrame'

export default function PhoneViewport({ children }: { children: ReactNode }) {
  const container = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(PHONE_WIDTH)

  useLayoutEffect(() => {
    const element = container.current!
    const update = () => setWidth(element.clientWidth)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const scale = width / PHONE_WIDTH
  const style = { '--phone-scale': scale, height: PHONE_HEIGHT * scale } as CSSProperties
  return <div className="phone-viewport" ref={container} style={style}>
    <div className="phone-viewport__native">{children}</div>
  </div>
}
