import { useSyncExternalStore } from 'react'
import { sessionTime } from '../data/osData'

function every(period: number) {
  return (notify: () => void) => {
    let timer = 0
    const schedule = () => {
      timer = window.setTimeout(() => { notify(); schedule() }, period - Date.now() % period)
    }
    schedule()
    document.addEventListener('visibilitychange', notify)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', notify)
    }
  }
}

const precisions = {
  minute: { subscribe: every(60000), read: () => sessionTime().slice(0, 5) },
  second: { subscribe: every(1000), read: () => sessionTime() },
}
const never = () => () => {}

/** The one wall clock behind the hardware status bar, the boot log and every instrument readout. */
export function useWallClock(precision: keyof typeof precisions, live = true) {
  const { subscribe, read } = precisions[precision]
  return useSyncExternalStore(live ? subscribe : never, read, read)
}
