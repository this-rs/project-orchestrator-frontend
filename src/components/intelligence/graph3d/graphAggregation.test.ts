import { describe, it, expect } from 'vitest'
import {
  aggregateAtResolution,
  aggregateByGroup,
  groupHullNodes,
  resolveGroupKeys,
  resolutionForLevel,
  groupBudgetForResolution,
} from './graphAggregation'
import type { Graph3DNode, Graph3DLink } from './useGraph3DLayout'

const node = (id: string, x: number, y: number, z: number): Graph3DNode => ({
  id, label: id, entityType: 'file', layer: 'code', x, y, z, data: {},
})
const link = (source: string, target: string, weight = 0.5): Graph3DLink => ({
  source, target, relationType: 'IMPORTS', layer: 'fabric', weight, color: '#fff', width: 1, particles: 0, particleSpeed: 0, isInterCommunity: false,
})

describe('aggregateAtResolution', () => {
  const nodes = [
    node('a', 0, 0, 0), node('b', 1, 1, 1), node('c', 2, 2, 2), // close together
    node('d', 100, 100, 100), node('e', 101, 101, 101),          // far away
  ]
  const links = [link('a', 'd', 1), link('b', 'd', 0.5), link('a', 'b')]

  it('keeps every node — super-node counts sum to N', () => {
    const g = aggregateAtResolution(nodes, links, 4)
    const total = g.superNodes.reduce((s, n) => s + n.count, 0)
    expect(total).toBe(nodes.length)
  })

  it('coarser resolution yields no more super-nodes than finer', () => {
    const fine = aggregateAtResolution(nodes, links, 8).superNodes.length
    const coarse = aggregateAtResolution(nodes, links, 2).superNodes.length
    expect(coarse).toBeLessThanOrEqual(fine)
  })

  it('aggregates cross-cell edges and sums their weight', () => {
    const g = aggregateAtResolution(nodes, links, 2)
    // a→d and b→d both cross into d's cell; if a,b share a cell they bundle.
    const totalWeight = g.superEdges.reduce((s, e) => s + e.weight, 0)
    expect(g.superEdges.length).toBeGreaterThan(0)
    expect(totalWeight).toBeGreaterThan(0)
    // Every super-edge endpoint is a real super-node key.
    const keys = new Set(g.superNodes.map((n) => n.key))
    for (const e of g.superEdges) {
      expect(keys.has(e.source)).toBe(true)
      expect(keys.has(e.target)).toBe(true)
    }
  })

  it('is deterministic', () => {
    const a = aggregateAtResolution(nodes, links, 3)
    const b = aggregateAtResolution(nodes, links, 3)
    expect(a.superNodes).toEqual(b.superNodes)
    expect(a.superEdges).toEqual(b.superEdges)
  })

  it('collapses to a single super-node at resolution 1', () => {
    const g = aggregateAtResolution(nodes, links, 1)
    expect(g.superNodes.length).toBe(1)
    expect(g.superEdges.length).toBe(0) // all edges are intra-cell
  })
})

describe('resolutionForLevel', () => {
  it('returns 0 for detail level', () => {
    expect(resolutionForLevel(1000, 0)).toBe(0)
  })

  it('each level targets ~5x fewer cells than the one below', () => {
    const r1 = resolutionForLevel(10000, 1)
    const r2 = resolutionForLevel(10000, 2)
    const r3 = resolutionForLevel(10000, 3)
    expect(r2).toBeLessThan(r1)
    expect(r3).toBeLessThan(r2)
    expect(r1).toBeGreaterThanOrEqual(2)
  })
})

import { buildScaledGraph, buildGroupedGraph, superNodeName } from './graphAggregation'

