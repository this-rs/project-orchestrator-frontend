import { describe, expect, it } from 'vitest'
import {
  arcLengths,
  braidedOffsets,
  cubicSpline,
  parallelTransportFrames,
  sectionRing,
  type Frame,
  type Vec3,
} from './linkVascular'

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2])
const angle = (a: Vec3, b: Vec3) => Math.acos(Math.max(-1, Math.min(1, dot(a, b))))

/** Vrai si tout nombre imbriqué est fini. */
function allFinite(x: unknown): boolean {
  if (typeof x === 'number') return Number.isFinite(x)
  if (Array.isArray(x)) return x.every(allFinite)
  if (x && typeof x === 'object') return Object.values(x).every(allFinite)
  return true
}

function expectOrthonormal(frames: Frame[]) {
  for (const f of frames) {
    expect(Math.abs(len(f.tangent) - 1)).toBeLessThan(1e-9)
    expect(Math.abs(len(f.normal) - 1)).toBeLessThan(1e-9)
    expect(Math.abs(len(f.binormal) - 1)).toBeLessThan(1e-9)
    expect(Math.abs(dot(f.tangent, f.normal))).toBeLessThan(1e-9)
    expect(Math.abs(dot(f.tangent, f.binormal))).toBeLessThan(1e-9)
    expect(Math.abs(dot(f.normal, f.binormal))).toBeLessThan(1e-9)
    // Repère direct : t · (n × b) = +1
    expect(dot(f.tangent, cross(f.normal, f.binormal))).toBeGreaterThan(1 - 1e-9)
  }
}

/** Demi-cercle dans le plan XY dont le tangent passe de +X à −X en traversant +Y (vertical). */
function verticalArc(n = 20): Vec3[] {
  return Array.from({ length: n }, (_, i) => {
    const phi = (Math.PI * i) / (n - 1)
    return [Math.sin(phi), -Math.cos(phi), 0] as Vec3
  })
}

/** Implémentation NAÏVE : normale recalculée depuis un « up » global à chaque point. */
function naiveNormals(points: Vec3[]): Vec3[] {
  const up: Vec3 = [0, 1, 0]
  return points.map((_, i) => {
    const a = points[Math.max(0, i - 1)]
    const b = points[Math.min(points.length - 1, i + 1)]
    const d: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const l = len(d)
    const t: Vec3 = [d[0] / l, d[1] / l, d[2] / l]
    const k = dot(up, t)
    const v: Vec3 = [up[0] - k * t[0], up[1] - k * t[1], up[2] - k * t[2]]
    const vl = len(v)
    return [v[0] / vl, v[1] / vl, v[2] / vl] as Vec3
  })
}

function maxStep(normals: Vec3[]): number {
  let m = 0
  for (let i = 1; i < normals.length; i++) m = Math.max(m, angle(normals[i - 1], normals[i]))
  return m
}

describe('cubicSpline', () => {
  it('inclut les extrémités et renvoie `samples` points', () => {
    const p = cubicSpline([0, 0, 0], [1, 2, 0], [3, 2, 1], [4, 0, 1], 11)
    expect(p).toHaveLength(11)
    expect(p[0]).toEqual([0, 0, 0])
    expect(p[10][0]).toBeCloseTo(4, 12)
    expect(p[10][2]).toBeCloseTo(1, 12)
  })
  it('samples = 2 ou invalide donne les deux extrémités, sans NaN', () => {
    for (const s of [2, 1, 0, -3, NaN]) {
      const p = cubicSpline([0, 0, 0], [1, 1, 1], [2, 2, 2], [3, 3, 3], s)
      expect(p).toHaveLength(2)
      expect(allFinite(p)).toBe(true)
    }
  })
})

