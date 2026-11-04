import { describe, it, expect } from 'vitest'
import { mergeGraphDelta } from './graphDelta'

const n = (id: string, label = id) => ({ id, type: 'file', label, layer: 'code' })
const e = (s: string, t: string, type = 'IMPORTS') => ({ source: s, target: t, type, layer: 'code' })

describe('mergeGraphDelta', () => {
  const base = { nodes: [n('a'), n('b'), n('c')], edges: [e('a', 'b'), e('b', 'c')] }

  it('upserts changed nodes and keeps the rest', () => {
    const out = mergeGraphDelta(base, { nodes: [n('b', 'B2')], edges: [] })
    expect(out.nodes.map((x) => x.id).sort()).toEqual(['a', 'b', 'c'])
    expect(out.nodes.find((x) => x.id === 'b')?.label).toBe('B2')
  })

  it('removes deleted nodes and the edges that touched them', () => {
    const out = mergeGraphDelta(base, { nodes: [], edges: [], deleted_nodes: [{ id: 'b' }] })
    expect(out.nodes.map((x) => x.id).sort()).toEqual(['a', 'c'])
    expect(out.edges).toEqual([])
  })

  it('adds an edge and removes one by its key', () => {
    const out = mergeGraphDelta(base, {
      nodes: [],
      edges: [e('a', 'c')],
      deleted_edges: [{ source: 'b', target: 'c', edge_type: 'IMPORTS' }],
    })
    expect(out.edges.map((x) => `${x.source}>${x.target}`).sort()).toEqual(['a>b', 'a>c'])
  })

  it('a node deleted then recreated with the same id keeps its newest state', () => {
    const out = mergeGraphDelta(base, { nodes: [n('b', 'new')], edges: [], deleted_nodes: [{ id: 'b' }] })
    expect(out.nodes.find((x) => x.id === 'b')?.label).toBe('new')
  })

  it('does not mutate the base snapshot', () => {
    const before = JSON.stringify(base)
    mergeGraphDelta(base, { nodes: [n('z')], edges: [e('z', 'a')], deleted_nodes: [{ id: 'a' }] })
    expect(JSON.stringify(base)).toBe(before)
  })

  it('an empty delta leaves the snapshot as it was', () => {
    const out = mergeGraphDelta(base, { nodes: [], edges: [] })
    expect(out.nodes).toHaveLength(3)
    expect(out.edges).toHaveLength(2)
  })
})
