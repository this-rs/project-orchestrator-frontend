import { describe, it, expect } from 'vitest'
import {
  MORPHOLOGY_ORDER,
  componentsSumToTotal,
  describeMagnitude,
  formatExactCount,
  magnitudeGap,
  magnitudeMantissaOf,
  magnitudeOrderOf,
  morphologyOf,
  toCount,
} from './linkMagnitude'

/** The magnitudes the brief names explicitly, plus the values BETWEEN them. */
const FIXTURES: Array<{ label: string; count: bigint }> = [
  { label: '1', count: 1n },
  { label: '10', count: 10n },
  { label: '100', count: 100n },
  { label: '1 000', count: 1_000n },
  { label: '10 000', count: 10_000n },
  { label: '100 000', count: 100_000n },
  { label: '1 000 000', count: 1_000_000n },
  { label: '1 000 000 000', count: 1_000_000_000n },
  { label: '1 000 000 000 000', count: 1_000_000_000_000n },
  // values BETWEEN the named orders — the brief asks for them explicitly
  { label: '3', count: 3n },
  { label: '42', count: 42n },
  { label: '750', count: 750n },
  { label: '3 141', count: 3_141n },
  { label: '7 500', count: 7_500n },
  { label: '42 000', count: 42_000n },
  { label: '3 141 592', count: 3_141_592n },
  { label: '7 500 000', count: 7_500_000n },
  { label: '4 200 000 000', count: 4_200_000_000n },
]

describe('magnitudeOrderOf', () => {
  it('is the exact decimal order of magnitude of every fixture', () => {
    const expected: Record<string, number> = {
      '1': 0, '3': 0,
      '10': 1, '42': 1,
      '100': 2, '750': 2,
      '1 000': 3, '3 141': 3,
      '10 000': 4, '7 500': 3, '42 000': 4,
      '100 000': 5,
      '1 000 000': 6, '3 141 592': 6, '7 500 000': 6,
      '1 000 000 000': 9, '4 200 000 000': 9,
      '1 000 000 000 000': 12,
    }
    for (const f of FIXTURES) expect(magnitudeOrderOf(f.count)).toBe(expected[f.label])
  })

  it('stays exact past Number.MAX_SAFE_INTEGER', () => {
    // 2^53 + 1 — the first integer a double cannot hold.
    expect(magnitudeOrderOf(9_007_199_254_740_993n)).toBe(15)
    expect(magnitudeOrderOf(10n ** 30n)).toBe(30)
    expect(magnitudeOrderOf(10n ** 100n)).toBe(100)
  })

  it('refuses a negative count instead of returning a nonsense order', () => {
    expect(() => magnitudeOrderOf(-1n)).toThrow(RangeError)
  })
})

describe('magnitudeMantissaOf', () => {
  it('lands in [1, 10) for every fixture', () => {
    for (const f of FIXTURES) {
      const m = magnitudeMantissaOf(f.count)
      expect(m).toBeGreaterThanOrEqual(1)
      expect(m).toBeLessThan(10)
    }
  })

  it('tells two bundles of the same order apart', () => {
    // 3·10^6 and 9·10^6 are the same order; the mantissa must still separate them.
    expect(magnitudeMantissaOf(3_000_000n)).toBeCloseTo(3, 9)
    expect(magnitudeMantissaOf(9_000_000n)).toBeCloseTo(9, 9)
    expect(magnitudeMantissaOf(3_141_592n)).toBeCloseTo(3.141592, 6)
  })

  it('keeps a meaningful mantissa on counts a double cannot hold', () => {
    // 10^30 is far past 2^53; the mantissa must not collapse to 1 because of a
    // conversion, so use a value whose leading digits are NOT 1.
    expect(magnitudeMantissaOf(7n * 10n ** 30n)).toBeCloseTo(7, 9)
    expect(magnitudeMantissaOf(9_007_199_254_740_993n)).toBeCloseTo(9.007199254741, 9)
  })
})

describe('morphologyOf — the five named levels of the brief', () => {
  it('maps the named boards: 1 filament, 10 bundle, 100 conduit, 1 000 artery, 10 000+ macrostructure', () => {
    expect(morphologyOf(1n)).toBe('filament')
    expect(morphologyOf(10n)).toBe('bundle')
    expect(morphologyOf(100n)).toBe('conduit')
    expect(morphologyOf(1_000n)).toBe('artery')
    expect(morphologyOf(10_000n)).toBe('macrostructure')
  })

  it('is monotone as the count grows', () => {
    // FIXTURES lists the named magnitudes first and the in-between ones after;
    // monotonicity is a property of the ORDER, so sort before walking it.
    const rank = (c: bigint) => MORPHOLOGY_ORDER.indexOf(morphologyOf(c))
    const ascending = [...FIXTURES].sort((a, b) => (a.count < b.count ? -1 : a.count > b.count ? 1 : 0))
    let previous = -1
    for (const f of ascending) {
      const r = rank(f.count)
      expect(r).toBeGreaterThanOrEqual(previous)
      previous = r
    }
  })
})

