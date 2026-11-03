import { describe, expect, it } from 'vitest'
import { flowPositions, strataFor, stratumRadius } from './linkStrata'

const ORDERS = [0, 1, 3, 6, 12, 30]

describe('strataFor', () => {
  it('rend un tableau vide pour 0 strate', () => {
    for (const o of ORDERS) expect(strataFor(0, o)).toEqual([])
  })
  it('rend exactement n strates, rayons strictement décroissants dans (0,1], un seul flux', () => {
    for (let n = 1; n <= 12; n++)
      for (const o of ORDERS) {
        const s = strataFor(n, o)
        expect(s).toHaveLength(n)
        s.forEach((x) => {
          expect(x.radius).toBeGreaterThan(0)
          expect(x.radius).toBeLessThanOrEqual(1)
          expect(x.alpha).toBeGreaterThan(0)
          expect(x.alpha).toBeLessThanOrEqual(1)
        })
        for (let i = 1; i < n; i++) expect(s[i].radius).toBeLessThan(s[i - 1].radius)
        expect(s.filter((x) => x.carriesFlow)).toHaveLength(1)
        expect(s[n - 1].carriesFlow).toBe(true)
      }
  })
  it('alphas : gaines décroissantes, flux le plus fort, somme bornée', () => {
    for (let n = 2; n <= 12; n++) {
      const s = strataFor(n, 5)
      for (let i = 1; i < n - 1; i++) expect(s[i].alpha).toBeLessThanOrEqual(s[i - 1].alpha)
      expect(s[n - 1].alpha).toBeGreaterThan(Math.max(...s.slice(0, -1).map((x) => x.alpha)))
      expect(s.reduce((a, x) => a + x.alpha, 0)).toBeLessThanOrEqual(2.05 + 1e-9)
    }
  })
  it("l'écart minimal ne s'effondre pas quand l'ordre croît (12 strates)", () => {
    const minGap = (o: number) => {
      const s = strataFor(12, o)
      return Math.min(...s.slice(1).map((x, i) => s[i].radius - x.radius))
    }
    expect(minGap(0)).toBeGreaterThan(0.06)
    let prev = 0
    for (const o of [0, 2, 5, 8, 12, 30]) {
      const g = minGap(o)
      expect(g).toBeGreaterThan(0.063)
      expect(g).toBeGreaterThanOrEqual(prev - 1e-12)
      prev = g
    }
  })
  it('aucun NaN, y compris entrées hostiles', () => {
    for (const n of [0, 1, 8, 12, NaN, -3, 2.7])
      for (const o of [0, 30, NaN, -1, 1e9])
        strataFor(n, o).forEach((x) => {
          expect(Number.isFinite(x.radius)).toBe(true)
          expect(Number.isFinite(x.alpha)).toBe(true)
        })
  })
})

describe('flowPositions', () => {
  it('dans [0,1), distinctes, régulières, même avec t négatif ou énorme', () => {
    for (const n of [1, 2, 5, 16])
      for (const t of [0, 0.37, -0.37, -123.456, 1e6 + 0.25, 1e9])
        for (const ph of [0, 0.6, -2.2]) {
          const p = flowPositions(n, t, ph)
          expect(p).toHaveLength(n)
          p.forEach((x) => {
            expect(x).toBeGreaterThanOrEqual(0)
            expect(x).toBeLessThan(1)
          })
          expect(new Set(p).size).toBe(n)
          const s = [...p].sort((a, b) => a - b)
          for (let i = 1; i < n; i++) expect(Math.abs(s[i] - s[i - 1] - 1 / n)).toBeLessThan(1e-9)
          if (n > 1) expect(Math.abs(1 - s[n - 1] + s[0] - 1 / n)).toBeLessThan(1e-9)
        }
  })
  it('défile de façon continue et déterministe, phase décale', () => {
    expect(flowPositions(4, 0.1, 0)).toEqual(flowPositions(4, 0.1, 0))
    expect(flowPositions(1, 0.25, 0)[0]).toBeCloseTo(0.25, 12)
    expect(flowPositions(1, 0, 0.25)[0]).toBeCloseTo(0.25, 12)
    expect(flowPositions(3, 1, 0)[0]).toBeCloseTo(flowPositions(3, 0, 0)[0], 12)
  })
  it('count = 0 ou invalide → vide, sans NaN', () => {
    expect(flowPositions(0, 1, 1)).toEqual([])
    expect(flowPositions(NaN, NaN, NaN)).toEqual([])
    flowPositions(3, NaN, NaN).forEach((x) => expect(Number.isFinite(x)).toBe(true))
  })
})

describe('stratumRadius', () => {
  const radii = [0.001, 0.05, 1, 4, 30, 1000]
  it('monotone en conduitRadius, ≤ conduitRadius, > 0', () => {
    for (const st of strataFor(12, 12)) {
      let prev = 0
      for (const R of radii) {
        const r = stratumRadius(st, R)
        expect(r).toBeGreaterThan(0)
        expect(r).toBeLessThanOrEqual(R)
        expect(r).toBeGreaterThan(prev)
        prev = r
      }
    }
  })
  it("garde l'ordre des strates et un cœur lisible sur un conduit épais", () => {
    const s = strataFor(12, 12)
    const e = s.map((x) => stratumRadius(x, 20))
    for (let i = 1; i < e.length; i++) expect(e[i]).toBeLessThan(e[i - 1])
    expect(e[11] / 20).toBeGreaterThan(s[11].radius)
  })
  it('entrées invalides : jamais NaN ni ≤ 0', () => {
    const st = strataFor(3, 0)[0]
    for (const R of [0, -1, NaN, Infinity]) {
      const r = stratumRadius(st, R)
      expect(Number.isFinite(r)).toBe(true)
      expect(r).toBeGreaterThan(0)
    }
  })
})
