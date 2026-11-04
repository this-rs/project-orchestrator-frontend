import { describe, it, expect } from 'vitest'
import { bowAnchors } from './linkVascularRenderer'
import type { Vec3 } from './linkVascular'

/** Point de la Bézier cubique a → c1 → c2 → b à u = 0,5. */
const midOf = (a: Vec3, c1: Vec3, c2: Vec3, b: Vec3): Vec3 =>
  [0, 1, 2].map((k) => (a[k] + 3 * c1[k] + 3 * c2[k] + b[k]) / 8) as Vec3

/**
 * Les troncs se cintrent VERS L'EXTÉRIEUR du graphe. Les deux contrôles étaient
 * poussés de part et d'autre (+ventre / −ventre) : B(0,5) retombait exactement
 * au milieu de la corde et tous les troncs traversaient le centre.
 */
describe('ventre des troncs', () => {
  const cases: [Vec3, Vec3, number][] = [
    [[300, 0, 0], [0, 300, 0], 0.3],
    [[-200, 50, 80], [100, 220, -40], 2.1],
    [[0, -500, 10], [400, -400, 200], 4.4],
  ]

  it('le milieu de la courbe est poussé vers l’extérieur, d’une part fixe de la corde', () => {
    for (const [a, b, seed] of cases) {
      const [c1, c2] = bowAnchors(a, b, seed, [0, 0, 0])
      const m = midOf(a, c1, c2, b)
      const chordMid: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]
      const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
      const push = [m[0] - chordMid[0], m[1] - chordMid[1], m[2] - chordMid[2]]
      // Composante radiale (depuis le centre) du déplacement du milieu.
      const rl = Math.hypot(...chordMid)
      const radialPush = (push[0] * chordMid[0] + push[1] * chordMid[1] + push[2] * chordMid[2]) / rl
      // Outward (never through the centre)…
      expect(radialPush).toBeGreaterThan(0.02 * len)
      // …but CLOSE to what it joins: at 0.16 of the chord the links made wide
      // loops around the graph (browser review, « les liaisons sont trop
      // grandes »). The middle moves less than 6 % of the chord.
      expect(Math.hypot(push[0], push[1], push[2])).toBeLessThan(0.06 * len)
    }
  })

  it('l’extérieur se mesure depuis le centre du graphe, pas depuis l’origine', () => {
    const T: Vec3 = [5000, -3000, 1200]
    for (const [a, b, seed] of cases) {
      const [c1, c2] = bowAnchors(a, b, seed, [0, 0, 0])
      const at = a.map((v, k) => v + T[k]) as Vec3
      const bt = b.map((v, k) => v + T[k]) as Vec3
      const [d1, d2] = bowAnchors(at, bt, seed, T)
      for (let k = 0; k < 3; k++) {
        expect(d1[k] - T[k]).toBeCloseTo(c1[k], 6)
        expect(d2[k] - T[k]).toBeCloseTo(c2[k], 6)
      }
    }
  })

  it('une corde nulle n’a pas de ventre (aucune longueur absolue)', () => {
    const p: Vec3 = [10, 20, 30]
    const [c1, c2] = bowAnchors(p, p, 1)
    expect(c1).toEqual(p)
    expect(c2).toEqual(p)
  })
})
