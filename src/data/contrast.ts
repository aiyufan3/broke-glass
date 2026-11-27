/** WCAG 2 contrast between six-digit hex colours, and the two decisions the lab makes with it. */

const channels = (hex: string) => [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16))
const hex = (rgb: number[]) => `#${rgb.map((value) => Math.round(value).toString(16).padStart(2, '0')).join('')}`.toUpperCase()

/** Relative luminance, 0 for black to 1 for white. */
export function luminance(colour: string) {
  const [r, g, b] = channels(colour).map((value) => {
    const unit = value / 255
    return unit <= .03928 ? unit / 12.92 : ((unit + .055) / 1.055) ** 2.4
  })
  return .2126 * r + .7152 * g + .0722 * b
}

/** Contrast ratio, 1 to 21. Text below 4.5 against its ground is not readable at small sizes. */
export function contrast(a: string, b: string) {
  const [dark, light] = [luminance(a), luminance(b)].sort((x, y) => x - y)
  return (light + .05) / (dark + .05)
}

/** Of the candidate inks, the one that reads best on the ground. */
export function inkOn(ground: string, inks: readonly string[] = ['#FFFFFF', '#0B0B0B']) {
  return inks.reduce((best, ink) => contrast(ink, ground) > contrast(best, ground) ? ink : best)
}

/**
 * The colour to set text in when it should carry `colour` on `ground`: the colour itself when it
 * already reads, otherwise the colour moved toward white just far enough to reach the minimum.
 */
export function legible(colour: string, ground: string, minimum = 4.5) {
  const from = channels(colour)
  for (let step = 0; step <= 100; step++) {
    const mixed = hex(from.map((value) => value + (255 - value) * step / 100))
    if (contrast(mixed, ground) >= minimum) return mixed
  }
  return '#FFFFFF'
}
