import { describe, it, expect } from 'vitest'
import { buildClusterTree, cutForView, type CutView } from './clusterTree'
import { CLUSTER_NODE_PREFIX, clusterIndexOf, graphFromCut } from './cutGraph'
import type { Graph3DLink, Graph3DNode } from './useGraph3DLayout'

/** `n` nodes in `comms` balls of radius 100 spread over 4 000; `e` links (no self-loops). */
function synth(n: number, e: number, comms: number, seed0 = 7) {
  let seed = seed0
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const centres = Array.from({ length: comms }, () => [(rnd() - 0.5) * 4000, (rnd() - 0.5) * 4000, (rnd() - 0.5) * 4000])
  const nodes: Graph3DNode[] = Array.from({ length: n }, (_, i) => {
    const c = i % comms
    return {
      id: `n${i}`, label: `n${i}`, entityType: i % 3 ? 'file' : 'function', layer: 'code',
      x: centres[c][0] + (rnd() - 0.5) * 200, y: centres[c][1] + (rnd() - 0.5) * 200, z: centres[c][2] + (rnd() - 0.5) * 200,
      communityId: c, communityLabel: `module-${c}`, groupKey: `c${c}`, data: {},
    }
  })
  const types = ['IMPORTS', 'CALLS', 'DISCUSSED']
  const links: Graph3DLink[] = []
  while (links.length < e) {
    const a = Math.floor(rnd() * n)
    const b = rnd() < 0.6 ? (a + comms * (1 + Math.floor(rnd() * 20))) % n : Math.floor(rnd() * n)
    if (a === b) continue
    links.push({ source: `n${a}`, target: `n${b}`, relationType: types[links.length % 3], layer: 'code', color: '#fff', width: 1, particles: 0, particleSpeed: 0, isInterCommunity: false })
  }
  return { nodes, links, centres }
}

const view = (x: number, y: number, z: number): CutView => ({ position: [x, y, z], fovDeg: 45, viewportHeightPx: 900 })
const BIG = { maxNodes: 1e9, maxLinks: 1e9 }
/** What the page uses: the budget is what keeps far regions grouped. */
const PAGE = { maxNodes: 500, maxLinks: 1e9 }

/** Relations the drawn graph carries: a real link is one, a bundle carries its count. */
function carried(links: Graph3DLink[]): number {
  return links.reduce((s, l) => s + (l.relationType === 'AGGREGATE' ? (l.count ?? 0) : 1), 0)
}

