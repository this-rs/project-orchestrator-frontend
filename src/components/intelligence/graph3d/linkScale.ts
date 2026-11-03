// ============================================================================
// linkScale — the three connection scales of a link, and the style of each
// ============================================================================
//
// Client request (verbatim): "les liens, c'est juste un fil, on n'exploite pas
// du tout la puissance du display, les échelles de connexion entre ensembles."
// A link is not one uniform thread: it sits at one of THREE scales of
// connection, and each scale must read differently at a glance.
//
//   intra     source and target in the SAME community — the internal tissue of
//             a cluster. It must NOT lead: very discreet stroke, minimal bow.
//   neighbor  different communities, SAME layer — the organic weave inside one
//             continent. This is the current behaviour: organic curve, a
//             moderate presence.
//   inter     different layers — the link crosses a whole continent. The most
//             visible: maximal bow, strongest stroke, readable from far away.
//
// The classification is a pure function of the two endpoints (layer +
// community id). Nothing here touches three.js, the GPU, or randomness, so it
// is unit-testable without a WebGL context.
// ============================================================================

/** The three scales of connection a link can sit at. */
export type LinkScale = 'intra' | 'neighbor' | 'inter'

/** What the classifier needs to know about one end of a link. */
export interface LinkEndpoint {
  /** Knowledge-graph layer (code, knowledge, neural, pm, …). */
  layer: string
  /** Louvain community id. Absent when the node carries no community. */
  communityId?: number
}

/**
 * Classify a link by the relationship of its two endpoints.
 *
 *   • `inter`    — the layers differ (the link crosses a continent);
 *   • `intra`    — same layer, same community (the internal tissue);
 *   • `neighbor` — same layer, different communities (or a community is
 *                  missing — see the documented edge case below).
 *
 * Edge case (documented): a node with no `communityId` cannot be asserted to
 * share a community with anyone, so the link degrades to `neighbor`, never
 * `intra`. The layer comparison stays exact — only the community comparison
 * has a fallback.
 */
export function classifyLinkScale(source: LinkEndpoint, target: LinkEndpoint): LinkScale {
  if (source.layer !== target.layer) return 'inter'
  const s = source.communityId
  const t = target.communityId
  if (s == null || t == null) return 'neighbor'
  return s === t ? 'intra' : 'neighbor'
}

// ---------------------------------------------------------------------------
// Opacity — one alpha per scale, in ONE named, documented table
// ---------------------------------------------------------------------------

/**
 * Per-scale stroke opacity. Strictly increasing intra < neighbor < inter: the
 * internal tissue recedes hardest, the inter-continent bridge leads. These
 * values REPLACE the per-family attenuation for the scale — the relation
 * family keeps choosing the direction (arrow heads, linkArrows.ts) and the
 * tint on the small-graph path (linkFamily.ts is untouched).
 */
export const LINK_SCALE_ALPHA: Record<LinkScale, number> = {
  intra: 0.05,    // internal tissue — must not lead
  neighbor: 0.12, // the organic weave — the current behaviour
  inter: 0.28,    // the continent bridge — reads from far away
}

/** Reading order of the scales, from quietest to loudest. */
export const LINK_SCALE_ORDER: readonly LinkScale[] = ['intra', 'neighbor', 'inter']

/** Stroke opacity of a scale. */
export function linkScaleAlpha(scale: LinkScale): number {
  return LINK_SCALE_ALPHA[scale]
}

// ---------------------------------------------------------------------------
// Curvature — one amplitude curve per scale
// ---------------------------------------------------------------------------

/** The three constants of the quadratic amplitude `base + growth·v²`. */
export interface CurvatureParams {
  /** Amplitude at volume 0 (fraction of the link's length). */
  base: number
  /** Quadratic growth coefficient against volume. */
  growth: number
  /** Hard ceiling (fraction of the link's length), reached at volume = 1. */
  max: number
}

/**
 * Curvature amplitude per scale. `neighbor` is the existing organic curve
 * (linkCurve.ts `curvature()`: 0.02 + 0.13·v², capped at 0.15); `intra` bows
 * minimally and `inter` bows the most, so the continent bridges are the most
 * visibly "alive" links.
 */
export const LINK_SCALE_CURVATURE: Record<LinkScale, CurvatureParams> = {
  intra: { base: 0.004, growth: 0.016, max: 0.02 },
  neighbor: { base: 0.02, growth: 0.13, max: 0.15 },
  inter: { base: 0.06, growth: 0.19, max: 0.3 },
}

/**
 * Curvature amplitude for a link of the given scale and normalized volume
 * (clamped to [0,1]). Same quadratic shape as `linkCurve.curvature()`, but the
 * three constants come from the scale's row in LINK_SCALE_CURVATURE.
 */
export function linkScaleCurvature(scale: LinkScale, volume: number): number {
  const v = Math.min(1, Math.max(0, volume))
  const p = LINK_SCALE_CURVATURE[scale]
  return Math.min(p.max, p.base + p.growth * v * v)
}

// ---------------------------------------------------------------------------
// Colour interpolation — the per-vertex gradient
// ---------------------------------------------------------------------------

/** A normalized RGB colour (0..1 per channel). */
export interface Rgb {
  r: number
  g: number
  b: number
}

/**
 * Linear interpolation between two colours: `a` at t = 0, `b` at t = 1.
 * Written as `a·(1−t) + b·t` so the endpoints are EXACT (a at 0, b at 1), not
 * subject to one-ulp rounding of `a + (b−a)·t`. Out-of-range t is allowed; the
 * caller passes a curve parameter already in [0,1].
 */
export function interpolateRgb(a: Rgb, b: Rgb, t: number): Rgb {
  const u = 1 - t
  return {
    r: a.r * u + b.r * t,
    g: a.g * u + b.g * t,
    b: a.b * u + b.b * t,
  }
}
