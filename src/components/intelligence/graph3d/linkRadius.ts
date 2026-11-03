// ============================================================================
// linkRadius — épaisseur réelle aux confluences
// ============================================================================
//
// PHASE 3 du plan Organic Neural Network V3.
//
// LE DÉFAUT. Chaque conduit avait un rayon CONSTANT. Un tronc et un capillaire
// avaient donc la même section, et les branches se terminaient en biseau net —
// « des extrémités brutalement coupées », exactement ce que la spec refuse.
//
// LA LOI (explicitement une MÉTAPHORE, pas une physique) :
//
//     r_parent^γ ≈ Σ r_child^γ        avec γ = 3 par défaut
//
// C'est la loi de Murray des réseaux vasculaires : la section du parent vaut la
// somme des sections de ses enfants, ce qui rend le gonflement visible quand
// plusieurs chemins se rejoignent. Elle ne prétend RIEN dire des relations
// logicielles ; elle sert uniquement à faire lire une confluence.
//
// Module pur : aucun three.js, aucun état, déterministe.

/** γ de la loi de confluence. 3 est la valeur des réseaux vasculaires. */
export const DEFAULT_GAMMA = 3

/** Bornes visuelles : on ne descend pas sous un capillaire lisible, on ne monte pas en boudin. */
export interface RadiusBounds {
  min: number
  max: number
}

export const DEFAULT_BOUNDS: RadiusBounds = { min: 0.12, max: 1 }

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

/**
 * Rayon du PARENT qui regroupe ces enfants : `r^γ = Σ enfants^γ`.
 *
 * L'argument est la liste des rayons d'enfants déjà calculés ; la fonction
 * n'invente aucun enfant et ne crée aucune relation — elle répond seulement à
 * « quelle section faut-il pour porter tout ça ».
 */
export function parentRadius(childRadii: readonly number[], gamma = DEFAULT_GAMMA): number {
  if (childRadii.length === 0) return 0
  let sum = 0
  for (const r of childRadii) sum += Math.pow(Math.max(0, r), gamma)
  return Math.pow(sum, 1 / gamma)
}

/**
 * Répartition des rayons d'enfants pour un parent donné, proportionnelle à
 * `charge^(1/γ)`. La somme des puissances γ des enfants rend EXACTEMENT la
 * puissance γ du parent (à l'erreur flottante près), et un enfant de charge nulle
 * reçoit un rayon nul — jamais un rayon négatif.
 */
export function childRadii(parent: number, loads: readonly number[], gamma = DEFAULT_GAMMA): number[] {
  const total = loads.reduce((acc, l) => acc + Math.max(0, l), 0)
  if (total <= 0 || parent <= 0) return loads.map(() => 0)
  return loads.map((l) => Math.pow(Math.max(0, l) / total, 1 / gamma) * parent)
}

/**
 * Profil continu du rayon le long d'une branche.
 *
 * `s` est la position curviligne normalisée : 0 au parent, 1 à l'extrémité.
 * Smoothstep, donc dérivée nulle aux deux bouts : aucune cassure ni au départ
 * ni à l'arrivée. `ease` > 0,5 garde le conduit épais plus longtemps (le
 * gonflement reste près de la confluence) ; < 0,5 il s'amincit tôt.
 */
export function radiusAt(
  s: number,
  startRadius: number,
  endRadius: number,
  ease = 0.5,
  bounds: RadiusBounds = DEFAULT_BOUNDS,
): number {
  const t = clamp(s, 0, 1)
  const e = clamp(ease, 0.01, 0.99)
  // Smoothstep généralisé : 0 et 1 aux bornes, dérivée nulle aux deux bouts.
  const k = t <= e ? (t / e) * 0.5 : 0.5 + ((t - e) / (1 - e)) * 0.5
  const w = k * k * (3 - 2 * k)
  const r = startRadius + (endRadius - startRadius) * w
  return clamp(r, bounds.min, bounds.max)
}

/**
 * Vérifie qu'une confluence respecte la loi à une tolérance donnée.
 * Sert aux tests ET au rendu : si une confluence ne la respecte pas, c'est que
 * l'appelant a fourni des rayons incohérents.
 */
export function confluenceHolds(
  parent: number,
  children: readonly number[],
  gamma = DEFAULT_GAMMA,
  tolerance = 1e-6,
): boolean {
  return Math.abs(Math.pow(parent, gamma) - children.reduce((acc, r) => acc + Math.pow(Math.max(0, r), gamma), 0)) <= tolerance
}

// ============================================================================
// LOI D'ÉCHELLE DES LIENS (retour client du 03/11 : « tout est trop gros ; la
// connexion de 1 doit être très fine, plusieurs doivent remonter »)
// ============================================================================
//
// L'UNITÉ est d0 : la distance médiane d'un nœud à son plus proche voisin. Ce
// n'est ni le rayon de la scène (qui dépend de l'origine et des grappes
// lointaines) ni une constante monde : c'est l'espacement que l'œil lit entre
// deux points voisins. Un lien qui porte UNE relation fait 3 % de cet espace.
//
//     r(n) = R1 · n^(1/3)        R1 = 0,03 · d0
//
// γ = 3 : r³ est proportionnel à n, donc la loi de Murray (r³ parent = Σ r³
// enfants) tient EXACTEMENT à chaque jonction dès que n s'additionne — ce qui
// est le cas : un parent porte la somme des relations de ses enfants.

