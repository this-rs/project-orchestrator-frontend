/**
 * Cœur mathématique du moteur 3D général — module AUTONOME (aucun import).
 *
 * Vague 1 — périmètre exclusif :
 *   1. Modèle TRS (translation + quaternion + échelle) aplati en Mat4 colonne-majeur
 *      (la forme consommée par le GPU), avec composition et interpolation.
 *   2. Triangulation CDT (Delaunay contraint) de polygones à trous.
 *   3. Primitives SDF + combinators booléens + `smin` polynomial, et conversion
 *      SDF → maillage par marching tetrahedra (simplification de marching cubes).
 *
 * Ne pas importer depuis `scene.ts` / `ast.ts` (modifiés en parallèle par d'autres
 * agents) ni depuis les modules générés du site : ce fichier est volontairement
 * sans aucune dépendance, TypeScript strict, zéro dépendance externe.
 */

export type Vec3 = [number, number, number]
export type Vec2 = [number, number]
/** Quaternion unitaire, convention (x, y, z, w) — w en dernier (comme gl-matrix / three.js). */
export type Quat = [number, number, number, number]

/* =========================== 1. Quaternions, Mat4, TRS =========================== */

export const quatIdentity = (): Quat => [0, 0, 0, 1]

/** Quaternion de rotation d'angle `angle` (radians) autour d'un axe quelconque (normalisé en interne). */
export function quatFromAxisAngle(axis: Vec3, angle: number): Quat {
  const half = angle / 2
  const s = Math.sin(half)
  const l = Math.hypot(axis[0], axis[1], axis[2]) || 1
  return [(axis[0] / l) * s, (axis[1] / l) * s, (axis[2] / l) * s, Math.cos(half)]
}

/** Produit de Hamilton q₁·q₂ (rotation q₂ suivie de q₁). */
export function quatMultiply(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a
  const [bx, by, bz, bw] = b
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ]
}

export function quatConjugate(q: Quat): Quat {
  return [-q[0], -q[1], -q[2], q[3]]
}

export function quatNormalize(q: Quat): Quat {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l]
}

/** Rotation d'un vecteur par le quaternion unitaire : v' = q · v · q⁻¹. */
export function quatRotate(q: Quat, v: Vec3): Vec3 {
  const p: Quat = [v[0], v[1], v[2], 0]
  const r = quatMultiply(quatMultiply(q, p), quatConjugate(q))
  return [r[0], r[1], r[2]]
}

export function quatDot(a: Quat, b: Quat): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]
}

/** Interpolation sphérique (chemin le plus court) ; bascule en nlerp près de l'alignement. */
export function quatSlerp(a: Quat, b: Quat, t: number): Quat {
  let bq: Quat = b
  let dot = quatDot(a, bq)
  if (dot < 0) {
    bq = [-bq[0], -bq[1], -bq[2], -bq[3]]
    dot = -dot
  }
  if (dot > 0.9995) {
    return quatNormalize([
      a[0] + (bq[0] - a[0]) * t,
      a[1] + (bq[1] - a[1]) * t,
      a[2] + (bq[2] - a[2]) * t,
      a[3] + (bq[3] - a[3]) * t,
    ])
  }
  const theta0 = Math.acos(dot)
  const theta = theta0 * t
  const sinTheta0 = Math.sin(theta0)
  const s0 = Math.cos(theta) - (dot * Math.sin(theta)) / sinTheta0
  const s1 = Math.sin(theta) / sinTheta0
  return quatNormalize([
    a[0] * s0 + bq[0] * s1,
    a[1] * s0 + bq[1] * s1,
    a[2] * s0 + bq[2] * s1,
    a[3] * s0 + bq[3] * s1,
  ])
}

/** Matrice affine 4×4 colonne-majeur (16 flottants, m[col*4+row]) — la forme attendue par WebGL. */
export type Mat4 = Float32Array

export function mat4Identity(): Mat4 {
  const m = new Float32Array(16)
  m[0] = m[5] = m[10] = m[15] = 1
  return m
}

