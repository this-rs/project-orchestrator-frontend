// ============================================================================
// GRAPH PALETTE — the one source of truth for entity and layer colours
// ============================================================================
//
// Origin: po-graph/po-graph.js — `LAYERS` (colour of each layer, ~line 15) and
// `TYPE_COLOR` (one hue family per entity type, ~line 27). That is the family
// the client judged finished. Values are copied here, not imported: po-graph is
// a separate repository.
//
// Everything that shows an entity or a layer colour reads it from here, through
// `ENTITY_COLORS` and `LAYERS` (constants/intelligence.ts) or `entityColor()`.
// To retune the graph, edit this file only.

import type { IntelligenceEntityType, IntelligenceLayer } from '@/types/intelligence'

/** Colour of each layer (po-graph `LAYERS[].color`). */
export const PO_LAYER_COLOR: Record<IntelligenceLayer, string> = {
  chat: '#facc15',
  pm: '#38bdf8',
  behavioral: '#fb7185',
  skills: '#e879f9',
  knowledge: '#a5a5ff',
  neural: '#c7b8ff',
  code: '#3ecf8e',
  fabric: '#f5a524',
}

// ----------------------------------------------------------------------------
// ONE FAMILY = ONE HUE. Mesuré le 05/11/2026 avant ce changement : la table
// précédente donnait 19 teintes indépendantes, avec un écart ΔE moyen
// INTRA-famille de 81 à 104 (code 86,7 · savoir 103,7 · travail 81,4 ·
// comportement 39,5). Une palette de familles a l'écart intra-famille PETIT :
// c'était donc l'inverse exact, et la famille (code / savoir / travail /
// comportement / discussion) n'était codée nulle part — la couleur répétait le
// type, que la forme dit déjà.
//
// La couleur porte maintenant la FAMILLE ; dans une famille, le TYPE se lit par
// la CLARTÉ (trois à six paliers d'une même teinte) et par la FORME. C'est
// nécessaire, pas décoratif : dans la famille code, quatre types sur cinq
// partagent le disque (file, struct, trait, enum) — la forme ne peut pas les
// séparer, la clarté le peut.
// ----------------------------------------------------------------------------

export type EntityFamily = 'code' | 'savoir' | 'travail' | 'comportement' | 'discussion'

/** The 5 families. One hue each, ≥ 35° apart on the wheel. */
export const PO_FAMILY_COLOR: Record<EntityFamily, string> = {
  code: '#10b981', //         émeraude  (≈160°)
  savoir: '#8b5cf6', //       violet    (≈257°)
  travail: '#0ea5e9', //      bleu ciel (≈199°)
  comportement: '#f472b6', // rose      (≈330°)
  discussion: '#f59e0b', //   ambre     (≈38°)
}

/** Family of each entity type. The 5 families partition the 19 types. */
export const PO_ENTITY_FAMILY: Record<IntelligenceEntityType, EntityFamily> = {
  file: 'code',
  function: 'code',
  struct: 'code',
  trait: 'code',
  enum: 'code',
  note: 'savoir',
  decision: 'savoir',
  constraint: 'savoir',
  feature_graph: 'savoir',
  plan: 'travail',
  task: 'travail',
  step: 'travail',
  milestone: 'travail',
  release: 'travail',
  commit: 'travail',
  skill: 'comportement',
  protocol: 'comportement',
  protocol_state: 'comportement',
  chat_session: 'discussion',
}

/**
 * One colour per entity type, GROUPED BY FAMILY: every value is a clarity step
 * of its family's hue (200 → 700 of the same ramp). Two types of one family
 * never share a value; two families never share a hue.
 */
export const PO_ENTITY_COLOR: Record<IntelligenceEntityType, string> = {
  // code — émeraude
  trait: '#a7f3d0', //     200
  struct: '#6ee7b7', //    300
  file: '#34d399', //      400  (base)
  function: '#10b981', //  500
  enum: '#047857', //      700
  // savoir — violet
  feature_graph: '#c4b5fd', // 300
  note: '#a78bfa', //          400  (base)
  decision: '#8b5cf6', //      500
  constraint: '#7c3aed', //    600
  // travail — bleu ciel
  release: '#bae6fd', //   200
  step: '#7dd3fc', //      300
  task: '#38bdf8', //      400
  plan: '#0ea5e9', //      500  (base)
  milestone: '#0284c7', // 600
  commit: '#0369a1', //    700
  // comportement — rose
  protocol_state: '#fbcfe8', // 200
  protocol: '#f9a8d4', //       300
  skill: '#f472b6', //          400  (base)
  // discussion — ambre
  chat_session: '#f59e0b', //   500  (base)
}

/** Family of an entity type, or null when the type is unknown. */
export function familyOf(type: string | null | undefined): EntityFamily | null {
  return (type && Object.prototype.hasOwnProperty.call(PO_ENTITY_FAMILY, type))
    ? PO_ENTITY_FAMILY[type as IntelligenceEntityType]
    : null
}

/** The family hue of an entity type (the node's colour, in every display mode). */
export function familyColor(type: string | null | undefined): string {
  const family = familyOf(type)
  return family ? PO_FAMILY_COLOR[family] : ENTITY_FALLBACK_COLOR
}

/** Colour of an entity type the palette does not know (never a Tailwind grey: it must read as "unknown"). */
export const ENTITY_FALLBACK_COLOR = '#8a8fa0'

/** Colour of an entity type, with the fallback for an unknown or missing type. */
export function entityColor(type: string | null | undefined): string {
  return (type && Object.prototype.hasOwnProperty.call(PO_ENTITY_COLOR, type))
    ? PO_ENTITY_COLOR[type as IntelligenceEntityType]
    : ENTITY_FALLBACK_COLOR
}