/** Rayon d'un lien d'UNE relation, en part de d0. */
export const LINK_R1_SHARE = 0.03

/**
 * Rayon d'un conduit qui porte `n` relations réelles, pour l'unité `d0`.
 * Strictement croissant en n ; n ≤ 0 ou non fini → 0.
 */
export function linkRadiusFor(n: number, d0: number): number {
  if (!(n > 0) || !(d0 > 0) || !Number.isFinite(n) || !Number.isFinite(d0)) return 0
  return LINK_R1_SHARE * d0 * Math.cbrt(n)
}

/**
 * Plafond de cohérence, appliqué en compression DOUCE.
 *
 * Sous le genou (rMax / 2) le rayon est inchangé ; au-dessus il tend vers rMax
 * sans jamais l'atteindre : x = r − genou devient L·x / (x + L), avec
 * L = rMax − genou. Continue, de dérivée 1 au genou, et STRICTEMENT croissante
 * — 10⁶ reste plus épais que 10⁵. Pas d'exponentielle : 1 − e^(−x/L) sature
 * au flottant dès x ≈ 37·L, et 10⁵ et 10⁶ y devenaient égaux ; la forme
 * rationnelle reste distinguable jusqu'à x ≈ 10¹⁵·L.
 *
 * Conséquence assumée : au-dessus du genou, Murray n'est plus qu'approché (le
 * parent est compressé plus que chacun de ses enfants).
 */
export function softCap(r: number, rMax: number): number {
  if (!(rMax > 0) || !Number.isFinite(rMax)) return r
  const knee = rMax / 2
  if (r <= knee) return r
  const span = rMax - knee
  const x = r - knee
  return knee + (span * x) / (x + span)
}

/**
 * d0 : distance médiane d'un point à son plus proche voisin.
 *
 * Grille spatiale (pas d'O(n²)) ; au plus `maxSample` points interrogés, pris à
 * pas régulier (déterministe), contre TOUS les points. Les doublons exacts
 * (distance nulle) sont ignorés. Moins de deux points distincts → 0.
 */
export function nearestNeighbourScale(
  points: ArrayLike<{ x: number; y: number; z: number }>,
  maxSample = 2000,
): number {
  const n = points.length
  if (n < 2) return 0
  let minX = Infinity, minY = Infinity, minZ = Infinity
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
  for (let i = 0; i < n; i++) {
    const p = points[i]
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.z < minZ) minZ = p.z
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
    if (p.z > maxZ) maxZ = p.z
  }
  const ex = maxX - minX, ey = maxY - minY, ez = maxZ - minZ
  const extent = Math.max(ex, ey, ez)
  if (!(extent > 0)) return 0
  // Cellule ≈ espacement moyen : ~1 point par cellule, sur le volume occupé
  // (les dimensions plates ne comptent pas pour zéro).
  const floor = extent * 1e-3
  const vol = Math.max(ex, floor) * Math.max(ey, floor) * Math.max(ez, floor)
  const cell = Math.max(floor, Math.cbrt(vol / n))
  const key = (i: number, j: number, k: number) => `${i},${j},${k}`
  const grid = new Map<string, number[]>()
  const ci = (v: number, lo: number) => Math.floor((v - lo) / cell)
  for (let i = 0; i < n; i++) {
    const p = points[i]
    const k = key(ci(p.x, minX), ci(p.y, minY), ci(p.z, minZ))
    const list = grid.get(k)
    if (list) list.push(i)
    else grid.set(k, [i])
  }
  const step = Math.max(1, Math.ceil(n / maxSample))
  const found: number[] = []
  const maxRing = Math.ceil(extent / cell) + 1
  for (let s = 0; s < n; s += step) {
    const p = points[s]
    const gi = ci(p.x, minX), gj = ci(p.y, minY), gk = ci(p.z, minZ)
    let best = Infinity
    for (let ring = 0; ring <= maxRing; ring++) {
      // Un voisin trouvé à distance d est définitif dès que l'anneau suivant
      // ne peut plus rien contenir de plus proche.
      if (best <= (ring - 1) * cell) break
      for (let i = gi - ring; i <= gi + ring; i++) {
        for (let j = gj - ring; j <= gj + ring; j++) {
          for (let k = gk - ring; k <= gk + ring; k++) {
            if (Math.max(Math.abs(i - gi), Math.abs(j - gj), Math.abs(k - gk)) !== ring) continue
            const list = grid.get(key(i, j, k))
            if (!list) continue
            for (const o of list) {
              if (o === s) continue
              const q = points[o]
              const d = Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z)
              if (d > 0 && d < best) best = d
            }
          }
        }
      }
    }
    if (Number.isFinite(best)) found.push(best)
  }
  if (found.length === 0) return 0
  found.sort((a, b) => a - b)
  return found[found.length >> 1]
}
