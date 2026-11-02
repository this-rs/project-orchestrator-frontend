import { describe, it, expect } from 'vitest'
import { detectCommunities, type CommunityEdge } from './communityDetect'

/** Two cliques of `size` nodes, optionally joined by a single bridge edge. */
function twoCliques(size: number, bridge = true): { nodes: string[]; edges: CommunityEdge[] } {
  const A = Array.from({ length: size }, (_, i) => `a${i}`)
  const B = Array.from({ length: size }, (_, i) => `b${i}`)
  const edges: CommunityEdge[] = []
  const connect = (group: string[]) => {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        edges.push({ source: group[i], target: group[j] })
      }
    }
  }
  connect(A)
  connect(B)
  if (bridge) edges.push({ source: A[0], target: B[0] })
  return { nodes: [...A, ...B], edges }
}

describe('detectCommunities', () => {
  it('splits two 20-node cliques joined by one edge into exactly two communities', () => {
    const { nodes, edges } = twoCliques(20)
    const partition = detectCommunities(nodes, edges)

    const cliqueA = new Set(nodes.slice(0, 20).map((id) => partition.get(id)))
    const cliqueB = new Set(nodes.slice(20).map((id) => partition.get(id)))

    // Each clique lands in a single community, and the two communities differ.
    expect(cliqueA.size).toBe(1)
    expect(cliqueB.size).toBe(1)
    expect([...cliqueA][0]).not.toBe([...cliqueB][0])
    // …and there is no third community.
    expect(new Set(nodes.map((id) => partition.get(id))).size).toBe(2)
  })

  it('is deterministic — identical input yields the identical partition', () => {
    const { nodes, edges } = twoCliques(5)
    const p1 = detectCommunities(nodes, edges)
    const p2 = detectCommunities(nodes, edges)

    expect(p1.size).toBe(p2.size)
    for (const [id, community] of p1) {
      expect(p2.get(id)).toBe(community)
    }
  })

  it('keeps a star graph (1 hub + 50 leaves) in a single community', () => {
    const nodes = ['hub', ...Array.from({ length: 50 }, (_, i) => `leaf${i}`)]
    const edges: CommunityEdge[] = nodes.slice(1).map((leaf) => ({ source: 'hub', target: leaf }))

    const partition = detectCommunities(nodes, edges)
    const communities = new Set(nodes.map((id) => partition.get(id)))
    expect(communities.size).toBe(1)
  })

  it('isolates every node for an empty graph or a graph with no edges', () => {
    expect(detectCommunities([], []).size).toBe(0)

    const nodes = Array.from({ length: 10 }, (_, i) => `n${i}`)
    const partition = detectCommunities(nodes, [])
    expect(partition.size).toBe(10)
    // Every node its own community, no exception.
    expect(new Set(nodes.map((id) => partition.get(id))).size).toBe(10)
  })

  it('returns a complete partition on a 5 000-node graph (no interruption)', () => {
    const N = 5000
    const nodes = Array.from({ length: N }, (_, i) => `n${i}`)
    // A connected chain of N-1 edges — detection must traverse the whole graph.
    const edges: CommunityEdge[] = Array.from({ length: N - 1 }, (_, i) => ({
      source: `n${i}`,
      target: `n${i + 1}`,
    }))

    const startedAt = Date.now()
    const partition = detectCommunities(nodes, edges)
    const elapsed = Date.now() - startedAt

    expect(partition.size).toBe(N)
    for (const id of nodes) expect(typeof partition.get(id)).toBe('number')
    // The internal budget is 400 ms; this is a generous ceiling that only guards
    // against an accidental hang, never against a slow-but-valid partition.
    expect(elapsed).toBeLessThan(15000)
  })

  it('returns the best partition reached when the budget is already exhausted', () => {
    const { nodes, edges } = twoCliques(10)
    const partition = detectCommunities(nodes, edges, { timeBudgetMs: 0 })

    // Complete — every node still gets a community, never an exception.
    expect(partition.size).toBe(nodes.length)
    for (const id of nodes) expect(typeof partition.get(id)).toBe('number')
  })
})
