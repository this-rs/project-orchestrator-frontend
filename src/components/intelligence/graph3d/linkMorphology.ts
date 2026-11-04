// ============================================================================
// linkMorphology — de la magnitude exacte à la forme dessinable d'un faisceau
// ============================================================================
//
// Brief client (03/11/2026) : un faisceau représente 1 relation comme 10¹².
// Un lien unique est un filament, un million un système vasculaire, un milliard
// une organisation de réseaux vasculaires imbriqués.
//
// DEUX RÈGLES :
//  1. Le compte réel est EXACT (bigint, voir `linkMagnitude`). Rien ici ne le
//     convertit en `number` pour le compter.
//  2. JAMAIS de saturation de la QUANTITÉ. La largeur projetée d'un conduit est
//     bornée (`WIDTH_CEILING`) pour la lisibilité ; au-delà, la magnitude passe
//     dans la STRUCTURE : sous-canaux, strates, profondeur hiérarchique.
//     `clamp(log10(count)/4, 0, 1)` est interdit : il rend 10⁴, 10⁶ et 10⁹ égaux.
//
// LA LOI (une seule abscisse, continue, sans seuil par ordre de grandeur)
//
//   t = ordre + log10(mantisse)            ≈ log10(compte), exact à l'ordre près
//
//   largeur  = LARGEUR_MIN + (PLAFOND − LARGEUR_MIN) · min(1, t / T_SATURATION)
//              monotone, bornée ; `saturated` dès t ≥ T_SATURATION (= 4 ordres).
//   canaux   = 1 + ⌊2·t⌋          sous-canaux représentatifs
//   strates  = 1 + ⌊t / 2⌋        strates internes
//   profondeur = ⌊t / 4⌋          niveaux de réseaux imbriqués
//
// Ces trois lois sont AFFINES en t, donc strictement croissantes par ordre
// entier (canaux : +2 par ordre) : elles ne cessent pas de croître quand la
// largeur sature. Chacune est ensuite bornée par le budget (`Math.min`).
//
// Les paliers nommés (`network`, `system`, `constellation`, voir
// `linkMagnitude`) n'interviennent PAS ici : le niveau est une étiquette, la
// forme vient uniquement de t. Au-delà de `constellation` rien n'est ajouté.
//
// LIMITE HONNÊTE : un budget fini ne peut pas, par construction, séparer deux
// ordres au-delà de sa capacité. Plutôt que de retomber en silence sur des
// valeurs identiques, `graphical.overflowOrders` expose le nombre d'ordres que
// le budget ne sait plus montrer : deux magnitudes qui dépassent le budget
// restent distinguables par ce champ (et par `logical`, toujours exact).
// ============================================================================

import type { Magnitude, MorphologyLevel } from './linkMagnitude'

/** Plafond de largeur projetée d'un conduit (unités de scène). Jamais dépassé. */
export const WIDTH_CEILING = 1

/** Largeur d'un filament unique : un fil visible, jamais nul. */
export const WIDTH_FLOOR = 0.04

/** Nombre d'ordres de grandeur (abscisse t) à partir duquel la largeur atteint son plafond. */
export const WIDTH_SATURATION_ORDER = 4

/** Ce que l'on s'autorise à dessiner : bornes dures sur la structure. */
export interface MorphologyBudget {
  /** Nombre maximal de sous-canaux dessinés. */
  maxChannels: number
  /** Nombre maximal de strates internes. */
  maxStrata: number
  /** Profondeur hiérarchique maximale. */
  maxDepth: number
}

/** Budget par défaut : assez large pour séparer chaque ordre de 10⁰ à 10³⁰. */
export const DEFAULT_BUDGET: Readonly<MorphologyBudget> = {
  maxChannels: 64,
  maxStrata: 16,
  maxDepth: 8,
}

/** Volume graphique : ce que le rendu dessine réellement. */
export interface GraphicalVolume {
  /** Largeur du conduit, bornée — jamais au-delà de `WIDTH_CEILING`. */
  width: number
  /** Nombre de sous-canaux représentatifs (structure, pas largeur). */
  channels: number
  /** Strates internes visibles. */
  strata: number
  /** Profondeur hiérarchique dessinée. */
  depth: number
  /** Vrai quand la largeur a atteint son plafond : la magnitude est alors portée par la structure. */
  saturated: boolean
  /**
   * Ordres de grandeur que le budget ne peut plus montrer (0 tant que la
   * structure suit la loi). Strictement croissant avec l'ordre une fois le
   * budget atteint : la différenciation survit même à un budget trop petit.
   */
  overflowOrders: number
}

/** Volume logique : la vérité numérique, sans aucune borne graphique. */
export interface LogicalVolume {
  exactCount: bigint
  order: number
  mantissa: number
  morphology: MorphologyLevel
}

