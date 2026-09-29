import { useCallback, useEffect, useMemo, useState } from 'react'
import { ReactFlow, Background, Controls, Handle, Position, MarkerType, type Edge, type Node, type NodeProps } from '@xyflow/react'
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
  type LucideIcon,
} from 'lucide-react'
import { EmptyState, EntityListSkeleton, ErrorState, PageShell } from '@/components/ui'
import { useWorkspaceSlug } from '@/hooks'
import { workspacesApi } from '@/services/workspaces'
import {
  COMPONENT_LABEL,
  NODE_H,
  NODE_W,
  buildArchitecture,
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
  other: Box,
}

function ComponentNode({ data }: NodeProps<Node<{ node: ArchNode }>>) {
  const n = data.node
  const Icon = ICONS[n.type]
  return (
    <div
      className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2.5 shadow-sm"
      style={{ width: NODE_W, height: NODE_H }}
    >
      <Handle type="target" position={Position.Left} className="!bg-gray-600 !border-0 !w-1.5 !h-1.5" />
      <div className="flex items-center gap-2 min-w-0">
        <Icon className="h-4 w-4 shrink-0 text-indigo-400" aria-hidden />
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

function toFlow(graph: ArchGraph): { nodes: Node[]; edges: Edge[] } {
  return {
    nodes: graph.nodes.map((n) => ({
      id: n.id,
      type: 'component',
      position: { x: n.x, y: n.y },
      data: { node: n },
      draggable: false,
    })),
    edges: graph.edges.map((e) => ({
      id: e.id,
      source: e.from,
      target: e.to,
      label: e.protocol,
      style: { stroke: '#6b7280', strokeDasharray: e.required ? undefined : '5 4' },
      labelStyle: { fill: '#9ca3af', fontSize: 11 },
      labelBgStyle: { fill: '#111827' },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#6b7280' },
    })),
  }
}

/**
 * Architecture — the deployed system as a left-to-right graph
 * (edge → services → data), read from the workspace topology.
 * A text outline below carries the same information for keyboards and screen readers.
 */
export function ArchitecturePage() {
  const wsSlug = useWorkspaceSlug()
  const [graph, setGraph] = useState<ArchGraph | null>(null)
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
    load()
  }, [load])

  const flow = useMemo(() => (graph ? toFlow(graph) : null), [graph])
  const tiers = useMemo(() => (graph ? groupByTier(graph.nodes) : []), [graph])
  const height = graph ? Math.min(Math.max(...graph.nodes.map((n) => n.y + NODE_H), 240) + 80, 640) : 240

  return (
    <PageShell
      title={NOMENCLATURE.architecture.plural}
      description={NOMENCLATURE.architecture.description}
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
          description="Add components (services, databases, queues…) to the workspace, or ask the agent to map the system."
        />
      ) : (
        <div className="space-y-6">
          <div
            className="rounded-lg border border-gray-800 bg-gray-950 overflow-hidden"
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
              proOptions={{ hideAttribution: true }}
            >
              <Background color="#1f2937" gap={20} />
              <Controls showInteractive={false} />
            </ReactFlow>
          </div>

          <section aria-label="Architecture outline" className="space-y-3">
            {tiers.map((t) => (
              <div key={t.tier}>
                <h2 className="text-xs font-medium uppercase tracking-wide text-gray-500">{t.label}</h2>
                <ul className="mt-1 divide-y divide-gray-800/70 rounded-lg border border-gray-800">
                  {t.nodes.map((n) => {
                    const deps = graph.edges.filter((e) => e.from === n.id)
                    const byId = new Map(graph.nodes.map((x) => [x.id, x.name]))
                    return (
                      <li key={n.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-2 text-sm">
                        <span className="font-medium text-gray-100">{n.name}</span>
                        <span className="text-xs text-gray-500">
                          {COMPONENT_LABEL[n.type]}
                          {n.runtime ? ` · ${n.runtime}` : ''}
                          {n.project ? ` · ${n.project}` : ''}
                        </span>
                        {deps.length > 0 && (
                          <span className="text-xs text-gray-500">
                            → {deps.map((d) => `${byId.get(d.to)}${d.protocol ? ` (${d.protocol})` : ''}`).join(', ')}
                          </span>
                        )}
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
