// ============================================================================
// linkCurve — pure geometry for "organic" link curvature
// ============================================================================
//
// Client request (verbatim): "j'aimerais vraiment que les liens tissés entre
// les éléments soient plus organiques, qu'ils représentent aussi la
// volumétrie de lien par des espaces d'évolution cohérente, comme les
// évolutions Pokémon : ça change, mais ça reste cohérent et identifiable."
//
// Reading: a link's bow grows continuously with its volume (importance) —
// like a Pokémon evolution line, the shape changes but the *nature* of the
// thing never breaks: it is always recognizably "a link between two nodes".
// A weak link is almost a straight segment (2 % of its length bowed out); a
// strong one bows into a visible arc (up to 15 %). There is no palier/step —
// curvature(volume) is smooth and strictly increasing on volume ∈ [0,1].
//
// Every function here is pure (no THREE, no randomness, no module state) so
// it is unit-testable without a GPU. linkSegments.ts is the only caller that
// touches BufferGeometry.
// ============================================================================

import type { Graph3DLink } from './useGraph3DLayout'

export type Vec3 = readonly [number, number, number]

// ---------------------------------------------------------------------------
// courbure(volume) — amplitude of the bow, as a fraction of the link length
// ---------------------------------------------------------------------------

/** Amplitude for a zero-volume link: 2 % of its length — almost straight. */
export const CURVATURE_BASE = 0.02
/** Quadratic growth coefficient against volume. */
export const CURVATURE_GROWTH = 0.13
/** Hard ceiling: 15 % of the link's length, reached at volume = 1. */
export const CURVATURE_MAX = 0.15

/**
 * Curvature amplitude (fraction of the link's length) for a link whose
 * normalized volume is `volume` (clamped to [0,1] — out-of-range input never
 * produces an out-of-range curve).
 *
 *   courbure(v) = min(CURVATURE_MAX, CURVATURE_BASE + CURVATURE_GROWTH · v²)
 *
 * Strictly increasing and continuous on [0,1]: courbure(0) = 0.02 (2 %),
 * courbure(1) = 0.15 (15 %). No palier — every volume gets its own bow.
 */
export function curvature(volume: number): number {
  const v = Math.min(1, Math.max(0, volume))
  return Math.min(CURVATURE_MAX, CURVATURE_BASE + CURVATURE_GROWTH * v * v)
}

// ---------------------------------------------------------------------------
// Normalized "volume" of a link, from the width the renderer already carries
// ---------------------------------------------------------------------------

/**
 * Width value that maps to volume = 1. Matches the existing saturation cap
 * applied to bundle widths elsewhere (graphAggregation.ts: `Math.min(4, …)`),
 * so an AGGREGATE link already at the width ceiling reads as a "strong" link
 * here too, and an ordinary typed link (LINK_WIDTHS: 0.3–1.0) reads as weak
 * to medium.
 */
export const LINK_VOLUME_WIDTH_MAX = 4

/** Normalize a link's `width` into a volume in [0,1] for `curvature()`. */
export function linkVolume(link: Pick<Graph3DLink, 'width'>): number {
  const w = link.width
  if (typeof w !== 'number' || !Number.isFinite(w)) return 0
  return Math.min(1, Math.max(0, w / LINK_VOLUME_WIDTH_MAX))
}

// ---------------------------------------------------------------------------
// Deterministic side — same link, same bow, every render
// ---------------------------------------------------------------------------

/** 32-bit FNV-1a string hash — deterministic, no Math.random anywhere here. */
function hashString(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/**
 * Which side of the straight segment a link bows to, derived purely from its
 * endpoint ids (order-independent: a→b and b→a bow the same way, since they
 * are the same visual edge). Never derived from node position or randomness,
 * so two successive renders — even after the nodes moved — bow identically.
 */
export function curveSide(sourceId: string, targetId: string): 1 | -1 {
  const [a, b] = sourceId <= targetId ? [sourceId, targetId] : [targetId, sourceId]
  const h = hashString(`${a}\u0000${b}`)
  return (h & 1) === 0 ? 1 : -1
}

// ---------------------------------------------------------------------------
// Vector helpers (tiny — not worth pulling THREE.Vector3 into a pure module)
// ---------------------------------------------------------------------------

function vSub(a: Vec3, b: Vec3): Vec3 { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]] }
function vAdd(a: Vec3, b: Vec3): Vec3 { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]] }
function vScale(a: Vec3, k: number): Vec3 { return [a[0] * k, a[1] * k, a[2] * k] }
function vLen(a: Vec3): number { return Math.hypot(a[0], a[1], a[2]) }

/**
 * A unit vector perpendicular to unit vector `dir`, picked deterministically
 * (cross product against whichever world axis is least aligned with `dir`) —
 * the same technique already used for the arrow head (linkArrows.ts), so a
 * link's bow and its arrow head agree on "sideways".
 */