/** Un sous-faisceau RÉEL, avec sa part exacte du faisceau. */
export interface ShapeComponent {
  key: string
  count: bigint
  /** Part du compte total, dans [0, 1], calculée en bigint puis convertie. */
  share: number
}

export interface MorphologyShape {
  level: MorphologyLevel
  logical: LogicalVolume
  graphical: GraphicalVolume
  /** Les sous-faisceaux RÉELS, dans l'ordre fourni. Jamais inventés : vide sans partition. */
  components: ShapeComponent[]
}

/** Ramène un budget partiel à des entiers valides (canaux ≥ 1, strates ≥ 1, profondeur ≥ 0). */
function resolveBudget(partial: Partial<MorphologyBudget> = {}): MorphologyBudget {
  const pick = (v: number | undefined, fallback: number, min: number) =>
    v === undefined || !Number.isFinite(v) ? fallback : Math.max(min, Math.floor(v))
  return {
    maxChannels: pick(partial.maxChannels, DEFAULT_BUDGET.maxChannels, 1),
    maxStrata: pick(partial.maxStrata, DEFAULT_BUDGET.maxStrata, 1),
    maxDepth: pick(partial.maxDepth, DEFAULT_BUDGET.maxDepth, 0),
  }
}

/** Abscisse continue t = ordre + log10(mantisse) ; 0 pour un compte nul ou un filament. */
function abscissa(m: Magnitude): number {
  const mantissa = m.magnitudeMantissa >= 1 ? m.magnitudeMantissa : 1
  return m.magnitudeOrder + Math.log10(mantissa)
}

/** Lois brutes (non bornées) de la structure pour une abscisse t. */
function rawStructure(t: number) {
  return {
    channels: 1 + Math.floor(2 * t),
    strata: 1 + Math.floor(t / 2),
    depth: Math.floor(t / 4),
  }
}

/**
 * Nombre de sous-canaux d'un faisceau, sans jamais dépasser le budget.
 *
 * Avec une partition RÉELLE, on dessine un canal par sous-faisceau (au plus
 * `maxChannels`). Sans partition, on ne l'invente pas : on rend le nombre de
 * sous-canaux représentatifs de la loi de structure.
 */
export function channelsFor(magnitude: Magnitude, budget: Partial<MorphologyBudget> = {}): number {
  const b = resolveBudget(budget)
  const parts = magnitude.hierarchicalComponents.length
  if (parts > 0) return Math.min(parts, b.maxChannels)
  return Math.min(rawStructure(abscissa(magnitude)).channels, b.maxChannels)
}

/** Part exacte count/total dans [0, 1] : division bigint à 12 décimales, puis conversion. */
function shareOf(count: bigint, total: bigint): number {
  if (total <= 0n) return 0
  return Number((count * 10n ** 12n) / total) / 1e12
}

/**
 * Forme dessinable d'un faisceau : volume logique (exact) et volume graphique
 * (borné). Fonction pure et déterministe.
 */
export function morphologyShape(
  magnitude: Magnitude,
  budget: Partial<MorphologyBudget> = {},
): MorphologyShape {
  const b = resolveBudget(budget)
  const t = abscissa(magnitude)
  const raw = rawStructure(t)

  const ratio = Math.min(1, t / WIDTH_SATURATION_ORDER)
  const width = Math.min(WIDTH_CEILING, WIDTH_FLOOR + (WIDTH_CEILING - WIDTH_FLOOR) * ratio)

  // Ordres que la capacité du budget ne sait plus montrer : on convertit chaque
  // plafond en abscisse (inverse de la loi) et on prend le plus tôt atteint.
  const capacityT = Math.min((b.maxChannels - 1) / 2, (b.maxStrata - 1) * 2, b.maxDepth * 4 + 3.999)
  const overflowOrders = Math.max(0, Math.floor(t) - Math.floor(capacityT))

  const graphical: GraphicalVolume = {
    width,
    channels: Math.min(raw.channels, b.maxChannels),
    strata: Math.min(raw.strata, b.maxStrata),
    depth: Math.min(raw.depth, b.maxDepth),
    saturated: t >= WIDTH_SATURATION_ORDER,
    overflowOrders,
  }

  const total = magnitude.exactCount
  return {
    level: magnitude.morphology,
    logical: {
      exactCount: total,
      order: magnitude.magnitudeOrder,
      mantissa: magnitude.magnitudeMantissa,
      morphology: magnitude.morphology,
    },
    graphical,
    components: magnitude.hierarchicalComponents.map((c) => ({
      key: c.key,
      count: c.count,
      share: shareOf(c.count, total),
    })),
  }
}
