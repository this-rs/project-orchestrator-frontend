/**
 * The surface of a panel that sits OVER the scrolling conversation (the composer dock: provider
 * errors, banners, the vault card, the composer's own notices).
 *
 * A tint alone (`bg-amber-500/10`) lets the message text behind it show straight through. So each
 * variant is a readable base surface (`bg-surface-base/80`) with the tint laid over it, plus a
 * blur: whatever scrolls under the panel is soft, never legible. Colour only — border, padding and
 * text stay with the panel, so adopting this changes no size or position.
 *
 * The tint is a gradient with identical stops because two `bg-*` colours cannot stack in one
 * element, while a background image paints over the background colour.
 */
const BLUR = 'backdrop-blur-md backdrop-saturate-150'
const BASE = 'bg-surface-base/80'

export const panelGlass = {
  /** Warnings and requests for attention (amber). */
  warning: `${BASE} bg-linear-to-b from-amber-500/10 to-amber-500/10 ${BLUR}`,
  /** Errors (red). */
  error: `${BASE} bg-linear-to-b from-red-500/10 to-red-500/10 ${BLUR}`,
  /** Neutral status lines (no tint). */
  neutral: `${BASE} ${BLUR}`,
} as const
