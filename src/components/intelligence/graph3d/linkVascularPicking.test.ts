import { describe, it, expect } from 'vitest'
import { bundleAtTriangle, buildRanges } from './linkVascularPicking'

describe('bundleAtTriangle', () => {
  const ranges = buildRanges(['a', 'b', 'c'], [10, 5, 20])

  it('premier et dernier triangle', () => {
    expect(bundleAtTriangle(ranges, 0)).toBe('a')
    expect(bundleAtTriangle(ranges, 34)).toBe('c')
  })
  it('bornes exactes : start et end-1', () => {
    expect(bundleAtTriangle(ranges, 10)).toBe('b')
    expect(bundleAtTriangle(ranges, 14)).toBe('b')
    expect(bundleAtTriangle(ranges, 9)).toBe('a')
    expect(bundleAtTriangle(ranges, 15)).toBe('c')
  })
  it('juste avant et juste après', () => {
    expect(bundleAtTriangle(ranges, -1)).toBeNull()
    expect(bundleAtTriangle(ranges, 35)).toBeNull()
    expect(bundleAtTriangle(ranges, 1.5)).toBeNull()
    expect(bundleAtTriangle(ranges, NaN)).toBeNull()
  })
  it('ignore une plage vide', () => {
    const r = buildRanges(['a', 'vide', 'b', 'vide2'], [3, 0, 3, 0])
    expect(bundleAtTriangle(r, 2)).toBe('a')
    expect(bundleAtTriangle(r, 3)).toBe('b')
    expect(bundleAtTriangle(r, 5)).toBe('b')
    expect(bundleAtTriangle(r, 6)).toBeNull()
    expect(bundleAtTriangle(buildRanges(['v'], [0]), 0)).toBeNull()
  })
  it('tableau vide ⇒ null', () => {
    expect(bundleAtTriangle([], 0)).toBeNull()
  })
})

describe('buildRanges', () => {
  it('plages contiguës et total conservé', () => {
    const counts = [7, 0, 12, 3, 100]
    const r = buildRanges(['a', 'b', 'c', 'd', 'e'], counts)
    expect(r[0].start).toBe(0)
    for (let i = 1; i < r.length; i++) expect(r[i].start).toBe(r[i - 1].end)
    expect(r[r.length - 1].end).toBe(counts.reduce((s, n) => s + n, 0))
    expect(r.map((x) => x.key)).toEqual(['a', 'b', 'c', 'd', 'e'])
  })
})

describe('recherche binaire à grande échelle', () => {
  it('5 000 plages, 1 000 tirages (graine fixe) = parcours linéaire', () => {
    let seed = 123456789
    const rand = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return seed / 4294967296
    }
    const keys: string[] = []
    const counts: number[] = []
    for (let i = 0; i < 5000; i++) {
      keys.push(`k${i}`)
      counts.push(Math.floor(rand() * 40)) // inclut des plages vides
    }
    const ranges = buildRanges(keys, counts)
    const total = ranges[ranges.length - 1].end
    for (let t = 0; t < 1000; t++) {
      const f = Math.floor(rand() * (total + 20)) - 10
      const linear = ranges.find((r) => f >= r.start && f < r.end)?.key ?? null
      expect(bundleAtTriangle(ranges, f)).toBe(linear)
    }
  })
})
