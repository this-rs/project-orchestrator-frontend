// ============================================================================
// layerColors — the COLOUR channel says the LAYER (aggregated view)
// ============================================================================
//
// At the aggregated tiers (scale ≥ 1) a super-node bundles many entities, so
// its entity type is not a meaningful colour: what the eye must read is which
// LAYER of the knowledge graph it belongs to. At the detail tier (scale 0) the
// colour stays the entity TYPE (graphPalette.ts, unchanged) — that is where
// types are read.
//
// Hues are deliberately far apart on the wheel (≥ 40° between neighbours, no
// two pastel lavenders as in PO_LAYER_COLOR) so layers stay distinguishable at
// a glance and on hull translucency. Pure module: no three.js, no GPU.
// ============================================================================

import { parseColor } from './linkSegments'

/** Layer → hex. One frank, distinct hue per layer. */
export const LAYER_COLORS: Readonly<Record<string, string>> = {
  code: '#22c55e', //       green   (≈142°) — source code
  knowledge: '#3b82f6', //  blue    (≈217°) — notes, decisions, constraints
  neural: '#a855f7', //     violet  (≈271°) — synapses / neural
  pm: '#f97316', //         orange  (≈25°)  — plans, tasks, milestones
  skills: '#ec4899', //     pink    (≈330°) — skills
  behavioral: '#eab308', // yellow  (≈45°)  — protocols / behaviour
  fabric: '#06b6d4', //     cyan    (≈189°) — knowledge fabric / cross-layer
  chat: '#ef4444', //       red     (≈0°)   — chat sessions
}

/** Neutral fallback for an unknown layer (never `undefined`). */
export const LAYER_FALLBACK_COLOR = '#9ca3af'

/** Hex colour of a layer; neutral grey for anything unknown. */
export function layerColor(layer: string | null | undefined): string {
  if (layer == null) return LAYER_FALLBACK_COLOR
  return Object.prototype.hasOwnProperty.call(LAYER_COLORS, layer) ? LAYER_COLORS[layer] : LAYER_FALLBACK_COLOR
}

export interface Rgb {
  r: number
  g: number
  b: number
}

const LAYER_RGB: Record<string, Rgb> = Object.fromEntries(
  Object.entries(LAYER_COLORS).map(([k, hex]) => {
    const p = parseColor(hex)
    return [k, { r: p.r, g: p.g, b: p.b }]
  }),
)
const FALLBACK_RGB: Rgb = (() => {
  const p = parseColor(LAYER_FALLBACK_COLOR)
  return { r: p.r, g: p.g, b: p.b }
})()

/** Normalised RGB of a layer (cached, no THREE.Color per node). */
export function layerRgb(layer: string | null | undefined): Rgb {
  if (layer == null) return FALLBACK_RGB
  return Object.prototype.hasOwnProperty.call(LAYER_RGB, layer) ? LAYER_RGB[layer] : FALLBACK_RGB
}

/**
 * Base colour of a node: its LAYER when aggregated, its entity TYPE in detail.
 * `typeRgb` is the detail-view colour already resolved by the caller (so the
 * detail behaviour is exactly the previous one).
 */
export function resolveNodeBaseRgb(aggregated: boolean, layer: string | null | undefined, typeRgb: Rgb): Rgb {
  return aggregated ? layerRgb(layer) : typeRgb
}

/**
 * Dominant layer = the one with the most members. A tie is broken
 * deterministically by layer name (alphabetical order), never by input order.
 */
export function dominantLayer(layers: Iterable<string | null | undefined>): string {
  const counts = new Map<string, number>()
  for (const l of layers) {
    const k = l ?? ''
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  let best = ''
  let bestN = -1
  for (const [k, n] of counts) {
    if (n > bestN || (n === bestN && k < best)) {
      best = k
      bestN = n
    }
  }
  return best
}
