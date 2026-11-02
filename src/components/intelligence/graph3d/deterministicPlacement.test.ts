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

// ── The communities must reach the placement ─────────────────────────────────
// A measured defect: the API sends `community_id` (snake_case), the view read
// `communityId`, so every node fell in one group and the layout drew one
// regular ball per layer. These tests fail on that code.

import { communityIndex, toGraph3DNode } from './useGraph3DLayout'

const intelNode = (id: string, data: Record<string, unknown>) => ({
  id,
  type: 'file',
  position: { x: 0, y: 0 },
  data: { entityId: id, entityType: 'file', layer: 'code', ...data },
}) as unknown as Parameters<typeof toGraph3DNode>[0]

describe('communities reach the placement', () => {
  it('reads the snake_case community_id the API actually sends', () => {
    const nodes = [
      intelNode('src/a.rs', { path: 'src/a.rs', community_id: 7, community_label: 'chat' }),
      intelNode('src/b.rs', { path: 'src/b.rs', community_id: 7, community_label: 'chat' }),
    ]
    const index = communityIndex(nodes)
    const n = toGraph3DNode(nodes[0], index)
    expect(n.communityId).toBe(7)
    expect(n.communityLabel).toBe('chat')
    expect(n.groupKey).toBe('c7')
  })

  it('gives a symbol the community of the file it lives in', () => {
    const nodes = [intelNode('src/a.rs', { path: 'src/a.rs', community_id: 3 })]
    const index = communityIndex(nodes)
    const symbol = toGraph3DNode(
      intelNode('src/a.rs::run', { entityType: 'function', file_path: 'src/a.rs' }),
      index,
    )
    expect(symbol.communityId).toBe(3)
    expect(symbol.groupKey).toBe('c3')
  })

  it('falls back to the directory when the project has no analytics', () => {
    const n = toGraph3DNode(intelNode('src/chat/manager.rs', { path: 'src/chat/manager.rs' }), new Map())
    expect(n.communityId).toBeUndefined()
    expect(n.groupKey).toBe('dsrc/chat')
  })

  it('keeps twenty communities from swallowing each other', () => {
    // The measured defect: a fixed 150 px ring with twenty groups put their
    // spheres 47 px apart while each needed ~36 px — one indistinguishable ball.
    const perGroup = 30
    const groups = 20
    const nodes: Graph3DNode[] = []
    for (let g = 0; g < groups; g++) {
      for (let i = 0; i < perGroup; i++) {
        nodes.push({
          id: `g${g}n${i}`, label: `g${g}n${i}`, entityType: 'file', layer: 'code',
          x: 0, y: 0, z: 0, communityId: g, groupKey: `c${g}`, data: {},
        })
      }
    }
    const placed = deterministicPlacement(nodes, [])
    const centroidOf = (g: number) => {
      const pts = Array.from({ length: perGroup }, (_, i) => placed.get(`g${g}n${i}`)!)
      return pts.reduce(
        (a, p) => ({ x: a.x + p.x / perGroup, y: a.y + p.y / perGroup, z: a.z + p.z / perGroup }),
        { x: 0, y: 0, z: 0 },
      )
    }
    const centres = Array.from({ length: groups }, (_, g) => centroidOf(g))
    // The contract is on the CORES: halos are allowed to interpenetrate.
    const core = (10 + 3.2 * Math.sqrt(perGroup)) * 0.45
    let minDistance = Infinity
    for (let i = 0; i < groups; i++) {
      for (let j = i + 1; j < groups; j++) {
        // 3D on purpose: the centres now live on a sphere, so two groups can
        // share an (x, y) and still be far apart in depth.
        minDistance = Math.min(
          minDistance,
          Math.hypot(
            centres[i].x - centres[j].x,
            centres[i].y - centres[j].y,
            centres[i].z - centres[j].z,
          ),
        )
      }
    }
    expect(minDistance).toBeGreaterThan(core * 2)
    // …and the nebula must stay COMPACT: spacing the full radii pushed the
    // clusters apart until the camera pulled back and everything read tiny.
    const furthest = Math.max(
      ...centres.map((c) => Math.hypot(c.x, c.y, c.z - (centres[0].z - centres[0].z))),
    )
    expect(furthest).toBeLessThan(260)
  })

  it('packs the busy nodes into the core and the leaves into the halo', () => {
    // A uniform spiral put every node at the same distance from the centre:
    // that is the "ball". A nebula has a dense core and a sparse halo, so the
    // hubs must sit near the middle and the leaves at the rim.
    const n = 200
    const nodes: Graph3DNode[] = Array.from({ length: n }, (_, i) => ({
      id: `h${i}`, label: `h${i}`, entityType: 'file', layer: 'code',
      x: 0, y: 0, z: 0, communityId: 1, groupKey: 'c1', data: {},
    }))
    const edges: IntelligenceEdge[] = []
    for (let i = 0; i < 20; i++) {
      for (let j = 0; j < 10; j++) edges.push(mkEdge(`h${i}`, `h${100 + j}`))
    }
    const placed = deterministicPlacement(nodes, edges)
    const centre = Array.from({ length: n }, (_, i) => placed.get(`h${i}`)!)
      .reduce((a, p) => ({ x: a.x + p.x / n, y: a.y + p.y / n, z: a.z + p.z / n }), { x: 0, y: 0, z: 0 })
    const radiusOf = (id: string) => {
      const p = placed.get(id)!
      return Math.hypot(p.x - centre.x, p.y - centre.y, p.z - centre.z)
    }
    const median = (ids: string[]) => {
      const r = ids.map(radiusOf).sort((a, b) => a - b)
      return r[Math.floor(r.length / 2)]
    }
    const hubs = Array.from({ length: 20 }, (_, i) => `h${i}`)
    const leaves = Array.from({ length: 50 }, (_, i) => `h${150 + i}`)
    expect(median(hubs)).toBeLessThan(median(leaves))
  })
})
