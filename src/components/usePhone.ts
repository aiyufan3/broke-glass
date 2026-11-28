import { useSyncExternalStore } from 'react'

/** The shorter side of a phone's screen, in CSS px, at most. Phones stay under 450; the smallest tablets start at 600. */
export const PHONE_SIDE = 520
const TOUCH = '(pointer: coarse)'

/**
 * A phone: a touch screen whose shorter side is phone-sized. It is read from the screen, never from
 * the window, so turning the phone, raising its keyboard or zooming a desktop window does not change
 * what the device is. On a phone the specimen is shown as itself, because the screen already is a phone.
 */
function isPhone() {
  return matchMedia(TOUCH).matches && Math.min(screen.width, screen.height) <= PHONE_SIDE
}

function subscribe(change: () => void) {
  const touch = matchMedia(TOUCH)
  touch.addEventListener('change', change)
  // A foldable opened or closed puts the page on another screen.
  window.addEventListener('resize', change)
  return () => {
    touch.removeEventListener('change', change)
    window.removeEventListener('resize', change)
  }
}

export function usePhone() {
  return useSyncExternalStore(subscribe, isPhone, () => false)
}
