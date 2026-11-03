// ============================================================================
// linkArrows — pure geometry of the arrow head drawn on directional links
// ============================================================================
//
// The head lives in the SAME LineSegments as the links (no extra object): two
// short segments forming a "V" whose apex sits at ARROW_ANCHOR (75 %) of the
// way from source to target, the wings trailing back toward the source. It is
// computed in world coordinates from the two endpoint positions — no per-frame
// work beyond the existing updatePositions().
// ============================================================================

import { isDirectionalRelation } from './linkFamily'

/** Fraction of the path (source → target) where the V's apex sits. */
export const ARROW_ANCHOR = 0.75
/** Head length as a proportion of the link length… */
export const ARROW_SIZE_RATIO = 0.12
/** …bounded in world units: never vanishing on a short link… */
export const ARROW_MIN_SIZE = 1.5
/** …nor huge on a long one. */
export const ARROW_MAX_SIZE = 6
/** Half-opening of the V (radians, 25°). */
export const ARROW_HALF_ANGLE = Math.PI / 7.2
/**
 * Above this many links, no heads are drawn and the links stay bare strokes:
 * each head adds 4 vertices (2 segments), so at 2 000 links the cost is ≤ 8 000
 * extra vertices, and past it the heads are sub-pixel clutter anyway.
 */
export const ARROW_MAX_LINKS = 2000
/** Vertices added per arrow head (2 segments). */
export const ARROW_VERTICES = 4

export type Vec3 = readonly [number, number, number]

/** True when heads may be drawn for a graph of this many links. */
export function arrowsEnabled(linkCount: number): boolean {
  return linkCount <= ARROW_MAX_LINKS
}

/** Head length for a link of the given length: ratio, clamped to [MIN, MAX]. */
export function arrowSize(linkLength: number): number {
  return Math.min(ARROW_MAX_SIZE, Math.max(ARROW_MIN_SIZE, linkLength * ARROW_SIZE_RATIO))
}

/**
 * The 12 floats of the head (apex→wingA, apex→wingB), or null if the link is
 * degenerate (zero length / non-finite) or not directional / over budget.
 */
export function computeArrowHead(
  s: Vec3,
  t: Vec3,
  relationType: string,
  linkCount: number,
): Float32Array | null {
  if (!arrowsEnabled(linkCount) || !isDirectionalRelation(relationType)) return null
  const dx = t[0] - s[0], dy = t[1] - s[1], dz = t[2] - s[2]
  const len = Math.hypot(dx, dy, dz)
  if (!Number.isFinite(len) || len < 1e-6) return null
  const ux = dx / len, uy = dy / len, uz = dz / len
  // Any unit vector perpendicular to u: cross with the axis least aligned to it.
  const ax = Math.abs(ux) < 0.9 ? 1 : 0, ay = ax ? 0 : 1
  let px = uy * 0 - uz * ay, py = uz * ax - ux * 0, pz = ux * ay - uy * ax
  const pl = Math.hypot(px, py, pz)
  px /= pl; py /= pl; pz /= pl
  const size = arrowSize(len)
  const back = size * Math.cos(ARROW_HALF_ANGLE)
  const side = size * Math.sin(ARROW_HALF_ANGLE)
  const ox = s[0] + dx * ARROW_ANCHOR, oy = s[1] + dy * ARROW_ANCHOR, oz = s[2] + dz * ARROW_ANCHOR
  const bx = ox - ux * back, by = oy - uy * back, bz = oz - uz * back
  return new Float32Array([
    ox, oy, oz, bx + px * side, by + py * side, bz + pz * side,
    ox, oy, oz, bx - px * side, by - py * side, bz - pz * side,
  ])
}
