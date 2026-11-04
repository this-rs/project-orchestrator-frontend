import { describe, it, expect } from 'vitest'
import {
  curvature, CURVATURE_BASE, CURVATURE_MAX,
  linkVolume, LINK_VOLUME_WIDTH_MAX,
  curveSide,
  curveControlPoint, bezierPoint, bezierTangent,
  sampleLinkPath, pathPointAndTangent,
  curveEnabled, CURVE_MAX_LINKS, CURVE_SUBDIVISIONS,
  type Vec3,
} from './linkCurve'

describe('curvature(volume)', () => {
  it('is continuous, strictly increasing, and bounded on [0,1]', () => {
    expect(curvature(0)).toBeCloseTo(CURVATURE_BASE, 10)
    expect(curvature(0.5)).toBeGreaterThan(curvature(0))
    expect(curvature(1)).toBeGreaterThan(curvature(0.5))
    expect(curvature(1)).toBeCloseTo(CURVATURE_MAX, 10)
  })

  it('matches the documented formula: 0.02 + 0.13·v², capped at 0.15', () => {
    expect(curvature(0)).toBeCloseTo(0.02, 6)
    expect(curvature(0.5)).toBeCloseTo(0.02 + 0.13 * 0.25, 6)
    expect(curvature(1)).toBeCloseTo(0.15, 6)
  })

  it('never exceeds CURVATURE_MAX even past the growth term alone', () => {
    // 0.02 + 0.13·1² = 0.15 exactly — the cap is reached, not overshot.
    expect(curvature(1)).toBeLessThanOrEqual(CURVATURE_MAX)
    expect(curvature(2)).toBeCloseTo(CURVATURE_MAX, 10) // out-of-range input clamped
  })

  it('clamps out-of-range volumes instead of producing an out-of-range curve', () => {
    expect(curvature(-5)).toBeCloseTo(curvature(0), 10)
    expect(curvature(5)).toBeCloseTo(curvature(1), 10)
  })
})

describe('linkVolume', () => {
  it('normalizes width into [0,1] against LINK_VOLUME_WIDTH_MAX', () => {
    expect(linkVolume({ width: 0 })).toBe(0)
    expect(linkVolume({ width: LINK_VOLUME_WIDTH_MAX })).toBe(1)
    expect(linkVolume({ width: LINK_VOLUME_WIDTH_MAX / 2 })).toBeCloseTo(0.5, 6)
  })

  it('clamps above the max and treats missing/invalid width as zero volume', () => {
    expect(linkVolume({ width: LINK_VOLUME_WIDTH_MAX * 10 })).toBe(1)
    expect(linkVolume({ width: undefined })).toBe(0)
    expect(linkVolume({ width: NaN })).toBe(0)
  })
})

describe('curveSide — deterministic bow direction', () => {
  it('is the same for the same pair of ids on repeated calls', () => {
    expect(curveSide('file:a.ts', 'file:b.ts')).toBe(curveSide('file:a.ts', 'file:b.ts'))
  })

  it('is the same regardless of which id is "source" and which is "target"', () => {
    expect(curveSide('file:a.ts', 'file:b.ts')).toBe(curveSide('file:b.ts', 'file:a.ts'))
  })

  it('only ever returns +1 or -1', () => {
    for (const [a, b] of [['x', 'y'], ['node-1', 'node-2'], ['', 'z'], ['same', 'same']] as const) {
      expect([1, -1]).toContain(curveSide(a, b))
    }
  })
})

