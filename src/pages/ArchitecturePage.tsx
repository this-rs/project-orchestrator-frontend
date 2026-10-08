import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  MarkerType,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import {
  Server,
  Monitor,
  Cog,
  Database,
  Inbox,
  Zap,
  Shield,
  Cloud,
  Box,
  Library,
  Terminal,
  X,
  ArrowRight,
  ArrowLeft,
  type LucideIcon,
} from 'lucide-react'
import { EmptyState, EntityListSkeleton, ErrorState, PageShell, focusRing } from '@/components/ui'
import { glassFlat, iconButton } from '@/components/ui/classes'
import { useWorkspaceSlug } from '@/hooks'
import { workspacesApi } from '@/services/workspaces'
import { workspacePath } from '@/utils/paths'
import {
  COMPONENT_LABEL,
  NODE_H,
  NODE_W,
  buildArchitecture,
  formatProvenance,
  groupByTier,
  type ArchGraph,
  type ArchNode,
} from '@/utils/architecture'
import type { ComponentType } from '@/types'
import { NOMENCLATURE } from '@/constants/nomenclature'
import '@xyflow/react/dist/style.css'

const ICONS: Record<ComponentType, LucideIcon> = {
  service: Server,
  frontend: Monitor,
  worker: Cog,
  database: Database,
  message_queue: Inbox,
  cache: Zap,
  gateway: Shield,
  external: Cloud,
  library: Library,
  cli: Terminal,
  other: Box,
}

/** What a node is to the current selection. Drives emphasis, never visibility. */
type Relation = 'none' | 'selected' | 'neighbour' | 'faded'

interface NodeData extends Record<string, unknown> {
  node: ArchNode
  relation: Relation
}

function ComponentNode({ data }: NodeProps<Node<NodeData>>) {
  const { node: n, relation } = data
  const Icon = ICONS[n.type]
  const selected = relation === 'selected'
  const faded = relation === 'faded'

  return (
    <div
      className={[
        'rounded-lg border px-3 py-2.5 transition-[opacity,border-color,box-shadow] duration-(--duration-fast)',
        selected
          ? 'border-indigo-400/70 bg-gray-900 shadow-[0_0_0_1px_rgba(129,140,248,0.35)]'
          : 'border-white/[0.08] bg-gray-900 shadow-sm',
        // Non-neighbours fade rather than disappear: the shape of the whole system
        // has to stay readable while one part of it is in focus.
        faded ? 'opacity-25' : 'opacity-100',
      ].join(' ')}
      style={{ width: NODE_W, height: NODE_H }}
    >
      <Handle type="target" position={Position.Left} className="!bg-gray-600 !border-0 !w-1.5 !h-1.5" />
      <div className="flex items-center gap-2 min-w-0">
        <Icon
          className={`h-4 w-4 shrink-0 ${selected ? 'text-indigo-300' : 'text-indigo-400'}`}
          aria-hidden
        />
        <span className="truncate text-sm font-medium text-gray-100">{n.name}</span>
      </div>
      <p className="mt-1 truncate text-[11px] leading-4 text-gray-500">
        {COMPONENT_LABEL[n.type]}
        {n.runtime ? ` · ${n.runtime}` : ''}
      </p>
      {n.project && <p className="truncate text-[11px] leading-4 text-gray-600">{n.project}</p>}
      <Handle type="source" position={Position.Right} className="!bg-gray-600 !border-0 !w-1.5 !h-1.5" />
    </div>
  )
}

const nodeTypes = { component: ComponentNode }

const EDGE_IDLE = '#6b7280'
const EDGE_ACTIVE = '#818cf8'

