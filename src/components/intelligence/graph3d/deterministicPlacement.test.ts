import { describe, it, expect } from 'vitest'
import { deterministicPlacement } from './useGraph3DLayout'
import type { Graph3DNode } from './useGraph3DLayout'
import type { IntelligenceEdge } from '@/types/intelligence'

const mkNode = (id: string, layer: string, communityId: number): Graph3DNode => ({
  id, label: id, entityType: 'file', layer, x: 0, y: 0, z: 0, communityId, data: {},
})
const mkEdge = (source: string, target: string): IntelligenceEdge => (
  { id: `${source}-${target}`, source, target, type: 'default' } as IntelligenceEdge
)

describe('deterministicPlacement', () => {
  it('places every node, with no NaN', () => {
    const nodes = [
      mkNode('a', 'code', 0), mkNode('b', 'code', 0), mkNode('c', 'code', 1),
      mkNode('d', 'knowledge', 0), mkNode('e', 'skills', 2),
    ]
    const edges = [mkEdge('a', 'b'), mkEdge('b', 'c')]
    const placed = deterministicPlacement(nodes, edges)
    expect(placed.size).toBe(nodes.length)
    for (const p of placed.values()) {
      expect(Number.isFinite(p.x)).toBe(true)
      expect(Number.isFinite(p.y)).toBe(true)
      expect(Number.isFinite(p.z)).toBe(true)
    }
  })

  it('is deterministic — same input, same output', () => {
    const nodes = [mkNode('a', 'code', 0), mkNode('b', 'code', 0), mkNode('c', 'knowledge', 1)]
    const edges = [mkEdge('a', 'b')]
    const p1 = deterministicPlacement(nodes, edges)
    const p2 = deterministicPlacement(nodes, edges)
    for (const id of ['a', 'b', 'c']) {
      expect(p2.get(id)).toEqual(p1.get(id))
    }
  })

  it('separates layers in z (knowledge sits above code)', () => {
    const nodes = [mkNode('a', 'code', 0), mkNode('k', 'knowledge', 0)]
    const placed = deterministicPlacement(nodes, [])
    expect(placed.get('k')!.z).toBeGreaterThan(placed.get('a')!.z + 40)
  })

  it('clusters same-community nodes closer than different communities', () => {
    const nodes = [
      mkNode('a1', 'code', 0), mkNode('a2', 'code', 0),
      mkNode('b1', 'code', 1), mkNode('b2', 'code', 1),
    ]
    const placed = deterministicPlacement(nodes, [])
    const d = (x: string, y: string) => {
      const p = placed.get(x)!, q = placed.get(y)!
      return Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z)
    }
    expect(d('a1', 'a2')).toBeLessThan(d('a1', 'b1'))
  })

  it('does not collapse a big group to the origin', () => {
    const nodes = Array.from({ length: 400 }, (_, i) => mkNode(`n${i}`, 'code', 0))
    const placed = deterministicPlacement(nodes, [])
    let maxR = 0
    for (const p of placed.values()) maxR = Math.max(maxR, Math.hypot(p.x, p.y, p.z))
    expect(maxR).toBeGreaterThan(20)
  })
})