describe('curveControlPoint + bezierPoint — the curve passes exactly through both endpoints', () => {
  const s: Vec3 = [0, 0, 0]
  const t: Vec3 = [100, 40, -20]

  it('bezierPoint(s, control, t, 0) === s and bezierPoint(..., 1) === t for any volume', () => {
    for (const volume of [0, 0.3, 0.7, 1]) {
      const control = curveControlPoint(s, t, volume, 'a', 'b')
      const p0 = bezierPoint(s, control, t, 0)
      const p1 = bezierPoint(s, control, t, 1)
      for (let i = 0; i < 3; i++) {
        expect(p0[i]).toBeCloseTo(s[i], 6)
        expect(p1[i]).toBeCloseTo(t[i], 6)
      }
    }
  })

  it('the midpoint (t=0.5) is offset from the chord midpoint by exactly courbure(volume)·length', () => {
    const chordMid: Vec3 = [(s[0] + t[0]) / 2, (s[1] + t[1]) / 2, (s[2] + t[2]) / 2]
    const len = Math.hypot(t[0] - s[0], t[1] - s[1], t[2] - s[2])
    for (const volume of [0, 0.25, 0.6, 1]) {
      const control = curveControlPoint(s, t, volume, 'a', 'b')
      const mid = bezierPoint(s, control, t, 0.5)
      // Quadratic Bézier at t=0.5 is exactly halfway between the chord
      // midpoint and the control point: mid = chordMid + (control-chordMid)/2
      // = chordMid + perp·offset/2. The *control point itself* carries the
      // full offset; what the client sees (the curve's own midpoint) is half
      // of it — still strictly proportional to courbure(volume)·length.
      const dist = Math.hypot(mid[0] - chordMid[0], mid[1] - chordMid[1], mid[2] - chordMid[2])
      const expectedControlOffset = curvature(volume) * len
      expect(dist).toBeCloseTo(expectedControlOffset / 2, 5)
    }
  })

  it('a stronger link bows out further than a weaker one, same ids, same geometry', () => {
    const chordMid: Vec3 = [(s[0] + t[0]) / 2, (s[1] + t[1]) / 2, (s[2] + t[2]) / 2]
    const distAt = (volume: number) => {
      const control = curveControlPoint(s, t, volume, 'a', 'b')
      const mid = bezierPoint(s, control, t, 0.5)
      return Math.hypot(mid[0] - chordMid[0], mid[1] - chordMid[1], mid[2] - chordMid[2])
    }
    expect(distAt(0)).toBeLessThan(distAt(0.5))
    expect(distAt(0.5)).toBeLessThan(distAt(1))
  })

  it('bows to the same side (sign of the offset) regardless of volume', () => {
    const control0 = curveControlPoint(s, t, 0.1, 'a', 'b')
    const control1 = curveControlPoint(s, t, 0.9, 'a', 'b')
    const chordMid: Vec3 = [(s[0] + t[0]) / 2, (s[1] + t[1]) / 2, (s[2] + t[2]) / 2]
    const sign = (c: Vec3) => Math.sign(
      (c[0] - chordMid[0]) + (c[1] - chordMid[1]) + (c[2] - chordMid[2]),
    )
    expect(sign(control0)).toBe(sign(control1))
  })

  it('degenerates to the source point when s === t (no direction to bow along)', () => {
    expect(curveControlPoint(s, s, 1, 'a', 'b')).toEqual(s)
  })

  it('an explicit amplitude overrides the volume-derived curvature (scale-aware bow)', () => {
    const s0: Vec3 = [0, 0, 0]
    const t0: Vec3 = [100, 0, 0]
    const len = 100
    const chordMid: Vec3 = [50, 0, 0]
    const distFromMid = (c: Vec3) => Math.hypot(c[0] - chordMid[0], c[1] - chordMid[1], c[2] - chordMid[2])
    // Default (volume=0) bows curvature(0)·len = 0.02·100 = 2.
    expect(distFromMid(curveControlPoint(s0, t0, 0, 'a', 'b'))).toBeCloseTo(curvature(0) * len, 5)
    // A custom amplitude 0.4 bows 0.4·len = 40, regardless of the volume passed.
    expect(distFromMid(curveControlPoint(s0, t0, 0, 'a', 'b', 0.4))).toBeCloseTo(0.4 * len, 5)
  })
})