/** Aplatit un TRS en matrice : M = T · R · S (échelle, puis rotation, puis translation). */
export function trsToMat4(translation: Vec3, rotation: Quat, scale: Vec3): Mat4 {
  const [x, y, z, w] = rotation
  const [sx, sy, sz] = scale
  // Matrice de rotation du quaternion unitaire (lignes/colonnes standard).
  const r00 = 1 - 2 * (y * y + z * z)
  const r01 = 2 * (x * y - w * z)
  const r02 = 2 * (x * z + w * y)
  const r10 = 2 * (x * y + w * z)
  const r11 = 1 - 2 * (x * x + z * z)
  const r12 = 2 * (y * z - w * x)
  const r20 = 2 * (x * z - w * y)
  const r21 = 2 * (y * z + w * x)
  const r22 = 1 - 2 * (x * x + y * y)
  const m = new Float32Array(16)
  m[0] = r00 * sx; m[1] = r10 * sx; m[2] = r20 * sx; m[3] = 0
  m[4] = r01 * sy; m[5] = r11 * sy; m[6] = r21 * sy; m[7] = 0
  m[8] = r02 * sz; m[9] = r12 * sz; m[10] = r22 * sz; m[11] = 0
  m[12] = translation[0]; m[13] = translation[1]; m[14] = translation[2]; m[15] = 1
  return m
}

/** Produit a·b (colonne-majeur). */
export function mulMat4(a: Mat4, b: Mat4): Mat4 {
  const r = new Float32Array(16)
  for (let c = 0; c < 4; c++) {
    for (let row = 0; row < 4; row++) {
      let s = 0
      for (let k = 0; k < 4; k++) s += a[k * 4 + row] * b[c * 4 + k]
      r[c * 4 + row] = s
    }
  }
  return r
}

/** Application à un point (w = 1). */
export function applyMat4(m: Mat4, p: Vec3): Vec3 {
  const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15]
  const iw = w === 0 ? 0 : 1 / w
  return [
    (m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12]) * iw,
    (m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13]) * iw,
    (m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]) * iw,
  ]
}

/** Application à une direction (w = 0, sans translation). */
export function applyMat4Dir(m: Mat4, v: Vec3): Vec3 {
  return [
    m[0] * v[0] + m[4] * v[1] + m[8] * v[2],
    m[1] * v[0] + m[5] * v[1] + m[9] * v[2],
    m[2] * v[0] + m[6] * v[1] + m[10] * v[2],
  ]
}

/** Nœud de graphe de scène : forme d'auteur décomposée (translation + quaternion + échelle). */
export interface TRS {
  translation: Vec3
  rotation: Quat
  scale: Vec3
}

export const trsIdentity = (): TRS => ({
  translation: [0, 0, 0],
  rotation: quatIdentity(),
  scale: [1, 1, 1],
})

/**
 * Compose `parent ∘ child` (on applique d'abord `child`, puis `parent`).
 * Exact pour une échelle uniforme (et pour les rotations sans échelle) ; pour une
 * échelle non uniforme combinée à une rotation, la composition exacte passe par
 * `mulMat4(trsToMat4(parent), trsToMat4(child))` (un TRS ne peut pas représenter un cisaillement).
 */
export function composeTRS(parent: TRS, child: TRS): TRS {
  const rotation = quatNormalize(quatMultiply(parent.rotation, child.rotation))
  const scale: Vec3 = [
    parent.scale[0] * child.scale[0],
    parent.scale[1] * child.scale[1],
    parent.scale[2] * child.scale[2],
  ]
  const rtc = quatRotate(parent.rotation, child.translation)
  const translation: Vec3 = [
    parent.translation[0] + parent.scale[0] * rtc[0],
    parent.translation[1] + parent.scale[1] * rtc[1],
    parent.translation[2] + parent.scale[2] * rtc[2],
  ]
  return { translation, rotation, scale }
}

/** Applique un TRS à un point : échelle → rotation → translation. */
export function applyTRS(trs: TRS, p: Vec3): Vec3 {
  const s: Vec3 = [p[0] * trs.scale[0], p[1] * trs.scale[1], p[2] * trs.scale[2]]
  const r = quatRotate(trs.rotation, s)
  return [r[0] + trs.translation[0], r[1] + trs.translation[1], r[2] + trs.translation[2]]
}

/** Interpolation TRS : lerp de translation/échelle, slerp de rotation. */
export function interpolateTRS(a: TRS, b: TRS, t: number): TRS {
  const lerp = (x: number, y: number) => x + (y - x) * t
  return {
    translation: [lerp(a.translation[0], b.translation[0]), lerp(a.translation[1], b.translation[1]), lerp(a.translation[2], b.translation[2])],
    rotation: quatSlerp(a.rotation, b.rotation, t),
    scale: [lerp(a.scale[0], b.scale[0]), lerp(a.scale[1], b.scale[1]), lerp(a.scale[2], b.scale[2])],
  }
}

