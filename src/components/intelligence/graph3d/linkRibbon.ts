// ============================================================================
// linkRibbon — pure planning + geometry for RIBBON links (thick quad bands)
// ============================================================================
//
// The client asked for links that are not "de simples traits de lumière" but
// *designed*, with different representations per density, "organique comme un
// tissu cérébral". A 1 px WebGL line cannot be thickened — `lineWidth` is
// ignored on every mainstream GPU — so a link can never be more than a hair
// no matter its colour or curve. This module plans REAL geometry instead: flat
// ribbon bands (triangle strips) sampled along the same Bézier curve that
// linkSegments already builds (linkCurve.ts).
//
// The width of a ribbon is `ribbonWidth(volume)`, a named, bounded function of
// the link's normalized volume; the RIBBON carries the source→target colour
// gradient per vertex so a link reads "who talks to whom" by shape AND colour.
//
// Three density regimes, chosen by the NUMBER of links on screen (thresholds
// named below), tune width / alpha / curvature and switch representation:
//
//   detail  (≤ RIBBON_DETAIL_MAX_LINKS)      one ribbon per link, organic
//                                            curve, full gradient;
//   bundle  (≤ RIBBON_BUNDLE_MAX_LINKS)      wider, dimmer, attenuated curve,
//                                            grouped per community pair (same
//                                            bow radius → visual bundles);
//   sheet   (> RIBBON_BUNDLE_MAX_LINKS)      ONE wide ribbon per community
//                                            pair, width ∝ summarized links.
//
// Everything here is pure (no THREE, no randomness, no module state) so the
// regimes, the width curve and the aggregation are unit-testable without a GPU.
// ============================================================================

import type { Graph3DLink } from './useGraph3DLayout'

/**
 * A per-link style: normalized RGB (source endpoint) plus optional target
 * endpoint colour and an alpha. `r2/g2/b2` being absent means a uniform colour
 * along the ribbon (the highlight overlay path). Shared verbatim with the
 * LineSegments fallback so both renderers speak the same vocabulary.
 */
export interface LinkStyle {
  r: number
  g: number
  b: number
  r2?: number
  g2?: number
  b2?: number
  a: number
}

/** A style provider evaluated for every link whenever highlight state changes. */
export type LinkStyleFn = (link: Graph3DLink) => LinkStyle

// ---------------------------------------------------------------------------
// Density regimes — three named thresholds, chosen by the NUMBER of links
// ---------------------------------------------------------------------------

export type RibbonRegime = 'detail' | 'bundle' | 'sheet'

/** Above this many links the "detail" regime (one ribbon per link) gives way. */
export const RIBBON_DETAIL_MAX_LINKS = 800
/** Above this many links the "bundle" regime gives way to one sheet per pair. */
export const RIBBON_BUNDLE_MAX_LINKS = 3000

/**
 * The regime for a graph with `linkCount` links.
 *
 *   detail  linkCount ≤ 800
 *   bundle  800 < linkCount ≤ 3000
 *   sheet   3000 < linkCount
 *
 * The boundaries are inclusive on the LOW side: 800 is still detail (the
 * "≤ 800" of the brief), 3000 is still bundle (the "> 3 000" of the brief).
 */
export function selectRibbonRegime(linkCount: number): RibbonRegime {
  if (linkCount <= RIBBON_DETAIL_MAX_LINKS) return 'detail'
  if (linkCount <= RIBBON_BUNDLE_MAX_LINKS) return 'bundle'
  return 'sheet'
}

// ---------------------------------------------------------------------------
// Ribbon width — a named, bounded function of the link's normalized volume
// ---------------------------------------------------------------------------

/** Width of a zero-volume link, in world units. */
export const RIBBON_WIDTH_MIN = 0.6
/** Width of a full-volume link, in world units. */
export const RIBBON_WIDTH_MAX = 3.0

/**
 * Width of a ribbon whose normalized volume is `volume` (clamped to [0,1] —
 * out-of-range input never produces an out-of-range width).
 *
 *   ribbonWidth(v) = RIBBON_WIDTH_MIN + (RIBBON_WIDTH_MAX − RIBBON_WIDTH_MIN)·v
 *
 * Strictly increasing on [0,1]: 0.6 at v = 0, 1.8 at v = 0.5, 3.0 at v = 1.
 */
export function ribbonWidth(volume: number): number {
  const v = Math.min(1, Math.max(0, volume))
  return RIBBON_WIDTH_MIN + (RIBBON_WIDTH_MAX - RIBBON_WIDTH_MIN) * v
}

// ---------------------------------------------------------------------------
// Regime tuning — width / alpha / curvature multipliers per regime
// ---------------------------------------------------------------------------

export interface RibbonRegimeParams {
  /** Multiplier on `ribbonWidth` (bundle ribbons are wider). */
  widthScale: number
  /** Multiplier on the style's alpha (bundle ribbons are dimmer). */
  alphaScale: number
  /** Multiplier on the curvature amplitude (bundle/sheet curves attenuate). */
  curvatureScale: number
}

