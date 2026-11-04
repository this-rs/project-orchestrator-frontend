import { describe, it, expect } from 'vitest'
import {
  ARROW_ANCHOR, ARROW_MAX_LINKS, ARROW_MAX_SIZE, ARROW_MIN_SIZE,
  arrowSize, computeArrowHead, type Vec3,
} from './linkArrows'
import { isDirectionalRelation } from './linkFamily'

const S: Vec3 = [0, 0, 0]
const T: Vec3 = [100, 0, 0]

describe('linkArrows', () => {
  it('directional families get a head, tissue links none', () => {
    for (const r of ['IMPORTS', 'CALLS', 'EXTENDS', 'IMPLEMENTS', 'CONTAINS', 'HAS_TASK']) {
      expect(computeArrowHead(S, T, r, 10)).not.toBeNull()
      expect(isDirectionalRelation(r)).toBe(true)
    }
    for (const r of ['CO_CHANGED', 'TOUCHES', 'SYNAPSE']) {
      expect(computeArrowHead(S, T, r, 10)).toBeNull()
    }
  })

  it('apex sits at 75 % of the path and the head points to the target', () => {
    const s: Vec3 = [10, -4, 7], t: Vec3 = [70, 56, -23]
    const h = computeArrowHead(s, t, 'CALLS', 10)!
    expect(h).toHaveLength(12)
    for (let i = 0; i < 3; i++) {
      expect(h[i]).toBeCloseTo(s[i] + (t[i] - s[i]) * ARROW_ANCHOR, 3)
    }
    const dir = [t[0] - s[0], t[1] - s[1], t[2] - s[2]]
    for (const w of [3, 9]) {
      // apex − wing is the vector pointing along the link direction
      const v = [h[0] - h[w], h[1] - h[w + 1], h[2] - h[w + 2]]
      expect(v[0] * dir[0] + v[1] * dir[1] + v[2] * dir[2]).toBeGreaterThan(0)
    }
  })

  it('draws nothing past the link threshold', () => {
    expect(computeArrowHead(S, T, 'CALLS', ARROW_MAX_LINKS)).not.toBeNull()
    expect(computeArrowHead(S, T, 'CALLS', ARROW_MAX_LINKS + 1)).toBeNull()
  })

  it('size is bounded on very short and very long links', () => {
    expect(arrowSize(0.01)).toBe(ARROW_MIN_SIZE)
    expect(arrowSize(1e6)).toBe(ARROW_MAX_SIZE)
    const wingLen = (h: Float32Array) => Math.hypot(h[3] - h[0], h[4] - h[1], h[5] - h[2])
    expect(wingLen(computeArrowHead(S, [0.5, 0, 0], 'CALLS', 1)!)).toBeCloseTo(ARROW_MIN_SIZE, 3)
    expect(wingLen(computeArrowHead(S, [0, 5000, 0], 'CALLS', 1)!)).toBeCloseTo(ARROW_MAX_SIZE, 3)
  })

  it('is deterministic and rejects degenerate links', () => {
    expect(Array.from(computeArrowHead(S, T, 'CALLS', 5)!)).toEqual(Array.from(computeArrowHead(S, T, 'CALLS', 5)!))
    expect(computeArrowHead(S, S, 'CALLS', 5)).toBeNull()
    expect(computeArrowHead(S, [NaN, 0, 0], 'CALLS', 5)).toBeNull()
  })
})
