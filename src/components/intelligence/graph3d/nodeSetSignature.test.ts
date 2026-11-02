import { describe, it, expect } from 'vitest'
import { nodeSetSignature } from './useGraph3DLayout'

// Regression: the 3D camera framing was keyed on the node COUNT (and on the
// boolean `needsRelayout`, which stays true), so two datasets with the same
// number of nodes kept the previous view's framing ("trop près / trop loin /
// nuage coupé"). `nodeSetSignature` must flip whenever the node set changes,
// same size or not.
describe('nodeSetSignature', () => {
  it('is empty for an empty set', () => {
    expect(nodeSetSignature([])).toBe('')
  })

  it('changes when the node set changes with the SAME count', () => {
    const a = [{ id: 'file:src/a.ts' }, { id: 'file:src/b.ts' }]
    const b = [{ id: 'file:src/x.ts' }, { id: 'file:src/y.ts' }]
    expect(a).toHaveLength(b.length)
    expect(nodeSetSignature(a)).not.toBe(nodeSetSignature(b))
  })

  it('is stable for the same set', () => {
    const a = [{ id: 'file:src/a.ts' }, { id: 'file:src/b.ts' }]
    expect(nodeSetSignature(a)).toBe(nodeSetSignature(a))
    expect(nodeSetSignature(a)).toBe(nodeSetSignature([...a]))
  })

  it('changes when the count changes', () => {
    expect(nodeSetSignature([{ id: 'a' }])).not.toBe(nodeSetSignature([{ id: 'a' }, { id: 'b' }]))
  })
})
