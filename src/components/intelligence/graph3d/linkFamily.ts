// ============================================================================
// linkFamily — the opacity budget of the graph's links, by relation family
// ============================================================================
//
// Colour already separates the relation TYPES (LINK_COLORS in useGraph3DLayout);
// this module adds the FAMILY axis the client asked for — "des directions ou
// affichage différents en fonction des types". A 1 px WebGL line carries no
// thickness, so OPACITY is
// the channel (direction is carried separately by arrow heads, see linkArrows) that tells the three layers apart:
//
//   structure  the skeleton of code and work (IMPORTS, CALLS, EXTENDS,
//              IMPLEMENTS, CONTAINS, HAS_*). Full-strength strokes, the most
//              readable: they carry the graph's reading order.
//   knowledge  the learned associations (DISCUSSED, AFFECTS, SYNAPSE).
//              Intermediate: visible context that never competes with the
//              skeleton.
//   tissue     the co-change web (CO_CHANGED, TOUCHES, CO_CHANGED_TRANSITIVE).
//              The densest layer, so it recedes hardest and never drowns the
//              other two.
//
// Everything lives in ONE named, documented table (LINK_FAMILY_ALPHA) so a
// rebalance is a single edit — no scattered constants. The budget was cut by
// ≈ ×0.7 from the previous one ("moins d'opacité") while keeping the family
// spread; the floor (LINK_ALPHA_FLOOR) guarantees a link never vanishes and
// computeLinkAlpha never attenuates a focused (hovered / selected / activated)
// link.
// ============================================================================

/** The three relation families, from most to least readable. */
export type LinkFamily = 'structure' | 'knowledge' | 'tissue'

/**
 * Per-relation-type base opacity, grouped and documented by family. This is
 * ≈ ×0.7 of the previous budget; the values are later multiplied by weight /
 * density / bridge / focus in computeLinkAlpha, so this table only sets the
 * FAMILY presence.
 */
export const LINK_FAMILY_ALPHA: Record<string, number> = {
  // structure — the skeleton of code and work, the most readable
  EXTENDS: 0.119,
  IMPORTS: 0.105,
  IMPLEMENTS: 0.105,
  CALLS: 0.091,
  CONTAINS: 0.091,
  HAS_TASK: 0.091,
  HAS_STEP: 0.077,
  HAS_DECISION: 0.077,
  HAS_CONSTRAINT: 0.077,
  HAS_MEMBER: 0.091,
  HAS_STATE: 0.091,
  HAS_FEATURE_GRAPH: 0.091,
  DEPENDS_ON: 0.091,
  TRANSITION: 0.091,
  INCLUDES_ENTITY: 0.091,
  // knowledge — learned associations, intermediate
  AFFECTS: 0.056,
  DISCUSSED: 0.049,
  SYNAPSE: 0.049,
  INFORMED_BY: 0.049,
  LINKED_TO: 0.049,
  BELONGS_TO_SKILL: 0.049,
  // tissue — the co-change web, the most discreet
  CO_CHANGED: 0.038,
  TOUCHES: 0.035,
  CO_CHANGED_TRANSITIVE: 0.028,
  // aggregated super-links (bundled structure between communities)
  AGGREGATE: 0.07,
}

const STRUCTURE_TYPES = new Set([
  'IMPORTS', 'CALLS', 'EXTENDS', 'IMPLEMENTS', 'CONTAINS',
  'DEPENDS_ON', 'TRANSITION', 'INCLUDES_ENTITY', 'AGGREGATE',
])

const KNOWLEDGE_TYPES = new Set([
  'DISCUSSED', 'AFFECTS', 'SYNAPSE', 'INFORMED_BY', 'LINKED_TO', 'BELONGS_TO_SKILL',
])

/** Family of a relation type (HAS_* is structure; anything unknown recedes like tissue). */
export function linkFamilyOf(relationType: string): LinkFamily {
  const t = relationType.toUpperCase()
  if (t.startsWith('HAS_')) return 'structure'
  if (STRUCTURE_TYPES.has(t)) return 'structure'
  if (KNOWLEDGE_TYPES.has(t)) return 'knowledge'
  return 'tissue'
}

/**
 * Directional relations carry a sense (A imports B): they get an arrow head.
 * Only the structure family qualifies; knowledge and tissue links (CO_CHANGED,
 * TOUCHES…) are symmetric associations and stay bare strokes.
 */
export function isDirectionalRelation(relationType: string): boolean {
  return linkFamilyOf(relationType) === 'structure'
}

/** Fallback for a relation type the table does not list: tissue, the quietest. */
const LINK_ALPHA_DEFAULT = 0.035

/** Base opacity of a relation type; unknown types fall back to the tissue budget. */
export function linkFamilyAlpha(relationType: string): number {
  return LINK_FAMILY_ALPHA[relationType.toUpperCase()] ?? LINK_ALPHA_DEFAULT
}

/**
 * Base opacity of the library's own link renderer (the small-graph cylinder
 * path, where ForceGraph3D draws each link itself). The LineSegments path
 * bakes per-family alphas instead; this single value covers the library path.
 * Cut ≈ ×0.7 from the previous 0.2.
 */
export const LINK_OPACITY = 0.14

/** Link counts above which density begins to fade the links (1/√E past it). */
export const LINK_DENSITY_REFERENCE = 2000