/* =========================== 2. CDT (Delaunay contraint) =========================== */

type Tri = [number, number, number]

/** Orientation 2D : > 0 sens direct, < 0 sens indirect, 0 colinéaire. */
function orient2(a: Vec2, b: Vec2, c: Vec2): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
}

/** Aire signée double (positive si sens direct). */
function signedArea2(poly: Vec2[]): number {
  let s = 0
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    s += a[0] * b[1] - b[0] * a[1]
  }
  return s
}

function range(start: number, len: number): number[] {
  const r: number[] = []
  for (let i = 0; i < len; i++) r.push(start + i)
  return r
}

function triEdges(t: Tri): [number, number][] {
  return [
    [t[0], t[1]],
    [t[1], t[2]],
    [t[2], t[0]],
  ]
}

function edgeKey(u: number, v: number): string {
  return u < v ? `${u}_${v}` : `${v}_${u}`
}

function unEdgeKey(k: string): [number, number] {
  const i = k.indexOf('_')
  return [Number(k.slice(0, i)), Number(k.slice(i + 1))]
}

/** `p` est dans (ou sur) le cercle circonscrit du triangle direct (a, b, c). */
function inCircle(a: Vec2, b: Vec2, c: Vec2, p: Vec2): boolean {
  const ax = a[0] - p[0], ay = a[1] - p[1]
  const bx = b[0] - p[0], by = b[1] - p[1]
  const cx = c[0] - p[0], cy = c[1] - p[1]
  const det =
    (ax * ax + ay * ay) * (bx * cy - cx * by) -
    (bx * bx + by * by) * (ax * cy - cx * ay) +
    (cx * cx + cy * cy) * (ax * by - bx * ay)
  return det > -1e-9
}

function orientCCW(t: Tri, pts: Vec2[]): Tri {
  return orient2(pts[t[0]], pts[t[1]], pts[t[2]]) < 0 ? [t[0], t[2], t[1]] : t
}

function buildEdgeMap(tris: Tri[]): Map<string, number[]> {
  const m = new Map<string, number[]>()
  for (let t = 0; t < tris.length; t++) {
    for (const e of triEdges(tris[t])) {
      const k = edgeKey(e[0], e[1])
      const arr = m.get(k)
      if (arr) arr.push(t)
      else m.set(k, [t])
    }
  }
  return m
}

function neighborAcross(edgeMap: Map<string, number[]>, t: number, u: number, v: number): number {
  const list = edgeMap.get(edgeKey(u, v))
  if (!list) return -1
  for (const x of list) if (x !== t) return x
  return -1
}

function sameEdge(e1: [number, number], e2: [number, number]): boolean {
  return (e1[0] === e2[0] && e1[1] === e2[1]) || (e1[0] === e2[1] && e1[1] === e2[0])
}

function segmentsIntersectProperly(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const d1 = orient2(a, b, c)
  const d2 = orient2(a, b, d)
  const d3 = orient2(c, d, a)
  const d4 = orient2(c, d, b)
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}

/** Triangles traversés par le segment ouvert (a, b), en ordre de traversée. */
function collectCrossed(a: number, b: number, tris: Tri[], pts: Vec2[], edgeMap: Map<string, number[]>): number[] {
  const pa = pts[a]
  const pb = pts[b]
  let t = -1
  for (let i = 0; i < tris.length; i++) {
    if (tris[i][0] === a || tris[i][1] === a || tris[i][2] === a) {
      t = i
      break
    }
  }
  if (t < 0) return []
  const crossed: number[] = []
  let entry: [number, number] | null = null
  let guard = 0
  while (guard++ < 100000) {
    const T = tris[t]
    if (T[0] === b || T[1] === b || T[2] === b) {
      if (!edgeMap.has(edgeKey(a, b))) crossed.push(t)
      break
    }
    let exit: [number, number] | null = null
    for (const e of triEdges(T)) {
      if (entry && sameEdge(e, entry)) continue
      if (segmentsIntersectProperly(pa, pb, pts[e[0]], pts[e[1]])) {
        exit = e
        break
      }
    }
    if (!exit) break
    crossed.push(t)
    const nb = neighborAcross(edgeMap, t, exit[0], exit[1])
    if (nb < 0) break
    entry = exit
    t = nb
  }
  return crossed
}

