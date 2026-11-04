// ============================================================================
// linkLod — LOD hiérarchique et LOCAL du moteur de liens organiques
// ============================================================================
//
// Brief client (03/11/2026) : « Le LOD doit fonctionner sur l'ensemble de la
// hiérarchie, et non seulement sur trois états globaux. […] Prévoir un
// raffinement local : zoomer une artère ne doit pas imposer la décomposition
// complète de tout le graphe. Transition stable, continue et déterministe, avec
// hystérésis. »
//
// GARANTIE DE LOCALITÉ. `lodFor` ne reçoit que la magnitude et la distance D'UN
// SEUL faisceau. Il n'existe dans ce module aucune fonction qui prenne le graphe,
// une liste de faisceaux ou un niveau « de la scène » : il est donc impossible,
// par construction, qu'un zoom sur une artère décide du niveau d'un autre
// faisceau. L'appelant évalue chaque faisceau avec SA distance (caméra → faisceau)
// et SON `previousDepth`, et le coût du raffinement reste proportionnel à ce qui
// est proche. Aucun état global, aucun aléa : même entrée ⇒ même sortie.
//
// SEUILS PAR PROFONDEUR. Pour passer à la profondeur d (1..3) :
//   - on raffine quand distance < refineBelow / 2^(d-1)
//   - on replie  quand distance > collapseAbove / 2^(d-1)
// Chaque profondeur a donc sa propre zone morte [refineBelow_d, collapseAbove_d],
// de même rapport que la zone de base, et les zones ne se chevauchent pas
// (refineBelow_{d+1} < collapseAbove_{d+1} < refineBelow_d tant que
// collapseAbove < 2·refineBelow ; sinon elles se recouvrent sans nuire, voir
// `lodFor`, car l'évaluation est séquentielle et monotone).
// ============================================================================

import type { Magnitude } from './linkMagnitude'

/** Ce qui est effectivement dessiné pour un faisceau à une distance donnée. */
export interface LodState {
  /** Profondeur de décomposition dessinée : 0 = agrégé, 1 = sous-faisceaux, 2 = canaux par type, 3 = relations réelles. */
  depth: number
  /** Vrai si l'on peut descendre encore (profondeur < profondeur maximale utile). */
  canRefine: boolean
  /** Ce qui est dessiné à ce niveau, pour l'affichage. */
  visible: 'aggregate' | 'subBundles' | 'families' | 'relations'
}

/** Paramètres du LOD. */
export interface LodOptions {
  /** Distance (unités monde) en deçà de laquelle on raffine vers la profondeur 1. */
  refineBelow: number
  /** Distance au-delà de laquelle on replie depuis la profondeur 1 (doit être > refineBelow : c'est l'hystérésis). */
  collapseAbove: number
  /** Profondeur maximale autorisée par l'appelant (budget), bornée à [0, 3]. */
  maxDepth: number
}

/** Profondeur structurelle la plus fine : les relations réelles. */
export const LOD_MAX_STRUCTURAL_DEPTH = 3

const VISIBLE_BY_DEPTH: readonly LodState['visible'][] = [
  'aggregate',
  'subBundles',
  'families',
  'relations',
]

/** Valeurs par défaut : zone morte de 50 % autour du seuil de base, budget complet. */
export const DEFAULT_LOD_OPTIONS: LodOptions = {
  refineBelow: 400,
  collapseAbove: 600,
  maxDepth: LOD_MAX_STRUCTURAL_DEPTH,
}

/**
 * Seuils RELATIFS à la scène, en rayons de scène. Le cadrage place la caméra à
 * ≈ 2,77 R (R / sin(fov/2) × 1,06) : 905 pour 2 000 nœuds,
 * 2 703 pour 20 000. Les seuils absolus 400 / 600 laissaient donc le LOD à 0
 * sur toute scène réelle, même zoomé dans le graphe.
 *
 * Avec 2 R / 3 R : au cadrage on voit l'ensemble (profondeur 0, et 2,77 R est
 * dans la zone morte [2 R, 3 R] de la profondeur 1 : pas de clignotement) ;
 * sous 2 R (on entre dans le nuage) profondeur 1, sous R profondeur 2, sous
 * R / 2 les relations réelles.
 */
export const LOD_REFINE_SCENE_RATIO = 2
export const LOD_COLLAPSE_SCENE_RATIO = 3

/**
 * Options de LOD pour une scène de rayon `sceneRadius` : mêmes rapports
 * distance / rayon ⇒ même profondeur, à toute échelle. Pure.
 */
