import { describe, it, expect } from 'vitest'
import type { NeighborhoodNode, NeighborhoodResponse } from '@/services/neighborhood'
import { neighborhoodQuery } from '@/services/neighborhood'
import { clamp01, pathToCenter, radialLayout } from '../radialLayout'
import { entityHref } from '../entityHref'
import { layerCounts, relLabel, typeColor, typeLabel, FALLBACK_COLOR } from '../entityVisuals'
import { noteNeighborhood } from './fixtures'

const SIZE = 600

function allNumbers(o: Record<string, unknown>): number[] {
  return Object.values(o).filter((v): v is number => typeof v === 'number')
}

/** Deterministic PRNG (mulberry32) for big synthetic graphs. */
function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function bigGraph(n: number): NeighborhoodResponse {
  const rand = rng(42)
  const types = ['note', 'decision', 'file', 'function', 'task', 'commit', 'weird_type']
  const nodes: NeighborhoodNode[] = [
    { id: 'c', type: 'task', label: 'center', weight: 1, depth: 0, layer: 'planning' },
  ]
  for (let i = 0; i < n; i++) {
    nodes.push({
      id: `x${i}`,
      type: types[Math.floor(rand() * types.length)],
      label: `node ${i}`,
      weight: rand(),
      depth: 1 + Math.floor(rand() * 3),
      layer: 'code',
    })
  }
  const edges = nodes.slice(1).map((nd, i) => ({
    source: i % 3 === 0 ? 'c' : `x${Math.floor(i / 2)}`,
    target: nd.id,
    rel: 'LINKED_TO',
    weight: rand(),
    layer: 'code',
  }))
  return {
    center: { id: 'c', type: 'task' },
    nodes,
    edges,
    truncated: false,
    stats: { by_type: {}, by_rel: {}, total_before_limit: n + 1 },
  }
}

describe('radialLayout', () => {
  it('puts the center in the middle and one ring per depth', () => {
    const layout = radialLayout(noteNeighborhood(), SIZE)
    const center = layout.byId.get('n1')!
    expect(center.isCenter).toBe(true)
    expect([center.x, center.y]).toEqual([300, 300])
    expect(layout.rings.map((r) => r.depth)).toEqual([1, 2])
    expect(layout.rings.map((r) => r.count)).toEqual([4, 4])
    expect(layout.rings[1].radius).toBeGreaterThan(layout.rings[0].radius)

    for (const n of layout.nodes) {
      if (n.isCenter) continue
      const dist = Math.hypot(n.x - 300, n.y - 300)
      const ring = layout.rings.find((r) => r.depth === n.depth)!
      expect(dist).toBeCloseTo(ring.radius, 0)
    }
  })

  it('is deterministic: same picture whatever the input order', () => {
    const g = noteNeighborhood()
    const a = radialLayout(g, SIZE)
    const shuffled = {
      ...g,
      nodes: [...g.nodes].reverse(),
      edges: [...g.edges].reverse(),
    }
    const b = radialLayout(shuffled, SIZE)
    const pos = (l: typeof a) =>
      Object.fromEntries(l.nodes.map((n) => [n.id, [n.x, n.y, n.r, n.opacity]]))
    expect(pos(b)).toEqual(pos(a))
    expect(b.edges.map((e) => e.key)).toEqual(a.edges.map((e) => e.key))
  })

  it('groups a ring by type (contiguous) then by weight', () => {
    const layout = radialLayout(bigGraph(120), SIZE)
    for (const ring of layout.rings) {
      const onRing = layout.nodes
        .filter((n) => n.depth === ring.depth && !n.isCenter)
        .sort((a, b) => a.angle - b.angle)
      const seenTypes: string[] = []
      for (const n of onRing) {
        if (seenTypes[seenTypes.length - 1] !== n.type) {
          expect(seenTypes).not.toContain(n.type) // each type appears in one block
          seenTypes.push(n.type)
        }
      }
      // Inside a type block, weights are non-increasing.
      for (let i = 1; i < onRing.length; i++) {
        if (onRing[i].type === onRing[i - 1].type) {
          expect(onRing[i].weight).toBeLessThanOrEqual(onRing[i - 1].weight)
        }
      }
    }
  })

  it('has no NaN and keeps every node inside the viewBox (300 nodes)', () => {
    const layout = radialLayout(bigGraph(300), SIZE)
    expect(layout.nodes).toHaveLength(301)
    for (const n of layout.nodes) {
      for (const v of allNumbers(n as unknown as Record<string, unknown>)) {
        expect(Number.isFinite(v)).toBe(true)
      }
      expect(n.x - n.r).toBeGreaterThanOrEqual(0)
      expect(n.y - n.r).toBeGreaterThanOrEqual(0)
      expect(n.x + n.r).toBeLessThanOrEqual(SIZE)
      expect(n.y + n.r).toBeLessThanOrEqual(SIZE)
    }
    for (const e of layout.edges) {
      for (const v of allNumbers(e as unknown as Record<string, unknown>)) {
        expect(Number.isFinite(v)).toBe(true)
      }
    }
    // Dense rings hide most labels.
    expect(layout.nodes.filter((n) => n.showLabel).length).toBeLessThan(60)
  })

  it('scales node radius / opacity and edge width with weight ("relief")', () => {
    const layout = radialLayout(noteNeighborhood(), SIZE)
    const strong = layout.byId.get('d1')!
    const weak = layout.byId.get('fn1')!
    expect(strong.r).toBeGreaterThan(weak.r)
    expect(strong.opacity).toBeGreaterThan(weak.opacity)
    const eStrong = layout.edges.find((e) => e.target === 'd1')!
    const eWeak = layout.edges.find((e) => e.target === 's1')!
    expect(eStrong.strokeWidth).toBeGreaterThan(eWeak.strokeWidth)
    expect(eStrong.opacity).toBeGreaterThan(eWeak.opacity)
    // strongest edges painted last
    expect(layout.edges[layout.edges.length - 1].target).toBe('d1')
  })

  it('survives garbage input: missing center node, NaN weights, bad depth, dangling edges, bad size', () => {
    const layout = radialLayout(
      {
        center: { id: 'ghost', type: 'decision' },
        nodes: [
          { id: 'a', type: 'note', label: 'a', weight: Number.NaN, depth: Number.NaN, layer: 'k' },
          { id: 'a', type: 'note', label: 'dup', weight: 1, depth: 1, layer: 'k' },
          { id: 'b', type: 'note', label: 'b', weight: 7, depth: 9, layer: 'k' },
        ],
        edges: [
          { source: 'ghost', target: 'a', rel: 'X', weight: 0.5, layer: 'k' },
          { source: 'ghost', target: 'a', rel: 'X', weight: 0.5, layer: 'k' },
          { source: 'a', target: 'nowhere', rel: 'X', weight: 0.5, layer: 'k' },
          { source: 'a', target: 'a', rel: 'SELF', weight: 0.5, layer: 'k' },
        ],
      },
      Number.NaN
    )
    expect(layout.size).toBe(600)
    expect(layout.centerId).toBe('ghost')
    expect(layout.nodes.map((n) => n.id)).toEqual(['ghost', 'a', 'b'])
    expect(layout.byId.get('a')!.depth).toBe(1)
    expect(layout.byId.get('b')!.depth).toBe(3)
    expect(layout.byId.get('b')!.weight).toBe(1)
    expect(layout.edges).toHaveLength(1)
  })

  it('handles a center-only graph', () => {
    const layout = radialLayout({ center: { id: 'c', type: 'note' }, nodes: [], edges: [] }, SIZE)
    expect(layout.nodes).toHaveLength(1)
    expect(layout.rings).toEqual([])
  })
})