/** Recoud des arêtes non orientées en un cycle simple, en partant de `start`. */
function stitchCycle(boundary: [number, number][], start: number): number[] {
  const adj = new Map<number, number[]>()
  const push = (k: number, v: number) => {
    const arr = adj.get(k)
    if (arr) arr.push(v)
    else adj.set(k, [v])
  }
  for (const [u, v] of boundary) {
    push(u, v)
    push(v, u)
  }
  const cycle = [start]
  let prev = -1
  let cur = start
  let guard = 0
  while (guard++ < 100000) {
    const nexts = adj.get(cur)
    if (!nexts || nexts.length === 0) break
    const next = nexts.find((x) => x !== prev)
    if (next === undefined) break
    if (next === start) break
    cycle.push(next)
    prev = cur
    cur = next
  }
  return cycle
}

function splitCycle(cycle: number[], a: number, b: number): { chain1: number[]; chain2: number[] } {
  const i = Math.min(cycle.indexOf(a), cycle.indexOf(b))
  const j = Math.max(cycle.indexOf(a), cycle.indexOf(b))
  const chain1 = cycle.slice(i, j + 1)
  const chain2 = cycle.slice(j).concat(cycle.slice(0, i + 1))
  return { chain1, chain2 }
}

function pointInTriangle(p: Vec2, a: Vec2, b: Vec2, c: Vec2): boolean {
  const d1 = orient2(a, b, p)
  const d2 = orient2(b, c, p)
  const d3 = orient2(c, a, p)
  return d1 > 1e-12 && d2 > 1e-12 && d3 > 1e-12
}

/** Coupe d'oreilles d'un polygone simple (indices), accumule dans `out`. */
function earClipInto(poly: number[], pts: Vec2[], out: Tri[]): void {
  if (poly.length < 3) return
  const ring = poly.slice()
  if (signedArea2(ring.map((i) => pts[i])) < 0) ring.reverse()
  let guard = ring.length * ring.length + 16
  while (ring.length > 3 && guard-- > 0) {
    let clipped = false
    for (let k = 0; k < ring.length; k++) {
      const a = ring[(k + ring.length - 1) % ring.length]
      const b = ring[k]
      const c = ring[(k + 1) % ring.length]
      if (orient2(pts[a], pts[b], pts[c]) <= 0) continue
      let ear = true
      for (const q of ring) {
        if (q === a || q === b || q === c) continue
        if (pointInTriangle(pts[q], pts[a], pts[b], pts[c])) {
          ear = false
          break
        }
      }
      if (!ear) continue
      out.push([a, b, c])
      ring.splice(k, 1)
      clipped = true
      break
    }
    if (!clipped) break
  }
  if (ring.length === 3) out.push([ring[0], ring[1], ring[2]])
}

function windingNumber(p: Vec2, poly: Vec2[]): number {
  let wn = 0
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    if (a[1] <= p[1]) {
      if (b[1] > p[1] && orient2(a, b, p) > 0) wn++
    } else if (b[1] <= p[1] && orient2(a, b, p) < 0) {
      wn--
    }
  }
  return wn
}

/** Vrai si le point est dans le solide (hors trous), par nombre de tours non nul. */
function inSolid(p: Vec2, outer: Vec2[], holes: Vec2[][]): boolean {
  let wn = windingNumber(p, outer)
  for (const h of holes) wn += windingNumber(p, h)
  return wn !== 0
}

/** Récupère l'arête contrainte (a, b) : retire la cavité traversée et la re-triangule. */
function recoverEdge(a: number, b: number, tris: Tri[], pts: Vec2[]): Tri[] {
  const edgeMap = buildEdgeMap(tris)
  if (edgeMap.has(edgeKey(a, b))) return tris
  const crossed = collectCrossed(a, b, tris, pts, edgeMap)
  if (crossed.length === 0) return tris
  const crossedSet = new Set(crossed)
  const edgeCount = new Map<string, number>()
  for (const t of crossed) {
    for (const e of triEdges(tris[t])) {
      const k = edgeKey(e[0], e[1])
      edgeCount.set(k, (edgeCount.get(k) ?? 0) + 1)
    }
  }
  const boundary: [number, number][] = []
  for (const [k, cnt] of edgeCount) if (cnt === 1) boundary.push(unEdgeKey(k))
  const cycle = stitchCycle(boundary, a)
  const { chain1, chain2 } = splitCycle(cycle, a, b)
  const newTris: Tri[] = []
  earClipInto(chain1, pts, newTris)
  earClipInto(chain2, pts, newTris)
  const out: Tri[] = []
  for (let t = 0; t < tris.length; t++) if (!crossedSet.has(t)) out.push(tris[t])
  for (const t of newTris) out.push(t)
  return out
}

