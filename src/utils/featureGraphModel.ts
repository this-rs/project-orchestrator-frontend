import dagre from 'dagre'
import type { FeatureGraphEntity, FeatureGraphRelation } from '@/types'
import { entityCodeName, entityTitle } from './featureGraphReadable'
import { tr } from '@/i18n/lazy'

// ============================================================================
// Vocabulary (single source for the page, the legend and the help text)
// ============================================================================

export const ROLE_ORDER = ['entry_point', 'core_logic', 'data_model', 'trait_contract', 'api_surface', 'support'] as const

type Role = (typeof ROLE_ORDER)[number]

/** A role of the vocabulary; its words are read when used, so they follow the language on screen. */
function roleMeta(role: Role, weight: number): { label: string; description: string; weight: number } {
  return {
    get label() {
      return tr(`fgModel.role.${role}.label`)
    },
    get description() {
      return tr(`fgModel.role.${role}.description`)
    },
    weight,
  }
}

export const ROLE_META: Record<string, { label: string; description: string; weight: number }> = {
  entry_point: roleMeta('entry_point', 6),
  core_logic: roleMeta('core_logic', 5),
  api_surface: roleMeta('api_surface', 4),
  data_model: roleMeta('data_model', 3),
  trait_contract: roleMeta('trait_contract', 2),
  support: roleMeta('support', 1),
}

export const roleLabel = (role: string | undefined) => (role && ROLE_META[role]?.label) || tr('fgModel.other')

export interface EntityTypeColors {
  bg: string
  border: string
  text: string
  minimap: string
  label: string
}

type EntityKind = 'function' | 'file' | 'struct' | 'trait' | 'enum'

function typeMeta(kind: EntityKind, bg: string, border: string, text: string): EntityTypeColors {
  return {
    bg,
    border,
    text,
    minimap: border,
    get label() {
      return tr(`fgModel.type.${kind}`)
    },
  }
}

export const ENTITY_TYPE_META: Record<string, EntityTypeColors> = {
  function: typeMeta('function', '#052e16', '#22c55e', '#86efac'),
  file: typeMeta('file', '#172554', '#3b82f6', '#93c5fd'),
  struct: typeMeta('struct', '#2e1065', '#a855f7', '#d8b4fe'),
  trait: typeMeta('trait', '#431407', '#f97316', '#fdba74'),
  enum: typeMeta('enum', '#022c22', '#10b981', '#6ee7b7'),
}

export const DEFAULT_ENTITY_COLORS: EntityTypeColors = {
  bg: '#1f2937',
  border: '#6b7280',
  text: '#d1d5db',
  minimap: '#6b7280',
  get label() {
    return tr('fgModel.other')
  },
}

export const entityColors = (type: string) => ENTITY_TYPE_META[type] ?? DEFAULT_ENTITY_COLORS

export interface RelationStyle {
  stroke: string
  dashed: boolean
  label: string
  description: string
}

type RelationKind = 'CALLS' | 'IMPORTS' | 'EXTENDS' | 'IMPLEMENTS' | 'IMPLEMENTS_TRAIT' | 'IMPLEMENTS_FOR'

function relationMeta(kind: RelationKind, stroke: string, dashed: boolean): RelationStyle {
  return {
    stroke,
    dashed,
    get label() {
      return tr(`fgModel.relation.${kind}.label`)
    },
    get description() {
      return tr(`fgModel.relation.${kind}.description`)
    },
  }
}

export const RELATION_META: Record<string, RelationStyle> = {
  CALLS: relationMeta('CALLS', '#6b7280', false),
  IMPORTS: relationMeta('IMPORTS', '#60a5fa', true),
  EXTENDS: relationMeta('EXTENDS', '#a855f7', false),
  IMPLEMENTS: relationMeta('IMPLEMENTS', '#f97316', false),
  IMPLEMENTS_TRAIT: relationMeta('IMPLEMENTS_TRAIT', '#f97316', false),
  IMPLEMENTS_FOR: relationMeta('IMPLEMENTS_FOR', '#f59e0b', true),
}

