import { describe, expect, it } from 'vitest'
import { describeMagnitude } from './linkMagnitude'
import {
  DEFAULT_BUDGET,
  WIDTH_CEILING,
  channelsFor,
  morphologyShape,
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
})