/**
 * Triangulation CDT d'un polygone avec trous.
 * `outer` : contour externe (sens direct ou indirect, normalisé en interne).
 * `holes` : trous, un tableau de contours par trou.
 * Retourne des triplets d'indices dans le tableau `[...outer, ...trous]` aplati.
 *
 * Algorithme : Delaunay incrémental (Bowyer–Watson, super-triangle) puis récupération
 * des arêtes contraintes par cavité + coupe d'oreilles. Cette implémentation de
 * référence est O(n²) (balayage linéaire des triangles) ; le passage à O(n log n)
 * attendu se fait par un index spatial de localisation de point.
 */
export function triangulatePolygonWithHoles(outer: Vec2[], holes: Vec2[][] = []): number[] {
  const outerPts = signedArea2(outer) >= 0 ? outer.slice() : outer.slice().reverse()
  const holePts = holes.map((h) => (signedArea2(h) <= 0 ? h.slice() : h.slice().reverse()))
  const pts: Vec2[] = [...outerPts, ...holePts.flat()]
  const n = pts.length
  if (n < 3) return []

  const contours: number[][] = []
  let off = 0
  contours.push(range(off, outerPts.length))
  off = outerPts.length
  for (const h of holePts) {
    contours.push(range(off, h.length))
    off += h.length
  }
  const constraints: [number, number][] = []
  for (const c of contours) {
    for (let i = 0; i < c.length; i++) constraints.push([c[i], c[(i + 1) % c.length]])
  }

  // Super-triangle englobant.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const p of pts) {
    if (p[0] < minX) minX = p[0]
    if (p[0] > maxX) maxX = p[0]
    if (p[1] < minY) minY = p[1]
    if (p[1] > maxY) maxY = p[1]
  }
  const dmax = Math.max(maxX - minX, maxY - minY, 1)
  const mx = (minX + maxX) / 2
  const my = (minY + maxY) / 2
  const full: Vec2[] = [
    ...pts,
    [mx - 20 * dmax, my - 10 * dmax],
    [mx + 20 * dmax, my - 10 * dmax],
    [mx, my + 20 * dmax],
  ]
  const S0 = n, S1 = n + 1, S2 = n + 2
  let tris: Tri[] = orient2(full[S0], full[S1], full[S2]) < 0 ? [[S0, S2, S1]] : [[S0, S1, S2]]

  // Bowyer–Watson.
  for (let i = 0; i < n; i++) {
    const p = full[i]
    const bad = new Set<number>()
    for (let t = 0; t < tris.length; t++) {
      if (inCircle(full[tris[t][0]], full[tris[t][1]], full[tris[t][2]], p)) bad.add(t)
    }
    const edgeCount = new Map<string, number>()
    for (const t of bad) {
      for (const e of triEdges(tris[t])) {
        const k = edgeKey(e[0], e[1])
        edgeCount.set(k, (edgeCount.get(k) ?? 0) + 1)
      }
    }
    const boundary: [number, number][] = []
    for (const [k, cnt] of edgeCount) if (cnt === 1) boundary.push(unEdgeKey(k))
    const kept: Tri[] = []
    for (let t = 0; t < tris.length; t++) if (!bad.has(t)) kept.push(tris[t])
    for (const [u, v] of boundary) kept.push(orientCCW([i, u, v], full))
    tris = kept
  }

  // Récupération des arêtes contraintes.
  for (const [a, b] of constraints) tris = recoverEdge(a, b, tris, full)

  // Classification : ne garder que les triangles du solide (hors super-triangle et hors trous).
  const out: number[] = []
  for (const t of tris) {
    if (t[0] >= n || t[1] >= n || t[2] >= n) continue
    const cx = (full[t[0]][0] + full[t[1]][0] + full[t[2]][0]) / 3
    const cy = (full[t[0]][1] + full[t[1]][1] + full[t[2]][1]) / 3
    if (!inSolid([cx, cy], outerPts, holePts)) continue
    out.push(t[0], t[1], t[2])
  }
  return out
}

