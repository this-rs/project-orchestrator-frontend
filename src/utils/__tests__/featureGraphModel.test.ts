import { describe, it, expect } from 'vitest'
import type { FeatureGraphEntity, FeatureGraphRelation } from '@/types'
import {
  MAX_EDGES,
  entityColors,
  layoutSubgraph,
  relationStyle,
  roleLabel,
  selectSubgraph,
} from '../featureGraphModel'

const ent = (i: number, role?: string, type = 'function'): FeatureGraphEntity => ({
  entity_type: type,
  entity_id: `e${i}`,
  name: `n${i}`,
  role,
})
const rel = (a: number, b: number, type = 'CALLS'): FeatureGraphRelation => ({
  source_type: 'Function',
  source_id: `e${a}`,
  target_type: 'Function',
  target_id: `e${b}`,
  relation_type: type,
})

describe('selectSubgraph', () => {
  it('ranks by role first, then degree, and keeps only relations between kept nodes', () => {
    const entities = [ent(0, 'support'), ent(1, 'support'), ent(2, 'core_logic'), ent(3, 'entry_point')]
    const relations = [rel(0, 1), rel(1, 0, 'IMPORTS'), rel(1, 2), rel(2, 3)]
    const sub = selectSubgraph(entities, relations, 3)
    expect(sub.nodes.map((n) => n.entity.entity_id)).toEqual(['e3', 'e2', 'e1'])
    expect(sub.relations.map((r) => `${r.source_id}>${r.target_id}`)).toEqual(['e1>e2', 'e2>e3'])
    expect(sub.totalRelations).toBe(4)
  })

  it('dedupes relations, ignores self loops and unknown endpoints', () => {
    const sub = selectSubgraph([ent(0), ent(1)], [rel(0, 1), rel(0, 1), rel(0, 0), rel(0, 9)], 10)
    expect(sub.relations).toHaveLength(1)
    expect(sub.totalRelations).toBe(1)
  })

  it('breaks ties on degree for unknown roles and handles limit 0', () => {
    const sub = selectSubgraph([ent(0, 'weird'), ent(1, 'weird')], [rel(1, 0)], 1)
    expect(sub.nodes).toHaveLength(1)
    expect(selectSubgraph([ent(0)], [], 0).nodes).toHaveLength(0)
  })

  it('caps edges', () => {
    const n = 400
    const entities = Array.from({ length: n }, (_, i) => ent(i))
    const relations: FeatureGraphRelation[] = []
    for (let i = 0; i < n; i++) for (let j = 0; j < 4; j++) relations.push(rel(i, (i + 1 + j * 37) % n))
    const sub = selectSubgraph(entities, relations, n)
    expect(sub.relations.length).toBeLessThanOrEqual(MAX_EDGES)
  })

  it('stays fast on 5000 entities / 15000 relations', () => {
    const n = 5000
    const entities = Array.from({ length: n }, (_, i) => ent(i, i % 2 ? 'support' : 'core_logic'))
    const relations = Array.from({ length: n * 3 }, (_, i) => rel(i % n, (i * 13 + 5) % n))
    const t0 = performance.now()
    const sub = selectSubgraph(entities, relations, 120)
    layoutSubgraph(sub)
    expect(sub.nodes).toHaveLength(120)
    expect(performance.now() - t0).toBeLessThan(2000)
  })
})

describe('layoutSubgraph', () => {
  it('lays out connected nodes with dagre and labels edges on small graphs', () => {
    const sub = selectSubgraph([ent(0), ent(1), ent(2)], [rel(0, 1), rel(1, 2)], 3)
    const layout = layoutSubgraph(sub)
    expect(layout.nodes).toHaveLength(3)
    expect(layout.edges).toHaveLength(2)
    expect(layout.edges[0].label).toBe('Calls')
    const ys = layout.nodes.map((n) => n.position.y)
    expect(new Set(ys).size).toBe(3)
    expect(layout.height).toBeGreaterThanOrEqual(400)
  })

  it('uses a static role grid when there are no edges (no graph algorithm)', () => {
    const entities = [ent(0, 'entry_point'), ...Array.from({ length: 13 }, (_, i) => ent(i + 1, 'core_logic')), ent(99, 'odd')]
    const layout = layoutSubgraph(selectSubgraph(entities, [], 100))
    expect(layout.edges).toHaveLength(0)
    const pos = new Set(layout.nodes.map((n) => `${n.position.x},${n.position.y}`))
    expect(pos.size).toBe(layout.nodes.length) // no overlap
  })

  it('drops edge labels on dense graphs', () => {
    const entities = Array.from({ length: 30 }, (_, i) => ent(i))
    const relations = Array.from({ length: 90 }, (_, i) => rel(i % 30, (i * 7 + 1 + 3 * Math.floor(i / 30)) % 30)).filter((r) => r.source_id !== r.target_id)
    const layout = layoutSubgraph(selectSubgraph(entities, relations, 30))
    expect(layout.edges.length).toBeGreaterThan(40)
    expect(layout.edges.every((e) => e.label === undefined)).toBe(true)
  })
})

describe('layered layout (big graphs)', () => {
  it('lays 2000 connected nodes out fast, without overlap, layering by depth, even with a cycle', () => {
    const n = 2000
    const entities = Array.from({ length: n }, (_, i) => ent(i))
    const relations = Array.from({ length: n - 1 }, (_, i) => rel(i, i + 1))
    relations.push(rel(n - 1, 0)) // cycle: no root at all
    relations.push(rel(5, 1000))
    const t0 = performance.now()
    const layout = layoutSubgraph(selectSubgraph(entities, relations, n))
    expect(performance.now() - t0).toBeLessThan(1500)
    expect(layout.nodes).toHaveLength(n)
    const pos = new Set(layout.nodes.map((x) => `${x.position.x},${x.position.y}`))
    expect(pos.size).toBe(n)
    const y = (id: string) => layout.nodes.find((x) => x.id === id)!.position.y
    expect(y('n1')).toBeGreaterThan(y('n0'))
  })

  it('carries a human label and the exact code name on every node', () => {
    const layout = layoutSubgraph(
      selectSubgraph([{ entity_type: 'function', entity_id: 'a.rs::build_system_prompt', name: 'build_system_prompt' }], [], 1),
    )
    expect(layout.nodes[0].data.label).toBe('Build system prompt')
    expect(layout.nodes[0].data.codeName).toBe('build_system_prompt')
  })
})

describe('vocabulary helpers', () => {
  it('falls back gracefully for unknown values', () => {
    expect(roleLabel(undefined)).toBe('Other')
    expect(roleLabel('core_logic')).toBe('Core Logic')
    expect(entityColors('nope').label).toBe('Other')
    expect(entityColors('file').label).toBe('File')
    expect(relationStyle('NOPE').label).toBe('Related')
    expect(relationStyle('IMPORTS').dashed).toBe(true)
  })
})