describe('buildScaledGraph', () => {
  const data = {
    nodes: [
      node('a', 0, 0, 0), node('b', 1, 1, 1),
      node('d', 100, 100, 100), node('e', 101, 101, 101),
    ],
    links: [link('a', 'd', 1), link('b', 'd', 0.5), link('a', 'b')],
  }

  it('produces render-ready nodes positioned at cell centroids', () => {
    const g = buildScaledGraph(data, 2)
    expect(g.nodes.length).toBeGreaterThan(0)
    for (const n of g.nodes) {
      expect(Number.isFinite(n.x) && Number.isFinite(n.y) && Number.isFinite(n.z)).toBe(true)
      expect(typeof n.id).toBe('string')
      expect((n.data as { count: number }).count).toBeGreaterThan(0)
    }
  })

  it('edges only reference existing super-node ids', () => {
    const g = buildScaledGraph(data, 2)
    const ids = new Set(g.nodes.map((n) => n.id))
    for (const e of g.links) {
      expect(ids.has(typeof e.source === 'string' ? e.source : (e.source as { id: string }).id)).toBe(true)
      expect(ids.has(typeof e.target === 'string' ? e.target : (e.target as { id: string }).id)).toBe(true)
    }
  })

  it('preserves total node count through composition', () => {
    const g = buildScaledGraph(data, 2)
    const total = g.nodes.reduce((s, n) => s + (n.data as { count: number }).count, 0)
    expect(total).toBe(data.nodes.length)
  })

  it('carries byType composition summing to count', () => {
    const g = buildScaledGraph(data, 2)
    for (const n of g.nodes) {
      const d = n.data as { count: number; byType: Record<string, number> }
      const sum = Object.values(d.byType).reduce((s, v) => s + v, 0)
      expect(sum).toBe(d.count)
    }
  })
})

// ── Semantic group aggregation ───────────────────────────────────────────────

const groupedNode = (
  id: string,
  x: number,
  y: number,
  z: number,
  groupKey: string,
  entityType = 'file',
): Graph3DNode => ({ ...node(id, x, y, z), groupKey, entityType })

describe('aggregateByGroup', () => {
  it('merges nodes sharing a groupKey into one super-node', () => {
    const nodes = [
      groupedNode('a', 0, 0, 0, 'c7'),
      groupedNode('b', 10, 10, 10, 'c7'), // same group, far apart in space
      groupedNode('c', 100, 100, 100, 'c9'),
    ]
    const g = aggregateByGroup(nodes, [], 2)
    expect(g.cellOfNode.get(0)).toBe(g.cellOfNode.get(1))
    expect(g.cellOfNode.get(0)).not.toBe(g.cellOfNode.get(2))
    expect(g.superNodes.length).toBe(2)
    expect(g.superNodes.map((n) => n.key)).toEqual(expect.arrayContaining(['g:c7', 'g:c9']))
    const c7 = g.superNodes.find((n) => n.key === 'g:c7')
    expect(c7?.count).toBe(2)
  })

  it('bundles every link between two groups into one edge with count 3', () => {
    const nodes = [
      groupedNode('a', 0, 0, 0, 'c7'),
      groupedNode('b', 10, 0, 0, 'c7'),
      groupedNode('c', 100, 0, 0, 'c9'),
    ]
    const links = [link('a', 'c', 1), link('b', 'c', 0.5), link('a', 'c', 0.2)]
    const g = aggregateByGroup(nodes, links, 2)
    expect(g.superEdges.length).toBe(1)
    const e = g.superEdges[0]
    expect(e.count).toBe(3)
    expect(new Set([e.source, e.target])).toEqual(new Set(['g:c7', 'g:c9']))
    expect(e.weight).toBeCloseTo(1.7)
  })

  it('drops intra-group links', () => {
    const nodes = [groupedNode('a', 0, 0, 0, 'c7'), groupedNode('b', 10, 0, 0, 'c7')]
    const g = aggregateByGroup(nodes, [link('a', 'b', 1)], 2)
    expect(g.superNodes.length).toBe(1)
    expect(g.superEdges.length).toBe(0)
  })

  it('sum of edge counts leaving a group equals its real outgoing links', () => {
    const nodes = [
      groupedNode('a', 0, 0, 0, 'c7'),
      groupedNode('b', 1, 0, 0, 'c7'),
      groupedNode('c', 100, 0, 0, 'c9'),
      groupedNode('d', 200, 0, 0, 'c11'),
    ]
    // Real outgoing links from c7: a→c, b→c, a→d = 3 (a→b is intra-group).
    const links = [
      link('a', 'c', 1),
      link('b', 'c', 0.5),
      link('a', 'd', 0.2),
      link('a', 'b', 0.1),
    ]
    const g = aggregateByGroup(nodes, links, 2)
    const out = g.superEdges.filter((e) => e.source === 'g:c7' || e.target === 'g:c7')
    expect(out.reduce((s, e) => s + e.count, 0)).toBe(3)
  })

  it('falls back to the grid for nodes without a groupKey', () => {
    const nodes = [
      groupedNode('a', 0, 0, 0, 'c7'),
      groupedNode('b', 10, 10, 10, 'c7'),
      node('c', 100, 100, 100), // no groupKey → grid cell
    ]
    const g = aggregateByGroup(nodes, [link('a', 'c')], 2)
    const cKey = g.cellOfNode.get(2)
    expect(cKey).toBeDefined()
    expect(cKey).not.toMatch(/^g:/)
    expect(g.superNodes.length).toBe(2)
  })

  it('is deterministic', () => {
    const nodes = [
      groupedNode('a', 0, 0, 0, 'c7'),
      groupedNode('b', 10, 0, 0, 'c7'),
      node('c', 100, 0, 0),
    ]
    const links = [link('a', 'c', 1), link('b', 'c', 0.5), link('a', 'b', 0.2)]
    const a = aggregateByGroup(nodes, links, 3)
    const b = aggregateByGroup(nodes, links, 3)
    expect(a.superNodes).toEqual(b.superNodes)
    expect(a.superEdges).toEqual(b.superEdges)
  })
})

