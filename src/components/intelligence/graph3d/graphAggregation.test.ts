import { describe, it, expect } from 'vitest'
import { aggregateAtResolution, resolutionLadder } from './graphAggregation'
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

describe('resolutionLadder', () => {
  it('is descending and ends at or above the floor', () => {
    const ladder = resolutionLadder(1000, 4, 6)
    expect(ladder.length).toBeGreaterThan(1)
    for (let i = 1; i < ladder.length; i++) expect(ladder[i]).toBeLessThan(ladder[i - 1])
    expect(ladder[ladder.length - 1]).toBeGreaterThanOrEqual(4)
  })
})
