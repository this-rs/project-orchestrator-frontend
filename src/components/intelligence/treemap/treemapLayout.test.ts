import { describe, it, expect } from 'vitest'
import {
  buildFileMetrics, buildTree, findEntry, breadcrumbFor, squarify, layoutFolder, prismColor,
  type TmNode, type TmEdge,
} from './treemapLayout'

const file = (path: string, extra: Record<string, unknown> = {}): TmNode => ({
  id: `file:${path}`,
  data: { entityType: 'file', path, ...extra },
})

describe('buildFileMetrics', () => {
  it('weights by pagerank, derives risk and badges from edges', () => {
    const nodes: TmNode[] = [
      file('src/a.ts', { pagerank: 0.5, riskLevel: 'high' }),
      file('src/b.ts', { pagerank: 0.1, betweenness: 0.3 }),
      { id: 'n1', data: { entityType: 'note' } },
      { id: 'd1', data: { entityType: 'decision' } },
      { id: 't1', data: { entityType: 'task', status: 'pending' } },
      { id: 't2', data: { entityType: 'task', status: 'completed' } },
    ]
    const edges: TmEdge[] = [
      { source: 'n1', target: 'file:src/a.ts', type: 'LINKED_TO' },
      { source: 'd1', target: 'file:src/a.ts', type: 'AFFECTS' },
      { source: 't1', target: 'file:src/a.ts', type: 'TOUCHES' },
      { source: 't2', target: 'file:src/a.ts', type: 'TOUCHES' },
      { source: 'file:src/a.ts', target: 'file:src/b.ts', type: 'CO_CHANGED' },
      { source: 'file:src/a.ts', target: 'file:src/b.ts', type: 'IMPORTS' },
    ]
    const [a, b] = buildFileMetrics(nodes, edges)
    expect(a).toMatchObject({ weight: 0.5, risk: 0.75, notes: 1, decisions: 1, tasks: 2, openTasks: 1, churn: 1 })
    expect(b).toMatchObject({ weight: 0.1, risk: 0.3, notes: 0, churn: 1 })
  })
  it('falls back to weight 1 without pagerank/loc', () => {
    expect(buildFileMetrics([file('x.ts')], [])[0].weight).toBe(1)
  })
})

describe('buildTree', () => {
  const files = buildFileMetrics(
    [file('src/ui/a.ts'), file('src/ui/b.ts'), file('src/core/deep/c.ts'), file('README.md')],
    [],
  )
  const root = buildTree(files)
  it('aggregates weights and collapses single-child chains', () => {
    expect(root.weight).toBe(4)
    expect(root.fileCount).toBe(4)
    const src = root.children.find((c) => c.name === 'src')!
    expect(src.fileCount).toBe(3)
    const core = src.children.find((c) => c.name.startsWith('core'))!
    expect(core.name).toBe('core/deep')
    expect(core.path).toBe('src/core/deep')
  })
  it('finds entries and builds breadcrumbs', () => {
    expect(findEntry(root, 'src/core/deep')?.fileCount).toBe(1)
    expect(findEntry(root, 'nope')).toBeNull()
    expect(breadcrumbFor(root, 'src/core/deep').map((c) => c.path)).toEqual(['', 'src', 'src/core/deep'])
  })
})

describe('squarify', () => {
  it('tiles the rect without overlap and proportionally', () => {
    const rect = { x: 0, y: 0, w: 200, h: 100 }
    const out = squarify([{ value: 6 }, { value: 3 }, { value: 2 }, { value: 1 }], rect)
    expect(out).toHaveLength(4)
    const area = out.reduce((s, o) => s + o.rect.w * o.rect.h, 0)
    expect(area).toBeCloseTo(200 * 100, 3)
    const first = out.find((o) => o.item.value === 6)!
    expect(first.rect.w * first.rect.h).toBeCloseTo((6 / 12) * 20000, 3)
    for (const o of out) {
      expect(o.rect.x).toBeGreaterThanOrEqual(-1e-6)
      expect(o.rect.x + o.rect.w).toBeLessThanOrEqual(200 + 1e-6)
      expect(o.rect.y + o.rect.h).toBeLessThanOrEqual(100 + 1e-6)
    }
  })
  it('handles empty and degenerate input', () => {
    expect(squarify([], { x: 0, y: 0, w: 10, h: 10 })).toEqual([])
    expect(squarify([{ value: 1 }], { x: 0, y: 0, w: 0, h: 10 })).toEqual([])
  })
})

describe('layoutFolder / prismColor', () => {
  it('normalises intensity to the strongest sibling', () => {
    const files = buildFileMetrics(
      [file('a.ts', { riskLevel: 'critical' }), file('b.ts', { riskLevel: 'medium' })],
      [],
    )
    const placed = layoutFolder(buildTree(files), { x: 0, y: 0, w: 100, h: 100 }, 'risk')
    const byName = Object.fromEntries(placed.map((p) => [p.entry.name, p.intensity]))
    expect(byName['a.ts']).toBe(1)
    expect(byName['b.ts']).toBeCloseTo(0.4)
  })
  it('uses PO tokens only', () => {
    expect(prismColor('risk', 1)).toContain('var(--color-error)')
    expect(prismColor('knowledge', 0)).toContain('var(--color-surface-raised)')
  })
})