describe('buildGroupedGraph', () => {
  const data = {
    nodes: [
      groupedNode('a', 0, 0, 0, 'c7', 'file'),
      groupedNode('b', 10, 0, 0, 'c7', 'file'),
      groupedNode('c', 20, 0, 0, 'c7', 'class'),
      groupedNode('d', 100, 0, 0, 'c9', 'file'),
    ],
    links: [link('a', 'd', 1), link('b', 'd', 0.5), link('a', 'c', 0.2)],
  }

  it('emits one super-node per group with dominant type and byType composition', () => {
    const g = buildGroupedGraph(data, 2)
    expect(g.nodes.length).toBe(2)
    const c7 = g.nodes.find((n) => n.id === 'g:c7')
    expect(c7).toBeDefined()
    const d = c7!.data as { count: number; byType: Record<string, number> }
    expect(d.count).toBe(3)
    expect(c7!.entityType).toBe('file')
    expect(d.byType).toEqual({ file: 2, class: 1 })
  })

  it('carries the bundle count, a positive width and a weight in (0, 1]', () => {
    const g = buildGroupedGraph(data, 2)
    expect(g.links.length).toBe(1)
    const e = g.links[0]
    expect(e.count).toBe(2) // a→d and b→d cross groups; a→c is intra-group
    expect(e.weight).toBe(1) // the only bundle of the tier is its biggest
    expect(e.width).toBeGreaterThan(0.5)
  })

  it('names every super-node (label + data.name) from its group', () => {
    const g = buildGroupedGraph(data, 2)
    const c7 = g.nodes.find((n) => n.id === 'g:c7')
    expect(c7?.label).toBe('Communauté 7')
    expect((c7?.data as { name?: string }).name).toBe('Communauté 7')
  })

  it('uses the community label as the name when one is present', () => {
    const withLabel = {
      nodes: [
        { ...groupedNode('a', 0, 0, 0, 'c7', 'file'), communityLabel: 'auth' },
        { ...groupedNode('b', 10, 0, 0, 'c7', 'file'), communityLabel: 'auth' },
      ],
      links: [] as ReturnType<typeof link>[],
    }
    const g = buildGroupedGraph(withLabel, 2)
    expect(g.nodes[0].label).toBe('auth')
  })
})