describe('pathToCenter', () => {
  it('returns the relations on the shortest path', () => {
    const g = noteNeighborhood()
    expect(pathToCenter(g, 'n1')).toEqual([])
    expect(pathToCenter(g, 'd1')).toEqual([{ from: 'n1', to: 'd1', rel: 'LINKED_TO' }])
    expect(pathToCenter(g, 'p1')).toEqual([
      { from: 'n1', to: 't1', rel: 'LINKED_TO' },
      { from: 't1', to: 'p1', rel: 'HAS_TASK' },
    ])
    // edges are undirected: c1 -TOUCHES-> f1
    expect(pathToCenter(g, 'c1')?.map((s) => s.rel)).toEqual(['ATTACHED_TO', 'TOUCHES'])
  })

  it('returns null when unreachable', () => {
    expect(pathToCenter({ center: { id: 'a', type: 'note' }, edges: [] }, 'b')).toBeNull()
  })
})

describe('helpers', () => {
  it('clamp01', () => {
    expect(clamp01(undefined)).toBe(0)
    expect(clamp01(Number.NaN, 1)).toBe(1)
    expect(clamp01(-1)).toBe(0)
    expect(clamp01(2)).toBe(1)
  })

  it('entityHref maps App.tsx routes and returns null for pages that do not exist', () => {
    expect(entityHref('decision', 'd1', 'ws')).toBe('/workspace/ws/decisions/d1')
    expect(entityHref('feature_graph', 'fg', 'ws')).toBe('/workspace/ws/feature-graphs/fg')
    expect(entityHref('chat_session', 's', 'ws')).toBe('/workspace/ws/chat/s')
    expect(entityHref('project', 'my-proj', 'ws')).toBe('/workspace/ws/projects/my-proj')
    expect(entityHref('note', 'n1', 'ws')).toBeNull()
    expect(entityHref('file', 'f', 'ws')).toBeNull()
    expect(entityHref('task', 't', '')).toBeNull()
  })

  it('layerCounts sums stats.by_type per layer', () => {
    const g = noteNeighborhood()
    expect(layerCounts(g.stats, g.nodes)).toEqual({
      knowledge: 2,
      code: 21,
      planning: 2,
      neural: 2,
    })
    expect(layerCounts(undefined)).toEqual({})
    expect(layerCounts({ by_type: { alien: 3 } })).toEqual({})
  })

  it('visual helpers fall back gracefully', () => {
    expect(typeColor('nope')).toBe(FALLBACK_COLOR)
    expect(typeLabel('decision')).toBe('Decision')
    expect(typeLabel('nope')).toBe('nope')
    expect(relLabel('LINKED_TO_TASK')).toBe('linked to task')
  })

  it('neighborhoodQuery serializes the data contract', () => {
    expect(
      neighborhoodQuery({
        entityType: 'note',
        entityId: 'n1',
        depth: 2,
        minWeight: 0.30000000000000004,
        limit: 150,
        layers: ['code', 'knowledge'],
      })
    ).toBe(
      '?entity_type=note&entity_id=n1&depth=2&min_weight=0.3&limit=150&layers=code%2Cknowledge'
    )
  })
})
