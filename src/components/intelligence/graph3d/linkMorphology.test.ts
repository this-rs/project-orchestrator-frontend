import { describe, expect, it } from 'vitest'
import { describeMagnitude } from './linkMagnitude'
import {
  DEFAULT_BUDGET,
  WIDTH_CEILING,
  channelsFor,
  morphologyShape,
  type GraphicalVolume,
  type MorphologyBudget,
} from './linkMorphology'

const FIXTURES: bigint[] = [
  1n, 10n, 100n, 1000n, 7500n, 10000n, 100000n, 3141592n, 10n ** 6n,
  4_200_000_000n, 10n ** 9n, 10n ** 12n, 10n ** 30n,
]
const mag = (n: bigint) => describeMagnitude(n)

describe('linkMorphology', () => {
  it('la largeur ne dépasse jamais le plafond', () => {
    for (const n of FIXTURES) {
      const w = morphologyShape(mag(n)).graphical.width
      expect(w).toBeLessThanOrEqual(WIDTH_CEILING)
      expect(w).toBeGreaterThan(0)
    }
  })

  it('la largeur est monotone avec la magnitude', () => {
    const sorted = [...FIXTURES].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    let prev = 0
    for (const n of sorted) {
      const w = morphologyShape(mag(n)).graphical.width
      expect(w).toBeGreaterThanOrEqual(prev)
      prev = w
    }
  })

  it('10⁶ et 10⁹ restent différenciables par la structure alors que la largeur est identique', () => {
    const a = morphologyShape(mag(10n ** 6n)).graphical
    const b = morphologyShape(mag(10n ** 9n)).graphical
    expect(a.saturated).toBe(true)
    expect(b.saturated).toBe(true)
    expect(a.width).toBe(b.width) // un simple clamp s'arrêterait ici
    expect(b.channels).toBeGreaterThan(a.channels)
    expect(b.strata).toBeGreaterThan(a.strata)
    expect(b.depth).toBeGreaterThan(a.depth)
  })

  it('les canaux croissent strictement de 10⁴ à 10³⁰, largeur saturée', () => {
    let prev = -1
    for (let order = 4; order <= 30; order++) {
      const g = morphologyShape(mag(10n ** BigInt(order))).graphical
      expect(g.width).toBe(WIDTH_CEILING)
      expect(g.channels).toBeGreaterThan(prev)
      prev = g.channels
    }
  })

  it('la mantisse différencie 3·10⁶ de 9·10⁶ dans la structure', () => {
    const a = morphologyShape(mag(3_000_000n)).graphical
    const b = morphologyShape(mag(9_000_000n)).graphical
    expect(b.channels).toBeGreaterThan(a.channels)
  })

  it('le budget n’est jamais dépassé, même minuscule', () => {
    const budgets: Partial<MorphologyBudget>[] = [
      {}, { maxChannels: 5, maxStrata: 2, maxDepth: 1 }, { maxChannels: 1, maxStrata: 1, maxDepth: 0 },
    ]
    for (const budget of budgets) {
      const cap = { ...DEFAULT_BUDGET, ...budget }
      for (const n of FIXTURES) {
        const g = morphologyShape(mag(n), budget).graphical
        expect(g.channels).toBeLessThanOrEqual(cap.maxChannels)
        expect(g.strata).toBeLessThanOrEqual(cap.maxStrata)
        expect(g.depth).toBeLessThanOrEqual(cap.maxDepth)
        expect(channelsFor(mag(n), budget)).toBeLessThanOrEqual(cap.maxChannels)
      }
    }
  })

  it('un budget trop petit expose honnêtement l’écart via overflowOrders', () => {
    const tiny = { maxChannels: 5, maxStrata: 2, maxDepth: 1 }
    const a = morphologyShape(mag(10n ** 6n), tiny).graphical
    const b = morphologyShape(mag(10n ** 9n), tiny).graphical
    expect(a.channels).toBe(b.channels) // le budget ne sait plus les séparer…
    expect(b.overflowOrders).toBeGreaterThan(a.overflowOrders) // …mais le champ, si
    expect(morphologyShape(mag(10n ** 30n), tiny).graphical.overflowOrders).toBeGreaterThan(
      b.overflowOrders,
    )
  })

  it('les parts somment à 1 quand la partition est complète', () => {
    const total = 10n ** 30n + 7n
    const m = describeMagnitude(total, [
      { key: 'a', count: 10n ** 30n / 3n },
      { key: 'b', count: 10n ** 30n / 7n },
      { key: 'c', count: total - 10n ** 30n / 3n - 10n ** 30n / 7n },
    ])
    const shape = morphologyShape(m)
    expect(shape.components.map((c) => c.key)).toEqual(['a', 'b', 'c'])
    const sum = shape.components.reduce((s, c) => s + c.share, 0)
    expect(Math.abs(sum - 1)).toBeLessThan(1e-9)
    expect(channelsFor(m, {})).toBe(3)
  })

  it('sans partition, aucun sous-faisceau n’est inventé', () => {
    for (const n of FIXTURES) expect(morphologyShape(mag(n)).components).toEqual([])
  })

  it('le volume logique reste exact', () => {
    const s = morphologyShape(mag(10n ** 30n))
    expect(s.logical.exactCount).toBe(10n ** 30n)
    expect(s.logical.order).toBe(30)
  })

  it('est déterministe', () => {
    for (const n of FIXTURES) {
      expect(morphologyShape(mag(n))).toEqual(morphologyShape(mag(n)))
    }
  })

  describe('au-delà de 10⁴ : la structure différencie les paliers', () => {
    const ORDERS = [5, 6, 7, 9, 10, 12]
    const at = (order: number, budget?: Partial<MorphologyBudget>) =>
      morphologyShape(mag(10n ** BigInt(order)), budget).graphical
    const structural = (g: GraphicalVolume) => [g.channels, g.strata, g.depth].join('/')
    const pairs = ORDERS.flatMap((a, i) => ORDERS.slice(i + 1).map((b) => [a, b] as const))
    // Budget « serré » mais réaliste : assez pour montrer ces six ordres.
    const TIGHT: Partial<MorphologyBudget> = { maxChannels: 16, maxStrata: 8, maxDepth: 4 }

    it('deux à deux, channels OU strata OU depth diffèrent — budget par défaut', () => {
      for (const [a, b] of pairs) {
        expect(structural(at(a)), `10^${a} vs 10^${b}`).not.toBe(structural(at(b)))
      }
    })

    it('deux à deux, channels OU strata OU depth diffèrent — budget serré', () => {
      for (const [a, b] of pairs) {
        expect(structural(at(a, TIGHT)), `10^${a} vs 10^${b}`).not.toBe(structural(at(b, TIGHT)))
      }
    })

    it('10⁶ ≠ 10⁹ à budget serré, sur la structure elle-même', () => {
      const a = at(6, TIGHT)
      const b = at(9, TIGHT)
      expect(a.width).toBe(b.width)
      expect(a.channels !== b.channels || a.strata !== b.strata || a.depth !== b.depth).toBe(true)
    })

    it('budget minuscule : la structure sature, overflowOrders sépare encore les paliers', () => {
      const tiny = { maxChannels: 5, maxStrata: 2, maxDepth: 1 }
      const seen = new Set<number>()
      for (const o of [9, 10, 12]) seen.add(at(o, tiny).overflowOrders)
      expect(seen.size).toBe(3)
      expect(at(6, tiny).overflowOrders).toBeLessThan(at(9, tiny).overflowOrders)
    })

    it('la largeur reste ≤ plafond sur tous ces ordres, saturée dès 10⁴', () => {
      for (const o of ORDERS) {
        const g = at(o)
        expect(g.width).toBeLessThanOrEqual(WIDTH_CEILING)
        expect(g.saturated).toBe(true)
        expect(g.width).toBe(WIDTH_CEILING)
      }
    })

    it('la croissance au-delà du dernier palier vient d’une formule : 10¹² → 10³⁰ strictement croissant', () => {
      const wide = { maxChannels: 1000, maxStrata: 1000, maxDepth: 1000 }
      let prev = at(12, wide)
      for (let o = 13; o <= 30; o++) {
        const g = at(o, wide)
        expect(g.channels).toBeGreaterThan(prev.channels)
        expect(g.strata).toBeGreaterThanOrEqual(prev.strata)
        expect(g.depth).toBeGreaterThanOrEqual(prev.depth)
        prev = g
      }
      expect(at(30, wide).depth).toBeGreaterThan(at(12, wide).depth)
    })

    it('RÈGLE FONDATRICE : la loi clamp(log10/4) échouerait à ces tests', () => {
      // La loi retirée, appliquée à la place des lois de structure : tous les
      // ordres ≥ 4 donnent la même valeur, donc aucune paire ne se distingue.
      const retired = (order: number) => Math.min(1, Math.max(0, order / 4))
      const retiredShape = (order: number) => {
        const g = at(order)
        const k = retired(order)
        return structural({ ...g, channels: k, strata: k, depth: k })
      }
      const collisions = pairs.filter(([a, b]) => retiredShape(a) === retiredShape(b))
      expect(collisions).toHaveLength(pairs.length) // la loi retirée ne sépare AUCUNE paire…
      // … alors que la loi réelle les sépare toutes (testé plus haut).
      const real = pairs.filter(([a, b]) => structural(at(a)) === structural(at(b)))
      expect(real).toHaveLength(0)
    })

    it('est déterministe sur ces ordres, à tous les budgets', () => {
      for (const o of ORDERS) {
        expect(at(o)).toEqual(at(o))
        expect(at(o, TIGHT)).toEqual(at(o, TIGHT))
      }
    })
  })
})