export function perpendicular(dir: Vec3): Vec3 {
  const ax = Math.abs(dir[0]) < 0.9 ? 1 : 0
  const ay = ax ? 0 : 1
  const px = dir[1] * 0 - dir[2] * ay
  const py = dir[2] * ax - dir[0] * 0
  const pz = dir[0] * ay - dir[1] * ax
  const pl = Math.hypot(px, py, pz) || 1
  return [px / pl, py / pl, pz / pl]
}

// ---------------------------------------------------------------------------
// The curve itself — a single quadratic Bézier per link
// ---------------------------------------------------------------------------

/**
 * Control point of the quadratic Bézier representing the link s → t at the
 * given `volume`: the segment's midpoint, pushed `courbure(volume) · length`
 * sideways along a deterministic perpendicular, signed by `curveSide`.
 *
 * At s === t (degenerate link) returns `s` — no direction to bow along.
 */
export function curveControlPoint(
  s: Vec3, t: Vec3, volume: number, sourceId: string, targetId: string,
): Vec3 {
  const d = vSub(t, s)
  const len = vLen(d)
  if (!Number.isFinite(len) || len < 1e-6) return s
  const dir: Vec3 = [d[0] / len, d[1] / len, d[2] / len]
  const perp = perpendicular(dir)
  const offset = curvature(volume) * len * curveSide(sourceId, targetId)
  const mid = vScale(vAdd(s, t), 0.5)
  return vAdd(mid, vScale(perp, offset))
}

/** Point at parameter t∈[0,1] on the quadratic Bézier (s, control, t). */
export function bezierPoint(s: Vec3, control: Vec3, t3: Vec3, t: number): Vec3 {
  const u = 1 - t
  const a = u * u, b = 2 * u * t, c = t * t
  return [
    a * s[0] + b * control[0] + c * t3[0],
    a * s[1] + b * control[1] + c * t3[1],
    a * s[2] + b * control[2] + c * t3[2],
  ]
}

/** Tangent (unnormalized, non-zero for a non-degenerate curve) at t∈[0,1]. */
export function bezierTangent(s: Vec3, control: Vec3, t3: Vec3, t: number): Vec3 {
  const u = 1 - t
  return [
    2 * u * (control[0] - s[0]) + 2 * t * (t3[0] - control[0]),
    2 * u * (control[1] - s[1]) + 2 * t * (t3[1] - control[1]),
    2 * u * (control[2] - s[2]) + 2 * t * (t3[2] - control[2]),
  ]
}

// ---------------------------------------------------------------------------
// Cost bound — below this many links the geometry may bow; above it, every
// link is drawn as a plain straight segment (2 points), exactly as before.
// ---------------------------------------------------------------------------

/**
 * Number of points sampled along a bowed link (CURVE_SUBDIVISIONS − 1 line
 * segments). Named so the vertex-budget math in linkSegments.ts reads
 * directly from it instead of a bare literal.
 */
export const CURVE_SUBDIVISIONS = 8

/**
 * Above this many links in the graph, curvature is not worth its geometry:
 * CURVE_SUBDIVISIONS points × 2 (LineSegments needs disjoint pairs) × N
 * links would be 16×N vertices instead of 2×N — an 8× blow-up — for a bow
 * that is sub-pixel on a dense graph anyway. Past the threshold every link
 * falls back to a plain straight segment, same as before this feature.
 */
export const CURVE_MAX_LINKS = 1500

/** True when links of a graph with this many links may be curved. */
export function curveEnabled(linkCount: number): boolean {
  return linkCount <= CURVE_MAX_LINKS
}

/**
 * Sample `n` points along the link s → t (n ≥ 2, both endpoints included):
 * the bowed Bézier when `curved`, or the plain straight segment (every
 * interior point linearly interpolated) when not — so callers get the same
 * shaped array either way, never a different "nature" of result.
 */
export function sampleLinkPath(
  s: Vec3, t: Vec3, volume: number, sourceId: string, targetId: string, n: number, curved: boolean,
): Vec3[] {
  const pts: Vec3[] = []
  if (curved) {
    const control = curveControlPoint(s, t, volume, sourceId, targetId)
    for (let i = 0; i < n; i++) pts.push(bezierPoint(s, control, t, i / (n - 1)))
  } else {
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1)
      pts.push([s[0] + (t[0] - s[0]) * u, s[1] + (t[1] - s[1]) * u, s[2] + (t[2] - s[2]) * u])
    }
  }
  return pts
}

/**
 * Point and tangent at parameter `t` (e.g. ARROW_ANCHOR) along the link's
 * path — bowed or straight, matching `sampleLinkPath`'s choice — so an
 * arrow head always sits exactly on the line that is actually drawn.
 */
export function pathPointAndTangent(
  s: Vec3, t: Vec3, volume: number, sourceId: string, targetId: string, at: number, curved: boolean,
): { point: Vec3; tangent: Vec3 } {
  if (curved) {
    const control = curveControlPoint(s, t, volume, sourceId, targetId)
    return { point: bezierPoint(s, control, t, at), tangent: bezierTangent(s, control, t, at) }
  }
  const d = vSub(t, s)
  return { point: [s[0] + d[0] * at, s[1] + d[1] * at, s[2] + d[2] * at], tangent: d }
}