describe('superNodeName', () => {
  it('uses the community label when present', () => {
    expect(superNodeName('g:c7', 'auth')).toBe('auth')
  })
  it('falls back to Communauté N for a community key without a label', () => {
    expect(superNodeName('g:c7')).toBe('Communauté 7')
  })
  it('keeps the directory path for a directory group key', () => {
    expect(superNodeName('g:dsrc/chat')).toBe('src/chat')
  })
  it('ignores a blank label and derives from the key', () => {
    expect(superNodeName('g:c7', '   ')).toBe('Communauté 7')
  })
  it('never presents a raw grid cell index as a name', () => {
    // "Groupe 3,2,1" looked like a community to the user; it is a cell index.
    expect(superNodeName('3,2,1')).toBe('Cellule 3,2,1')
  })
})

// ── Group cap ────────────────────────────────────────────────────────────────

/** `total` nodes spread over `dirs` directories (`src/mNN/sNNN`), Zipf-ish sizes. */
function manyDirNodes(total: number, dirs: number): Graph3DNode[] {
  const weights = Array.from({ length: dirs }, (_, d) => 1 / (d + 1))
  const sum = weights.reduce((a, b) => a + b, 0)
  const nodes: Graph3DNode[] = []
  for (let d = 0; d < dirs && nodes.length < total; d++) {
    const n = Math.max(1, Math.min(total - nodes.length, Math.round((weights[d] / sum) * total)))
    const dir = `src/m${String(d % 40).padStart(2, '0')}/s${String(d).padStart(4, '0')}`
    for (let i = 0; i < n; i++) {
      nodes.push(groupedNode(`n${nodes.length}`, (d % 37) * 10, (d % 23) * 10, (i % 11) * 10, `d${dir}`))
    }
  }
  while (nodes.length < total) {
    nodes.push(groupedNode(`n${nodes.length}`, 0, 0, 0, `dsrc/m00/s0000`))
  }
  return nodes
}

describe('group cap', () => {
  const nodes = manyDirNodes(20000, 1285)

  it('caps 1285 input groups at the budget of the resolution', () => {
    const distinct = new Set(nodes.map((n) => n.groupKey)).size
    expect(distinct).toBeGreaterThan(1000)
    const agg = aggregateByGroup(nodes, [], 4)
    expect(agg.superNodes.length).toBeLessThanOrEqual(groupBudgetForResolution(4))
    expect(agg.superNodes.length).toBeGreaterThan(1)
  })

  it('keeps every node (sum of counts = N) and leaves no empty group', () => {
    const agg = aggregateByGroup(nodes, [], 4)
    expect(agg.superNodes.reduce((s, n) => s + n.count, 0)).toBe(nodes.length)
    expect(agg.superNodes.every((n) => n.count > 0)).toBe(true)
    expect(agg.cellOfNode.size).toBe(nodes.length)
  })

  it('is deterministic', () => {
    const a = aggregateByGroup(nodes, [], 4)
    const b = aggregateByGroup(nodes, [], 4)
    expect(a.superNodes).toEqual(b.superNodes)
  })

  it('merges into the path-prefix parent', () => {
    const ns = [
      ...Array.from({ length: 30 }, (_, i) => groupedNode(`a${i}`, 0, 0, 0, 'dsrc/chat/manager')),
      ...Array.from({ length: 2 }, (_, i) => groupedNode(`b${i}`, 1, 1, 1, 'dsrc/chat/x')),
      ...Array.from({ length: 30 }, (_, i) => groupedNode(`c${i}`, 2, 2, 2, 'dsrc/graph')),
    ]
    const keys = resolveGroupKeys(ns, 2, 2)
    expect(new Set(keys).size).toBe(2)
    expect(keys[31]).toBe(keys[0]) // src/chat/x joined its chat sibling group
  })

  it('folds parentless groups (communities) into regions, under the budget', () => {
    const ns = Array.from({ length: 100 }, (_, i) => groupedNode(`n${i}`, i, 0, 0, `c${i % 50}`))
    const agg = aggregateByGroup(ns, [], 2)
    expect(agg.superNodes.length).toBeLessThanOrEqual(groupBudgetForResolution(2))
    expect(agg.superNodes.reduce((s, n) => s + n.count, 0)).toBe(100)
  })

  it('does not touch an input already under the cap', () => {
    const ns = [groupedNode('a', 0, 0, 0, 'c1'), groupedNode('b', 1, 1, 1, 'c2')]
    expect(aggregateByGroup(ns, [], 2).superNodes.length).toBe(2)
  })

  it('groupHullNodes numbers the capped groups, biggest first', () => {
    const hn = groupHullNodes(nodes, 4)
    const ids = new Set(hn.map((n) => n.communityId))
    expect(ids.size).toBeLessThanOrEqual(groupBudgetForResolution(4))
    expect(hn.every((n) => n.communityId != null && n.communityLabel)).toBe(true)
  })

  it('measure: group sizes for 20000 nodes / 1285 dirs', () => {
    const sizes = aggregateByGroup(nodes, [], 4)
      .superNodes.map((n) => n.count)
      .sort((a, b) => b - a)
    console.log('GROUPS', sizes.length, 'TOP5', sizes.slice(0, 5), 'MIN', sizes[sizes.length - 1])
    expect(sizes.length).toBeLessThanOrEqual(groupBudgetForResolution(4))
  })
})

