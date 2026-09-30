import dagre from 'dagre'
import type { FeatureGraphEntity, FeatureGraphRelation } from '@/types'

// ============================================================================
// Vocabulary (single source for the page, the legend and the help text)
// ============================================================================

export const ROLE_ORDER = ['entry_point', 'core_logic', 'data_model', 'trait_contract', 'api_surface', 'support'] as const

export const ROLE_META: Record<string, { label: string; description: string; weight: number }> = {
  entry_point: { label: 'Entry Points', description: 'Where the feature starts (the function you built from).', weight: 6 },
  core_logic: { label: 'Core Logic', description: 'The functions and files doing the actual work.', weight: 5 },
  api_surface: { label: 'API Surface', description: 'What other parts of the code call into.', weight: 4 },
  data_model: { label: 'Data Models', description: 'Structs and enums carrying the feature data.', weight: 3 },
  trait_contract: { label: 'Trait Contracts', description: 'Traits the feature implements or relies on.', weight: 2 },
  support: { label: 'Support', description: 'Helpers and utilities around the feature.', weight: 1 },
}

export const roleLabel = (role: string | undefined) => (role && ROLE_META[role]?.label) || 'Other'

export interface EntityTypeColors {
  bg: string
  border: string
  text: string
  minimap: string
  label: string
}

export const ENTITY_TYPE_META: Record<string, EntityTypeColors> = {
  function: { bg: '#052e16', border: '#22c55e', text: '#86efac', minimap: '#22c55e', label: 'Function' },
  file: { bg: '#172554', border: '#3b82f6', text: '#93c5fd', minimap: '#3b82f6', label: 'File' },
  struct: { bg: '#2e1065', border: '#a855f7', text: '#d8b4fe', minimap: '#a855f7', label: 'Struct' },
  trait: { bg: '#431407', border: '#f97316', text: '#fdba74', minimap: '#f97316', label: 'Trait' },
  enum: { bg: '#022c22', border: '#10b981', text: '#6ee7b7', minimap: '#10b981', label: 'Enum' },
}

export const DEFAULT_ENTITY_COLORS: EntityTypeColors = {
  bg: '#1f2937',
  border: '#6b7280',
  text: '#d1d5db',
  minimap: '#6b7280',
  label: 'Other',
}

export const entityColors = (type: string) => ENTITY_TYPE_META[type] ?? DEFAULT_ENTITY_COLORS

export interface RelationStyle {
  stroke: string
  dashed: boolean
  label: string
  description: string
}

export const RELATION_META: Record<string, RelationStyle> = {
  CALLS: { stroke: '#6b7280', dashed: false, label: 'Calls', description: 'A function calls another.' },
  IMPORTS: { stroke: '#60a5fa', dashed: true, label: 'Imports', description: 'A file imports another.' },
  EXTENDS: { stroke: '#a855f7', dashed: false, label: 'Extends', description: 'A type extends another.' },
  IMPLEMENTS: { stroke: '#f97316', dashed: false, label: 'Implements', description: 'A type implements a trait.' },
  IMPLEMENTS_TRAIT: { stroke: '#f97316', dashed: false, label: 'Impl Trait', description: 'An impl block targets a trait.' },
  IMPLEMENTS_FOR: { stroke: '#f59e0b', dashed: true, label: 'Impl For', description: 'An impl block targets a type.' },
}

export const DEFAULT_RELATION: RelationStyle = { stroke: '#4b5563', dashed: false, label: 'Related', description: '' }

export const relationStyle = (type: string) => RELATION_META[type] ?? DEFAULT_RELATION

// ============================================================================
// Bounded subgraph selection
// ============================================================================

/** Nodes shown the first time the canvas opens. */
export const INITIAL_NODE_LIMIT = 120
/** Extra nodes added by each "Show more". */
export const NODE_LIMIT_STEP = 120
/** Hard ceiling: beyond this a canvas is unreadable and slow — use the list. */
export const MAX_NODE_LIMIT = 480
/** Edges beyond this are dropped from the canvas (the count stays visible). */
export const MAX_EDGES = 900
/** Edge labels are only drawn on small graphs (text per edge is costly and unreadable when dense). */
export const EDGE_LABEL_MAX = 40

export interface RankedEntity {
  entity: FeatureGraphEntity
  /** Index in the source array (stable identity even when entity_ids repeat). */
  index: number
  degree: number
}

export interface Subgraph {
  nodes: RankedEntity[]
  relations: FeatureGraphRelation[]
  /** Distinct relations between two distinct entities of the whole graph. */
  totalRelations: number
}

/**
 * Picks the `limit` most important entities — role first (entry points, core logic…),
 * then connectivity (degree) — and the relations that link two of them.
 * O(n log n + r): safe on thousands of entities.
 */
