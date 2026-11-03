import { describe, it, expect } from 'vitest'
import { labelStructureKey, linkStructureKey, nodeStructureKey } from './graphStructureKey'
import type { Graph3DLink, Graph3DNode } from './useGraph3DLayout'

const node = (id: string, x = 0, extra: Partial<Graph3DNode> = {}): Graph3DNode =>
  ({ id, label: id, entityType: 'file', layer: 'code', x, y: 0, z: 0, data: {}, ...extra })
const link = (source: string, target: string, extra: Partial<Graph3DLink> = {}): Graph3DLink =>
  ({ source, target, relationType: 'IMPORTS', layer: 'code', color: '#fff', width: 1, particles: 0, particleSpeed: 0, isInterCommunity: false, ...extra })

describe('graph structure keys', () => {
  it('a refresh with the same entities, as new objects, keeps the key', () => {
    const a = [node('a'), node('b', 10)]
    const b = a.map((n) => ({ ...n, data: { ...n.data, energy: 0.9 } }))
    expect(nodeStructureKey(b)).toBe(nodeStructureKey(a))
    const la = [link('a', 'b')]
    expect(linkStructureKey(la.map((l) => ({ ...l })))).toBe(linkStructureKey(la))
  })

  it('reads link endpoints whether they are ids or the node objects the library swaps in', () => {
    const a = node('a')
    const b = node('b', 10)
    const asIds = [link('a', 'b')]
    const asObjects = [{ ...link('a', 'b'), source: a, target: b } as unknown as Graph3DLink]
    expect(linkStructureKey(asObjects)).toBe(linkStructureKey(asIds))
  })

  it('changes with the ids, their order, a move, or a regrouping', () => {
    const base = nodeStructureKey([node('a'), node('b', 10)])
    expect(nodeStructureKey([node('a'), node('c', 10)])).not.toBe(base)
    expect(nodeStructureKey([node('b', 10), node('a')])).not.toBe(base)
    expect(nodeStructureKey([node('a'), node('b', 11)])).not.toBe(base)
    expect(nodeStructureKey([node('a'), node('b', 10, { communityId: 3 })])).not.toBe(base)
  })

  it('changes with a link endpoint, relation or weight', () => {
    const base = linkStructureKey([link('a', 'b')])
    expect(linkStructureKey([link('a', 'c')])).not.toBe(base)
    expect(linkStructureKey([link('a', 'b', { relationType: 'CALLS' })])).not.toBe(base)
    expect(linkStructureKey([link('a', 'b', { weight: 0.7 })])).not.toBe(base)
  })

  it('a label key follows the text and the bundle size', () => {
    const base = labelStructureKey([node('g1', 0, { label: 'src', data: { count: 5 } })])
    expect(labelStructureKey([node('g1', 0, { label: 'lib', data: { count: 5 } })])).not.toBe(base)
    expect(labelStructureKey([node('g1', 0, { label: 'src', data: { count: 6 } })])).not.toBe(base)
  })

  it('is empty for an empty set', () => {
    expect(nodeStructureKey([])).toBe('')
    expect(linkStructureKey([])).toBe('')
  })
})