/**
 * Per-regime multipliers, in ONE named table so a rebalance is a single edit.
 * `detail` is the reference (×1); `bundle` widens, dims and flattens; `sheet`
 * flattens hardest (it is a wide aggregate band, not an individual stroke) and
 * keeps alpha = 1 because its presence is carried by `sheetAlpha`, not by the
 * single-link density term that would otherwise floor it to near-invisibility.
 */
export const RIBBON_REGIME_PARAMS: Record<RibbonRegime, RibbonRegimeParams> = {
  detail: { widthScale: 1, alphaScale: 1, curvatureScale: 1 },
  bundle: { widthScale: 1.4, alphaScale: 0.55, curvatureScale: 0.5 },
  sheet: { widthScale: 1, alphaScale: 1, curvatureScale: 0.3 },
}

// ---------------------------------------------------------------------------
// Strip topology — vertex / index counts (no THREE, pure arithmetic)
// ---------------------------------------------------------------------------

/** Sample points along a ribbon's curve (2 vertices per point, strip order). */
export const RIBBON_SUBDIVISIONS = 8

/** Vertices for `ribbonCount` ribbons: `ribbonCount × SUBDIVISIONS × 2`. */
export function ribbonVertexCount(ribbonCount: number): number {
  return ribbonCount * RIBBON_SUBDIVISIONS * 2
}

/** Triangle-list indices for `ribbonCount` ribbons: `ribbonCount × (SUBDIVISIONS−1) × 6`. */
export function ribbonIndexCount(ribbonCount: number): number {
  return ribbonCount * (RIBBON_SUBDIVISIONS - 1) * 6
}

// ---------------------------------------------------------------------------
// Sheet aggregation — one wide ribbon per community PAIR (order-independent)
// ---------------------------------------------------------------------------

export interface CommunityPairSheet {
  /** Order-independent pair key (see communityPairKey). */
  key: string
  sourceCommunityId: number | undefined
  targetCommunityId: number | undefined
  /** The links summarized by this sheet (links.length === count). */
  links: Graph3DLink[]
  /** Number of links summarized. */
  count: number
}

/** A community id as a stable token; a missing community is its own bucket. */
export function communityToken(id: number | undefined): string {
  return id === undefined ? 'none' : String(id)
}

/**
 * Order-independent key of the (a, b) community pair: a→b and b→a are the same
 * visual edge between the same two communities, so they share a key and fold
 * into one sheet.
 */
export function communityPairKey(a: number | undefined, b: number | undefined): string {
  const x = communityToken(a)
  const y = communityToken(b)
  return x <= y ? `${x}\u0000${y}` : `${y}\u0000${x}`
}

/** Group links into one sheet per community pair (preserves link order). */
export function buildCommunityPairSheets(links: readonly Graph3DLink[]): CommunityPairSheet[] {
  const map = new Map<string, CommunityPairSheet>()
  for (const link of links) {
    const key = communityPairKey(link.sourceCommunityId, link.targetCommunityId)
    let sheet = map.get(key)
    if (!sheet) {
      sheet = {
        key,
        sourceCommunityId: link.sourceCommunityId,
        targetCommunityId: link.targetCommunityId,
        links: [],
        count: 0,
      }
      map.set(key, sheet)
    }
    sheet.links.push(link)
    sheet.count++
  }
  return [...map.values()]
}

// ---------------------------------------------------------------------------
// Sheet width / alpha — the aggregated band's presence, from the link count
// ---------------------------------------------------------------------------

/** Width (world units) of a sheet summarizing a single link. */
export const SHEET_WIDTH_MIN = 2
/** Width (world units) of a sheet summarizing thousands of links. */
export const SHEET_WIDTH_MAX = 14

/**
 * Width of a sheet that summarizes `count` links: log-scaled so the first few
 * links matter most, bounded to [SHEET_WIDTH_MIN, SHEET_WIDTH_MAX].
 */
export function sheetWidth(count: number): number {
  const v = Math.min(1, Math.max(0, Math.log1p(count) / Math.log1p(4000)))
  return SHEET_WIDTH_MIN + (SHEET_WIDTH_MAX - SHEET_WIDTH_MIN) * v
}

/** Alpha of a sheet summarizing a single link. */
export const SHEET_ALPHA_MIN = 0.1
/** Alpha of a sheet summarizing thousands of links. */
export const SHEET_ALPHA_MAX = 0.45

/**
 * Alpha of a sheet summarizing `count` links. The density term in
 * computeLinkAlpha floors a SINGLE link to near-invisibility on a huge graph;
 * a sheet REPRESENTS many links, so its presence grows with count instead of
 * shrinking with the global link count.
 */
export function sheetAlpha(count: number): number {
  const v = Math.min(1, Math.max(0, Math.log1p(count) / Math.log1p(4000)))
  return SHEET_ALPHA_MIN + (SHEET_ALPHA_MAX - SHEET_ALPHA_MIN) * v
}
