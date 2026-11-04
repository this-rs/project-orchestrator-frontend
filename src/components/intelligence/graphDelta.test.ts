import { describe, it, expect } from 'vitest'
import { mergeEdgeList, mergeGraphDelta, mergeWorkspaceDelta } from './graphDelta'

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

describe('mergeEdgeList', () => {
  const x = (s: string, t: string) => ({ source: s, target: t, type: 'SHARES', layer: 'code' })

  it('upserts and removes by key, without requiring the endpoints to be known', () => {
    const out = mergeEdgeList([x('p1:a', 'p2:b'), x('p1:c', 'p2:d')], [x('p1:e', 'p2:f')], [
      { source: 'p1:c', target: 'p2:d', edge_type: 'SHARES' },
    ])
    expect(out.map((e) => `${e.source}>${e.target}`).sort()).toEqual(['p1:a>p2:b', 'p1:e>p2:f'])
  })
})

describe('mergeWorkspaceDelta', () => {
  const n = (id: string) => ({ id, type: 'file', label: id, layer: 'code' })
  const e = (s: string, t: string) => ({ source: s, target: t, type: 'IMPORTS', layer: 'code' })
  const base = {
    nodes: [n('a'), n('b'), n('c')],
    edges: [e('a', 'b')],
    cross_project_edges: [e('a', 'c'), e('b', 'c')],
    projects: [{ id: 'p1' }, { id: 'p2' }],
  }

  it('folds nodes, edges and cross-project edges together', () => {
    const out = mergeWorkspaceDelta(base, { nodes: [n('d')], edges: [], cross_project_edges: [e('d', 'a')] })
    expect(out.nodes.map((x) => x.id).sort()).toEqual(['a', 'b', 'c', 'd'])
    expect(out.cross_project_edges.map((x) => `${x.source}>${x.target}`).sort()).toEqual(['a>c', 'b>c', 'd>a'])
  })

  it('a deleted node takes its cross-project edges with it', () => {
    const out = mergeWorkspaceDelta(base, { nodes: [], edges: [], deleted_nodes: [{ id: 'c' }] })
    expect(out.nodes.map((x) => x.id).sort()).toEqual(['a', 'b'])
    expect(out.cross_project_edges).toEqual([])
    expect(out.edges).toHaveLength(1)
  })

  it('keeps the project list unless the delta carries one', () => {
    expect(mergeWorkspaceDelta(base, { nodes: [], edges: [] }).projects).toEqual(base.projects)
    expect(mergeWorkspaceDelta(base, { nodes: [], edges: [], projects: [{ id: 'p3' }] }).projects).toEqual([{ id: 'p3' }])
  })

  it('does not mutate the base snapshot', () => {
    const before = JSON.stringify(base)
    mergeWorkspaceDelta(base, { nodes: [n('z')], edges: [e('z', 'a')], cross_project_edges: [e('z', 'b')], deleted_nodes: [{ id: 'a' }] })
    expect(JSON.stringify(base)).toBe(before)
  })
})
