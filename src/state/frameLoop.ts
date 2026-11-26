import { useCallback, useEffect, useRef } from 'react'
import type { RefObject } from 'react'

type Frame = {
  time: number
  delta: number
  still: boolean
  ratio: number
}

const MAX_RATIO = 2.5
const MAX_DELTA = 50

function backingRatio(host: Element) {
  const layoutWidth = host instanceof HTMLElement ? host.offsetWidth : 0
  const scale = layoutWidth ? host.getBoundingClientRect().width / layoutWidth : 1
  return Math.min(MAX_RATIO, Math.max(1, devicePixelRatio * scale))
}

/**
 * Drives one paradigm engine. `time` only advances while the loop runs, so engines resume
 * where they stopped. A `still` frame asks for the settled state: it is issued when the host
 * is static, off-screen, in a hidden tab or under prefers-reduced-motion.
 */
export function useFrameLoop(host: RefObject<Element | null>, animate: boolean, draw: (frame: Frame) => void) {
  const latest = useRef(draw)
  const settle = useRef<() => void>(() => {})
  useEffect(() => { latest.current = draw })

  useEffect(() => {
    const element = host.current
    if (!element) return
    const motion = matchMedia('(prefers-reduced-motion: reduce)')
    let ratio = backingRatio(element)
    let request = 0
    let previous = 0
    let time = 0
    let onScreen = true
    let disposed = false

    const render = (delta: number, still: boolean) => latest.current({ time, delta, still, ratio })
    const step = (now: number) => {
      const delta = previous ? Math.min(MAX_DELTA, now - previous) : 1000 / 60
      previous = now
      time += delta
      render(delta, false)
      request = requestAnimationFrame(step)
    }
    const sync = () => {
      cancelAnimationFrame(request)
      request = 0
      previous = 0
      if (animate && onScreen && !document.hidden && !motion.matches) request = requestAnimationFrame(step)
      else render(0, true)
    }
    const rescale = () => {
      const next = backingRatio(element)
      if (Math.abs(next - ratio) < .05) return
      ratio = next
      if (!request) render(0, true)
    }
    settle.current = () => { if (!request && !disposed) render(0, true) }

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting === onScreen) return
      onScreen = entry.isIntersecting
      sync()
    })
    observer.observe(element)
    window.addEventListener('resize', rescale)
    document.addEventListener('visibilitychange', sync)
    motion.addEventListener('change', sync)
    void document.fonts.ready.then(() => settle.current())
    sync()

    return () => {
      disposed = true
      cancelAnimationFrame(request)
      observer.disconnect()
      window.removeEventListener('resize', rescale)
      document.removeEventListener('visibilitychange', sync)
      motion.removeEventListener('change', sync)
    }
  }, [host, animate])

  return useCallback(() => settle.current(), [])
}

export function surface(canvas: HTMLCanvasElement | null, width: number, height: number, ratio: number) {
  if (!canvas) return null
  const pixelWidth = Math.round(width * ratio)
  const pixelHeight = Math.round(height * ratio)
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth
    canvas.height = pixelHeight
  }
  const context = canvas.getContext('2d')
  context?.setTransform(ratio, 0, 0, ratio, 0, 0)
  return context
}
