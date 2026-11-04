import { describe, it, expect } from 'vitest'
import {
  prepareCommunityHulls,
  MIN_HULL_MEMBERS,
  MAX_HULLS,
  HULL_EXPANSION_RATIO,
} from './communityHullPrep'
import type { Graph3DNode } from './useGraph3DLayout'

const mk = (
  id: string,
  x: number,
  y: number,
  z: number,
  communityId: number,
  entityType = 'file',
): Graph3DNode => ({
  id,
  label: id,
  entityType,
  layer: 'code',
  x,
  y,
  z,
  communityId,
  data: {},
})

// `count` nodes placed on the X axis, symmetric about the origin (half at +R,
// half at −R): centroid = origin, radius = R exactly — a clean fixture for the
// expansion assertion.
const axisCommunity = (id: number, count: number, R = 10): Graph3DNode[] =>
  Array.from({ length: count }, (_, i) =>
    mk(`c${id}-${i}`, i % 2 === 0 ? R : -R, 0, 0, id),
  )

describe('prepareCommunityHulls', () => {
  it('ignores a community below MIN_HULL_MEMBERS and keeps one at/above it', () => {
    expect(MIN_HULL_MEMBERS).toBe(20)
    const nodes = [
      ...axisCommunity(0, 5), // 5 members → too small, ignored
      ...axisCommunity(1, 25), // 25 members → kept
    ]
    const result = prepareCommunityHulls(nodes)
    expect(result.map((h) => h.communityId)).toEqual([1])
    expect(result[0].nodeCount).toBe(25)
  })

  it('keeps only the MAX_HULLS biggest communities, in size order', () => {
    // community i has i + 1 members → community 99 is the biggest (100 members).
    const nodes: Graph3DNode[] = []
    for (let id = 0; id < 100; id++) nodes.push(...axisCommunity(id, id + 1))

    const result = prepareCommunityHulls(nodes)

    expect(result).toHaveLength(MAX_HULLS)
    // Biggest first: ids 99..60 (sizes 100..61).
    expect(result[0].communityId).toBe(99)
    expect(result[0].nodeCount).toBe(100)
    expect(result[MAX_HULLS - 1].communityId).toBe(60)
    expect(result[MAX_HULLS - 1].nodeCount).toBe(61)
    // Strictly descending size across the whole selection.
    for (let i = 1; i < result.length; i++) {
      expect(result[i].nodeCount).toBeLessThan(result[i - 1].nodeCount)
    }
  })

  it('sets the expansion radius to HULL_EXPANSION_RATIO of the community radius', () => {
    expect(HULL_EXPANSION_RATIO).toBe(0.08)
    const result = prepareCommunityHulls(axisCommunity(0, 20, 10))

    expect(result).toHaveLength(1)
    expect(result[0].radius).toBe(10)
    expect(result[0].expansion).toBe(result[0].radius * HULL_EXPANSION_RATIO)
    expect(result[0].expansion).toBe(10 * 0.08)
  })

  it('is deterministic — identical inputs give the same selection', () => {
    const nodes: Graph3DNode[] = []
    for (let id = 0; id < 60; id++) nodes.push(...axisCommunity(id, 25))

    const a = prepareCommunityHulls(nodes)
    const b = prepareCommunityHulls(nodes)

    expect(a.map((h) => h.communityId)).toEqual(b.map((h) => h.communityId))
    expect(a).toEqual(b)
  })
})
