import { describe, it, expect } from 'vitest'
import {
  DEGROUP_DISTANCE_RATIO,
  REGROUP_DISTANCE_RATIO,
  characteristicClusterRadius,
  nextScaleLevel,
  superNodeRadius,
} from './scaleDecision'
import type { Graph3DNode } from './useGraph3DLayout'

const superNode = (count: number): Graph3DNode => ({
  id: `c${count}`,
  label: `c${count}`,
  entityType: 'file',
  layer: 'fabric',
  x: 0,
  y: 0,
  z: 0,
  data: { count },
})
const plain = (id: string): Graph3DNode => ({
  id,
  label: id,
  entityType: 'file',
  layer: 'code',
  x: 0,
  y: 0,
  z: 0,
  data: {},
})

describe('nextScaleLevel', () => {
  const radius = 10

  it('regroups (level +1) when the camera is clearly far out', () => {
    const far = REGROUP_DISTANCE_RATIO * radius * 1.5
    expect(nextScaleLevel(far, radius, 0)).toBe(1)
    expect(nextScaleLevel(far, radius, 1)).toBe(2)
  })

  it('degroups (level −1) when the camera is close enough to resolve members', () => {
    const close = DEGROUP_DISTANCE_RATIO * radius * 0.5
    expect(nextScaleLevel(close, radius, 1)).toBe(0)
    expect(nextScaleLevel(close, radius, 2)).toBe(1)
  })

  it('holds the level in the dead zone between the two thresholds (hysteresis)', () => {
    const mid = ((DEGROUP_DISTANCE_RATIO + REGROUP_DISTANCE_RATIO) / 2) * radius
    expect(nextScaleLevel(mid, radius, 1)).toBe(1)
    expect(nextScaleLevel(mid, radius, 2)).toBe(2)
  })

  it('never degroups below level 0', () => {
    expect(nextScaleLevel(radius * 0.1, radius, 0)).toBe(0)
  })

  it('stays aggregated when close-ish but members are not yet readable', () => {
    // 4× the cluster radius: close by the old graph-radius yardstick, but still
    // in the dead zone → no premature degroup.
    expect(nextScaleLevel(4 * radius, radius, 1)).toBe(1)
  })

  it('does not change level without a real cluster radius', () => {
    expect(nextScaleLevel(radius * 0.1, 0, 1)).toBe(1)
    expect(nextScaleLevel(Number.NaN, radius, 1)).toBe(1)
    expect(nextScaleLevel(radius, Number.POSITIVE_INFINITY, 1)).toBe(1)
  })
})

describe('superNodeRadius', () => {
  it('grows as √count and returns 0 for singletons and plain nodes', () => {
    expect(superNodeRadius(superNode(1))).toBe(0)
    expect(superNodeRadius(superNode(4))).toBeCloseTo(3 + 2.6 * 2, 10)
    expect(superNodeRadius(plain('a'))).toBe(0)
  })
})

describe('characteristicClusterRadius', () => {
  it('is the median super-node radius, ignoring singletons', () => {
    const nodes = [superNode(1), superNode(4), superNode(9), superNode(16), plain('p')]
    // radii: 0, 8.2, 10.8, 13.4 → median of [8.2, 10.8, 13.4] = 10.8
    expect(characteristicClusterRadius(nodes)).toBeCloseTo(3 + 2.6 * 3, 10)
  })

  it('is 0 when there are no real clusters', () => {
    expect(characteristicClusterRadius([plain('a'), plain('b')])).toBe(0)
    expect(characteristicClusterRadius([])).toBe(0)
  })
})
