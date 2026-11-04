import { describe, it, expect } from 'vitest'
import { declutterRects, selectLabeledNodes, SUPER_NODE_LABEL_LIMIT } from './superNodeLabels'
import type { Graph3DNode } from './useGraph3DLayout'

const superNode = (id: string, count: number): Graph3DNode => ({
  id, label: id, entityType: 'file', layer: 'code', x: 0, y: 0, z: 0,
  data: { count },
})

describe('selectLabeledNodes', () => {
  it('keeps only super-nodes (count > 1)', () => {
    const nodes = [superNode('a', 5), superNode('b', 1), superNode('c', 3)]
    expect(selectLabeledNodes(nodes).map((n) => n.id).sort()).toEqual(['a', 'c'])
  })

  it('picks the largest first', () => {
    const nodes = [superNode('small', 2), superNode('big', 9), superNode('mid', 5)]
    expect(selectLabeledNodes(nodes, 2).map((n) => n.id)).toEqual(['big', 'mid'])
  })

  it('respects the default label limit', () => {
    const nodes = Array.from({ length: 100 }, (_, i) => superNode('n' + i, 100 - i))
    const picked = selectLabeledNodes(nodes)
    expect(picked.length).toBe(SUPER_NODE_LABEL_LIMIT)
    expect(picked[0].id).toBe('n0')
    expect(picked[picked.length - 1].id).toBe('n' + (SUPER_NODE_LABEL_LIMIT - 1))
  })

  it('respects an explicit smaller limit', () => {
    const nodes = Array.from({ length: 10 }, (_, i) => superNode('n' + i, 10 - i))
    expect(selectLabeledNodes(nodes, 3).length).toBe(3)
  })

  it('returns the whole population when it is smaller than the limit', () => {
    const nodes = [superNode('a', 8), superNode('b', 6)]
    expect(selectLabeledNodes(nodes, 40)).toHaveLength(2)
  })
})

describe('declutterRects — names never pile up', () => {
  it('keeps the biggest group\'s name and hides the ones overlapping it', () => {
    const show = declutterRects([
      { x: 100, y: 100, w: 80, h: 14 }, // biggest group
      { x: 120, y: 104, w: 80, h: 14 }, // overlaps it → hidden
      { x: 100, y: 140, w: 80, h: 14 }, // below, clear → shown
      null, // behind the camera
    ])
    expect(show).toEqual([true, false, true, false])
  })

  it('a gap separates two names that merely touch', () => {
    expect(declutterRects([{ x: 0, y: 0, w: 50, h: 10 }, { x: 52, y: 0, w: 50, h: 10 }], 4)).toEqual([true, false])
    expect(declutterRects([{ x: 0, y: 0, w: 50, h: 10 }, { x: 60, y: 0, w: 50, h: 10 }], 4)).toEqual([true, true])
  })
})