function toFlow(
  graph: ArchGraph,
  selectedId: string | null,
  neighbours: Set<string>,
): { nodes: Node<NodeData>[]; edges: Edge[] } {
  const relationOf = (id: string): Relation => {
    if (!selectedId) return 'none'
    if (id === selectedId) return 'selected'
    return neighbours.has(id) ? 'neighbour' : 'faded'
  }

  return {
    nodes: graph.nodes.map((n) => ({
      id: n.id,
      type: 'component',
      position: { x: n.x, y: n.y },
      data: { node: n, relation: relationOf(n.id) },
      // Draggable so a crowded diagram can be untangled by hand. Positions are
      // not persisted: the layout is recomputed from the topology on each load.
      draggable: true,
    })),
    edges: graph.edges.map((e) => {
      const touchesSelection = !selectedId || e.from === selectedId || e.to === selectedId
      const stroke = selectedId && touchesSelection ? EDGE_ACTIVE : EDGE_IDLE
      return {
        id: e.id,
        source: e.from,
        target: e.to,
        label: e.protocol,
        animated: Boolean(selectedId) && touchesSelection,
        style: {
          stroke,
          strokeWidth: selectedId && touchesSelection ? 2 : 1,
          // Dashed means optional — the one piece of visual vocabulary the
          // diagram carries, so the legend spells it out.
          strokeDasharray: e.required ? undefined : '5 4',
          opacity: selectedId && !touchesSelection ? 0.15 : 1,
          transition: 'opacity var(--duration-fast) var(--ease-standard), stroke var(--duration-fast) var(--ease-standard)',
        },
        labelStyle: { fill: '#9ca3af', fontSize: 11 },
        labelBgStyle: { fill: '#111827' },
        markerEnd: { type: MarkerType.ArrowClosed, color: stroke },
      }
    })
  }
}

function Legend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] leading-4 text-gray-500">
      <li className="flex items-center gap-1.5">
        <svg width="22" height="6" aria-hidden className="shrink-0">
          <line x1="0" y1="3" x2="22" y2="3" stroke={EDGE_IDLE} strokeWidth="1.5" />
        </svg>
        Required
      </li>
      <li className="flex items-center gap-1.5">
        <svg width="22" height="6" aria-hidden className="shrink-0">
          <line x1="0" y1="3" x2="22" y2="3" stroke={EDGE_IDLE} strokeWidth="1.5" strokeDasharray="5 4" />
        </svg>
        Optional — the system runs without it
      </li>
      <li>Left to right: where people enter → services → data</li>
      <li>Select a component to see what it would take down</li>
    </ul>
  )
}

interface DetailPanelProps {
  node: ArchNode
  graph: ArchGraph
  projectSlugByName: Map<string, string>
  wsSlug: string
  onClose: () => void
  onSelect: (id: string) => void
}

/**
 * What one component is and what it is wired to. The incoming list is the one
 * that answers "what breaks if I touch this" — it is deliberately first.
 */