// ── Semantic zoom: every level is a different graph ─────────────────────────

/** `n` nodes in `comms` communities, each a ball around its own centre. */
function communityGraph(n: number, e: number, comms: number) {
  let seed = 11
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const centres = Array.from({ length: comms }, () => [
    (rnd() - 0.5) * 4000, (rnd() - 0.5) * 4000, (rnd() - 0.5) * 4000,
  ])
  const nodes = Array.from({ length: n }, (_, i) => {
    const c = i % comms
    return groupedNode(
      `n${i}`,
      centres[c][0] + (rnd() - 0.5) * 200,
      centres[c][1] + (rnd() - 0.5) * 200,
      centres[c][2] + (rnd() - 0.5) * 200,
      `c${c}`,
    )
  })
  const links = Array.from({ length: e }, () =>
    link(`n${Math.floor(rnd() * n)}`, `n${Math.floor(rnd() * n)}`),
  )
  return { nodes, links }
}

describe('semantic zoom levels', () => {
  const g = communityGraph(20000, 40000, 300)
  const levels = [1, 2, 3, 4, 5].map((level) => {
    const res = resolutionForLevel(g.nodes.length, level)
    return { level, res, agg: aggregateByGroup(g.nodes, g.links, res) }
  })

  it('each level is strictly coarser than the one below it (fewer super-nodes AND super-edges)', () => {
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i].agg.superNodes.length).toBeLessThan(levels[i - 1].agg.superNodes.length)
      expect(levels[i].agg.superEdges.length).toBeLessThan(levels[i - 1].agg.superEdges.length)
    }
  })

  it('tracks the ≈5:1 target of resolutionForLevel within a factor of 2', () => {
    for (const { res, agg } of levels) {
      const budget = groupBudgetForResolution(res)
      expect(agg.superNodes.length).toBeLessThanOrEqual(budget)
      expect(agg.superNodes.length).toBeGreaterThanOrEqual(budget / 2)
    }
  })

  it('loses no node at any level', () => {
    for (const { agg } of levels) {
      expect(agg.superNodes.reduce((s, n) => s + n.count, 0)).toBe(g.nodes.length)
    }
  })

  it('splits a community only at levels finer than the communities, and never mixes two', () => {
    const fine = levels[0].agg // ≈ 4 000 targets for 300 communities
    const parts = new Map<string, Set<string>>()
    fine.cellOfNode.forEach((key, i) => {
      const set = parts.get(g.nodes[i].groupKey as string) ?? new Set()
      set.add(key)
      parts.set(g.nodes[i].groupKey as string, set)
    })
    // every community is split in several parts, each part belongs to ONE community
    const owner = new Map<string, string>()
    for (const [community, keys] of parts) {
      expect(keys.size).toBeGreaterThan(1)
      for (const k of keys) {
        expect(owner.get(k) ?? community).toBe(community)
        owner.set(k, community)
      }
    }
  })

  it('merges neighbouring communities at coarse levels instead of one catch-all blob', () => {
    const coarse = levels[3].agg // budget 27 for 300 communities
    const biggest = Math.max(...coarse.superNodes.map((n) => n.count))
    expect(biggest).toBeLessThan(g.nodes.length / 4)
  })

  it('hulls wrap the semantic groups, not the fine parts', () => {
    const res = levels[0].res
    const ids = new Set(groupHullNodes(g.nodes, res).map((n) => n.communityId))
    expect(ids.size).toBeLessThanOrEqual(300)
  })
})

