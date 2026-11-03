import { describe, it, expect } from 'vitest'
import { deterministicPlacement, groupRadius } from './useGraph3DLayout'
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

  it('separates layers in space (an island per layer, none on the origin)', () => {
    const nodes = [mkNode('a', 'code', 0), mkNode('k', 'knowledge', 0)]
    const placed = deterministicPlacement(nodes, [])
    const a = placed.get('a')!, k = placed.get('k')!
    expect(Math.hypot(a.x - k.x, a.y - k.y, a.z - k.z)).toBeGreaterThan(100)
    expect(Math.hypot(a.x, a.y, a.z)).toBeGreaterThan(50)
    expect(Math.hypot(k.x, k.y, k.z)).toBeGreaterThan(50)
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
    const core = groupRadius(perGroup) * 0.45
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

// ── Two-level placement: hubs at the centre, satellites on a corona ──────────

describe('hub-and-corona placement', () => {
  const mkGroup = (n: number, hubDeg = 0) => {
    const nodes: Graph3DNode[] = Array.from({ length: n }, (_, i) => ({
      id: `q${i}`, label: `q${i}`, entityType: 'file', layer: 'code',
      x: 0, y: 0, z: 0, communityId: 1, groupKey: 'c1', data: {},
    }))
    const edges: IntelligenceEdge[] = []
    for (let j = 1; j <= hubDeg; j++) edges.push(mkEdge('q0', `q${j}`))
    return { nodes, edges }
  }
  // Same ranking as the placement: degree desc, then id.
  const satellitesOf = (nodes: Graph3DNode[], edges: IntelligenceEdge[]) => {
    const deg = new Map<string, number>()
    for (const e of edges) {
      deg.set(e.source, (deg.get(e.source) ?? 0) + 1)
      deg.set(e.target, (deg.get(e.target) ?? 0) + 1)
    }
    const sorted = [...nodes].sort(
      (a, b) => (deg.get(b.id) ?? 0) - (deg.get(a.id) ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    )
    return sorted.slice(Math.ceil(nodes.length * 0.1))
  }
  // One group on the code layer: its centre is the origin of the layer plane.
  const radiusOf = (placed: Map<string, { x: number; y: number; z: number }>, id: string) => {
    const p = placed.get(id)!
    const z0 = placed.get('q0')!.z - 0 // hub z is the plane offset (hub at centre)
    return Math.hypot(p.x, p.y, p.z - z0)
  }

  it('puts the hub nearer the centre than the median satellite', () => {
    const { nodes, edges } = mkGroup(100, 40)
    const placed = deterministicPlacement(nodes, edges)
    const sats = satellitesOf(nodes, edges).map((n) => radiusOf(placed, n.id)).sort((a, b) => a - b)
    const median = sats[Math.floor(sats.length / 2)]
    expect(radiusOf(placed, 'q0')).toBeLessThan(median * 0.3)
  })

  it('spreads satellites on a corona between 0.55 and 1.0 of the group radius', () => {
    for (const n of [30, 100, 400]) {
      const { nodes, edges } = mkGroup(n, 10)
      const placed = deterministicPlacement(nodes, edges)
      const R = groupRadius(n)
      for (const node of satellitesOf(nodes, edges)) {
        const nr = radiusOf(placed, node.id) / R
        expect(nr).toBeGreaterThanOrEqual(0.55 - 1e-9)
        expect(nr).toBeLessThanOrEqual(1 + 1e-9)
      }
    }
  })

  it('thins the corona as the group grows', () => {
    const spread = (n: number) => {
      const { nodes, edges } = mkGroup(n, 5)
      const placed = deterministicPlacement(nodes, edges)
      const R = groupRadius(n)
      const rs = satellitesOf(nodes, edges).map((x) => radiusOf(placed, x.id) / R)
      return Math.max(...rs) - Math.min(...rs)
    }
    expect(spread(800)).toBeLessThan(spread(20))
    expect(spread(800)).toBeLessThan(0.15)
  })

  it('is strictly deterministic', () => {
    const { nodes, edges } = mkGroup(150, 20)
    const a = deterministicPlacement(nodes, edges)
    const b = deterministicPlacement(nodes, edges)
    for (const n of nodes) expect(b.get(n.id)).toEqual(a.get(n.id))
  })

  it('places a single-node group at the centre', () => {
    const { nodes } = mkGroup(1)
    const p = deterministicPlacement(nodes, []).get('q0')!
    expect(Math.hypot(p.x, p.y, p.z)).toBeCloseTo(0, 6)
  })
})

// ── One archipelago, logarithmic radius ─────────────────────────────────────
// The layer used to be a place — an island per layer sized by the layer's own
// mass — so the project layer (~20 nodes) collapsed to an invisible oval next
// to the code (~2000 nodes). The client ruled the constellation is the primary
// scale on every layer: every community of every layer now shares ONE
// archipelago, and a community's radius grows with log₂ of its mass so a small
// one stays readable. These tests encode that contract.

function groupStats(placed: Map<string, { x: number; y: number; z: number }>, ids: string[]) {
  const pts = ids.map((i) => placed.get(i)!)
  const c = {
    x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
    y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
    z: pts.reduce((s, p) => s + p.z, 0) / pts.length,
  }
  const radius = Math.max(...pts.map((p) => Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z)))
  return { c, radius }
}

describe('one archipelago, logarithmic radius', () => {
  // Three communities of very different masses, spread over different layers.
  const build = () => {
    const specs = [
      { key: 'big', layer: 'code', community: 0, mass: 2000 },
      { key: 'mid', layer: 'knowledge', community: 1, mass: 60 },
      { key: 'small', layer: 'pm', community: 2, mass: 20 },
    ]
    const nodes: Graph3DNode[] = []
    const ids: Record<string, string[]> = {}
    for (const s of specs) {
      ids[s.key] = []
      for (let i = 0; i < s.mass; i++) {
        const id = `${s.key}${i}`
        ids[s.key].push(id)
        nodes.push(mkNode(id, s.layer, s.community))
      }
    }
    return { nodes, ids, specs }
  }

  it('keeps three very unequal communities apart — their cores never touch', () => {
    const { nodes, ids, specs } = build()
    const placed = deterministicPlacement(nodes, [])
    const st = Object.fromEntries(specs.map((s) => [s.key, groupStats(placed, ids[s.key])]))
    const coreOf = (m: number) => groupRadius(m) * 0.45 // CORE_FRACTION
    for (let i = 0; i < specs.length; i++) {
      for (let j = i + 1; j < specs.length; j++) {
        const a = st[specs[i].key], b = st[specs[j].key]
        const d = Math.hypot(a.c.x - b.c.x, a.c.y - b.c.y, a.c.z - b.c.z)
        expect(d).toBeGreaterThan(coreOf(specs[i].mass) + coreOf(specs[j].mass))
      }
    }
  })

  it('keeps a small community readable next to a huge one', () => {
    expect(groupRadius(20)).toBeGreaterThanOrEqual(groupRadius(2000) * 0.6)
    expect(groupRadius(20)).toBeLessThan(groupRadius(2000))
  })

  it('grows the radius monotonically and clamps it to [MIN, MAX]', () => {
    const masses = [1, 2, 8, 20, 200, 2000, 20000, 1000000]
    for (let i = 1; i < masses.length; i++) {
      expect(groupRadius(masses[i])).toBeGreaterThanOrEqual(groupRadius(masses[i - 1]))
    }
    for (const m of masses) {
      expect(groupRadius(m)).toBeGreaterThanOrEqual(60)
      expect(groupRadius(m)).toBeLessThanOrEqual(160)
    }
  })

  it('is deterministic across the whole archipelago', () => {
    const { nodes } = build()
    expect(deterministicPlacement(nodes, [])).toEqual(deterministicPlacement(nodes, []))
  })
})
