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
 * The 12 floats of a "V" head whose apex is `anchor` and whose wings trail
 * back along `-tangent` (needs only normalizing, not a from/to pair) — the
 * shared core of both `computeArrowHead` (straight link) and
 * `computeArrowHeadAt` (link bowed by linkCurve.ts: the anchor then sits on
 * the curve, not on the chord). `refLen` sizes the head exactly as before
 * (proportional to the link's straight-line length, clamped), so a bowed
 * link's head is not larger just because the curve is longer than the chord.
 */
function buildHead(anchor: Vec3, tangent: Vec3, refLen: number): Float32Array | null {
  const tl = Math.hypot(tangent[0], tangent[1], tangent[2])
  if (!Number.isFinite(tl) || tl < 1e-6 || !Number.isFinite(refLen) || refLen < 1e-6) return null
  const ux = tangent[0] / tl, uy = tangent[1] / tl, uz = tangent[2] / tl
  // Any unit vector perpendicular to u: cross with the axis least aligned to it.
  const ax = Math.abs(ux) < 0.9 ? 1 : 0, ay = ax ? 0 : 1
  let px = uy * 0 - uz * ay, py = uz * ax - ux * 0, pz = ux * ay - uy * ax
  const pl = Math.hypot(px, py, pz)
  px /= pl; py /= pl; pz /= pl
  const size = arrowSize(refLen)
  const back = size * Math.cos(ARROW_HALF_ANGLE)
  const side = size * Math.sin(ARROW_HALF_ANGLE)
  const ox = anchor[0], oy = anchor[1], oz = anchor[2]
  const bx = ox - ux * back, by = oy - uy * back, bz = oz - uz * back
  return new Float32Array([
    ox, oy, oz, bx + px * side, by + py * side, bz + pz * side,
    ox, oy, oz, bx - px * side, by - py * side, bz - pz * side,
  ])
}

/**
 * The 12 floats of the head (apex→wingA, apex→wingB), or null if the link is
 * degenerate (zero length / non-finite) or not directional / over budget.
 * Straight-link form: the apex sits at ARROW_ANCHOR of the way from s to t.
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
  const anchor: Vec3 = [s[0] + dx * ARROW_ANCHOR, s[1] + dy * ARROW_ANCHOR, s[2] + dz * ARROW_ANCHOR]
  return buildHead(anchor, [dx, dy, dz], len)
}

/**
 * Curve-aware form: the apex is `anchor` (ARROW_ANCHOR along the link's
 * actual bowed path — see linkCurve.ts `pathPointAndTangent`), the wings
 * trail back along `-tangent` (the curve's tangent there, not the chord),
 * and the head is sized from `straightLen` (the chord length), exactly like
 * `computeArrowHead` — so a link's head keeps the same size whether or not
 * it is bowed, and only its position/orientation follow the curve.
 */
export function computeArrowHeadAt(
  anchor: Vec3,
  tangent: Vec3,
  straightLen: number,
  relationType: string,
  linkCount: number,
): Float32Array | null {
  if (!arrowsEnabled(linkCount) || !isDirectionalRelation(relationType)) return null
  return buildHead(anchor, tangent, straightLen)
}
