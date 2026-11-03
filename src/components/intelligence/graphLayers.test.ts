import { describe, expect, it } from 'vitest'
import { dropLayers, splitBudget } from './graphLayers'

describe('splitBudget', () => {
  it('sums to exactly the budget when it does not divide', () => {
    const parts = splitBudget(20_000, ['code', 'knowledge', 'pm', 'skills', 'behaviour', 'neural'])
    expect(parts.reduce((a, b) => a + b, 0)).toBe(20_000)
    expect(parts).toEqual([3334, 3334, 3333, 3333, 3333, 3333])
  })

  it('gives everything to a single layer', () => {
    expect(splitBudget(5_000, ['code'])).toEqual([5_000])
  })

  it('returns nothing for no layer, and never a negative share', () => {
    expect(splitBudget(5_000, [])).toEqual([])
    expect(splitBudget(-10, ['code', 'pm'])).toEqual([0, 0])
  })
})

describe('dropLayers', () => {
  const nodes = [
    { id: 'a', layer: 'code' },
    { id: 'b', layer: 'knowledge' },
    { id: 'c', layer: 'code' },
  ]

  it('removes the nodes of a layer that is no longer shown', () => {
    // THE invariant the reverted loader was missing.
    const kept = dropLayers(nodes, ['code'])
    expect(kept.map((n) => n.id)).toEqual(['a', 'c'])
  })

  it('keeps everything when all layers are shown', () => {
    expect(dropLayers(nodes, ['code', 'knowledge'])).toBe(nodes)
  })

  it('empties the list when nothing is shown, and returns a new array', () => {
    const kept = dropLayers(nodes, [])
    expect(kept).toEqual([])
    expect(kept).not.toBe(nodes)
  })
})
