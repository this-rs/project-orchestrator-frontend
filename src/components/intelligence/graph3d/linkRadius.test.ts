import { describe, it, expect } from 'vitest'
import {
  DEFAULT_BOUNDS,
  DEFAULT_GAMMA,
  childRadii,
  confluenceHolds,
  parentRadius,
  radiusAt,
} from './linkRadius'

describe('loi de confluence r_parent^γ ≈ Σ r_child^γ', () => {
  it('le parent porte exactement la somme des puissances de ses enfants', () => {
    const children = [0.4, 0.3, 0.25, 0.2]
    const parent = parentRadius(children)
    expect(confluenceHolds(parent, children)).toBe(true)
  })

  it('un seul enfant rend un parent de MÊME rayon (pas de gonflement gratuit)', () => {
    expect(parentRadius([0.37])).toBeCloseTo(0.37, 12)
  })

  it('regrouper des chemins ÉPAISSIT le parent', () => {
    const one = parentRadius([0.3])
    const four = parentRadius([0.3, 0.3, 0.3, 0.3])
    expect(four).toBeGreaterThan(one)
    // γ=3 : quatre enfants de même section donnent 4^(1/3) ≈ 1,587 fois le rayon.
    expect(four / one).toBeCloseTo(Math.cbrt(4), 9)
  })

  it('répartit les enfants selon leur charge, et la somme reste juste', () => {
    const loads = [120, 60, 20]
    const parent = 0.9
    const kids = childRadii(parent, loads)
    expect(kids[0]).toBeGreaterThan(kids[1])
    expect(kids[1]).toBeGreaterThan(kids[2])
    expect(confluenceHolds(parent, kids, DEFAULT_GAMMA, 1e-9)).toBe(true)
  })

  it('un enfant de charge nulle reçoit un rayon nul, jamais négatif', () => {
    const kids = childRadii(0.8, [10, 0, -5])
    expect(kids[1]).toBe(0)
    expect(kids[2]).toBe(0)
    expect(kids.every((r) => r >= 0)).toBe(true)
  })

  it('aucune charge ⇒ aucun rayon, et aucune division par zéro', () => {
    expect(childRadii(0.8, [0, 0])).toEqual([0, 0])
    expect(parentRadius([])).toBe(0)
  })
})

describe('profil de rayon le long d’une branche', () => {
  it('part du rayon du parent et arrive au rayon de l’enfant', () => {
    expect(radiusAt(0, 0.9, 0.25)).toBeCloseTo(0.9, 9)
    expect(radiusAt(1, 0.9, 0.25)).toBeCloseTo(0.25, 9)
  })

  it('ne fait AUCUN saut : le plus grand pas reste petit', () => {
    // Le défaut d'origine était un rayon constant puis une extrémité coupée.
    // On vérifie ici qu'aucun échantillon ne saute.
    const N = 400
    let maxStep = 0
    let prev = radiusAt(0, 1, 0.2)
    for (let i = 1; i <= N; i++) {
      const r = radiusAt(i / N, 1, 0.2)
      maxStep = Math.max(maxStep, Math.abs(r - prev))
      prev = r
    }
    expect(maxStep).toBeLessThan(0.01)
  })

  it('est monotone entre les deux rayons', () => {
    let prev = radiusAt(0, 0.9, 0.2)
    for (let i = 1; i <= 100; i++) {
      const r = radiusAt(i / 100, 0.9, 0.2)
      expect(r).toBeLessThanOrEqual(prev + 1e-12)
      prev = r
    }
  })

  it('démarre et finit avec une pente nulle (pas de cassure au raccord)', () => {
    const eps = 1e-4
    const slopeStart = Math.abs(radiusAt(eps, 1, 0.3) - radiusAt(0, 1, 0.3)) / eps
    const slopeEnd = Math.abs(radiusAt(1, 1, 0.3) - radiusAt(1 - eps, 1, 0.3)) / eps
    const slopeMid = Math.abs(radiusAt(0.5 + eps, 1, 0.3) - radiusAt(0.5, 1, 0.3)) / eps
    expect(slopeStart).toBeLessThan(slopeMid)
    expect(slopeEnd).toBeLessThan(slopeMid)
  })

  it('respecte les bornes visuelles, même hors de [0,1]', () => {
    expect(radiusAt(-3, 5, 5)).toBeLessThanOrEqual(DEFAULT_BOUNDS.max)
    expect(radiusAt(9, 0, 0)).toBeGreaterThanOrEqual(DEFAULT_BOUNDS.min)
  })

  it('est déterministe', () => {
    for (const s of [0, 0.13, 0.5, 0.87, 1]) {
      expect(radiusAt(s, 0.7, 0.2)).toBe(radiusAt(s, 0.7, 0.2))
    }
  })
})
