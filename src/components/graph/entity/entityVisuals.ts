/**
 * Visual vocabulary of the EntityGraph: per-type colour / icon / label and
 * per-layer metadata. Colours reuse the app-wide ENTITY_COLORS mapping of the
 * intelligence graph so a "note" has the same colour everywhere.
 */
import {
  Box,
  Circle,
  ClipboardList,
  FileCode,
  FileText,
  Flag,
  FolderKanban,
  GitCommitHorizontal,
  ListTodo,
  MessageSquare,
  Network,
  Scale,
  Sparkles,
  SquareFunction,
  StickyNote,
  User,
  Workflow,
  type LucideIcon,
} from 'lucide-react'
import { ENTITY_COLORS } from '@/constants/intelligence'
import type { NeighborhoodLayer } from '@/services/neighborhood'

/** Colour per entity type (app mapping + the types it doesn't know yet). */
export const ENTITY_TYPE_COLORS: Record<string, string> = {
  ...ENTITY_COLORS,
  project: '#0EA5E9', // sky-500
  persona: '#F472B6', // pink-400
  document: '#FACC15', // yellow-400
}

export const FALLBACK_COLOR = '#94A3B8'

export function typeColor(type: string): string {
  return ENTITY_TYPE_COLORS[type] ?? FALLBACK_COLOR
}

export const ENTITY_TYPE_ICONS: Record<string, LucideIcon> = {
  note: StickyNote,
  decision: Scale,
  task: ListTodo,
  plan: ClipboardList,
  milestone: Flag,
  project: FolderKanban,
  file: FileCode,
  function: SquareFunction,
  struct: Box,
  skill: Sparkles,
  persona: User,
  protocol: Workflow,
  feature_graph: Network,
  commit: GitCommitHorizontal,
  chat_session: MessageSquare,
  document: FileText,
}

export function typeIcon(type: string): LucideIcon {
  return ENTITY_TYPE_ICONS[type] ?? Circle
}

export const ENTITY_TYPE_LABELS: Record<string, string> = {
  note: 'Note',
  decision: 'Decision',
  task: 'Task',
  plan: 'Plan',
  milestone: 'Milestone',
  project: 'Project',
  file: 'File',
  function: 'Function',
  struct: 'Struct',
  skill: 'Skill',
  persona: 'Persona',
  protocol: 'Protocol',
  feature_graph: 'Feature graph',
  commit: 'Commit',
  chat_session: 'Conversation',
  document: 'Document',
}

export function typeLabel(type: string): string {
  return ENTITY_TYPE_LABELS[type] ?? type
}

/**
 * Stable ordering of types around a ring: types of the same family sit next
 * to each other (knowledge → planning → code → behavioral/neural).
 */
export const TYPE_ORDER: readonly string[] = [
  'note',
  'decision',
  'document',
  'task',
  'plan',
  'milestone',
  'project',
  'feature_graph',
  'file',
  'function',
  'struct',
  'commit',
  'skill',
  'persona',
  'protocol',
  'chat_session',
]

export interface LayerMeta {
  label: string
  description: string
  color: string
}

export const LAYER_META: Record<NeighborhoodLayer, LayerMeta> = {
  code: { label: 'Code', description: 'files, functions, structs, commits', color: '#3B82F6' },
  knowledge: { label: 'Knowledge', description: 'notes, decisions, documents', color: '#F59E0B' },
  planning: { label: 'Planning', description: 'projects, plans, tasks, milestones', color: '#10B981' },
  neural: { label: 'Neural', description: 'synapses and emerging skills', color: '#06B6D4' },
  behavioral: {
    label: 'Behavior',
    description: 'protocols, personas, sessions',
    color: '#F97316',
  },
}

/** Best-effort type → layer mapping, used to count stats.by_type per layer. */
export const TYPE_LAYER: Record<string, NeighborhoodLayer> = {
  file: 'code',
  function: 'code',
  struct: 'code',
  commit: 'code',
  note: 'knowledge',
  decision: 'knowledge',
  document: 'knowledge',
  task: 'planning',
  plan: 'planning',
  milestone: 'planning',
  project: 'planning',
  feature_graph: 'planning',
  skill: 'neural',
  protocol: 'behavioral',
  persona: 'behavioral',
  chat_session: 'behavioral',
}

/** Human label for a relation type: `LINKED_TO_TASK` → `linked to task`. */
export function relLabel(rel: string): string {
  return rel.toLowerCase().replace(/_/g, ' ')
}

/**
 * Entity count per layer, from `stats.by_type` (all matches before the limit)
 * mapped to a layer — the layer the server put on the returned nodes of that
 * type when known, else the static TYPE_LAYER mapping.
 */
export function layerCounts(
  stats: { by_type: Record<string, number> } | undefined,
  nodes: readonly { type: string; layer: string }[] = []
): Partial<Record<NeighborhoodLayer, number>> {
  const out: Partial<Record<NeighborhoodLayer, number>> = {}
  const nodeLayer = new Map<string, string>()
  for (const n of nodes) if (!nodeLayer.has(n.type)) nodeLayer.set(n.type, n.layer)
  for (const [type, count] of Object.entries(stats?.by_type ?? {})) {
    const layer = (nodeLayer.get(type) as NeighborhoodLayer | undefined) ?? TYPE_LAYER[type]
    if (!layer || !(layer in LAYER_META)) continue
    out[layer] = (out[layer] ?? 0) + count
  }
  return out
}
