// GENERATED from website@4dfb9f9807e5ff890ea2007962062eef1398c7d5:src/three/iso/polygon.ts by scripts/sync-iso-lib.mjs — do not edit.
// @ts-nocheck — typechecked on the site (TypeScript 6, strict + noUncheckedIndexedAccess); TS 5.7 here infers differently.
/**
 * Triangulation d'un polygone SIMPLE ou À TROUS, dans le plan.
 *
 * Pourquoi ce module : le moteur savait dessiner un capuchon comme UN polygone (n-gone) et laisser le rendu le
 * trianguler. Avec un trou, ce n'est plus un polygone mais une surface trouée : il faut découper soi-même. On procède en
 * deux temps, comme tous les triangulateurs (earcut, libtess) :
 *   1. PONTS — on relie chaque trou au contour extérieur par un segment dégagé, ce qui donne UNE seule boucle ;
 *   2. OREILLES — on retire des triangles d'oreille jusqu'à épuisement.
 * Module pur (aucun import du moteur) : il se teste sans GPU.
 */

export type P2 = readonly [number, number]

const area = (a: P2, b: P2, c: P2) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])

/** Oriente une boucle dans le sens anti-horaire (les trous seront orientés à l'inverse). */
export function ccw(ring: readonly P2[]): P2[] {
  let s = 0
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!
    const b = ring[(i + 1) % ring.length]!
    s += a[0] * b[1] - b[0] * a[1]
  }
  return s < 0 ? [...ring].reverse() : [...ring]
}

const inside = (a: P2, b: P2, c: P2, p: P2) => {
  const d1 = area(a, b, p)
  const d2 = area(b, c, p)
  const d3 = area(c, a, p)
  return d1 >= 0 && d2 >= 0 && d3 >= 0
}

/**
 * Relie un trou au contour par un pont : on cherche le sommet du trou le plus à DROITE, puis le sommet du contour
 * qui lui fait face sans qu'aucune arête ne coupe le segment. La boucle résultante passe deux fois par les deux
 * sommets du pont — c'est ce qui « ouvre » le trou dans la surface.
 */
function bridge(outer: readonly P2[], hole: readonly P2[]): P2[] {
  let hi = 0
  for (let i = 1; i < hole.length; i++) if (hole[i]![0] > hole[hi]![0]) hi = i
  const h = hole[hi]!
  // Candidats = sommets du contour à droite du trou, du plus proche au plus loin. On prend le premier dont le pont ne
  // coupe AUCUNE arête du contour : sans ce test, le deuxième trou se reliait à travers le premier (aire fausse).
  const cand = outer
    .map((o, i) => ({ i, d: (o[0] - h[0]) ** 2 + (o[1] - h[1]) ** 2 }))
    .filter((c) => outer[c.i]![0] >= h[0])
    .sort((a, b) => a.d - b.d)
  const seg = (a: P2, b: P2, c: P2, d: P2) => {
    const s1 = area(a, b, c)
    const s2 = area(a, b, d)
    const s3 = area(c, d, a)
    const s4 = area(c, d, b)
    return s1 * s2 < 0 && s3 * s4 < 0
  }
  let pick = outer.length ? 0 : 0
  for (const c of cand) {
    const o = outer[c.i]!
    let clean = true
    for (let k = 0; k < outer.length; k++) {
      const a = outer[k]!
      const b = outer[(k + 1) % outer.length]!
      if (a === o || b === o || a === h) continue
      if (seg(h, o, a, b)) { clean = false; break }
    }
    if (clean) { pick = c.i; break }
  }
  const rotated = [...hole.slice(hi), ...hole.slice(0, hi)]
  return [...outer.slice(0, pick + 1), ...rotated, rotated[0]!, ...outer.slice(pick)]
}

/** Découpe une boucle simple en triangles (indices dans la boucle fournie). */
export function earClip(ring: readonly P2[]): [number, number, number][] {
  const n = ring.length
  if (n < 3) return []
  const idx = [...Array(n).keys()]
  const out: [number, number, number][] = []
  let guard = n * n
  while (idx.length > 3 && guard-- > 0) {
    let clipped = false
    for (let i = 0; i < idx.length; i++) {
      const i0 = idx[(i + idx.length - 1) % idx.length]!
      const i1 = idx[i]!
      const i2 = idx[(i + 1) % idx.length]!
      const a = ring[i0]!
      const b = ring[i1]!
      const c = ring[i2]!
      if (area(a, b, c) <= 1e-12) continue // oreille plate ou concave : on passe
      let ok = true
      for (const j of idx) {
        if (j === i0 || j === i1 || j === i2) continue
        const q = ring[j]!
        // Un pont fait passer DEUX FOIS par les mêmes sommets : un point confondu avec un sommet du triangle ne peut pas
        // être « à l intérieur », sinon aucune oreille n est jamais acceptée et la boucle rend zéro triangle.
        const same = (p2: P2) => Math.abs(p2[0] - q[0]) < 1e-9 && Math.abs(p2[1] - q[1]) < 1e-9
        if (same(a) || same(b) || same(c)) continue
        if (inside(a, b, c, q)) {
          ok = false
          break
        }
      }
      if (!ok) continue
      out.push([i0, i1, i2])
      idx.splice(i, 1)
      clipped = true
      break
    }
    if (!clipped) break // plus d'oreille (boucle dégénérée) : on rend ce qu'on a
  }
  if (idx.length === 3) out.push([idx[0]!, idx[1]!, idx[2]!])
  return out
}

/**
 * Triangule un polygone à trous. Rend des triangles en COORDONNÉES (pas en indices) : l'appelant les projette dans
 * l'espace, ce qui évite de promener deux systèmes d'indices.
 */
export function triangulateWithHoles(outer: readonly P2[], holes: readonly (readonly P2[])[] = []): [P2, P2, P2][] {
  // UN trou pour l'instant. Le pont vers un second trou traverse le premier et l'aire devient fausse (mesuré : 54 au
  // lieu de 80). On refuse plutôt que de dessiner faux — le jour où les ponts seront vérifiés contre TOUS les trous
  // déjà reliés, la limite tombera.
  if (holes.length > 1) throw new Error('profils à plusieurs trous : pas encore supporté (un seul trou pour l instant)')
  let ring = ccw(outer)
  // Les trous se relient du plus à droite au plus à gauche : un pont ne peut alors pas traverser un trou déjà relié.
  const sorted = holes.map((h) => ccw(h).reverse()).sort((a, b) => Math.max(...b.map((p) => p[0])) - Math.max(...a.map((p) => p[0])))
  for (const hole of sorted) ring = bridge(ring, hole)
  // TOUS les triangles dans le MÊME sens : un mélange laisse des triangles vus de dos, donc cullés ou éclairés
  // autrement — c était les arêtes visibles sur le capuchon (mesuré au rendu).
  return earClip(ring).map(([a, b, c]) => {
    const t: [P2, P2, P2] = [ring[a]!, ring[b]!, ring[c]!]
    return area(t[0], t[1], t[2]) < 0 ? ([t[0], t[2], t[1]] as [P2, P2, P2]) : t
  })
}