export function lodOptionsForScene(sceneRadius: number, maxDepth = LOD_MAX_STRUCTURAL_DEPTH): LodOptions {
  if (!Number.isFinite(sceneRadius) || sceneRadius <= 0) {
    throw new RangeError(`sceneRadius doit être un nombre fini > 0, reçu ${sceneRadius}`)
  }
  return {
    refineBelow: LOD_REFINE_SCENE_RATIO * sceneRadius,
    collapseAbove: LOD_COLLAPSE_SCENE_RATIO * sceneRadius,
    maxDepth,
  }
}

/**
 * Fusionne et VALIDE les options. Refus (RangeError) plutôt que normalisation
 * silencieuse : `refineBelow >= collapseAbove` fait osciller le LOD, et on
 * préfère le dire à l'appelant. `maxDepth` est arrondi vers le bas et borné à [0, 3].
 */
function resolveOptions(options?: Partial<LodOptions>): LodOptions {
  const o = { ...DEFAULT_LOD_OPTIONS, ...options }
  if (!Number.isFinite(o.refineBelow) || o.refineBelow <= 0) {
    throw new RangeError(`refineBelow doit être un nombre fini > 0, reçu ${o.refineBelow}`)
  }
  if (!Number.isFinite(o.collapseAbove) || o.collapseAbove <= o.refineBelow) {
    throw new RangeError(
      `collapseAbove (${o.collapseAbove}) doit être > refineBelow (${o.refineBelow}) : sinon pas d'hystérésis`,
    )
  }
  if (Number.isNaN(o.maxDepth)) throw new RangeError('maxDepth ne peut pas être NaN')
  const maxDepth = Math.min(LOD_MAX_STRUCTURAL_DEPTH, Math.max(0, Math.floor(o.maxDepth)))
  return { refineBelow: o.refineBelow, collapseAbove: o.collapseAbove, maxDepth }
}

/**
 * Profondeur maximale utile pour cette magnitude, dans [0, maxDepth].
 *
 * Elle croît avec l'ORDRE DE GRANDEUR, sans table par ordre : `1 + floor(ordre/2)`
 * au-delà de 9 relations, plafonnée à 3. Un filament (1 relation) ne se décompose
 * pas (0) ; 10¹² et 10⁶ atteignent tous deux `relations`, la différence entre eux
 * étant portée par l'ordre et le nombre exact, pas par un niveau de plus.
 */
export function maxUsefulDepth(magnitude: Magnitude, options?: Partial<LodOptions>): number {
  const { maxDepth } = resolveOptions(options)
  const order = magnitude.magnitudeOrder
  const useful = order <= 0 ? 0 : Math.min(LOD_MAX_STRUCTURAL_DEPTH, 1 + Math.floor(order / 2))
  return Math.min(useful, maxDepth)
}

/**
 * Profondeur à dessiner pour UN faisceau, à UNE distance. Voir l'en-tête du
 * module pour la garantie de localité.
 *
 * Sans `previousDepth` : profondeur = nombre de seuils de raffinement franchis
 * (monotone en la distance). Avec `previousDepth` : HYSTÉRÉSIS. On part du niveau
 * précédent (ramené dans [0, utile]) ; on ne le quitte que si la distance
 * franchit le seuil correspondant :
 *   - repli  : tant que distance > collapseAbove / 2^(p-1), p ← p-1
 *   - raffine: tant que distance < refineBelow / 2^p,       p ← p+1
 * Dans la zone morte [refineBelow_p, collapseAbove_p] le niveau ne bouge pas :
 * un aller-retour autour d'un seuil n'oscille donc jamais.
 *
 * @param distance distance caméra → faisceau, ≥ 0 (négative ramenée à 0) ; NaN refusé.
 */
export function lodFor(
  magnitude: Magnitude,
  distance: number,
  options?: Partial<LodOptions>,
  previousDepth?: number,
): LodState {
  const opts = resolveOptions(options)
  if (Number.isNaN(distance)) throw new RangeError('distance ne peut pas être NaN')
  const d = Math.max(0, distance)
  const useful = maxUsefulDepth(magnitude, opts)

  let depth: number
  if (previousDepth === undefined || !Number.isFinite(previousDepth)) {
    depth = 0
  } else {
    depth = Math.min(useful, Math.max(0, Math.floor(previousDepth)))
  }

  // Repli : on quitte la profondeur p si la distance dépasse son seuil de repli.
  while (depth > 0 && d > opts.collapseAbove / 2 ** (depth - 1)) depth -= 1
  // Raffinement : on entre en p+1 si la distance passe sous son seuil.
  while (depth < useful && d < opts.refineBelow / 2 ** depth) depth += 1

  return { depth, canRefine: depth < useful, visible: VISIBLE_BY_DEPTH[depth] }
}