/* =========================== 3. SDF + combinators + isosurface =========================== */

/** Champ de distance signé : f(p) ≤ 0 à l'intérieur, > 0 à l'extérieur. */
export type Sdf = (p: Vec3) => number

const vlen = (v: Vec3): number => Math.hypot(v[0], v[1], v[2])

export const sdSphere = (r: number): Sdf => (p) => vlen(p) - r

export const sdBox = (b: Vec3): Sdf => (p) => {
  const q: Vec3 = [Math.abs(p[0]) - b[0], Math.abs(p[1]) - b[1], Math.abs(p[2]) - b[2]]
  const outside = vlen([Math.max(q[0], 0), Math.max(q[1], 0), Math.max(q[2], 0)])
  const inside = Math.min(Math.max(q[0], q[1], q[2]), 0)
  return outside + inside
}

export const sdRoundedBox = (b: Vec3, r: number): Sdf => {
  const inner = sdBox([b[0] - r, b[1] - r, b[2] - r])
  return (p) => inner(p) - r
}

export const sdCylinder = (h: number, r: number): Sdf => (p) => {
  const d: Vec2 = [Math.hypot(p[0], p[1]) - r, Math.abs(p[2]) - h / 2]
  return Math.min(Math.max(d[0], d[1]), 0) + Math.hypot(Math.max(d[0], 0), Math.max(d[1], 0))
}

export const sdCapsule = (a: Vec3, b: Vec3, r: number): Sdf => (p) => {
  const pa: Vec3 = [p[0] - a[0], p[1] - a[1], p[2] - a[2]]
  const ba: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const denom = ba[0] * ba[0] + ba[1] * ba[1] + ba[2] * ba[2]
  const h = Math.max(0, Math.min(1, (pa[0] * ba[0] + pa[1] * ba[1] + pa[2] * ba[2]) / (denom || 1)))
  return vlen([pa[0] - ba[0] * h, pa[1] - ba[1] * h, pa[2] - ba[2] * h]) - r
}

export const sdTorus = (R: number, r: number): Sdf => (p) => {
  const d: Vec2 = [Math.hypot(p[0], p[1]) - R, p[2]]
  return Math.hypot(d[0], d[1]) - r
}

/* Combinators booléens durs. */
export function union(a: Sdf, b: Sdf): Sdf {
  return (p) => Math.min(a(p), b(p))
}
export function intersection(a: Sdf, b: Sdf): Sdf {
  return (p) => Math.max(a(p), b(p))
}
export function subtraction(a: Sdf, b: Sdf): Sdf {
  return (p) => Math.max(a(p), -b(p))
}

/** Union lisse polynomiale C¹ (rayon de raccord `k`) : `smin(a,b,k) = mix(b,a,h) − k·h·(1−h)`. */
export function smin(a: number, b: number, k: number): number {
  const h = Math.min(1, Math.max(0, 0.5 + (0.5 * (b - a)) / k))
  return b * (1 - h) + a * h - k * h * (1 - h)
}

/** Intersection lisse : `smax(a,b,k) = −smin(−a,−b,k)`. */
export function smax(a: number, b: number, k: number): number {
  return -smin(-a, -b, k)
}

export function smoothUnion(a: Sdf, b: Sdf, k: number): Sdf {
  return (p) => smin(a(p), b(p), k)
}
export function smoothSubtraction(a: Sdf, b: Sdf, k: number): Sdf {
  return (p) => smin(a(p), -b(p), k)
}

/** Arrondi (offset) : gonfle le solide de `r`. */
export function offset(s: Sdf, r: number): Sdf {
  return (p) => s(p) - r
}
/** Coque (onion) : épaissit en coquille d'épaisseur `r`. */
export function onion(s: Sdf, r: number): Sdf {
  return (p) => Math.abs(s(p)) - r
}

export interface Mesh {
  positions: Float32Array
  indices: Uint32Array
}