describe('bezierTangent', () => {
  it('points from s toward t at t=0 and t=1 for a straight (zero-curvature-ish) case', () => {
    const s: Vec3 = [0, 0, 0]
    const t: Vec3 = [10, 0, 0]
    const control = curveControlPoint(s, t, 0, 'a', 'b')
    const tan0 = bezierTangent(s, control, t, 0)
    // Tangent should have a positive x-component (heading toward t).
    expect(tan0[0]).toBeGreaterThan(0)
  })
})

describe('sampleLinkPath', () => {
  const s: Vec3 = [0, 0, 0]
  const t: Vec3 = [10, 6, -4]

  it('returns n points, starting at s and ending exactly at t, whether curved or straight', () => {
    for (const curved of [true, false]) {
      const pts = sampleLinkPath(s, t, 0.7, 'a', 'b', 8, curved)
      expect(pts).toHaveLength(8)
      expect(pts[0]).toEqual(s)
      for (let i = 0; i < 3; i++) expect(pts[7][i]).toBeCloseTo(t[i], 6)
    }
  })

  it('straight mode lies exactly on the chord; curved mode (volume>0) does not', () => {
    const straight = sampleLinkPath(s, t, 0.7, 'a', 'b', 8, false)
    const curved = sampleLinkPath(s, t, 0.7, 'a', 'b', 8, true)
    // Midpoint of the straight sampling is the exact chord midpoint.
    const mid = straight[4] // index 4 of 8 ≈ t-param 4/7
    const onChord = (p: Vec3) => {
      // Check collinearity with s→t by comparing cross-product magnitude ~0.
      const d: Vec3 = [t[0] - s[0], t[1] - s[1], t[2] - s[2]]
      const v: Vec3 = [p[0] - s[0], p[1] - s[1], p[2] - s[2]]
      const cross = [
        d[1] * v[2] - d[2] * v[1],
        d[2] * v[0] - d[0] * v[2],
        d[0] * v[1] - d[1] * v[0],
      ]
      return Math.hypot(...cross)
    }
    expect(onChord(mid)).toBeCloseTo(0, 4)
    expect(onChord(curved[4])).toBeGreaterThan(0.01)
  })
})

describe('pathPointAndTangent — arrow anchor stays on the actual drawn path', () => {
  const s: Vec3 = [0, 0, 0]
  const t: Vec3 = [20, 0, 0]

  it('matches bezierPoint/bezierTangent at the same parameter when curved', () => {
    const control = curveControlPoint(s, t, 0.8, 'src', 'tgt')
    const expectedPoint = bezierPoint(s, control, t, 0.75)
    const expectedTangent = bezierTangent(s, control, t, 0.75)
    const { point, tangent } = pathPointAndTangent(s, t, 0.8, 'src', 'tgt', 0.75, true)
    for (let i = 0; i < 3; i++) {
      expect(point[i]).toBeCloseTo(expectedPoint[i], 6)
      expect(tangent[i]).toBeCloseTo(expectedTangent[i], 6)
    }
  })

  it('falls back to straight-line interpolation when curving is disabled', () => {
    const { point, tangent } = pathPointAndTangent(s, t, 1, 'src', 'tgt', 0.75, false)
    expect(point).toEqual([15, 0, 0]) // 75% of the way from s to t, no bow
    expect(tangent).toEqual([20, 0, 0]) // t - s
  })
})

describe('curve cost budget', () => {
  it('is enabled at and under CURVE_MAX_LINKS, disabled just past it', () => {
    expect(curveEnabled(CURVE_MAX_LINKS)).toBe(true)
    expect(curveEnabled(CURVE_MAX_LINKS + 1)).toBe(false)
  })

  it('CURVE_SUBDIVISIONS is at least 3 (a real curve, not a single bent segment)', () => {
    expect(CURVE_SUBDIVISIONS).toBeGreaterThanOrEqual(3)
  })
})
