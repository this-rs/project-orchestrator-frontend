import { describe, it, expect } from 'vitest'
import {
  communityRings,
  prepareCommunityRings,
  MIN_RING_MEMBERS,
  MAX_RINGS,
  RING_FLOOR_RATIO,
  RING_P50,
  RING_P90,
  type RingMember,
} from './communityRings'
import type { Graph3DNode } from './useGraph3DLayout'

const pt = (x: number, y = 0, z = 0): RingMember => ({ x, y, z })

const mk = (
  id: string,
  x: number,
  y: number,
  z: number,
  communityId: number,
  layer = 'code',
): Graph3DNode => ({
  id,
  label: id,
  entityType: 'file',
  layer,
  x,
  y,
  z,
  communityId,
  data: {},
})

// `count` members placed in symmetric pairs on the X axis: for r = 1..count/2
// one member at +r and one at −r. Centroid = origin, distances are 1..count/2
// each appearing twice — a clean, exact fixture for the quantile assertions.
const symmetricPairs = (count: number): RingMember[] =>
  Array.from({ length: count }, (_, i) => {
    const r = Math.floor(i / 2) + 1
    return pt(i % 2 === 0 ? r : -r)
  })

describe('communityRings (pure)', () => {
  it('is null for fewer than 3 members (degenerate)', () => {
    expect(communityRings([])).toBeNull()
    expect(communityRings([pt(0), pt(1)])).toBeNull()
    expect(communityRings([pt(0), pt(1), pt(2, 1, 0)])).not.toBeNull()
  })

  it('returns rising radii — p50 ≤ p90', () => {
    // A lopsided cloud: a tight core + a thin halo.
    const members: RingMember[] = [
      ...Array.from({ length: 30 }, () => pt((Math.random() - 0.5) * 2)),
      ...Array.from({ length: 10 }, () => pt(40 + Math.random())),
    ]
    for (let trial = 0; trial < 5; trial++) {
      const rings = communityRings(members)
      expect(rings).not.toBeNull()
      expect(rings!.p50).toBeLessThanOrEqual(rings!.p90)
    }
  })

  it('p50 and p90 bracket the real distances on a known fixture', () => {
    const members = symmetricPairs(1000) // distances 1..500, each twice
    const rings = communityRings(members)
    expect(rings).not.toBeNull()
    expect(rings!.nodeCount).toBe(1000)
    expect(rings!.radius).toBe(500)

    // p50 = nearest-rank 50 % of 1000 sorted distances = index 499 = 250.
    expect(rings!.p50).toBe(250)
    // p90 = nearest-rank 90 % = index 899 = 450.
    expect(rings!.p90).toBe(450)
    // Exactly half the distances are ≤ p50, and 90 % are ≤ p90.
    const d = (i: number) => Math.floor(i / 2) + 1
    const atMost50 = Array.from({ length: 1000 }, (_, i) => d(i)).filter((v) => v <= rings!.p50).length
    const atMost90 = Array.from({ length: 1000 }, (_, i) => d(i)).filter((v) => v <= rings!.p90).length
    expect(atMost50).toBe(500)
    expect(atMost90).toBe(900)
    // And the quantiles carry the documented fractions.
    expect(RING_P50).toBe(0.5)
    expect(RING_P90).toBe(0.9)
  })

  it('respects the bounds — never wider than the radius, never thinner than the floor', () => {
    // 30 members hugging the centre, 10 far out → p50 must be floored up, p90
    // must stay under the radius.
    const members: RingMember[] = [
      ...Array.from({ length: 30 }, (_, i) => pt(i % 2 === 0 ? 0.01 : -0.01)),
      ...Array.from({ length: 10 }, (_, i) => pt(i % 2 === 0 ? 100 : -100)),
    ]
    const rings = communityRings(members)
    expect(rings).not.toBeNull()
    expect(rings!.radius).toBe(100)
    const floor = rings!.radius * RING_FLOOR_RATIO
    // The unclamped p50 (≈ 0.01) is below the floor, so it is pushed up to it.
    expect(rings!.p50).toBe(floor)
    expect(rings!.p50).toBeGreaterThanOrEqual(floor)
    // p90 = farthest member = radius, and never above it.
    expect(rings!.p90).toBe(100)
    expect(rings!.p90).toBeLessThanOrEqual(rings!.radius)

    // All-on-a-shell community: both quantiles collapse to the radius, never above.
    const shell = Array.from({ length: 20 }, (_, i) => {
      const a = (i / 20) * Math.PI * 2
      return pt(10 * Math.cos(a), 10 * Math.sin(a))
    })
    const shellRings = communityRings(shell)
    expect(shellRings).not.toBeNull()
    expect(shellRings!.p50).toBeLessThanOrEqual(shellRings!.radius)
    expect(shellRings!.p90).toBeLessThanOrEqual(shellRings!.radius)
  })

  it('is deterministic — identical inputs give identical rings', () => {
    const members = symmetricPairs(600)
    const a = communityRings(members)
    const b = communityRings(members)
    expect(a).toEqual(b)
  })

  it('skips non-finite members', () => {
    const members: RingMember[] = [
      ...symmetricPairs(20),
      { x: Number.NaN, y: 0, z: 0 },
      { x: Infinity, y: 0, z: 0 },
    ]
    const rings = communityRings(members)
    expect(rings).not.toBeNull()
    expect(rings!.nodeCount).toBe(20)
  })
})

describe('prepareCommunityRings (selection)', () => {
  it('ignores a community below MIN_RING_MEMBERS and keeps one at/above it', () => {
    expect(MIN_RING_MEMBERS).toBe(20)
    const nodes: Graph3DNode[] = [
      ...Array.from({ length: 5 }, (_, i) => mk(`s${i}`, i, 0, 0, 0)),
      ...Array.from({ length: 25 }, (_, i) => mk(`b${i}`, i, 0, 0, 1)),
    ]
    const result = prepareCommunityRings(nodes)
    expect(result.map((r) => r.communityId)).toEqual([1])
    expect(result[0].nodeCount).toBe(25)
  })

  it('keeps at most MAX_RINGS communities, biggest first', () => {
    const nodes: Graph3DNode[] = []
    for (let id = 0; id < 100; id++) {
      for (let i = 0; i < id + 1; i++) nodes.push(mk(`c${id}-${i}`, i, 0, 0, id))
    }
    const result = prepareCommunityRings(nodes)
    expect(result).toHaveLength(MAX_RINGS)
    expect(result[0].communityId).toBe(99)
    expect(result[0].nodeCount).toBe(100)
    for (let i = 1; i < result.length; i++) {
      expect(result[i].nodeCount).toBeLessThan(result[i - 1].nodeCount)
    }
  })
})
