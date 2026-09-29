/**
 * Architecture helpers — turn the workspace topology into a layered graph.
 *
 * The backend serialises `component_type` with Debug formatting ("MessageQueue"),
 * while the rest of the app speaks snake_case ("message_queue"). `normalizeComponentType`
 * accepts both so the view keeps working whichever side is fixed first.
 */
import dagre from 'dagre'
import type { ComponentType } from '@/types'
import type { TopologyResponse } from '@/services/workspaces'

const KNOWN: ComponentType[] = [
  'service',
  'frontend',
  'worker',
  'database',
  'message_queue',
  'cache',
  'gateway',
  'external',
  'other',
]

export function normalizeComponentType(raw: string | undefined | null): ComponentType {
  const snake = (raw ?? '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toLowerCase()
  return (KNOWN as string[]).includes(snake) ? (snake as ComponentType) : 'other'
}

export const COMPONENT_LABEL: Record<ComponentType, string> = {
  service: 'Service',
  frontend: 'Frontend',
  worker: 'Worker',
  database: 'Database',
  message_queue: 'Queue',
  cache: 'Cache',
  gateway: 'Gateway',
  external: 'External',
  other: 'Other',
}

/** Architectural tier: 0 = edge (users reach it), higher = deeper infrastructure. */
export const COMPONENT_TIER: Record<ComponentType, number> = {
  frontend: 0,
  gateway: 1,
  service: 2,
  worker: 2,
  message_queue: 3,
  cache: 3,
  database: 4,
  external: 4,
  other: 2,
}

export interface ArchNode {
  id: string
  name: string
  type: ComponentType
  runtime?: string
  project?: string
  description?: string
  tags: string[]
  x: number
  y: number
}

export interface ArchEdge {
  id: string
  from: string
  to: string
  protocol?: string
  required: boolean
}

export const NODE_W = 208
export const NODE_H = 76

export interface ArchGraph {
  nodes: ArchNode[]
  edges: ArchEdge[]
}

/** Layout left-to-right with dagre. Edges pointing at unknown components are dropped. */
export function buildArchitecture(topology: TopologyResponse | null | undefined): ArchGraph {
  const items = topology?.components ?? []
  const ids = new Set(items.map((i) => i.component.id))

  const edges: ArchEdge[] = items.flatMap((i) =>
    (i.dependencies ?? [])
      .filter((d) => ids.has(d.to_id))
      .map((d) => ({
        id: `${i.component.id}->${d.to_id}`,
        from: i.component.id,
        to: d.to_id,
        protocol: d.protocol ?? undefined,
        required: d.required,
      })),
  )

  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'LR', nodesep: 28, ranksep: 88 })
  g.setDefaultEdgeLabel(() => ({}))
  items.forEach((i) => g.setNode(i.component.id, { width: NODE_W, height: NODE_H }))
  edges.forEach((e) => g.setEdge(e.from, e.to))
  dagre.layout(g)

  const nodes: ArchNode[] = items.map((i) => {
    const pos = g.node(i.component.id)
    return {
      id: i.component.id,
      name: i.component.name,
      type: normalizeComponentType(i.component.component_type),
      runtime: i.component.runtime ?? undefined,
      project: i.project_name ?? undefined,
      description: i.component.description ?? undefined,
      tags: i.component.tags ?? [],
      x: (pos?.x ?? 0) - NODE_W / 2,
      y: (pos?.y ?? 0) - NODE_H / 2,
    }
  })

  return { nodes, edges }
}

/** Group by tier for the text view (same information as the graph, readable by screen readers). */
export function groupByTier(nodes: ArchNode[]): { tier: number; label: string; nodes: ArchNode[] }[] {
  const labels = ['Edge', 'Entry', 'Services', 'Messaging & cache', 'Data & external']
  const map = new Map<number, ArchNode[]>()
  nodes.forEach((n) => {
    const t = COMPONENT_TIER[n.type]
    map.set(t, [...(map.get(t) ?? []), n])
  })
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([tier, list]) => ({ tier, label: labels[tier] ?? 'Other', nodes: list }))
}