describe('parallelTransportFrames', () => {
  it('repères orthonormés sur une courbe quelconque', () => {
    const pts = cubicSpline([0, 0, 0], [3, 5, -1], [-2, 4, 6], [5, -1, 2], 40)
    const frames = parallelTransportFrames(pts)
    expect(frames).toHaveLength(40)
    expectOrthonormal(frames)
  })

  it('repères orthonormés sur une courbe verticale (tangent ∥ axe up)', () => {
    const pts: Vec3[] = Array.from({ length: 12 }, (_, i) => [0, i * 0.7, 0] as Vec3)
    const frames = parallelTransportFrames(pts)
    expectOrthonormal(frames)
    expect(maxStep(frames.map((f) => f.normal))).toBeLessThan(1e-9)
  })

  it('repères orthonormés sur une courbe dégénérée (points confondus)', () => {
    const pts: Vec3[] = Array.from({ length: 6 }, () => [2, 2, 2] as Vec3)
    const frames = parallelTransportFrames(pts)
    expect(frames).toHaveLength(6)
    expectOrthonormal(frames)
    expect(allFinite(frames)).toBe(true)
  })

  it('cas limites : vide, un point, deux points, partiellement confondus, entrées non finies', () => {
    expect(parallelTransportFrames([])).toEqual([])
    expectOrthonormal(parallelTransportFrames([[1, 2, 3]]))
    expectOrthonormal(parallelTransportFrames([[0, 0, 0], [0, 0, 1]]))
    const partial = parallelTransportFrames([[0, 0, 0], [0, 0, 0], [1, 0, 0], [1, 0, 0], [1, 1, 0]])
    expectOrthonormal(partial)
    const dirty = parallelTransportFrames([[0, 0, 0], [NaN, Infinity, 1], [2, 0, 0]], [NaN, 0, 0])
    expect(allFinite(dirty)).toBe(true)
    expectOrthonormal(dirty)
  })

  it('upHint colinéaire au premier tangent : repli propre', () => {
    const frames = parallelTransportFrames([[0, 0, 0], [0, 1, 0], [0, 2, 0]], [0, 1, 0])
    expectOrthonormal(frames)
  })

  it('déterministe', () => {
    const pts = cubicSpline([0, 0, 0], [3, 5, -1], [-2, 4, 6], [5, -1, 2], 25)
    expect(parallelTransportFrames(pts)).toEqual(parallelTransportFrames(pts))
  })

  it('continuité : pas de demi-tour de normale quand la courbe passe par la verticale', () => {
    const pts = verticalArc(20)

    // Transport parallèle : la normale suit le tangent, petit pas régulier.
    const pt = parallelTransportFrames(pts)
    expectOrthonormal(pt)
    const ptStep = maxStep(pt.map((f) => f.normal))
    expect(ptStep).toBeLessThan(0.3)

    // Implémentation naïve (up global) : le signe de up·t bascule au zénith
    // et la normale se retourne d'environ π — c'est le piège classique.
    const naiveStep = maxStep(naiveNormals(pts))
    expect(naiveStep).toBeGreaterThan(2.5)
    expect(ptStep).toBeLessThan(naiveStep / 10)
  })

  it('continuité sur une spline qui monte à la verticale puis redescend', () => {
    const pts = cubicSpline([0, 0, 0], [0, 6, 0], [1, 6, 0], [1, -2, 0], 60)
    const frames = parallelTransportFrames(pts)
    expectOrthonormal(frames)
    // Le demi-tour en haut est un vrai virage serré (~0,46 rad/pas) ; un retournement serait ~π.
    expect(maxStep(frames.map((f) => f.normal))).toBeLessThan(1)
  })
})

describe('sectionRing', () => {
  const frame = parallelTransportFrames([[1, 2, 3], [1, 2, 4], [1, 2, 5]])[1]

  it('segments points distincts, elliptiques, dans un plan ⟂ tangent', () => {
    const rn = 2
    const rb = 0.5
    const ring = sectionRing(frame, rn, rb, 16, 0.3)
    expect(ring).toHaveLength(16)
    const keys = new Set(ring.map((p) => p.map((c) => c.toFixed(9)).join(',')))
    expect(keys.size).toBe(16)
    for (const p of ring) {
      const d: Vec3 = [p[0] - frame.position[0], p[1] - frame.position[1], p[2] - frame.position[2]]
      // coordonnées locales : (x/rn)² + (y/rb)² = 1
      const x = dot(d, frame.normal)
      const y = dot(d, frame.binormal)
      expect((x / rn) ** 2 + (y / rb) ** 2).toBeCloseTo(1, 9)
      expect(Math.abs(dot(d, frame.tangent))).toBeLessThan(1e-9)
    }
  })

  it('sens direct : n × b est aligné avec le tangent, et les points tournent dans ce sens', () => {
    expect(dot(frame.tangent, cross(frame.normal, frame.binormal))).toBeGreaterThan(0)
    const ring = sectionRing(frame, 1, 1, 8, 0)
    const rel = (p: Vec3): Vec3 => [
      p[0] - frame.position[0],
      p[1] - frame.position[1],
      p[2] - frame.position[2],
    ]
    for (let k = 0; k < 8; k++) {
      const turn = cross(rel(ring[k]), rel(ring[(k + 1) % 8]))
      expect(dot(turn, frame.tangent)).toBeGreaterThan(0)
    }
  })

  it('la phase tourne l\'anneau ; rayons ou segments invalides restent finis', () => {
    const a = sectionRing(frame, 1, 1, 4, 0)
    const b = sectionRing(frame, 1, 1, 4, Math.PI / 2)
    expect(b[0][0]).toBeCloseTo(a[1][0], 9)
    expect(allFinite(sectionRing(frame, NaN, Infinity, NaN, NaN))).toBe(true)
    expect(sectionRing(frame, 1, 1, 0, 0)).toHaveLength(3)
  })
})

