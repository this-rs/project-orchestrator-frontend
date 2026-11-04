/**
 * How the sampling ceiling follows the camera distance.
 *
 * The graph used to sample at one ceiling whatever the distance: the frame budget
 * (frameQuality.ts) could only LOWER it, so a close-up stayed as blurry as the
 * overview — measured complaint of 03/11/2026, « quand je sélectionne quelque
 * chose ça zoom mais tout reste flou ». Closer than the framing distance, fewer
 * nodes fill the viewport at full size, so the GPU can afford more pixels.
 *
 * The ceiling never replaces the frame budget: it only sets the height to which
 * the budget may climb back. A drop caused by slow frames still wins.
 */

/** Closest zoom may raise the ceiling to this multiple of the base one. */
export const ZOOM_RATIO_BOOST_MAX = 1.5
/** At (or closer than) this fraction of the framing distance, the boost is full. */
export const ZOOM_NEAR_THRESHOLD = 0.5
/**
 * At (or further than) this multiple of the framing distance, there is no boost.
 * 1, not 2: the default view IS the framing distance, and it must keep the
 * base ceiling (1.5 on a retina panel, MAX_PIXEL_RATIO) — only a real close-up
 * buys the extra pixels.
 */
export const ZOOM_FAR_THRESHOLD = 1.0
/**
 * The ceiling moves in steps of this size, never continuously. Each new ratio
 * is a `renderer.setPixelRatio`, i.e. a reallocation of the drawing buffer: a
 * smooth zoom fires one controls `change` per frame, and a continuous ceiling
 * would resize the canvas on every one of them.
 */
export const ZOOM_RATIO_QUANTUM = 0.25

/**
 * The ceiling to hand to the frame budget, for a camera at `distance` from its
 * target.
 *
 * - `framingDistance`: the distance at which the cloud fills the viewport;
 * - `baseCeiling`: the device/budget ceiling (`pixelRatioCeiling()`);
 * - `deviceRatio`: the screen's own ratio, a hard ceiling — sampling above it
 *   costs GPU time and buys nothing.
 *
 * A missing or nonsensical distance returns `baseCeiling` unchanged: a camera
 * that has not framed anything yet must not sharpen anything.
 *
 * The boosted value is floored to `ZOOM_RATIO_QUANTUM` (never below the base),
 * so a zoom crosses a handful of discrete ceilings instead of a continuum.
 */
export function zoomAdaptivePixelRatioCeiling(
  distance: number,
  framingDistance: number,
  baseCeiling: number,
  deviceRatio: number,
): number {
  if (!Number.isFinite(framingDistance) || framingDistance <= 0) return baseCeiling
  if (!Number.isFinite(distance) || distance <= 0) return baseCeiling
  if (!Number.isFinite(baseCeiling) || baseCeiling <= 0) return baseCeiling

  const ratio = distance / framingDistance
  const t = Math.min(
    1,
    Math.max(0, (ZOOM_FAR_THRESHOLD - ratio) / (ZOOM_FAR_THRESHOLD - ZOOM_NEAR_THRESHOLD)),
  )
  const boost = 1 + (ZOOM_RATIO_BOOST_MAX - 1) * t
  const stepped = Math.floor((baseCeiling * boost + 1e-9) / ZOOM_RATIO_QUANTUM) * ZOOM_RATIO_QUANTUM
  return Math.min(Math.max(baseCeiling, stepped), deviceRatio)
}
