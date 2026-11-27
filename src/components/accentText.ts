import { legible } from '../data/contrast'

/** The lab's ground, `--lab-ink` in app.css. */
const LAB_INK = '#0B0B0C'

/**
 * A paradigm's accent as small text on the lab chrome. Rules, marks and fills keep the accent
 * itself; type gets it lightened only as far as it needs to be read (StrataOS and InfinityOS do).
 */
export const accentText = (accent: string) => legible(accent, LAB_INK)
