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

/** One colour per entity type (po-graph `TYPE_COLOR`). Code is green, PM blue, knowledge lavender. */
export const PO_ENTITY_COLOR: Record<IntelligenceEntityType, string> = {
  file: '#3ecf8e',
  function: '#2bb57f',
  struct: '#7ef0c2',
  trait: '#5fd6a0',
  enum: '#b4f5d6',
  feature_graph: '#9cf2a8',
  note: '#a5a5ff',
  decision: '#dcd6ff',
  constraint: '#7f8cf5',
  skill: '#e879f9',
  protocol: '#fb7185',
  protocol_state: '#fdb0ba',
  plan: '#38bdf8',
  task: '#7dd3fc',
  step: '#c3e9fd',
  milestone: '#0ea5e9',
  release: '#22d3ee',
  commit: '#67e8f9',
  chat_session: '#facc15',
}

/** Colour of an entity type the palette does not know (never a Tailwind grey: it must read as "unknown"). */
export const ENTITY_FALLBACK_COLOR = '#8a8fa0'

/** Colour of an entity type, with the fallback for an unknown or missing type. */
export function entityColor(type: string | null | undefined): string {
  return (type && Object.prototype.hasOwnProperty.call(PO_ENTITY_COLOR, type))
    ? PO_ENTITY_COLOR[type as IntelligenceEntityType]
    : ENTITY_FALLBACK_COLOR
}
