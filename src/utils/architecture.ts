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
import { tr } from '@/i18n/lazy'

const KNOWN: ComponentType[] = [
  'service',
  'frontend',
  'worker',
  'database',
  'message_queue',
  'cache',
  'gateway',
  'external',
  'library',
  'cli',
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
  library: 'Library',
  cli: 'CLI',
  other: 'Other',
}

/**
 * Architectural tier: 0 = where people enter, higher = deeper infrastructure.
 *
 * A CLI sits at tier 0 beside a frontend: both are how a human reaches the
 * system. Typing one as `service` — as `this-cli` was — buries an entry point in
 * the middle of the diagram and the left-to-right reading stops working.
 *
 * A library sits at tier 3: it is not deployed, it is consumed, so it belongs
 * downstream of the services that build against it.
 */
export const COMPONENT_TIER: Record<ComponentType, number> = {
  frontend: 0,
  cli: 0,
  gateway: 1,
  service: 2,
  worker: 2,
  message_queue: 3,
  cache: 3,
  library: 3,
  database: 4,
  external: 4,
  other: 2,
}

/**
 * Where a derived element came from.
 *
 * The topology is rebuilt from the source tree rather than typed in, so nobody
 * can vouch for it from memory. Carrying the file and line that implied each
 * node is what makes a generated diagram checkable instead of merely plausible.
 */
export interface Provenance {
  /** How it was derived: "compose", "manifest", "runtime-config", "project". */
  method: string
  /** Path relative to the project root. */
  file: string
  /** 1-based line, or 0 when it could not be located. */
  line: number
  /** The package or service that implied it. */
  package: string
}

/** Key under which the backend stores provenance inside `config`. */
const DERIVED_KEY = 'derived_from'

/** Read provenance out of a component's free-form config, if it is there. */
export function readProvenance(config: unknown): Provenance | undefined {
  if (!config || typeof config !== 'object') return undefined
  const raw = (config as Record<string, unknown>)[DERIVED_KEY]
  if (!raw || typeof raw !== 'object') return undefined
  const p = raw as Record<string, unknown>
  if (typeof p.method !== 'string' || typeof p.file !== 'string') return undefined
  return {
    method: p.method,
    file: p.file,
    line: typeof p.line === 'number' ? p.line : 0,
    package: typeof p.package === 'string' ? p.package : '',
  }
}

/** Human-readable source, e.g. "Cargo.toml:24 · neo4rs". */
export function formatProvenance(p: Provenance): string {
  const location = p.line > 0 ? `${p.file}:${p.line}` : p.file
  return p.package ? `${location} · ${p.package}` : location
}

export interface ArchNode {
  id: string
  name: string
  type: ComponentType
  runtime?: string
  project?: string
  description?: string
  tags: string[]
  /** Set when this component was derived rather than entered by hand. */
  provenance?: Provenance
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
      provenance: readProvenance(i.component.config),
      x: (pos?.x ?? 0) - NODE_W / 2,
      y: (pos?.y ?? 0) - NODE_H / 2,
    }
  })

  return { nodes, edges }
}

/** Group by tier for the text view (same information as the graph, readable by screen readers). */
export function groupByTier(nodes: ArchNode[]): { tier: number; label: string; nodes: ArchNode[] }[] {
  const labels = [
    tr('app.architecture.entry'),
    tr('app.architecture.gateway'),
    tr('app.architecture.services'),
    tr('app.architecture.libraries'),
    tr('app.architecture.data'),
  ]
  const map = new Map<number, ArchNode[]>()
  nodes.forEach((n) => {
    const t = COMPONENT_TIER[n.type]
    map.set(t, [...(map.get(t) ?? []), n])
  })
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([tier, list]) => ({ tier, label: labels[tier] ?? tr('fgModel.other'), nodes: list }))
}