export const DEFAULT_RELATION: RelationStyle = {
  stroke: '#4b5563',
  dashed: false,
  get label() {
    return tr('fgModel.relation.related')
  },
  description: '',
}

export const relationStyle = (type: string) => RELATION_META[type] ?? DEFAULT_RELATION

// ============================================================================
// Bounded subgraph selection
// ============================================================================

/**
 * Edges beyond this are dropped from the canvas (the count stays visible). This is the only
 * canvas cap: React Flow keeps one SVG path per edge, and past ~1.5k of them pan/zoom gets janky
 * even with off-screen culling. Every entity is drawn; the list shows them all regardless.
 */
export const MAX_EDGES = 1500
/** Edge labels are only drawn on small graphs (text per edge is costly and unreadable when dense). */
export const EDGE_LABEL_MAX = 40
/** Dagre is O(n·e)-ish: above these sizes the cheap layered layout takes over. */
export const DAGRE_MAX_NODES = 250
export const DAGRE_MAX_EDGES = 600

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
  /** Human title ("Build system prompt"). */
  label: string
  /** Exact code name, shown on hover / when selected. */
  codeName: string
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
 * Cheap layered layout for big graphs, O(n + e): each node goes one layer below its deepest
 * parent (BFS from the roots, cycles are broken by the visit order), layers wrap into rows
 * of at most `perRow` nodes. No crossing minimisation — it only has to be readable and instant.
 */
function layeredLayout(nodes: LaidOutNode[], edges: LaidOutEdge[]): void {
  const indexOf = new Map<string, number>()
  nodes.forEach((n, i) => indexOf.set(n.id, i))
  const out: number[][] = nodes.map(() => [])
  const indeg = new Array<number>(nodes.length).fill(0)
  for (const e of edges) {
    const s = indexOf.get(e.source)!
    const t = indexOf.get(e.target)!
    out[s].push(t)
    indeg[t]++
  }
  const layer = new Array<number>(nodes.length).fill(-1)
  const queue: number[] = []
  const enqueueRoots = () => {
    for (let i = 0; i < nodes.length; i++) if (layer[i] < 0 && indeg[i] === 0) { layer[i] = 0; queue.push(i) }
  }
  enqueueRoots()
  let head = 0
  const drain = () => {
    while (head < queue.length) {
      const u = queue[head++]
      for (const v of out[u]) {
        if (layer[v] < 0) { layer[v] = layer[u] + 1; queue.push(v) }
      }
    }
  }
  drain()
  // Pure cycles have no root: seed from the first unvisited node.
  for (let i = 0; i < nodes.length; i++) {
    if (layer[i] < 0) { layer[i] = 0; queue.push(i); drain() }
  }
  const layers = new Map<number, number[]>()
  nodes.forEach((_, i) => {
    const l = layers.get(layer[i]) ?? []
    l.push(i)
    layers.set(layer[i], l)
  })
  const perRow = 12
  let y = 0
  for (const l of [...layers.keys()].sort((a, b) => a - b)) {
    const members = layers.get(l)!
    members.forEach((idx, k) => {
      nodes[idx].position = { x: (k % perRow) * (NODE_W + 30), y: y + Math.floor(k / perRow) * (NODE_H + 30) }
    })
    y += Math.ceil(members.length / perRow) * (NODE_H + 30) + 50
  }
}

/**
 * Lays out a subgraph. Small graphs use dagre (nicer edges, tens of ms); big ones use the
 * linear layered layout so 3000 nodes never freeze the tab.
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
        label: entityTitle(entity),
        codeName: entityCodeName(entity),
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
  } else if (nodes.length > DAGRE_MAX_NODES || edges.length > DAGRE_MAX_EDGES) {
    layeredLayout(nodes, edges)
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
