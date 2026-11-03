import { describe, it, expect } from 'vitest'
import { layoutGroups } from './relationalLayout'
import type { RelationalGroup, AffinityMatrix, OrganicPoint } from './relationalLayout'

function dist(a: OrganicPoint, b: OrganicPoint): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2)
}

describe('layoutGroups', () => {
  it('is deterministic regardless of group listing order', () => {
    const groups: RelationalGroup[] = [
      { id: 'a', radius: 60 },
      { id: 'b', radius: 80 },
      { id: 'c', radius: 100 },
      { id: 'd', radius: 60 },
    ]
    const affinities: AffinityMatrix = {
      a: { b: 5 },
      c: { d: 1 },
    }
    const forward = layoutGroups(groups, affinities)
    const shuffled = layoutGroups([...groups].reverse(), affinities)
    for (const g of groups) {
      expect(shuffled.get(g.id)).toEqual(forward.get(g.id))
    }
  })

  it('places two strongly-related groups closer than two weakly-related groups of equal radius', () => {
    // Two independent components so they don't interfere with each other.
    const groups: RelationalGroup[] = [
      { id: 'strong-a', radius: 60 },
      { id: 'strong-b', radius: 60 },
      { id: 'weak-a', radius: 60 },
      { id: 'weak-b', radius: 60 },
    ]
    const affinities: AffinityMatrix = {
      'strong-a': { 'strong-b': 20 },
      'weak-a': { 'weak-b': 0.5 },
    }
    const positions = layoutGroups(groups, affinities, { maxIterations: 300 })
    const strongDist = dist(positions.get('strong-a')!, positions.get('strong-b')!)
    const weakDist = dist(positions.get('weak-a')!, positions.get('weak-b')!)
    expect(strongDist).toBeLessThan(weakDist)
  })

  it('keeps a group with no external relation isolated (farther than the envelope sum)', () => {
    const groups: RelationalGroup[] = [
      { id: 'hub-1', radius: 80 },
      { id: 'hub-2', radius: 80 },
      { id: 'hub-3', radius: 80 },
      { id: 'lonely', radius: 80 },
    ]
    const affinities: AffinityMatrix = {
      'hub-1': { 'hub-2': 10, 'hub-3': 10 },
      'hub-2': { 'hub-3': 10 },
    }
    const positions = layoutGroups(groups, affinities, { maxIterations: 300 })
    const lonely = positions.get('lonely')!
    for (const id of ['hub-1', 'hub-2', 'hub-3']) {
      const other = positions.get(id)!
      const d = dist(lonely, other)
      const envelopeSum = 80 + 80
      expect(d).toBeGreaterThan(envelopeSum)
    }
  })

  it('never produces NaN or Infinity, including with zero/no affinities', () => {
    const groups: RelationalGroup[] = [
      { id: 'x', radius: 60 },
      { id: 'y', radius: 60 },
      { id: 'z', radius: 160 },
    ]
    const positions = layoutGroups(groups, {})
    for (const p of positions.values()) {
      expect(Number.isFinite(p.x)).toBe(true)
      expect(Number.isFinite(p.y)).toBe(true)
      expect(Number.isFinite(p.z)).toBe(true)
    }
  })

  it('respects the iteration budget and leaves no overlapping envelopes at convergence', () => {
    const groups: RelationalGroup[] = Array.from({ length: 10 }, (_, i) => ({
      id: `g${i}`,
      radius: 60 + (i % 3) * 20,
    }))
    const affinities: AffinityMatrix = {}
    // A chain of affinities so the layout has real pulling forces to resolve
    // against the overlap constraint.
    for (let i = 0; i < groups.length - 1; i++) {
      affinities[`g${i}`] = { [`g${i + 1}`]: 3 }
    }
    const budget = 150
    const positions = layoutGroups(groups, affinities, { maxIterations: budget })
    expect(positions.size).toBe(groups.length)
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const gi = groups[i]
        const gj = groups[j]
        const d = dist(positions.get(gi.id)!, positions.get(gj.id)!)
        expect(d).toBeGreaterThanOrEqual(gi.radius + gj.radius)
      }
    }
  })

  it('pulls the result toward supplied previous positions (stability)', () => {
    const groups: RelationalGroup[] = [
      { id: 'a', radius: 60 },
      { id: 'b', radius: 60 },
    ]
    const affinities: AffinityMatrix = { a: { b: 1 } }
    const previousFar = new Map<string, OrganicPoint>([
      ['a', { x: 1000, y: 1000, z: 1000 }],
      ['b', { x: -1000, y: -1000, z: -1000 }],
    ])
    const withoutPrev = layoutGroups(groups, affinities, { maxIterations: 200 })
    const withPrev = layoutGroups(groups, affinities, { maxIterations: 200, previousPositions: previousFar })

    const aWithout = withoutPrev.get('a')!
    const aWith = withPrev.get('a')!
    const distToPrevWithout = dist(aWithout, previousFar.get('a')!)
    const distToPrevWith = dist(aWith, previousFar.get('a')!)
    expect(distToPrevWith).toBeLessThan(distToPrevWithout)
  })
})