const MC_CORNERS: [number, number, number][] = [
  [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
  [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
]
/** Cube découpé en 6 tétraèdres autour de la diagonale 0–6 (pavage standard). */
const MC_TETS: [number, number, number, number][] = [
  [0, 1, 2, 6], [0, 2, 3, 6], [0, 3, 7, 6], [0, 7, 4, 6], [0, 4, 5, 6], [0, 5, 1, 6],
]
const MC_TET_EDGES: [number, number][] = [
  [0, 1], [1, 2], [2, 0], [0, 3], [1, 3], [2, 3],
]

/**
 * Conversion SDF → maillage par marching tetrahedra (simplification de marching cubes)
 * sur une grille régulière `res`³ entre `min` et `max`. Les normales ne sont pas
 * calculées ici (elles se dérivent du gradient de la SDF) ; le maillage est indexé
 * et étanche (sommets partagés par clé d'arête de grille).
 */
export function sdfToMesh(sdf: Sdf, min: Vec3, max: Vec3, res: number): Mesh {
  const n = res + 1
  const size: Vec3 = [max[0] - min[0], max[1] - min[1], max[2] - min[2]]
  const values = new Float64Array(n * n * n)
  const nodeId = (ix: number, iy: number, iz: number) => (iz * n + iy) * n + ix
  const posAt = (ix: number, iy: number, iz: number): Vec3 => [
    min[0] + (ix / res) * size[0],
    min[1] + (iy / res) * size[1],
    min[2] + (iz / res) * size[2],
  ]
  for (let iz = 0; iz < n; iz++) {
    for (let iy = 0; iy < n; iy++) {
      for (let ix = 0; ix < n; ix++) values[nodeId(ix, iy, iz)] = sdf(posAt(ix, iy, iz))
    }
  }

  const positions: number[] = []
  const indices: number[] = []
  const cache = new Map<string, number>()
  const addVertex = (g0: [number, number, number], g1: [number, number, number]): number => {
    const a = nodeId(g0[0], g0[1], g0[2])
    const b = nodeId(g1[0], g1[1], g1[2])
    const lo = a < b ? a : b
    const hi = a < b ? b : a
    const key = `${lo}_${hi}`
    const hit = cache.get(key)
    if (hit !== undefined) return hit
    const va = values[a]
    const vb = values[b]
    const t = va / (va - vb)
    const pa = posAt(g0[0], g0[1], g0[2])
    const pb = posAt(g1[0], g1[1], g1[2])
    const idx = positions.length / 3
    positions.push(pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t, pa[2] + (pb[2] - pa[2]) * t)
    cache.set(key, idx)
    return idx
  }

  for (let iz = 0; iz < res; iz++) {
    for (let iy = 0; iy < res; iy++) {
      for (let ix = 0; ix < res; ix++) {
        const cornerVal = MC_CORNERS.map(([dx, dy, dz]) => values[nodeId(ix + dx, iy + dy, iz + dz)])
        const cornerGrid = MC_CORNERS.map(([dx, dy, dz]) => [ix + dx, iy + dy, iz + dz] as [number, number, number])
        for (const tet of MC_TETS) {
          const inside = [cornerVal[tet[0]] < 0, cornerVal[tet[1]] < 0, cornerVal[tet[2]] < 0, cornerVal[tet[3]] < 0]
          const cross: [number, number][] = []
          for (const [e0, e1] of MC_TET_EDGES) {
            if (inside[e0] !== inside[e1]) cross.push([e0, e1])
          }
          const gridOf = (ci: number): [number, number, number] => cornerGrid[tet[ci]]
          if (cross.length === 3) {
            const [p0, p1, p2] = cross.map(([e0, e1]) => addVertex(gridOf(e0), gridOf(e1)))
            indices.push(p0, p1, p2)
          } else if (cross.length === 4) {
            const inC = [0, 1, 2, 3].filter((i) => inside[i])
            const outC = [0, 1, 2, 3].filter((i) => !inside[i])
            const ia = inC[0], ib = inC[1], oa = outC[0], ob = outC[1]
            const q0 = addVertex(gridOf(ia), gridOf(oa))
            const q1 = addVertex(gridOf(ib), gridOf(oa))
            const q2 = addVertex(gridOf(ib), gridOf(ob))
            const q3 = addVertex(gridOf(ia), gridOf(ob))
            indices.push(q0, q1, q2, q0, q2, q3)
          }
        }
      }
    }
  }
  return { positions: Float32Array.from(positions), indices: Uint32Array.from(indices) }
}