export function selectSubgraph(
  entities: FeatureGraphEntity[],
  relations: FeatureGraphRelation[],
  limit: number,
): Subgraph {
  const indexById = new Map<string, number>()
  entities.forEach((e, i) => {
    if (!indexById.has(e.entity_id)) indexById.set(e.entity_id, i)
  })

  const seen = new Set<string>()
  const distinct: FeatureGraphRelation[] = []
  const degree = new Array<number>(entities.length).fill(0)
  for (const rel of relations) {
    const s = indexById.get(rel.source_id)
    const t = indexById.get(rel.target_id)
    if (s === undefined || t === undefined || s === t) continue
    const key = `${rel.source_id}\u0000${rel.relation_type}\u0000${rel.target_id}`
    if (seen.has(key)) continue
    seen.add(key)
    distinct.push(rel)
    degree[s]++
    degree[t]++
  }

  const ranked: RankedEntity[] = entities.map((entity, index) => ({ entity, index, degree: degree[index] }))
  ranked.sort((a, b) => {
    const wa = (a.entity.role && ROLE_META[a.entity.role]?.weight) || 0
    const wb = (b.entity.role && ROLE_META[b.entity.role]?.weight) || 0
    return wb - wa || b.degree - a.degree || a.index - b.index
  })
  const nodes = ranked.slice(0, Math.max(0, limit))

  const visible = new Set(nodes.map((n) => n.entity.entity_id))
  const kept: FeatureGraphRelation[] = []
  for (const rel of distinct) {
    if (visible.has(rel.source_id) && visible.has(rel.target_id)) {
      kept.push(rel)
      if (kept.length >= MAX_EDGES) break
    }
  }
  return { nodes, relations: kept, totalRelations: distinct.length }
}

// ============================================================================
// Layout
// ============================================================================

export interface GraphNodeData extends Record<string, unknown> {
  label: string
  entityType: string
  role: string
  /** Index of the entity in the source array (click → details without a linear search). */
  entityIndex: number
}

export interface LaidOutNode {
  id: string
  type: 'entityNode'
  position: { x: number; y: number }
  data: GraphNodeData
}

export interface LaidOutEdge {
  id: string
  source: string
  target: string
  relationType: string
  label?: string
}

export interface GraphLayout {
  nodes: LaidOutNode[]
  edges: LaidOutEdge[]
  height: number
}

const NODE_W = 200
const NODE_H = 40

/** Static role × row grid: used when there is no edge to lay out (no graph algorithm needed). */
function gridLayout(nodes: LaidOutNode[]): void {
  const order: string[] = [...ROLE_ORDER]
  const byRole = new Map<string, LaidOutNode[]>()
  for (const n of nodes) {
    const list = byRole.get(n.data.role) ?? []
    list.push(n)
    byRole.set(n.data.role, list)
  }
  for (const r of byRole.keys()) if (!order.includes(r)) order.push(r)
  const columns = 6
  let y = 0
  for (const role of order) {
    const list = byRole.get(role)
    if (!list) continue
    list.forEach((n, i) => {
      n.position = { x: (i % columns) * (NODE_W + 30), y: y + Math.floor(i / columns) * (NODE_H + 40) }
    })
    y += Math.ceil(list.length / columns) * (NODE_H + 40) + 40
  }
}

/**
 * Lays out an already-capped subgraph. Dagre runs only when the graph is bounded by
 * `selectSubgraph` (≤ MAX_NODE_LIMIT nodes / MAX_EDGES edges), so it stays in the tens of ms.
 */
export function layoutSubgraph(sub: Subgraph): GraphLayout {
  const idByEntityId = new Map<string, string>()
  const nodes: LaidOutNode[] = sub.nodes.map(({ entity, index }) => {
    const id = `n${index}`
    if (!idByEntityId.has(entity.entity_id)) idByEntityId.set(entity.entity_id, id)
    return {
      id,
      type: 'entityNode',
      position: { x: 0, y: 0 },
      data: {
        label: entity.name || entity.entity_id,
        entityType: entity.entity_type,
        role: entity.role || 'unknown',
        entityIndex: index,
      },
    }
  })

  const showLabels = sub.relations.length <= EDGE_LABEL_MAX
  const edges: LaidOutEdge[] = []
  for (const rel of sub.relations) {
    const source = idByEntityId.get(rel.source_id)
    const target = idByEntityId.get(rel.target_id)
    if (!source || !target) continue
    edges.push({
      id: `e-${source}-${rel.relation_type}-${target}`,
      source,
      target,
      relationType: rel.relation_type,
      label: showLabels ? relationStyle(rel.relation_type).label : undefined,
    })
  }

  if (edges.length === 0) {
    gridLayout(nodes)
  } else {
    const g = new dagre.graphlib.Graph()
    g.setDefaultEdgeLabel(() => ({}))
    g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 90, marginx: 20, marginy: 20 })
    for (const n of nodes) g.setNode(n.id, { width: NODE_W, height: NODE_H })
    for (const e of edges) g.setEdge(e.source, e.target)
    dagre.layout(g)
    for (const n of nodes) {
      const p = g.node(n.id)
      n.position = { x: p.x - NODE_W / 2, y: p.y - NODE_H / 2 }
    }
  }

  const maxY = nodes.reduce((m, n) => Math.max(m, n.position.y), 0)
  return { nodes, edges, height: Math.max(400, Math.min(700, maxY + 120)) }
}
