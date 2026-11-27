import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'

type Frame = {
  time: number
  delta: number
  still: boolean
  ratio: number
}

const MAX_RATIO = 2.5
const MAX_DELTA = 50
/** A resize is measured once it has stopped, after the viewport components have applied their new scale. */
const RESCALE_MS = 140

function backingRatio(host: Element) {
  const layoutWidth = host instanceof HTMLElement ? host.offsetWidth : 0
  const scale = layoutWidth ? host.getBoundingClientRect().width / layoutWidth : 1
  return Math.min(MAX_RATIO, Math.max(1, devicePixelRatio * scale))
}

/**
 * Drives one paradigm engine. `time` only advances while the loop runs, so engines resume
 * where they stopped. A `still` frame asks for the settled state: it is issued when the host
 * is static, off-screen, in a hidden tab or under prefers-reduced-motion.
 *
 * An engine that throws while stepping or painting is stopped and its error is thrown again from
 * this hook's next render, so the specimen's error boundary shows the fault instead of a frozen canvas.
 */
export function useFrameLoop(host: RefObject<Element | null>, animate: boolean, draw: (frame: Frame) => void) {
  const latest = useRef(draw)
  const settle = useRef<() => void>(() => {})
  const [fault, setFault] = useState<{ error: unknown } | null>(null)
  if (fault) throw fault.error
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
    let rescaling = 0

    // Returns false when the engine threw: the loop is over and the boundary takes it from here.
    const render = (delta: number, still: boolean) => {
      try {
        latest.current({ time, delta, still, ratio })
        return true
      } catch (error) {
        disposed = true
        cancelAnimationFrame(request)
        request = 0
        setFault({ error })
        return false
      }
    }
    const step = (now: number) => {
      const delta = previous ? Math.min(MAX_DELTA, now - previous) : 1000 / 60
      previous = now
      time += delta
      if (render(delta, false)) request = requestAnimationFrame(step)
    }
    const sync = () => {
      if (disposed) return
      cancelAnimationFrame(request)
      request = 0
      previous = 0
      if (animate && onScreen && !document.hidden && !motion.matches) request = requestAnimationFrame(step)
      else render(0, true)
    }
    const measure = () => {
      if (disposed) return
      const next = backingRatio(element)
      if (Math.abs(next - ratio) < .05) return
      ratio = next
      if (!request) render(0, true)
    }
    // The host is scaled by a transform its ancestors set after they have measured themselves, so
    // the ratio is read once the resize has gone quiet, not while the old scale is still applied.
    const rescale = () => {
      clearTimeout(rescaling)
      rescaling = window.setTimeout(measure, RESCALE_MS)
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
      clearTimeout(rescaling)
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
