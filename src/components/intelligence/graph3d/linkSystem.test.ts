import { describe, it, expect } from 'vitest'
import {
  buildLinkSystem,
  bundleTriangles,
  syntheticCorridor,
} from './linkSystem'
import { lodFor } from './linkLod'
import { describeMagnitude } from './linkMagnitude'

const corridorSet = (n: number, each: bigint): ReturnType<typeof syntheticCorridor>[] =>
  Array.from({ length: n }, (_, i) => syntheticCorridor(`c${i}`, `g${i}`, `g${i + 1}`, each))

describe('the GPU cost does not follow the relation count', () => {
  it('THE acceptance test: 50 corridors of 10^6 and of 10^9 cost the SAME', () => {
    // Same number of corridors, magnitudes 1 000× apart. If any code path scaled
    // the geometry with the relation count, this would differ by ~1000.
    const small = buildLinkSystem(corridorSet(50, 1_000_000n))
    const large = buildLinkSystem(corridorSet(50, 1_000_000_000n))

    expect(small.stats.triangles).toBe(large.stats.triangles)
    expect(small.stats.drawn).toBe(large.stats.drawn)
    // …while the exact quantities really are 1 000× apart.
    expect(large.stats.exactRelations / small.stats.exactRelations).toBe(1000n)
    expect(small.stats.exactRelations).toBe(50n * 1_000_000n)
    expect(large.stats.exactRelations).toBe(50n * 1_000_000_000n)
  })

  it('one corridor of 10^12 costs what one corridor of 10^3 costs', () => {
    const tiny = buildLinkSystem([syntheticCorridor('a', 'x', 'y', 1_000n)])
    const huge = buildLinkSystem([syntheticCorridor('a', 'x', 'y', 1_000_000_000_000n)])
    expect(huge.stats.triangles).toBe(tiny.stats.triangles)
    expect(huge.stats.exactRelations).toBe(1_000_000_000_000n)
  })

  it('scales with the number of CORRIDORS, which is what the budget bounds', () => {
    const ten = buildLinkSystem(corridorSet(10, 10_000n))
    const hundred = buildLinkSystem(corridorSet(100, 10_000n))
    expect(hundred.stats.triangles).toBeGreaterThan(ten.stats.triangles)
    expect(hundred.stats.drawn).toBe(100)
  })
})

describe('the budget is a ceiling, never a lie', () => {
  it('never exceeds maxTriangles, whatever the input', () => {
    for (const [n, each, budget] of [
      [10, 1n, 240_000],
      [1_000, 1_000_000n, 240_000],
      [5_000, 10n, 240_000],
      [200, 10n, 1_000],
      [50, 10n, 42],
    ] as const) {
      const system = buildLinkSystem(corridorSet(n, each), { maxTriangles: budget })
      expect(system.stats.triangles).toBeLessThanOrEqual(budget)
    }
  })

  it('falls back to a coarser shape rather than dropping a bundle it cannot afford', () => {
    // A budget that cannot hold every corridor at full depth still draws as many
    // as it can, and says how much of the graph it had to simplify.
    const system = buildLinkSystem(corridorSet(200, 10_000n), { maxTriangles: 2_000 })
    expect(system.stats.drawn).toBeLessThan(200)
    expect(system.stats.aggregated).toBe(true)
    // Nothing is lost from the ledger: the exact total is still reported.
    expect(system.stats.exactRelations).toBe(200n * 10_000n)
    expect(system.stats.drawnRelations).toBeLessThan(system.stats.exactRelations)
  })

  it('respects the corridor ceiling too', () => {
    const system = buildLinkSystem(corridorSet(100, 10n), { maxCorridors: 7 })
    expect(system.stats.drawn).toBe(7)
    expect(system.stats.aggregated).toBe(true)
    expect(system.stats.exactRelations).toBe(1_000n)
  })
})

describe('determinism and shape', () => {
  it('gives the same system whatever the input order', () => {
    const corridors = corridorSet(30, 5_000n)
    const forward = buildLinkSystem(corridors)
    const backward = buildLinkSystem([...corridors].reverse())
    expect(backward.stats).toEqual(forward.stats)
    expect(backward.bundles.map((b) => b.corridor.key)).toEqual(forward.bundles.map((b) => b.corridor.key))
  })

  it('gives the biggest bundles the budget first', () => {
    const corridors = [
      syntheticCorridor('small', 'a', 'b', 10n),
      syntheticCorridor('big', 'c', 'd', 1_000_000n),
      syntheticCorridor('mid', 'e', 'f', 1_000n),
    ]
    const system = buildLinkSystem(corridors, { maxCorridors: 1 })
    expect(system.bundles[0].corridor.key).toBe('big')
  })

  it('a drawn bundle carries its own LOD, strands and cost', () => {
    const system = buildLinkSystem([syntheticCorridor('a', 'x', 'y', 1_000_000_000n)])
    const [bundle] = system.bundles
    expect(bundle.lod.depth).toBeGreaterThanOrEqual(0)
    expect(bundle.strands).toBeGreaterThanOrEqual(1)
    expect(bundle.triangles).toBe(bundleTriangles(bundle.lod, bundle.morphology.graphical.channels < bundle.lod.depth ? bundle.strands : bundle.strands))
    expect(bundle.corridor.magnitude.magnitudeOrder).toBe(9)
  })

  it('refuses a negative budget instead of drawing nothing silently', () => {
    expect(() => buildLinkSystem([], { maxTriangles: -1 })).toThrow(RangeError)
  })

  it('handles an empty graph', () => {
    const system = buildLinkSystem([])
    expect(system.bundles).toEqual([])
    expect(system.stats.exactRelations).toBe(0n)
    expect(system.stats.aggregated).toBe(false)
  })
})

describe('the LOD is per corridor, not global', () => {
  it('two bundles at the same distance can sit at different depths', () => {
    // This is exactly what three global regimes could not express. The distance
    // must sit INSIDE the refinement zone (the default refines below 100), so
    // close to the graph rather than at the framing distance.
    const distance = 20
    const filament = lodFor(describeMagnitude(1n), distance)
    const macro = lodFor(describeMagnitude(10_000_000_000n), distance)
    expect(filament.depth).not.toBe(macro.depth)
    expect(macro.depth).toBeGreaterThan(filament.depth)
  })
})
