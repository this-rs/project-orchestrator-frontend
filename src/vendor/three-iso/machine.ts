// GENERATED from website@255d188e3498305845e72a27d2569810c72c2e1b:src/three/iso/machine.ts by scripts/sync-iso-lib.mjs — do not edit.
// @ts-nocheck — typechecked on the site (TypeScript 6, strict + noUncheckedIndexedAccess); TS 5.7 here infers differently.
/**
 * Une machine de héros : un registre de pièces nommées (groupées, avec un niveau de détail) et une fonction de
 * construction pure `build(u, lod)` qui rend les faces à l'instant `u` du cycle (0 ≤ u < 1).
 *
 * `lod` 1 = ce qui va dans le SVG prérendu (≤ 500 faces) ; 2 = tout (canvas). Une pièce `lod: 2` (boulons,
 * rivets, nervures, poignées) n'existe qu'au canvas. Une pièce `under` passe sous le texte (conduit, moyeu) : le
 * masque du héros l'efface, elle est exemptée du contrôle « rien de plein dans la zone de texte ».
 *
 * Module PUR, sans import `@/` : lu par Node dans les tests.
 */
import { Scene, type Face, type Mat3, type Vec3 } from './iso.ts'
import type { BuildPlan } from './choreography.ts'

export interface GroupDef {
  /** Clé i18n du nom du groupe (domaine `hero`), affichée au survol. */
  key: string
}

export interface PartDef {
  name: string
  group: number
  lod: 1 | 2
  under: boolean
  /** Lien de navigation (postes miniatures de l'accueil). */
  href?: string
  /** Couche de construction (0 = d'abord … 1 = en dernier) : sinon déduite de la hauteur. */
  layer?: number
}

export interface MachineDef {
  id: string
  /** Pixels du viewBox 1200 × 700 par unité monde. */
  U: number
  /** Origine : point du viewBox où tombe l'origine monde projetée. */
  origin: readonly [number, number]
  /** Perspective : 0 = isométrique (défaut) ; > 0 = force du raccourcissement en profondeur (ex. 0,08). */
  focal?: number
  /** Durée d'un cycle (s). */
  cycle: number
  /** Instant canonique (0 ≤ t0 < 1) : le SVG prérendu, reduced-motion et lowPower. */
  t0: number
  groups: readonly GroupDef[]
  parts: readonly PartDef[]
  /** Faces de la machine à l'instant u (fraction du cycle), triées du fond vers l'avant. `focus` : un poste mis en
   * avant par le lecteur (survol, toucher) — soulevé, allumé, il joue son geste en boucle. */
  build(u: number, lod: 1 | 2, focus?: number | null): Face[]
  /** Points d'interaction : le centre de chaque poste (monde) et son rayon (monde), dans l'ordre des postes. */
  hotspots?: { at: readonly Vec3[]; radius: number } | undefined
  /** Repère de l'arbre de construction de chaque poste : monde = pos + rot · (k · p) pour un point `p` de l'arbre (z = 0 :
   * dessus du socle, ou le sol d'une machine `bare`). Sert à poser des étiquettes (`pins.ts`) en coordonnées d'arbre. */
  treeFrames?: readonly { pos: Vec3; rot: Mat3; k: number }[] | undefined
  /** Centre de l'espace libre (pixels du viewBox) : le cadrage met ce point au centre de la zone visible, là où se centre
   * le texte du héros. Absent : la boîte de la machine est centrée. */
  anchor?: readonly [number, number] | undefined
  /** Calendrier de l'apparition (qui construit quoi, quand) ; absent : ordonnancement parallèle par défaut. */
  buildPlan?: BuildPlan | undefined
  /** Scène vivante (`live.ts`) : le rendu lui confie les faces de l'instant pour les assembler selon l'état réel de
   * chaque poste (au lieu de l'apparition jouée une fois). `now` en ms. */
  live?: { assemble(faces: readonly Face[], now: number): Face[] } | undefined
  /** Variante compacte (aucun texte à entourer : chat, bloc de page) : serpentin serré, cadré sur la machine. */
  compact?: (() => MachineDef) | undefined
  /** Variante téléphone (portrait) : même scène, disposition `phone` (au-dessus et en dessous du texte). `gap` (≥ 1)
   * écarte les deux blocs pour un texte plus haut (IsoHero le choisit en mesurant le texte de la page). */
  phone?: ((gap?: number) => MachineDef) | undefined
  /** Variante pour un cadre très large et bas (rapport ≥ WIDE_ASPECT) : une disposition qui laisse au texte toute la
   * hauteur centrale (ailes), au lieu d'un anneau écrasé dont le trou ne contient plus le texte. */
  wide?: (() => MachineDef) | undefined
  /** La même machine, sa disposition étirée en largeur de `sx` (≥ 1) : cadre plus large que haut (rendu WebGL). */
  stretch?: ((sx: number, sy?: number) => MachineDef) | undefined
}

/** Registre de construction : déclarer les groupes et les pièces une fois, avant `build`. */
export class Registry {
  readonly groups: GroupDef[] = []
  readonly parts: PartDef[] = []

  group(key: string): number {
    this.groups.push({ key })
    return this.groups.length - 1
  }

  part(name: string, group: number, o: { lod?: 1 | 2; under?: boolean; href?: string; layer?: number } = {}): number {
    const def: PartDef = { name, group, lod: o.lod ?? 1, under: o.under ?? false }
    if (o.href !== undefined) def.href = o.href
    if (o.layer !== undefined) def.layer = o.layer
    this.parts.push(def)
    return this.parts.length - 1
  }

  parts_(prefix: string, n: number, group: number, o: { lod?: 1 | 2; under?: boolean } = {}): number[] {
    return Array.from({ length: n }, (_, i) => this.part(`${prefix} ${i + 1}`, group, o))
  }
}

/** Scène filtrée par niveau de détail : les pièces au-delà de `lod` sont ignorées. */
export class LodScene extends Scene {
  private readonly parts: readonly PartDef[]
  private readonly lod: 1 | 2
  constructor(parts: readonly PartDef[], lod: 1 | 2) {
    super()
    this.parts = parts
    this.lod = lod
  }
  override face(pts: Parameters<Scene['face']>[0], o: Parameters<Scene['face']>[1], nrm?: Parameters<Scene['face']>[2], soft?: number): void {
    if (this.parts[o.part]!.lod > this.lod) return
    super.face(pts, o, nrm, soft)
  }
}

/** Rapport largeur/hauteur de la zone visible au-delà duquel une machine passe sur sa variante `wide`. */
export const WIDE_ASPECT = 2.2
