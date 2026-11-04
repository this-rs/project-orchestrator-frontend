import { describe, it, expect } from 'vitest'
import type { BackendGraphNode, BackendGraphEdge } from '@/types/intelligence'
import { cellCentre, layoutBackdrop } from './workspaceBackdrop'

const node = (id: string, path?: string, community?: number): BackendGraphNode => ({
  id,
  type: 'file',
  label: id,
  layer: 'code',
  attributes: { ...(path ? { file_path: path } : {}), ...(community != null ? { community_id: community } : {}) },
})
const edge = (source: string, target: string): BackendGraphEdge => ({ source, target, type: 'IMPORTS', layer: 'code' })

describe('layoutBackdrop', () => {
  it('returns nothing for no workspace', () => {
    expect(layoutBackdrop([])).toEqual([])
  })

  it('keeps every point inside the unit square, with no NaN', () => {
    const nodes = Array.from({ length: 40 }, (_, i) => node(`src/m${i % 5}/f${i}.ts`, `src/m${i % 5}/f${i}.ts`, i % 4))
    const edges = [edge('src/m0/f0.ts', 'src/m0/f5.ts'), edge('src/m1/f1.ts', 'src/m2/f2.ts')]
    const [layer] = layoutBackdrop([{ slug: 'alpha', graph: { nodes, edges } }])
    expect(layer.points).toHaveLength(40)
    for (const p of layer.points) {
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true)
      expect(Math.abs(p.x)).toBeLessThanOrEqual(1 + 1e-9)
      expect(Math.abs(p.y)).toBeLessThanOrEqual(1 + 1e-9)
    }
  })

  it('drops edges whose endpoint is not in the graph', () => {
    const nodes = [node('a', 'src/a.ts'), node('b', 'src/b.ts')]
    const edges = [edge('a', 'b'), edge('a', 'ghost')]
    const [layer] = layoutBackdrop([{ slug: 'w', graph: { nodes, edges } }])
    expect(layer.edges).toEqual([[0, 1]])
    expect(layer.points.map((p) => p.degree)).toEqual([1, 1])
  })

  it('prefixes ids by workspace, so a shared file path never merges two projects', () => {
    const shared = [node('src/main.ts', 'src/main.ts')]
    const layers = layoutBackdrop([
      { slug: 'one', graph: { nodes: shared, edges: [] } },
      { slug: 'two', graph: { nodes: shared, edges: [] } },
    ])
    expect(layers).toHaveLength(2)
    expect(layers[0].points).toHaveLength(1)
    expect(layers[1].points).toHaveLength(1)
  })

  it('gives each workspace its own hue', () => {
    const g = { nodes: [node('a', 'a.ts')], edges: [] }
    const layers = layoutBackdrop([
      { slug: 'x', graph: g },
      { slug: 'y', graph: g },
      { slug: 'z', graph: g },
    ])
    expect(new Set(layers.map((l) => l.hue)).size).toBe(3)
  })
})

describe('cellCentre', () => {
  it('places n workspaces on a grid whose cells stay inside [0, 1]', () => {
    for (let n = 1; n <= 12; n++) {
      const seen = new Set<string>()
      for (let i = 0; i < n; i++) {
        const { cx, cy } = cellCentre(i, n)
        expect(cx).toBeGreaterThan(0)
        expect(cx).toBeLessThan(1)
        expect(cy).toBeGreaterThan(0)
        expect(cy).toBeLessThan(1)
        seen.add(`${cx.toFixed(4)},${cy.toFixed(4)}`)
      }
      expect(seen.size).toBe(n)
    }
  })
})