function DetailPanel({ node, graph, projectSlugByName, wsSlug, onClose, onSelect }: DetailPanelProps) {
  const nameById = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n.name])), [graph.nodes])
  const outgoing = graph.edges.filter((e) => e.from === node.id)
  const incoming = graph.edges.filter((e) => e.to === node.id)
  const projectSlug = node.project ? projectSlugByName.get(node.project) : undefined
  const Icon = ICONS[node.type]

  const edgeList = (
    edges: typeof graph.edges,
    direction: 'in' | 'out',
    empty: string,
  ) => {
    if (edges.length === 0) return <p className="text-xs text-gray-600">{empty}</p>
    const Arrow = direction === 'in' ? ArrowLeft : ArrowRight
    return (
      <ul className="space-y-1">
        {edges.map((e) => {
          const otherId = direction === 'in' ? e.from : e.to
          return (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => onSelect(otherId)}
                className={`flex w-full min-h-9 items-center gap-1.5 rounded px-1 py-1 text-left text-xs text-gray-300 hover:bg-white/[0.04] ${focusRing}`}
              >
                <Arrow className="h-3 w-3 shrink-0 text-gray-600" aria-hidden />
                <span className="truncate">{nameById.get(otherId) ?? otherId}</span>
                {e.protocol && <span className="shrink-0 text-gray-500">{e.protocol}</span>}
                {!e.required && <span className="shrink-0 text-gray-600">optional</span>}
              </button>
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    <aside
      aria-label={`${node.name} details`}
      className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3"
    >
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-indigo-400" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-gray-100">{node.name}</h2>
          <p className="text-[11px] leading-4 text-gray-500">
            {COMPONENT_LABEL[node.type]}
            {node.runtime ? ` · ${node.runtime}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close details"
          className={`${iconButton('ghost', 'size-9 md:size-8')} ${glassFlat} -mr-2 -mt-2`}
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {node.description && <p className="text-sm text-gray-300">{node.description}</p>}

      {node.project && (
        <p className="text-xs text-gray-400">
          {projectSlug ? (
            <Link
              to={workspacePath(wsSlug, `/projects/${projectSlug}`)}
              className="text-indigo-400 hover:text-indigo-300"
            >
              {node.project}
            </Link>
          ) : (
            node.project
          )}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <h3 className="mb-1 text-[11px] font-medium text-gray-500">
            Depended on by ({incoming.length})
          </h3>
          {edgeList(incoming, 'in', 'Nothing depends on this.')}
        </div>
        <div>
          <h3 className="mb-1 text-[11px] font-medium text-gray-500">
            Depends on ({outgoing.length})
          </h3>
          {edgeList(outgoing, 'out', 'Depends on nothing.')}
        </div>
      </div>

      {node.tags.length > 0 && (
        <p className="text-[11px] leading-4 text-gray-500">{node.tags.map((t) => `#${t}`).join(' ')}</p>
      )}

      {node.provenance && (
        // Nobody typed this diagram in, so the reader has no memory to check it
        // against. Naming the file and line that implied this node is what turns
        // a generated graph into one that can be verified.
        <p className="text-[11px] leading-4 text-gray-600">
          Derived from {formatProvenance(node.provenance)}
        </p>
      )}
    </aside>
  )
}

/**
 * Architecture — the deployed system as a left-to-right graph
 * (entry points → services → data), read from the workspace topology.
 *
 * Selecting a component emphasises its immediate neighbourhood and fades the
 * rest, which is how the page answers "what breaks if I touch this".
 *
 * The tiered outline below is not a fallback: it is the keyboard and
 * screen-reader path to the same selection, so every node is reachable without
 * a pointer.
 */
export function ArchitecturePage() {
  const wsSlug = useWorkspaceSlug()
  const [graph, setGraph] = useState<ArchGraph | null>(null)
  const [projectSlugByName, setProjectSlugByName] = useState<Map<string, string>>(new Map())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      setGraph(buildArchitecture(await workspacesApi.getTopology(wsSlug)))
    } catch {
      setError('Failed to load the architecture')
    } finally {
      setLoading(false)
    }
  }, [wsSlug])

  useEffect(() => {
    setLoading(true)
    setSelectedId(null)
    load()
  }, [load])

  // Project names are all the topology carries; the slug is what routes need.
  // Wrapped because this only ever buys a hyperlink: the diagram must render
  // even if the lookup is unavailable, and a synchronous throw here would
  // otherwise take the whole page down over a link.
  useEffect(() => {
    let cancelled = false
    try {
      void workspacesApi
        .listProjects(wsSlug)
        .then((projects) => {
          if (cancelled) return
          setProjectSlugByName(new Map(projects.map((p) => [p.name, p.slug])))
        })
        .catch(() => {})
    } catch {
      /* no link, still a diagram */
    }
    return () => {
      cancelled = true
    }
  }, [wsSlug])

  // Escape clears the selection wherever focus happens to be.
  useEffect(() => {
    if (!selectedId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId])

  const neighbours = useMemo(() => {
    const set = new Set<string>()
    if (!graph || !selectedId) return set
    for (const e of graph.edges) {
      if (e.from === selectedId) set.add(e.to)
      if (e.to === selectedId) set.add(e.from)
    }
    return set
  }, [graph, selectedId])

  const flow = useMemo(
    () => (graph ? toFlow(graph, selectedId, neighbours) : null),
    [graph, selectedId, neighbours],
  )
  const tiers = useMemo(() => (graph ? groupByTier(graph.nodes) : []), [graph])
  const selectedNode = useMemo(
    () => graph?.nodes.find((n) => n.id === selectedId) ?? null,
    [graph, selectedId],
  )
  const height = graph
    ? Math.min(Math.max(...graph.nodes.map((n) => n.y + NODE_H), 240) + 80, 640)
    : 240

  const toggle = useCallback(
    (id: string) => setSelectedId((current) => (current === id ? null : id)),
    [],
  )

  return (
    <PageShell
      title={NOMENCLATURE.architecture.plural}
      description={NOMENCLATURE.architecture.description}
      intro="architecture"
      width="wide"
      count={graph?.nodes.length}
    >
      {loading ? (
        <EntityListSkeleton rows={4} />
      ) : error ? (
        <ErrorState description={error} onRetry={load} />
      ) : !graph || graph.nodes.length === 0 ? (
        <EmptyState
          title="No architecture yet"
          description="Add components (services, databases, queues…) to the workspace, or ask an assistant to map the system."
        />
      ) : (
        <div className="space-y-4">
          <div
            className="rounded-xl border border-white/[0.06] bg-gray-950 overflow-hidden"
            style={{ height }}
            aria-label="Architecture graph"
          >
            <ReactFlow
              nodes={flow!.nodes}
              edges={flow!.edges}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.15 }}
              nodesConnectable={false}
              onNodeClick={(_, n) => toggle(n.id)}
              onPaneClick={() => setSelectedId(null)}
              proOptions={{ hideAttribution: true }}
            >
              <Background color="#1f2937" gap={20} />
              <Controls showInteractive={false} />
            </ReactFlow>
          </div>

          <Legend />

          {selectedNode && (
            <DetailPanel
              node={selectedNode}
              graph={graph}
              projectSlugByName={projectSlugByName}
              wsSlug={wsSlug}
              onClose={() => setSelectedId(null)}
              onSelect={setSelectedId}
            />
          )}

          <section aria-label="Architecture outline" className="space-y-3">
            {tiers.map((t) => (
              <div key={t.tier}>
                <h2 className="text-[11px] font-medium text-gray-500">{t.label}</h2>
                <ul className="mt-1 divide-y divide-white/[0.06] rounded-xl border border-white/[0.06]">
                  {t.nodes.map((n) => {
                    const deps = graph.edges.filter((e) => e.from === n.id)
                    const byId = new Map(graph.nodes.map((x) => [x.id, x.name]))
                    const isSelected = n.id === selectedId
                    return (
                      <li key={n.id}>
                        <button
                          type="button"
                          onClick={() => toggle(n.id)}
                          aria-pressed={isSelected}
                          className={[
                            'flex w-full flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-2 text-left text-sm',
                            focusRing,
                            isSelected ? 'bg-indigo-500/10' : 'hover:bg-white/[0.03]',
                          ].join(' ')}
                        >
                          <span className="font-medium text-gray-100">{n.name}</span>
                          <span className="text-xs text-gray-500">
                            {COMPONENT_LABEL[n.type]}
                            {n.runtime ? ` · ${n.runtime}` : ''}
                            {n.project ? ` · ${n.project}` : ''}
                          </span>
                          {deps.length > 0 && (
                            <span className="text-xs text-gray-500">
                              →{' '}
                              {deps
                                .map((d) => `${byId.get(d.to)}${d.protocol ? ` (${d.protocol})` : ''}`)
                                .join(', ')}
                            </span>
                          )}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </section>
        </div>
      )}
    </PageShell>
  )
}
