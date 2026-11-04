// ============================================================================
// linkFocus — what a hovered group does to the links
// ============================================================================
//
// Client request (verbatim, 03/11/2026): "au moment des hovers, les liens aussi
// doivent gagner ou perdre en opacité en fonction de leurs groupe et il faudra
// recalculer les densités de liens en fonction de ce qui est hover ou non".
//
// Those are TWO distinct asks, and the second is the one that makes the first
// visible:
//
//   1. a link's opacity depends on where its two ENDPOINTS sit relative to the
//      group under the cursor (inside / crossing its border / outside);
//   2. the density attenuation is measured against the FOCUSED SUBSET, not the
//      whole graph. Without this, hovering changes nothing: the fade factor is
//      `√(2000/linkCount)` and, for a graph of 12 000 links, it stays exactly
//      the same for the 40 links of the hovered group — the group would be
//      "highlighted" by a gain applied to an alpha that was computed for a
//      crowd it is no longer part of.
//
// The gain and the density are separate on purpose:
//   alpha = family × gain(focus) × density(count of THAT focus class) × …
//
// Pure module: no three.js, no atom, no DOM. Every value here is a
// deterministic function of the arguments.

/** Where a link sits relative to the group under the cursor. */
export type LinkFocus = 'inside' | 'boundary' | 'outside'

/**
 * Opacity gain per focus class, applied on top of the resting alpha.
 *
 * Strictly decreasing inside > boundary > outside: the hovered group's own web
 * leads, what leaves the group stays readable (that is how a cluster is seen to
 * be connected to the rest), everything else recedes without disappearing.
 */
export const LINK_FOCUS_GAIN: Record<LinkFocus, number> = {
  inside: 2.6,
  boundary: 1.35,
  outside: 0.22,
}

/** Reading order, loudest first — same convention as LINK_SCALE_ORDER. */
export const LINK_FOCUS_ORDER: readonly LinkFocus[] = ['inside', 'boundary', 'outside']

/**
 * Classify one link against the group under the cursor.
 *
 * Returns `null` when nothing is focused: the caller then keeps the resting
 * style untouched (gain 1, density on the whole graph). A missing group key is
 * treated as "not in the focus": a node without a group cannot be asserted to
 * belong to the hovered one — the same conservative rule as
 * `classifyLinkScale` for a missing community id.
 */
export function classifyLinkFocus(
  sourceGroup: string | null | undefined,
  targetGroup: string | null | undefined,
  focusGroup: string | null | undefined,
): LinkFocus | null {
  if (!focusGroup) return null
  const sourceIn = sourceGroup === focusGroup
  const targetIn = targetGroup === focusGroup
  if (sourceIn && targetIn) return 'inside'
  if (sourceIn || targetIn) return 'boundary'
  return 'outside'
}

/** One link, reduced to what the focus classification needs. */
export interface FocusableLink {
  sourceGroup: string | null
  targetGroup: string | null
}

/** How many links of the graph fall in each focus class. */
export type LinkFocusCounts = Record<LinkFocus, number>

/**
 * Count the links per focus class for the group under the cursor.
 *
 * This is the "density of what is hovered": the caller passes the returned
 * count of a class as the density denominator, so each class is faded against
 * itself rather than against the whole graph.
 *
 * Returns `null` when nothing is focused, so the caller cannot accidentally use
 * a zeroed count as a divisor.
 */
export function countLinksByFocus(
  links: readonly FocusableLink[],
  focusGroup: string | null | undefined,
): LinkFocusCounts | null {
  if (!focusGroup) return null
  const counts: LinkFocusCounts = { inside: 0, boundary: 0, outside: 0 }
  for (const link of links) {
    const focus = classifyLinkFocus(link.sourceGroup, link.targetGroup, focusGroup)
    if (focus) counts[focus]++
  }
  return counts
}
