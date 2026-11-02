import { describe, it, expect } from 'vitest'
import { aggregateAtResolution, aggregateByGroup, resolutionForLevel } from './graphAggregation'
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

  it('saturates edge weight and grows width with count', () => {
    const g = buildGroupedGraph(data, 2)
    expect(g.links.length).toBe(1)
    const e = g.links[0]
    expect(e.count).toBe(2) // a→d and b→d cross groups; a→c is intra-group
    expect(e.weight).toBe(Math.min(1, 2 / 8))
    expect(e.width).toBe(Math.min(4, 0.5 + 2 * 0.25))
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
  it('falls back to Groupe … for a raw grid cell key', () => {
    expect(superNodeName('3,2,1')).toBe('Groupe 3,2,1')
  })
})
