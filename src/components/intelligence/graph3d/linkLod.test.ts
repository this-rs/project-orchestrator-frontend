import { describe, expect, it } from 'vitest'
import { DEFAULT_LOD_OPTIONS, lodFor, maxUsefulDepth } from './linkLod'
import { describeMagnitude } from './linkMagnitude'

const FIXTURES: bigint[] = [1n, 10n, 100n, 1000n, 10000n, 10n ** 6n, 10n ** 9n, 10n ** 12n]
const mag = (n: bigint) => describeMagnitude(n)
const OPT = { refineBelow: 100, collapseAbove: 150 }

describe('maxUsefulDepth', () => {
  it('0 pour un filament, croissant avec l’ordre, plafonné à 3', () => {
    const depths = FIXTURES.map((n) => maxUsefulDepth(mag(n)))
    expect(depths[0]).toBe(0)
    for (let i = 1; i < depths.length; i++) expect(depths[i]).toBeGreaterThanOrEqual(depths[i - 1])
    expect(depths[depths.length - 1]).toBe(3)
    expect(depths[1]).toBeGreaterThan(depths[0])
  })
  it('est plafonné par maxDepth', () => {
    expect(maxUsefulDepth(mag(10n ** 12n), { maxDepth: 1 })).toBe(1)
    expect(maxUsefulDepth(mag(10n ** 12n), { maxDepth: 0 })).toBe(0)
    expect(maxUsefulDepth(mag(10n ** 12n), { maxDepth: 99 })).toBe(3)
  })
})

describe('lodFor', () => {
  it('monotonie : plus on s’approche, plus la profondeur augmente', () => {
    const m = mag(10n ** 9n)
    const distances = [5000, 1000, 400, 150, 99, 49, 24, 10, 1, 0]
    let prev = -1
    for (const dist of distances) {
      const { depth } = lodFor(m, dist, OPT)
      expect(depth).toBeGreaterThanOrEqual(prev)
      prev = depth
    }
    expect(lodFor(m, 5000, OPT).depth).toBe(0)
    expect(lodFor(m, 1, OPT).depth).toBe(3)
  })

  it('hystérésis (descente) : pas de raffinement tant que refineBelow n’est pas franchi', () => {
    const m = mag(10n ** 9n)
    // depuis 0, distance dans la zone morte [100, 150] : on reste agrégé
    for (const dist of [150, 125, 100]) expect(lodFor(m, dist, OPT, 0).depth).toBe(0)
    expect(lodFor(m, 99.9, OPT, 0).depth).toBe(1)
  })

  it('hystérésis (remontée) : pas de repli avant collapseAbove', () => {
    const m = mag(10n ** 9n)
    // depuis 1, distance dans la zone morte : on reste à 1
    for (const dist of [100, 125, 150]) expect(lodFor(m, dist, OPT, 1).depth).toBe(1)
    expect(lodFor(m, 150.1, OPT, 1).depth).toBe(0)
  })

  it('un aller-retour autour d’un seuil n’oscille pas', () => {
    const m = mag(10n ** 9n)
    let depth = 0
    const seen: number[] = []
    for (const dist of [101, 99, 101, 99, 140, 99, 149, 99]) {
      depth = lodFor(m, dist, OPT, depth).depth
      seen.push(depth)
    }
    expect(seen).toEqual([0, 1, 1, 1, 1, 1, 1, 1])
    // sans hystérésis, les mêmes distances oscilleraient
    const memoryless = [101, 99, 101, 99].map((x) => lodFor(m, x, OPT).depth)
    expect(memoryless).toEqual([0, 1, 0, 1])
  })

  it('la zone morte tient à chaque profondeur', () => {
    const m = mag(10n ** 12n)
    // seuils profondeur 2 : raffine < 50, replie > 75
    expect(lodFor(m, 60, OPT, 1).depth).toBe(1)
    expect(lodFor(m, 49, OPT, 1).depth).toBe(2)
    expect(lodFor(m, 60, OPT, 2).depth).toBe(2)
    expect(lodFor(m, 76, OPT, 2).depth).toBe(1)
  })

  it('le LOD n’est pas global : deux faisceaux, même distance, profondeurs différentes', () => {
    const dist = 20
    const filament = lodFor(mag(1n), dist, OPT)
    const artery = lodFor(mag(1000n), dist, OPT)
    const macro = lodFor(mag(10n ** 12n), dist, OPT)
    expect(filament.depth).toBe(0)
    expect(filament.canRefine).toBe(false)
    expect(artery.depth).toBe(2)
    expect(macro.depth).toBe(3)
    expect(new Set([filament.depth, artery.depth, macro.depth]).size).toBe(3)
    // et l’évaluation d’un faisceau n’influence pas l’autre (pas d’état partagé)
    expect(lodFor(mag(1000n), dist, OPT)).toEqual(artery)
  })

  it('respecte maxDepth et expose visible / canRefine', () => {
    const m = mag(10n ** 12n)
    const s = lodFor(m, 0, { ...OPT, maxDepth: 2 })
    expect(s.depth).toBe(2)
    expect(s.visible).toBe('families')
    expect(s.canRefine).toBe(false)
    expect(lodFor(m, 5000, OPT).visible).toBe('aggregate')
    expect(lodFor(m, 5000, OPT).canRefine).toBe(true)
    expect(lodFor(m, 0, OPT).visible).toBe('relations')
    // previousDepth au-dessus du budget est ramené dans [0, utile]
    expect(lodFor(m, 0, { ...OPT, maxDepth: 1 }, 3).depth).toBe(1)
  })

  it('déterminisme et absence de NaN sur les fixtures', () => {
    for (const n of FIXTURES) {
      for (const dist of [0, 0.5, 10, 100, 1e6, Infinity]) {
        const a = lodFor(mag(n), dist, undefined, 1)
        const b = lodFor(mag(n), dist, undefined, 1)
        expect(a).toEqual(b)
        expect(Number.isNaN(a.depth)).toBe(false)
        expect(Number.isInteger(a.depth)).toBe(true)
        expect(a.depth).toBeLessThanOrEqual(DEFAULT_LOD_OPTIONS.maxDepth)
      }
    }
  })

  it('refuse les options incohérentes et les distances NaN', () => {
    const m = mag(100n)
    expect(() => lodFor(m, 10, { refineBelow: 100, collapseAbove: 100 })).toThrow(RangeError)
    expect(() => lodFor(m, 10, { refineBelow: 200, collapseAbove: 100 })).toThrow(RangeError)
    expect(() => lodFor(m, 10, { refineBelow: 0 })).toThrow(RangeError)
    expect(() => lodFor(m, NaN)).toThrow(RangeError)
  })
})