describe('graphFromCut', () => {
  const { nodes, links, centres } = synth(3000, 6000, 12)
  const tree = buildClusterTree(nodes, links)

  it('loses and doubles nothing: drawn + collapsed relations = all relations, at any view', () => {
    for (const v of [view(0, 0, 20000), view(centres[3][0], centres[3][1], centres[3][2] + 300), view(0, 0, 3000)]) {
      const cut = cutForView(tree, v, BIG)
      const g = graphFromCut(tree, cut, nodes, links)
      let inside = 0
      for (const c of cut.internal.values()) inside += c.count
      expect(carried(g.links) + inside).toBe(tree.linkTotal)
    }
  })

  it('shows detail near the camera and groups far away IN THE SAME graph', () => {
    const [cx, cy, cz] = centres[3]
    const g = graphFromCut(tree, cutForView(tree, view(cx, cy, cz + 300), PAGE), nodes, links)
    const real = g.nodes.filter((n) => !n.id.startsWith(CLUSTER_NODE_PREFIX))
    const groups = g.nodes.filter((n) => n.id.startsWith(CLUSTER_NODE_PREFIX))
    expect(real.length).toBeGreaterThan(0)
    expect(groups.length).toBeGreaterThan(0)
    // the region looked at is in detail…
    expect(real.filter((n) => n.communityId === 3).length).toBe(nodes.filter((n) => n.communityId === 3).length)
    // …and the region furthest from the camera is still a group
    const d = (c: number[]) => Math.hypot(c[0] - cx, c[1] - cy, c[2] - cz - 300)
    const far = centres.map((c, i) => [d(c), i] as const).sort((p, q) => q[0] - p[0])[0][1]
    expect(real.some((n) => n.communityId === far)).toBe(false)
  })

  it('a real node is the SAME object (selection, fiche, hover keep working)', () => {
    const [cx, cy, cz] = centres[3]
    const g = graphFromCut(tree, cutForView(tree, view(cx, cy, cz + 300), PAGE), nodes, links)
    const byId = new Map(nodes.map((n) => [n.id, n]))
    for (const n of g.nodes) if (!n.id.startsWith(CLUSTER_NODE_PREFIX)) expect(n).toBe(byId.get(n.id))
  })

  it('a link between two real nodes keeps its own relation type', () => {
    const [cx, cy, cz] = centres[3]
    const g = graphFromCut(tree, cutForView(tree, view(cx, cy, cz + 300), PAGE), nodes, links)
    const realIds = new Set(g.nodes.filter((n) => !n.id.startsWith(CLUSTER_NODE_PREFIX)).map((n) => n.id))
    const between = g.links.filter((l) => realIds.has(String(l.source)) && realIds.has(String(l.target)))
    expect(between.length).toBeGreaterThan(0)
    expect(between.every((l) => l.relationType !== 'AGGREGATE')).toBe(true)
  })

  it('a group carries its size, composition and a human name, and points back to the tree', () => {
    const g = graphFromCut(tree, cutForView(tree, view(0, 0, 20000), BIG), nodes, links)
    const groups = g.nodes.filter((n) => n.id.startsWith(CLUSTER_NODE_PREFIX))
    expect(groups.length).toBeGreaterThan(0)
    let total = 0
    for (const s of groups) {
      const count = (s.data as { count: number }).count
      const byType = (s.data as { byType: Record<string, number> }).byType
      expect(Object.values(byType).reduce((a, b) => a + b, 0)).toBe(count)
      expect(s.label).not.toMatch(/^Cellule/)
      expect(clusterIndexOf(s)).toBeGreaterThanOrEqual(0)
      total += count
    }
    const realCount = g.nodes.length - groups.length
    expect(total + realCount).toBe(nodes.length)
  })

  it('ids of groups are stable from one cut to the next', () => {
    const a = graphFromCut(tree, cutForView(tree, view(0, 0, 20000), BIG), nodes, links)
    const b = graphFromCut(tree, cutForView(tree, view(0, 0, 20000), BIG), nodes, links)
    expect(a.nodes.map((n) => n.id)).toEqual(b.nodes.map((n) => n.id))
  })
})

describe('graphFromCut — a part of a community is named by what it holds', () => {
  // one community, 140 files: 70 in components/chat (left), 70 in components/graph (right)
  const nodes: Graph3DNode[] = Array.from({ length: 140 }, (_, i) => {
    const chat = i < 70
    return {
      id: `f${i}`, label: `f${i}`, entityType: 'file', layer: 'code',
      x: (chat ? -500 : 500) + (i % 7) * 10, y: (i % 5) * 10, z: (i % 3) * 10,
      communityId: 4, communityLabel: 'frontend/src/components', groupKey: 'c4',
      data: { path: `frontend/src/components/${chat ? 'chat' : 'graph'}/f${i}.tsx` },
    }
  })
  const tree = buildClusterTree(nodes, [])
  const parts = tree.nodes.filter((t) => t.kind === 'split' && tree.nodes[t.parent].kind === 'community')
  const cut = {
    frontier: parts.map((t) => t.index).sort((a, b) => a - b),
    open: new Set(tree.nodes.filter((t) => t.kind !== 'leaf' && t.kind !== 'split').map((t) => t.index)),
    links: [],
    internal: new Map(),
  }

  it('says the sub-directory, not the community again', () => {
    const names = graphFromCut(tree, cut, nodes, []).nodes.map((n) => n.label)
    expect(names.length).toBeGreaterThan(1)
    expect(names.some((n) => n === 'components/chat')).toBe(true)
    expect(names.some((n) => n === 'components/graph')).toBe(true)
    expect(names.every((n) => !n.endsWith('· partie'))).toBe(true)
  })
})