describe('braidedOffsets', () => {
  it('strands × samples décalages, barycentre nul à 1e-9, déterministe', () => {
    for (const strands of [2, 3, 5, 8]) {
      const o = braidedOffsets(strands, 30, 2.5, 0.8)
      expect(o).toHaveLength(strands)
      for (const row of o) expect(row).toHaveLength(30)
      for (let i = 0; i < 30; i++) {
        let sx = 0
        let sy = 0
        let sz = 0
        for (let k = 0; k < strands; k++) {
          sx += o[k][i][0]
          sy += o[k][i][1]
          sz += o[k][i][2]
        }
        expect(Math.abs(sx)).toBeLessThan(1e-9)
        expect(Math.abs(sy)).toBeLessThan(1e-9)
        expect(Math.abs(sz)).toBeLessThan(1e-9)
      }
      expect(braidedOffsets(strands, 30, 2.5, 0.8)).toEqual(o)
    }
  })

  it('brins répartis symétriquement et distincts, qui s\'entrecroisent', () => {
    const o = braidedOffsets(4, 50, 3, 1)
    for (let i = 0; i < 50; i++) {
      // rayon constant = amplitude
      for (let k = 0; k < 4; k++) expect(len(o[k][i])).toBeCloseTo(1, 9)
      // brins opposés diamétralement : o[k] = −o[k+2]
      expect(o[0][i][0]).toBeCloseTo(-o[2][i][0], 9)
      expect(o[1][i][1]).toBeCloseTo(-o[3][i][1], 9)
      // jamais confondus
      expect(len([o[0][i][0] - o[1][i][0], o[0][i][1] - o[1][i][1], 0])).toBeGreaterThan(1)
    }
    // un brin change bien de côté le long du conduit
    const xs = o[0].map((v) => v[0])
    expect(Math.min(...xs)).toBeLessThan(-0.9)
    expect(Math.max(...xs)).toBeGreaterThan(0.9)
  })

  it('cas dégénérés : un brin, zéro brin, zéro échantillon, entrées non finies', () => {
    expect(braidedOffsets(1, 5, 2, 1).flat().every((v) => v.every((c) => c === 0))).toBe(true)
    expect(braidedOffsets(0, 5, 2, 1)).toEqual([])
    expect(braidedOffsets(3, 0, 2, 1).every((r) => r.length === 0)).toBe(true)
    expect(braidedOffsets(3, 1, 2, 1)[0]).toHaveLength(1)
    expect(allFinite(braidedOffsets(NaN, NaN, NaN, NaN))).toBe(true)
    expect(allFinite(braidedOffsets(3, 10, Infinity, Infinity))).toBe(true)
  })
})

describe('arcLengths', () => {
  it('strictement croissante sur des points distincts, part de 0', () => {
    const l = arcLengths(cubicSpline([0, 0, 0], [1, 2, 0], [3, 2, 1], [4, 0, 1], 20))
    expect(l[0]).toBe(0)
    for (let i = 1; i < l.length; i++) expect(l[i]).toBeGreaterThan(l[i - 1])
  })
  it('nulle sur un point unique, vide sur vide, plate sur points confondus', () => {
    expect(arcLengths([[3, 3, 3]])).toEqual([0])
    expect(arcLengths([])).toEqual([])
    expect(arcLengths([[1, 1, 1], [1, 1, 1]])).toEqual([0, 0])
  })
  it('valeurs exactes', () => {
    expect(arcLengths([[0, 0, 0], [3, 4, 0], [3, 4, 12]])).toEqual([0, 5, 17])
  })
})

describe('aucune sortie non finie', () => {
  it('sur tous les cas dégénérés combinés', () => {
    const same: Vec3[] = [[0, 0, 0], [0, 0, 0]]
    const frames = parallelTransportFrames(same)
    expect(allFinite(frames)).toBe(true)
    expect(allFinite(sectionRing(frames[0], 0, 0, 5, 0))).toBe(true)
    expect(allFinite(arcLengths(same))).toBe(true)
    expect(allFinite(cubicSpline([0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], 2))).toBe(true)
  })
})
