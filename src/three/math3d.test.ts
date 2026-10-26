import { describe, expect, it } from 'vitest'

import {
  applyMat4,
  applyTRS,
  composeTRS,
  interpolateTRS,
  quatFromAxisAngle,
  quatSlerp,
  sdSphere,
  sdfToMesh,
  smin,
  triangulatePolygonWithHoles,
  trsToMat4,
  type TRS,
  type Vec3,
} from './math3d'

const qz = (deg: number) => quatFromAxisAngle([0, 0, 1], (deg * Math.PI) / 180)

describe('math3d — TRS / quaternion / Mat4', () => {
  it('compose deux TRS (rotation + translation + échelle uniforme) et applique au point attendu', () => {
    const a: TRS = { translation: [1, 2, 3], rotation: qz(90), scale: [2, 2, 2] }
    const b: TRS = { translation: [0, 0, 0], rotation: qz(90), scale: [1, 1, 1] }
    const composed = composeTRS(a, b)
    const p = applyTRS(composed, [1, 0, 0])
    // b : (1,0,0) → (0,1,0) ; a : ×2 → (0,2,0) ; rot 90° → (−2,0,0) ; + (1,2,3) → (−1,2,3)
    expect(p[0]).toBeCloseTo(-1, 6)
    expect(p[1]).toBeCloseTo(2, 6)
    expect(p[2]).toBeCloseTo(3, 6)
  })

  it('trsToMat4 + applyMat4 appliquent la même transformation que applyTRS', () => {
    const trs: TRS = { translation: [1, 0, 0], rotation: quatFromAxisAngle([0, 0, 1], 0), scale: [2, 2, 2] }
    const m = trsToMat4(trs.translation, trs.rotation, trs.scale)
    const got = applyMat4(m, [1, 2, 3])
    // échelle ×2 puis translation +x : (3, 4, 6)
    expect(got[0]).toBeCloseTo(3, 6)
    expect(got[1]).toBeCloseTo(4, 6)
    expect(got[2]).toBeCloseTo(6, 6)
  })

  it('slerp entre l’identité et 180° donne 90° au milieu', () => {
    const qm = quatSlerp(qz(0), qz(180), 0.5)
    expect(2 * Math.acos(qm[3])).toBeCloseTo(Math.PI / 2, 5)
  })

  it('interpolateTRS interpole translation et échelle linéairement', () => {
    const a: TRS = { translation: [0, 0, 0], rotation: qz(0), scale: [1, 1, 1] }
    const b: TRS = { translation: [10, 20, 30], rotation: qz(0), scale: [3, 3, 3] }
    const mid = interpolateTRS(a, b, 0.5)
    expect(mid.translation[0]).toBeCloseTo(5, 6)
    expect(mid.translation[1]).toBeCloseTo(10, 6)
    expect(mid.translation[2]).toBeCloseTo(15, 6)
    expect(mid.scale[0]).toBeCloseTo(2, 6)
  })
})

describe('math3d — CDT avec trous', () => {
  it('un carré à trou carré produit 8 triangles (n + 2h − 2)', () => {
    const outer: [number, number][] = [
      [-2, -2], [2, -2], [2, 2], [-2, 2],
    ]
    const hole: [number, number][] = [
      [-1, -1], [1, -1], [1, 1], [-1, 1],
    ]
    const tris = triangulatePolygonWithHoles(outer, [hole])
    expect(tris.length).toBe(8 * 3)
    for (const i of tris) expect(i).toBeGreaterThanOrEqual(0)
  })

  it('un polygone simple sans trou (carré) produit 2 triangles', () => {
    const outer: [number, number][] = [
      [0, 0], [2, 0], [2, 2], [0, 2],
    ]
    expect(triangulatePolygonWithHoles(outer).length).toBe(2 * 3)
  })

  it('un polygone concave (L) sans trou produit 4 triangles', () => {
    const outer: [number, number][] = [
      [0, 0], [4, 0], [4, 2], [2, 2], [2, 4], [0, 4],
    ]
    expect(triangulatePolygonWithHoles(outer).length).toBe(4 * 3)
  })

  it('un triangle à trou triangulaire produit 6 triangles', () => {
    const outer: [number, number][] = [
      [0, 0], [4, 0], [0, 4],
    ]
    const hole: [number, number][] = [
      [1, 1], [2, 1], [1, 2],
    ]
    expect(triangulatePolygonWithHoles(outer, [hole]).length).toBe(6 * 3)
  })
})

describe('math3d — SDF', () => {
  it('smin lisse au voisinage de la transition et converge vers min quand k→0', () => {
    // h = clamp(½ + ½·(−0.3−0.3)/1) = 0.2 → −0.3·0.8 + 0.3·0.2 − 0.2·0.8 = −0.34
    expect(smin(0.3, -0.3, 1)).toBeCloseTo(-0.34, 6)
    expect(smin(0.3, -0.3, 0.0001)).toBeCloseTo(-0.3, 3)
  })

  it('une sphère SDF produit un maillage non vide, indexé, à indices valides', () => {
    const mesh = sdfToMesh(sdSphere(1), [-2, -2, -2], [2, 2, 2], 16)
    expect(mesh.indices.length).toBeGreaterThan(0)
    expect(mesh.indices.length % 3).toBe(0)
    expect(mesh.positions.length % 3).toBe(0)
    const maxIdx = mesh.indices.reduce((m, i) => (i > m ? i : m), 0)
    expect(maxIdx).toBeLessThan(mesh.positions.length / 3)
  })
})
