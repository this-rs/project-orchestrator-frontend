// GENERATED from website@8ff26ee08f7be0342973cc35bcffb837b7fc5e0f:src/three/iso/triangulate.ts by scripts/sync-iso-lib.mjs — do not edit.
// @ts-nocheck — typechecked on the site (TypeScript 6, strict + noUncheckedIndexedAccess); TS 5.7 here infers differently.
/**
 * Triangulation des faces planes des machines (rendu WebGL). Module PUR, sans import : lu par Node dans les tests.
 */
type Vec3 = readonly [number, number, number]

/**
 * Triangulation d'une face plane : éventail si elle est convexe, sinon découpage par oreilles (anneaux complets,
 * secteurs, étoiles : un éventail tirerait des triangles en travers du trou). Rend des triplets d'indices.
 */
export function triangulate(pts: readonly Vec3[], nx: number, ny: number, nz: number): number[] {
  const n = pts.length
  // Anneau complet (`annulus` de 0 à 2π) : polygone à fente, l'arc extérieur puis l'intérieur à rebours, avec un sommet
  // de couture en double à chaque bout. On le coud en bande : le point k de l'extérieur avec le point n−1−k de l'intérieur.
  const same = (a: Vec3, b: Vec3) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 1e-7
  if (n >= 8 && n % 2 === 0 && same(pts[0]!, pts[n / 2 - 1]!) && same(pts[n / 2]!, pts[n - 1]!)) {
    const out: number[] = []
    for (let k = 0; k < n / 2 - 1; k++) out.push(k, k + 1, n - 2 - k, k, n - 2 - k, n - 1 - k)
    return out
  }
  // Projection 2D sur le plan le plus ouvert (on laisse tomber l'axe dominant de la normale).
  const ax = Math.abs(nx)
  const ay = Math.abs(ny)
  const az = Math.abs(nz)
  const [i0, i1, sgn] = az >= ax && az >= ay ? [0, 1, nz] : ax >= ay ? [1, 2, nx] : [2, 0, ny]
  const P = pts.map((p) => [p[i0]!, p[i1]!] as const)
  const cross = (a: number, b: number, c: number) => (P[b]![0] - P[a]![0]) * (P[c]![1] - P[a]![1]) - (P[b]![1] - P[a]![1]) * (P[c]![0] - P[a]![0])
  const dir = sgn >= 0 ? 1 : -1
  let convex = true
  for (let i = 0; i < n && convex; i++) if (cross(i, (i + 1) % n, (i + 2) % n) * dir < -1e-9) convex = false
  const out: number[] = []
  if (convex) {
    for (let i = 1; i < n - 1; i++) out.push(0, i, i + 1)
    return out
  }
  const idx = Array.from({ length: n }, (_, i) => i)
  const inside = (p: number, a: number, b: number, c: number) => {
    const d1 = cross(a, b, p) * dir
    const d2 = cross(b, c, p) * dir
    const d3 = cross(c, a, p) * dir
    return d1 > 1e-12 && d2 > 1e-12 && d3 > 1e-12
  }
  let guard = n * n
  while (idx.length > 3 && guard-- > 0) {
    let clipped = false
    for (let k = 0; k < idx.length; k++) {
      const a = idx[(k + idx.length - 1) % idx.length]!
      const b = idx[k]!
      const c = idx[(k + 1) % idx.length]!
      if (cross(a, b, c) * dir <= 1e-12) continue
      let ear = true
      for (const q of idx) {
        if (q === a || q === b || q === c) continue
        if (inside(q, a, b, c)) {
          ear = false
          break
        }
      }
      if (!ear) continue
      out.push(a, b, c)
      idx.splice(k, 1)
      clipped = true
      break
    }
    if (!clipped) {
      // Plus d'oreille : retirer un sommet aligné (doublon de couture d'un anneau complet), sans triangle.
      const k = idx.findIndex((b, j) => Math.abs(cross(idx[(j + idx.length - 1) % idx.length]!, b, idx[(j + 1) % idx.length]!)) <= 1e-12)
      if (k < 0) break
      idx.splice(k, 1)
    }
  }
  if (idx.length === 3) out.push(idx[0]!, idx[1]!, idx[2]!)
  return out
}
