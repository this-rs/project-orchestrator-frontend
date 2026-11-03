import { describe, it, expect } from 'vitest'
import {
  buildCommunityPairSheets, communityPairKey, RIBBON_DETAIL_MAX_LINKS, RIBBON_BUNDLE_MAX_LINKS,
  RIBBON_SUBDIVISIONS, RIBBON_WIDTH_MAX, RIBBON_WIDTH_MIN, ribbonIndexCount, ribbonVertexCount,
  ribbonWidth, selectRibbonRegime, sheetAlpha, sheetWidth,
} from './linkRibbon'
import type { Graph3DLink } from './useGraph3DLayout'

const link = (sourceCommunityId?: number, targetCommunityId?: number): Graph3DLink => ({
  source: 'a', target: 'b', relationType: 'IMPORTS', layer: 'fabric',
  color: 'rgba(148,163,184,0.35)', width: 1, particles: 0, particleSpeed: 0,
  isInterCommunity: false, sourceCommunityId, targetCommunityId,
})

describe('ribbonWidth', () => {
  it('is strictly increasing across its domain', () => {
    let prev = -Infinity
    for (let v = 0; v <= 1; v += 0.05) {
      const w = ribbonWidth(v)
      expect(w).toBeGreaterThan(prev)
      prev = w
    }
  })

  it('is bounded to [RIBBON_WIDTH_MIN, RIBBON_WIDTH_MAX]', () => {
    for (let v = -1; v <= 2; v += 0.1) {
      const w = ribbonWidth(v)
      expect(w).toBeGreaterThanOrEqual(RIBBON_WIDTH_MIN)
      expect(w).toBeLessThanOrEqual(RIBBON_WIDTH_MAX)
    }
  })

  it('has the documented values at 0 / 0.5 / 1', () => {
    expect(ribbonWidth(0)).toBeCloseTo(RIBBON_WIDTH_MIN, 6)             // 0.6
    expect(ribbonWidth(0.5)).toBeCloseTo((RIBBON_WIDTH_MIN + RIBBON_WIDTH_MAX) / 2, 6) // 1.8
    expect(ribbonWidth(1)).toBeCloseTo(RIBBON_WIDTH_MAX, 6)             // 3.0
  })

  it('clamps out-of-range volume instead of blowing out', () => {
    expect(ribbonWidth(-5)).toBe(RIBBON_WIDTH_MIN)
    expect(ribbonWidth(42)).toBe(RIBBON_WIDTH_MAX)
  })
})

describe('selectRibbonRegime', () => {
  it('picks the right regime at the boundaries (799/800, 2999/3000)', () => {
    expect(selectRibbonRegime(RIBBON_DETAIL_MAX_LINKS - 1)).toBe('detail')
    expect(selectRibbonRegime(RIBBON_DETAIL_MAX_LINKS)).toBe('detail')   // "≤ 800" is detail
    expect(selectRibbonRegime(RIBBON_DETAIL_MAX_LINKS + 1)).toBe('bundle')
    expect(selectRibbonRegime(RIBBON_BUNDLE_MAX_LINKS - 1)).toBe('bundle')
    expect(selectRibbonRegime(RIBBON_BUNDLE_MAX_LINKS)).toBe('bundle')   // "> 3 000" is sheet, so 3000 stays bundle
    expect(selectRibbonRegime(RIBBON_BUNDLE_MAX_LINKS + 1)).toBe('sheet')
  })

  it('never fails on zero or negative counts', () => {
    expect(selectRibbonRegime(0)).toBe('detail')
    expect(selectRibbonRegime(-1)).toBe('detail')
  })
})

describe('ribbonVertexCount', () => {
  it('is exactly N × subdivisions × 2 for a strip', () => {
    expect(ribbonVertexCount(1000)).toBe(1000 * RIBBON_SUBDIVISIONS * 2)
    expect(ribbonVertexCount(1)).toBe(RIBBON_SUBDIVISIONS * 2)
    expect(ribbonVertexCount(3)).toBe(3 * RIBBON_SUBDIVISIONS * 2)
  })

  it('is zero in fallback (no ribbons drawn)', () => {
    expect(ribbonVertexCount(0)).toBe(0)
  })

  it('matches ribbonIndexCount so the strip triangulates to quads', () => {
    // A strip of SUBDIVISIONS points has (SUBDIVISIONS-1) quads = (SUBDIVISIONS-1)*2 triangles.
    const n = 7
    expect(ribbonIndexCount(n)).toBe(n * (RIBBON_SUBDIVISIONS - 1) * 6)
  })
})

describe('buildCommunityPairSheets', () => {
  it('aggregates by community pair: ribbon count = pair count', () => {
    const links = [
      link(1, 2), link(1, 2), link(2, 1), // pair {1,2} — 3 links (both directions)
      link(3, 4),                         // pair {3,4} — 1 link
      link(5, 5),                         // pair {5,5} — 1 link (self)
      link(undefined, undefined),         // pair {none,none} — 1 link
    ]
    const sheets = buildCommunityPairSheets(links)
    expect(sheets).toHaveLength(4)
    const byKey = new Map(sheets.map((s) => [s.key, s]))
    expect(byKey.get(communityPairKey(1, 2))?.count).toBe(3)
    expect(byKey.get(communityPairKey(3, 4))?.count).toBe(1)
    expect(byKey.get(communityPairKey(5, 5))?.count).toBe(1)
  })

  it('treats a→b and b→a as the same pair (order-independent)', () => {
    expect(communityPairKey(1, 2)).toBe(communityPairKey(2, 1))
  })

  it('returns an empty list for no links', () => {
    expect(buildCommunityPairSheets([])).toEqual([])
  })
})

describe('sheetWidth / sheetAlpha', () => {
  it('grow with count and stay bounded', () => {
    expect(sheetWidth(1)).toBeLessThan(sheetWidth(100))
    expect(sheetWidth(100)).toBeLessThanOrEqual(sheetWidth(10000))
    expect(sheetAlpha(1)).toBeLessThan(sheetAlpha(100))
    for (const n of [0, 1, 10, 1000, 1e6]) {
      expect(sheetWidth(n)).toBeGreaterThanOrEqual(2)
      expect(sheetAlpha(n)).toBeGreaterThanOrEqual(0)
      expect(sheetAlpha(n)).toBeLessThanOrEqual(1)
    }
  })
})
