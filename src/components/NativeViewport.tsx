import { useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'

const SURFACE_WIDTH = 377
const SURFACE_HEIGHT = 836

export default function NativeViewport({ children, background }: { children: ReactNode; background: string }) {
  const viewport = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  useLayoutEffect(() => {
    const element = viewport.current!
    const fit = () => setScale(Math.min(element.clientWidth / SURFACE_WIDTH, element.clientHeight / SURFACE_HEIGHT))
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return <div className="native-viewport" ref={viewport} style={{ background, '--native-scale': scale } as CSSProperties}>
    <div className="native-surface">{children}</div>
  </div>
}
