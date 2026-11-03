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