// ── Super-edge importance: a magnitude law, no early saturation ─────────────

describe('super-edge width and weight follow the magnitude of the bundle', () => {
  /** Two groups joined by `count` links, plus a 1 000-link reference pair. */
  function bundles(counts: number[]) {
    const nodes: Graph3DNode[] = []
    const links: Graph3DLink[] = []
    counts.forEach((count, i) => {
      nodes.push(groupedNode(`a${i}`, i * 10, 0, 0, `c${2 * i}`))
      nodes.push(groupedNode(`b${i}`, i * 10, 50, 0, `c${2 * i + 1}`))
      for (let k = 0; k < count; k++) links.push(link(`a${i}`, `b${i}`))
    })
    return buildGroupedGraph({ nodes, links }, 16).links
  }

  it('tells 14, 232 and 294 relations apart (they were all width 4, weight 1)', () => {
    const edges = bundles([14, 232, 294, 1000]).sort((x, y) => (x.count ?? 0) - (y.count ?? 0))
    for (let i = 1; i < edges.length; i++) {
      expect(edges[i].width).toBeGreaterThan(edges[i - 1].width)
      expect(edges[i].weight as number).toBeGreaterThan(edges[i - 1].weight as number)
    }
  })

  it('width follows count^(1/3), relative to one relation (no world unit, no ceiling)', () => {
    const [w1, w8, w1000, w27000] = bundles([1, 8, 1000, 27000])
      .sort((x, y) => (x.count ?? 0) - (y.count ?? 0))
      .map((e) => e.width)
    expect(w1).toBeCloseTo(1, 9)
    expect(w8).toBeCloseTo(2, 9)
    expect(w1000).toBeCloseTo(10, 9)
    expect(w27000).toBeCloseTo(30, 9)
  })

  it('keeps weight in (0, 1], the biggest bundle of the tier at 1', () => {
    const edges = bundles([1, 30, 900])
    const weights = edges.map((e) => e.weight as number)
    expect(Math.max(...weights)).toBe(1)
    expect(Math.min(...weights)).toBeGreaterThan(0)
  })
})

describe('super-edge weight', () => {
  it('is log1p(count) / log1p(tier max), and the count stays exact', () => {
    const nodes = [groupedNode('a', 0, 0, 0, 'c1'), groupedNode('b', 9, 0, 0, 'c2'), groupedNode('c', 0, 9, 0, 'c3')]
    const links: Graph3DLink[] = []
    for (let k = 0; k < 294; k++) links.push(link('a', 'b'))
    for (let k = 0; k < 14; k++) links.push(link('a', 'c'))
    const edges = buildGroupedGraph({ nodes, links }, 16).links
    const small = edges.find((e) => e.count === 14)!
    const big = edges.find((e) => e.count === 294)!
    expect(big.weight).toBe(1)
    expect(small.weight).toBeCloseTo(Math.log1p(14) / Math.log1p(294), 12)
  })
})