describe('NO CEILING AT 10 000 — the rule the brief replaces', () => {
  it('keeps every order above 10^4 distinct', () => {
    const orders = [10_000n, 100_000n, 1_000_000n, 1_000_000_000n, 1_000_000_000_000n].map(
      (c) => describeMagnitude(c).magnitudeOrder,
    )
    expect(orders).toEqual([4, 5, 6, 9, 12])
    expect(new Set(orders).size).toBe(orders.length)
  })

  it('makes 10^6 and 10^9 differ on order AND exact count, not just on a clamped shape', () => {
    const million = describeMagnitude(1_000_000n)
    const billion = describeMagnitude(1_000_000_000n)
    // The morphology saturates by design (the brief says the named levels stop
    // growing) — so the difference must live in the channels that do not.
    expect(million.morphology).toBe(billion.morphology)
    expect(magnitudeGap(million, billion)).toBe(3)
    expect(million.exactCountText).not.toBe(billion.exactCountText)
  })

  it('would catch the retired formula: clamp(log10/4) cannot separate these', () => {
    const retired = (c: number) => Math.min(1, Math.max(0, Math.log10(c) / 4))
    // The proof that the old shape was uniform past 10^4 …
    expect(retired(10_000)).toBe(retired(1_000_000_000))
    // … and that the new one is not. Two exact powers of ten share a mantissa
    // of 1 BY CONSTRUCTION, so the channel that separates them is the ORDER —
    // which the retired shape had already clamped away.
    const tenK = describeMagnitude(10_000n)
    const oneG = describeMagnitude(1_000_000_000n)
    expect(tenK.magnitudeOrder).not.toBe(oneG.magnitudeOrder)
    expect(formatExactCount(tenK.exactCount)).not.toBe(formatExactCount(oneG.exactCount))
    // And the mantissa does separate two non-power-of-ten neighbours of the
    // same order, which a single clamped scalar never could.
    expect(magnitudeMantissaOf(4_200_000_000n)).toBeCloseTo(4.2, 9)
    expect(magnitudeMantissaOf(9_100_000_000n)).toBeCloseTo(9.1, 9)
  })
})

describe('exact counts', () => {
  it('accepts the three transports and refuses the ones that would lose digits', () => {
    expect(toCount(42n)).toBe(42n)
    expect(toCount('123456789012345678901234567890')).toBe(123456789012345678901234567890n)
    expect(toCount(42)).toBe(42n)
    // Past 2^53 a `number` is already wrong: refuse it, do not guess.
    expect(() => toCount(Number.MAX_SAFE_INTEGER + 1)).toThrow(RangeError)
    expect(() => toCount(1.5)).toThrow(RangeError)
    expect(() => toCount(-3)).toThrow(RangeError)
    expect(() => toCount('12e5')).toThrow(TypeError)
    expect(() => toCount('12 345')).toThrow(TypeError)
  })

  it('carries a count of 10^30 exactly, in text and in bigint', () => {
    const huge = '1000000000000000000000000000000'
    const m = describeMagnitude(huge)
    expect(m.exactCount).toBe(10n ** 30n)
    expect(m.exactCountText).toBe(huge)
    expect(m.magnitudeOrder).toBe(30)
  })

  it('formats a huge count exactly, digit grouping on the STRING', () => {
    expect(formatExactCount(1_234_567n)).toBe('1\u202f234\u202f567')
    expect(formatExactCount('1000000000000000000000000000000')).toBe(
      '1\u202f000\u202f000\u202f000\u202f000\u202f000\u202f000\u202f000\u202f000\u202f000\u202f000',
    )
  })
})

describe('components — a REAL partition, never an invented branch', () => {
  it('says how much of the graph the count is valid on', () => {
    expect(describeMagnitude(1_000n).coverage).toBe(1)
    // A sampled graph: the count is exact for the covered half, and says so.
    expect(describeMagnitude(1_000n, [], 0.5).coverage).toBe(0.5)
    expect(() => describeMagnitude(1_000n, [], 1.5)).toThrow(RangeError)
    expect(() => describeMagnitude(1_000n, [], Number.NaN)).toThrow(RangeError)
  })

  it('keeps the caller\'s partition and proves a complete one sums exactly', () => {
    const m = describeMagnitude(1_000n, [
      { key: 'IMPORTS', count: 600n },
      { key: 'CALLS', count: 399n },
      { key: 'CO_CHANGED', count: 1n },
    ])
    expect(m.hierarchicalComponents).toHaveLength(3)
    expect(componentsSumToTotal(m)).toBe(true)
  })

  it('detects a partition that loses relations', () => {
    const m = describeMagnitude(1_000n, [
      { key: 'IMPORTS', count: 600n },
      { key: 'CALLS', count: 399n },
    ])
    expect(componentsSumToTotal(m)).toBe(false)
  })

  it('refuses two components under the same key (the same links counted twice)', () => {
    expect(() =>
      describeMagnitude(10n, [
        { key: 'IMPORTS', count: 5n },
        { key: 'IMPORTS', count: 5n },
      ]),
    ).toThrow(/duplicate component key/)
  })

  it('leaves the components empty when nothing real is known — empty means UNKNOWN', () => {
    const m = describeMagnitude(10_000n)
    expect(m.hierarchicalComponents).toEqual([])
    // An empty list is not a zero-sum partition: the caller must read it as
    // "no breakdown available", never as "no relations".
    expect(componentsSumToTotal(m)).toBe(false)
    expect(m.exactCount).toBe(10_000n)
  })
})
