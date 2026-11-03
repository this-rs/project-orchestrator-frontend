import { describe, it, expect } from 'vitest'
import {
  LAYER_COLORS,
  LAYER_FALLBACK_COLOR,
  dominantLayer,
  layerColor,
  layerRgb,
  resolveNodeBaseRgb,
} from './layerColors'
import { prepareCommunityHulls } from './communityHullPrep'
import type { Graph3DNode } from './useGraph3DLayout'

describe('layerColor', () => {
  it('code, knowledge and pm differ', () => {
    const c = [layerColor('code'), layerColor('knowledge'), layerColor('pm')]
    expect(new Set(c).size).toBe(3)
  })
  it('all layers are pairwise distinct', () => {
    const v = Object.values(LAYER_COLORS)
    expect(new Set(v).size).toBe(v.length)
  })
  it('unknown layer → fallback, never undefined', () => {
    expect(layerColor('nope')).toBe(LAYER_FALLBACK_COLOR)
    expect(layerColor(undefined)).toBe(LAYER_FALLBACK_COLOR)
    expect(layerColor('toString')).toBe(LAYER_FALLBACK_COLOR)
    expect(layerRgb('nope')).toEqual(layerRgb(null))
  })
})

describe('resolveNodeBaseRgb', () => {
  const typeRgb = { r: 0.1, g: 0.2, b: 0.3 }
  it('aggregated follows the layer', () => {
    expect(resolveNodeBaseRgb(true, 'pm', typeRgb)).toEqual(layerRgb('pm'))
    expect(resolveNodeBaseRgb(true, 'code', typeRgb)).not.toEqual(resolveNodeBaseRgb(true, 'pm', typeRgb))
  })
  it('detail follows the entity type, whatever the layer', () => {
    expect(resolveNodeBaseRgb(false, 'pm', typeRgb)).toBe(typeRgb)
    expect(resolveNodeBaseRgb(false, 'code', typeRgb)).toBe(typeRgb)
  })
})

describe('dominantLayer', () => {
  it('most members wins', () => {
    expect(dominantLayer(['pm', 'code', 'code', 'knowledge'])).toBe('code')
  })
  it('tie is deterministic (alphabetical), independent of order', () => {
    expect(dominantLayer(['pm', 'code'])).toBe('code')
    expect(dominantLayer(['code', 'pm'])).toBe('code')
  })
})

describe('hull dominantLayer', () => {
  const mk = (i: number, layer: string, type: string): Graph3DNode =>
    ({ id: `n${i}`, label: '', entityType: type, layer, x: i, y: i % 3, z: i % 5, communityId: 1, data: {} }) as unknown as Graph3DNode
  it('is the layer with most members, not the dominant type', () => {
    const nodes: Graph3DNode[] = []
    for (let i = 0; i < 12; i++) nodes.push(mk(i, 'code', 'file'))
    for (let i = 12; i < 30; i++) nodes.push(mk(i, 'knowledge', 'file'))
    const [h] = prepareCommunityHulls(nodes)
    expect(h.dominantType).toBe('file')
    expect(h.dominantLayer).toBe('knowledge')
  })
})
