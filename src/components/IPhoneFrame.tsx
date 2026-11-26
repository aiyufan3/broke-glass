import { BatteryFull, Wifi } from 'lucide-react'
import type { ReactNode } from 'react'
import type { ParadigmSpec } from '../data/paradigms'
import { useWallClock } from '../state/wallClock'

export const PHONE_WIDTH = 393
export const PHONE_HEIGHT = 852

export default function IPhoneFrame({ children, statusBar }: { children: ReactNode; statusBar: ParadigmSpec['statusBar'] }) {
  const time = useWallClock('minute')
  return (
    <div className="iphone">
      <span className="hardware-button hardware-button--action" aria-hidden="true" />
      <span className="hardware-button hardware-button--volume" aria-hidden="true" />
      <span className="hardware-button hardware-button--power" aria-hidden="true" />
      <div className="iphone-screen" data-status={statusBar}>
        <div className="status-bar" aria-label={`${time}, connected, full battery`}>
          <time dateTime={time}>{time}</time>
          <div className="dynamic-island" aria-hidden="true"><span /></div>
          <div className="status-icons" aria-hidden="true">
            <svg width="18" height="14" viewBox="0 0 18 14" fill="currentColor">
              <rect x="0" y="9" width="3" height="5" rx=".75" />
              <rect x="5" y="6" width="3" height="8" rx=".75" />
              <rect x="10" y="3" width="3" height="11" rx=".75" />
              <rect x="15" width="3" height="14" rx=".75" />
            </svg>
            <Wifi size={17} strokeWidth={2.7} />
            <BatteryFull size={23} strokeWidth={2.1} />
          </div>
        </div>
        {children}
        <div className="home-indicator" aria-hidden="true" />
      </div>
    </div>
  )
}
