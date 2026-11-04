import { describe, it, expect } from 'vitest'
import { deterministicPlacement, type Graph3DNode } from './useGraph3DLayout'
import type { IntelligenceEdge } from '@/types/intelligence'

const mk = (id: string, groupKey: string): Graph3DNode =>
  ({ id, label: id, entityType: 'file', layer: 'code', x: 0, y: 0, z: 0, groupKey, data: {} }) as Graph3DNode
const link = (s: string, t: string) =>
  ({ id: `${s}->${t}`, source: s, target: t, data: { relationType: 'IMPORTS', layer: 'code' } }) as unknown as IntelligenceEdge

const centroid = (pts: Map<string, { x: number; y: number; z: number }>, ids: string[]) => {
  const p = ids.map((i) => pts.get(i)!)
  return {
    x: p.reduce((a, q) => a + q.x, 0) / p.length,
    y: p.reduce((a, q) => a + q.y, 0) / p.length,
    z: p.reduce((a, q) => a + q.z, 0) / p.length,
  }
}
const dist = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)

describe('relational group centres', () => {
  // Six groups. "A" and "Z" sort at the two ends, so the old golden-sphere order
  // puts them far apart. They are linked; the four middle groups are not.
  const ids = (p: string) => Array.from({ length: 8 }, (_, i) => `${p}${i}`)
  const A = ids('a')
  const Z = ids('z')
  const M = [1, 2, 3, 4].map((k) => ids(`m${k}-`))
  const nodes = [
    ...A.map((id) => mk(id, 'A')),
    ...Z.map((id) => mk(id, 'Z')),
    ...M.flatMap((g, k) => g.map((id) => mk(id, `M${k + 1}`))),
  ]
  const edges = [
    ...A.map((a, i) => link(a, Z[i])),
    ...A.slice(1).map((a, i) => link(A[i], a)),
    ...Z.slice(1).map((z, i) => link(Z[i], z)),
  ]

  it('pulls two linked groups closer than any unlinked group', () => {
    const pts = deterministicPlacement(nodes, edges)
    const cA = centroid(pts, A)
    const linked = dist(cA, centroid(pts, Z))
    for (const g of M) expect(linked).toBeLessThan(dist(cA, centroid(pts, g)))
  })

  it('stays finite and deterministic', () => {
    const p1 = deterministicPlacement(nodes, edges)
    const p2 = deterministicPlacement([...nodes].reverse(), [...edges].reverse())
    for (const [id, p] of p1) {
      expect(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)).toBe(true)
      expect(p2.get(id)).toEqual(p)
    }
  })
})