/** Ceiling of the density factor for a resting link (a sparse graph is still capped). */
export const LINK_DENSITY_CEILING = 0.7

/**
 * Floor of a link's final alpha for the REFERENCE presence
 * (LINK_FLOOR_REFERENCE_ALPHA, the neighbour scale), scaled by the colour's
 * own alpha so dim links stay dim. See linkAlphaFloor for the other presences.
 */
export const LINK_ALPHA_FLOOR = 0.04

/** Presence (family alpha × focus gain) whose floor is exactly LINK_ALPHA_FLOOR. */
export const LINK_FLOOR_REFERENCE_ALPHA = 0.12

/** Bounds of the floor's scale factor: no presence floors below ½ or above 2× the reference. */
export const LINK_FLOOR_MIN_SCALE = 0.5
export const LINK_FLOOR_MAX_SCALE = 2

/**
 * Floor of a link of presence `familyAlpha × gain`:
 *
 *     floor = LINK_ALPHA_FLOOR × colorAlpha × clamp(√(presence / REFERENCE), ½, 2)
 *
 * WHY NOT ONE ABSOLUTE FLOOR. Past ~10 000 links the density fade pushes every
 * resting link under 0.04, and the three connection scales (intra 0.05,
 * neighbour 0.12, inter 0.28) all landed on the SAME floor: the hierarchy the
 * client asked for vanished exactly when the graph is big enough to need it.
 * A floor that follows √presence keeps every ratio ≥ √(f₂/f₁) at any count
 * (intra : neighbour : inter ≈ 1 : 1.55 : 2.37), while still never letting a
 * link vanish.
 */
export function linkAlphaFloor(familyAlpha: number, gain = 1, colorAlpha = 1): number {
  const presence = Math.max(0, familyAlpha) * Math.max(0, gain)
  const scale = Math.min(
    LINK_FLOOR_MAX_SCALE,
    Math.max(LINK_FLOOR_MIN_SCALE, Math.sqrt(presence / LINK_FLOOR_REFERENCE_ALPHA)),
  )
  return LINK_ALPHA_FLOOR * colorAlpha * scale
}

export interface LinkAlphaParams {
  /** Base opacity of the relation family (see LINK_FAMILY_ALPHA / linkFamilyAlpha). */
  familyAlpha: number
  /** Edge weight 0..1 — weak links fade, strong links stand out. */
  weight: number
  /** The colour's own alpha (0..1). */
  colorAlpha: number
  /** Total number of links in the graph, for the density term. */
  linkCount: number
  /** True when the edge spans two communities (drawn a little stronger). */
  isInterCommunity: boolean
  /** Hover / selection / activation: a focused link never attenuates. */
  emphasised: boolean
  /**
   * Opacity gain from the hover focus (see linkFocus.ts). 1 when nothing is
   * hovered; > 1 inside the hovered group, < 1 outside. Optional so the
   * existing call sites and tests keep their meaning unchanged.
   */
  gain?: number
  /**
   * Number of links the density term is measured against. Defaults to
   * `linkCount`.
   *
   * A hovered group passes the count of ITS OWN focus class: the fade must be
   * computed on what is actually being looked at. Measured motivation: with
   * 12 000 links the resting density factor is √(2000/12000) ≈ 0.41 whatever
   * the group; applying it to the 40 links of the hovered cluster brightens
   * them by a gain computed for a crowd they are no longer part of.
   */
  densityCount?: number
}

/**
 * Final alpha of a link, in [linkAlphaFloor(family, gain, colorAlpha), 1].
 *
 *     alpha = max( family × focus × gain × density × colorAlpha × weight × bridge,
 *                  linkAlphaFloor(family, gain, colorAlpha) )
 *
 * with focus = 2 for an emphasised link else 1,
 * gain = the hover focus gain (1 when nothing is hovered),
 * density = 1 for an emphasised link else
 *           min(LINK_DENSITY_CEILING, √(LINK_DENSITY_REFERENCE / densityCount)),
 * weight = 0.12 + 0.88·√weight, bridge = 1.7 when inter-community else 1.
 *
 * The rule that matters for the client: an emphasised link (hovered, selected
 * or activated) keeps its full strength — the calm only applies to the resting
 * web, otherwise the link under the cursor would vanish.
 */
export function computeLinkAlpha(p: LinkAlphaParams): number {
  const w = Math.max(0, Math.min(1, p.weight))
  const weightFactor = 0.12 + 0.88 * Math.sqrt(w)
  // An emphasised link skips the density term entirely: it is never attenuated
  // by how many other links the graph holds, only the resting web takes the fade.
  // The denominator is the hovered class when one is supplied — see densityCount.
  const densityBase = Math.max(1, p.densityCount ?? p.linkCount)
  const density = p.emphasised
    ? 1
    : Math.min(LINK_DENSITY_CEILING, Math.sqrt(LINK_DENSITY_REFERENCE / densityBase))
  const bridge = p.isInterCommunity ? 1.7 : 1
  const focus = p.emphasised ? 2 : 1
  const gain = p.gain ?? 1
  const a = Math.max(
    p.familyAlpha * focus * gain * density * p.colorAlpha * weightFactor * bridge,
    linkAlphaFloor(p.familyAlpha, gain, p.colorAlpha),
  )
  return Math.min(1, a)
}
