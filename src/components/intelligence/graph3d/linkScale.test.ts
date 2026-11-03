import { describe, it, expect } from 'vitest'
import {
  classifyLinkScale,
  linkScaleAlpha,
  linkScaleCurvature,
  interpolateRgb,
  LINK_SCALE_ALPHA,
  LINK_SCALE_CURVATURE,
  LINK_SCALE_ORDER,
  type LinkEndpoint,
} from './linkScale'

const ep = (layer: string, communityId?: number): LinkEndpoint => ({ layer, communityId })

describe('classifyLinkScale — the three connection scales', () => {
  it('intra: same community on the same layer', () => {
    expect(classifyLinkScale(ep('code', 3), ep('code', 3))).toBe('intra')
  })

  it('neighbor: different communities on the same layer', () => {
    expect(classifyLinkScale(ep('code', 3), ep('code', 7))).toBe('neighbor')
  })

  it('inter: different layers, whatever the communities', () => {
    expect(classifyLinkScale(ep('code', 3), ep('knowledge', 3))).toBe('inter')
  })

  it('edge case (documented): a node without communityId is never intra — defaults to neighbor', () => {
    expect(classifyLinkScale(ep('code', undefined), ep('code', 3))).toBe('neighbor')
    expect(classifyLinkScale(ep('code', 3), ep('code', undefined))).toBe('neighbor')
    expect(classifyLinkScale(ep('code', undefined), ep('code', undefined))).toBe('neighbor')
  })

  it('is deterministic: same endpoints, same scale', () => {
    const a = ep('knowledge', 5)
    const b = ep('knowledge', 9)
    expect(classifyLinkScale(a, b)).toBe(classifyLinkScale(a, b))
  })
})

describe('LINK_SCALE_ALPHA — strictly increasing', () => {
  it('intra < neighbor < inter', () => {
    expect(LINK_SCALE_ALPHA.intra).toBeLessThan(LINK_SCALE_ALPHA.neighbor)
    expect(LINK_SCALE_ALPHA.neighbor).toBeLessThan(LINK_SCALE_ALPHA.inter)
  })

  it('is strictly increasing across the documented order', () => {
    for (let i = 1; i < LINK_SCALE_ORDER.length; i++) {
      expect(linkScaleAlpha(LINK_SCALE_ORDER[i - 1])).toBeLessThan(linkScaleAlpha(LINK_SCALE_ORDER[i]))
    }
  })

  it('matches the documented targets', () => {
    expect(linkScaleAlpha('intra')).toBeCloseTo(0.05, 6)
    expect(linkScaleAlpha('neighbor')).toBeCloseTo(0.12, 6)
    expect(linkScaleAlpha('inter')).toBeCloseTo(0.28, 6)
  })
})

describe('LINK_SCALE_CURVATURE — minimal / organic / maximal', () => {
  it('neighbor matches the existing organic curve (linkCurve.curvature)', () => {
    // 0.02 + 0.13·v², capped at 0.15
    expect(linkScaleCurvature('neighbor', 0)).toBeCloseTo(0.02, 6)
    expect(linkScaleCurvature('neighbor', 0.5)).toBeCloseTo(0.02 + 0.13 * 0.25, 6)
    expect(linkScaleCurvature('neighbor', 1)).toBeCloseTo(0.15, 6)
  })

  it('is strictly increasing in volume for every scale', () => {
    for (const scale of LINK_SCALE_ORDER) {
      expect(linkScaleCurvature(scale, 0)).toBeLessThan(linkScaleCurvature(scale, 0.5))
      expect(linkScaleCurvature(scale, 0.5)).toBeLessThan(linkScaleCurvature(scale, 1))
    }
  })

  it('intra bows least and inter bows most at the same volume', () => {
    for (const v of [0.3, 1]) {
      expect(linkScaleCurvature('intra', v)).toBeLessThan(linkScaleCurvature('neighbor', v))
      expect(linkScaleCurvature('neighbor', v)).toBeLessThan(linkScaleCurvature('inter', v))
    }
  })

  it('clamps out-of-range volume instead of overshooting the ceiling', () => {
    for (const scale of LINK_SCALE_ORDER) {
      expect(linkScaleCurvature(scale, -5)).toBeCloseTo(linkScaleCurvature(scale, 0), 10)
      expect(linkScaleCurvature(scale, 5)).toBeCloseTo(linkScaleCurvature(scale, 1), 10)
      expect(linkScaleCurvature(scale, 1)).toBeLessThanOrEqual(LINK_SCALE_CURVATURE[scale].max)
    }
  })
})

describe('interpolateRgb — per-vertex gradient', () => {
  const src = { r: 0.1, g: 0.2, b: 0.3 }
  const dst = { r: 0.9, g: 0.7, b: 0.5 }

  it('returns exactly the source at t = 0 and the target at t = 1', () => {
    expect(interpolateRgb(src, dst, 0)).toEqual(src)
    expect(interpolateRgb(src, dst, 1)).toEqual(dst)
  })

  it('is linear at the midpoint', () => {
    const mid = interpolateRgb(src, dst, 0.5)
    expect(mid.r).toBeCloseTo((src.r + dst.r) / 2, 6)
    expect(mid.g).toBeCloseTo((src.g + dst.g) / 2, 6)
    expect(mid.b).toBeCloseTo((src.b + dst.b) / 2, 6)
  })

  it('interpolates every channel independently', () => {
    const out = interpolateRgb(src, dst, 0.25)
    expect(out.r).toBeCloseTo(src.r * 0.75 + dst.r * 0.25, 10)
    expect(out.g).toBeCloseTo(src.g * 0.75 + dst.g * 0.25, 10)
    expect(out.b).toBeCloseTo(src.b * 0.75 + dst.b * 0.25, 10)
  })
})
