import { describe, it, expect } from 'vitest'
import {
  LINK_FOCUS_GAIN,
  LINK_FOCUS_ORDER,
  classifyLinkFocus,
  countLinksByFocus,
  type FocusableLink,
} from './linkFocus'
import { LINK_DENSITY_CEILING, LINK_DENSITY_REFERENCE, computeLinkAlpha } from './linkFamily'

describe('classifyLinkFocus', () => {
  it('puts both ends in the group inside, one end on the boundary, none outside', () => {
    expect(classifyLinkFocus('A', 'A', 'A')).toBe('inside')
    expect(classifyLinkFocus('A', 'B', 'A')).toBe('boundary')
    expect(classifyLinkFocus('B', 'A', 'A')).toBe('boundary')
    expect(classifyLinkFocus('B', 'C', 'A')).toBe('outside')
  })

  it('returns null when nothing is focused, so the caller keeps the resting style', () => {
    expect(classifyLinkFocus('A', 'A', null)).toBeNull()
    expect(classifyLinkFocus('A', 'A', undefined)).toBeNull()
    expect(classifyLinkFocus('A', 'A', '')).toBeNull()
  })

  it('never asserts that an ungrouped end belongs to the focus', () => {
    // Same conservative rule as classifyLinkScale for a missing community id.
    expect(classifyLinkFocus(null, 'A', 'A')).toBe('boundary')
    expect(classifyLinkFocus(null, null, 'A')).toBe('outside')
  })

  it('is order-independent on the two ends', () => {
    for (const [s, t] of [['A', 'B'], ['B', 'A'], ['A', 'A'], ['C', 'D']]) {
      expect(classifyLinkFocus(s, t, 'A')).toBe(classifyLinkFocus(t, s, 'A'))
    }
  })
})

describe('countLinksByFocus', () => {
  const links: FocusableLink[] = [
    { sourceGroup: 'A', targetGroup: 'A' },
    { sourceGroup: 'A', targetGroup: 'A' },
    { sourceGroup: 'A', targetGroup: 'B' },
    { sourceGroup: 'C', targetGroup: 'D' },
    { sourceGroup: 'C', targetGroup: 'D' },
    { sourceGroup: 'C', targetGroup: 'D' },
  ]

  it('counts each class exactly, and the three add up to the link total', () => {
    const counts = countLinksByFocus(links, 'A')!
    expect(counts).toEqual({ inside: 2, boundary: 1, outside: 3 })
    expect(counts.inside + counts.boundary + counts.outside).toBe(links.length)
  })

  it('returns null with no focus, never a zeroed object a caller could divide by', () => {
    expect(countLinksByFocus(links, null)).toBeNull()
  })

  it('gives the same counts whatever the link order', () => {
    expect(countLinksByFocus([...links].reverse(), 'A')).toEqual(countLinksByFocus(links, 'A'))
  })
})

describe('the hovered group reads louder, measured on its OWN density', () => {
  /** The resting alpha of a link in a graph of `linkCount` links. */
  const resting = (linkCount: number) =>
    computeLinkAlpha({
      familyAlpha: 0.091,
      weight: 0.5,
      colorAlpha: 1,
      linkCount,
      isInterCommunity: false,
      emphasised: false,
    })

  it('orders the three focus classes inside > boundary > outside', () => {
    const linkCount = 12000
    const counts = { inside: 40, boundary: 120, outside: 11840 }
    const alphaFor = (focus: 'inside' | 'boundary' | 'outside') =>
      computeLinkAlpha({
        familyAlpha: 0.091,
        weight: 0.5,
        colorAlpha: 1,
        linkCount,
        isInterCommunity: false,
        emphasised: false,
        gain: LINK_FOCUS_GAIN[focus],
        densityCount: counts[focus],
      })
    const inside = alphaFor('inside')
    const boundary = alphaFor('boundary')
    const outside = alphaFor('outside')
    expect(inside).toBeGreaterThan(boundary)
    expect(boundary).toBeGreaterThan(outside)
    expect(LINK_FOCUS_ORDER).toEqual(['inside', 'boundary', 'outside'])
  })

  it('does NOT attenuate the hovered group by the size of the whole graph', () => {
    // The point of densityCount: 40 links out of 12 000 must not be faded by
    // the 12 000. Both alphas use the same gain; only the denominator differs.
    const common = {
      familyAlpha: 0.091,
      weight: 0.5,
      colorAlpha: 1,
      linkCount: 12000,
      isInterCommunity: false,
      emphasised: false,
      gain: LINK_FOCUS_GAIN.inside,
    }
    const onSubset = computeLinkAlpha({ ...common, densityCount: 40 })
    const onWholeGraph = computeLinkAlpha({ ...common })
    expect(onSubset).toBeGreaterThan(onWholeGraph)
    // And a sparse subset is not boosted past the ceiling the resting web obeys.
    expect(onSubset).toBeLessThanOrEqual(0.091 * LINK_FOCUS_GAIN.inside * LINK_DENSITY_CEILING * (0.12 + 0.88 * Math.sqrt(0.5)) + 1e-12)
  })

  it('leaves a resting link bit-for-bit unchanged when no focus is supplied', () => {
    // Backwards compatibility: gain/densityCount are optional, and their
    // absence must reproduce the previous formula exactly.
    for (const n of [10, 2000, 12000]) {
      const legacy = resting(n)
      const explicit = computeLinkAlpha({
        familyAlpha: 0.091, weight: 0.5, colorAlpha: 1, linkCount: n,
        isInterCommunity: false, emphasised: false, gain: 1, densityCount: n,
      })
      expect(explicit).toBe(legacy)
    }
    expect(LINK_DENSITY_REFERENCE).toBeGreaterThan(0)
  })
})
