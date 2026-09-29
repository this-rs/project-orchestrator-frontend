// ============================================================================
// PlanUniverse3D — 3D visualization of a plan using IntelligenceGraph3D
// ============================================================================
//
// Thin wrapper that transforms plan data into IntelligenceNode/Edge format,
// then delegates to IntelligenceGraph3D.
//
// Feature graphs are toggleable — each one can be switched on/off to
// interconnect its entities with the base plan graph.
//
// NodeInspector is rendered inline — clicking a node opens its detail card.
// ============================================================================

import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useSetAtom, useAtomValue } from 'jotai'
import { Network, Eye } from 'lucide-react'
import { Graph3DErrorBoundary } from '@/components/ui/Graph3DErrorBoundary'

import { usePlanUniverse, buildFeatureGraphOverlay } from './usePlanUniverse'
import { selectedNodeIdAtom, intelligenceNodesAtom, selectedNodeAtom, highlightedGroupAtom } from '@/atoms/intelligence'
import { NodeInspector } from '../intelligence/NodeInspector'
import type { IntelligenceNode, IntelligenceEdge } from '@/types/intelligence'
import type { FeatureGraphDetail } from '@/types'

// ── Lazy load the 3D component (heavy Three.js bundle) ─────────────────────
const IntelligenceGraph3D = lazy(() => import('../intelligence/graph3d/IntelligenceGraph3D'))

// ── Layer mapping ────────────────────────────────────────────────────────────

const LAYER_MAP: Record<string, string> = {
  file: 'code',
  function: 'code',
  struct: 'code',
  trait: 'code',
  enum: 'code',
  note: 'knowledge',
  decision: 'knowledge',
  constraint: 'knowledge',
  chat_session: 'chat',
  feature_graph: 'code',
  skill: 'skills',
  protocol: 'behavioral',
  protocol_state: 'behavioral',
}

// ── Status → energy mapping ────────────────────────────────────────────────

function statusToEnergy(status: string | undefined): number {
  switch (status) {
    case 'in_progress': return 0.9
    case 'completed': return 0.4
    case 'blocked': return 0.7
    case 'failed': return 0.2
    case 'pending': return 0.5
    default: return 0.5
  }
}

// ── Adapter: UniverseNode/Link → IntelligenceNode/Edge ─────────────────────

function toIntelligenceNodes(
  nodes: { id: string; label: string; type: string; data: Record<string, unknown>; color: string }[],
): IntelligenceNode[] {
  return nodes.map((n) => ({
    id: n.id,
    type: 'default' as const,
    position: { x: 0, y: 0 },
    data: {
      label: n.label,
      entityType: n.type,
      layer: LAYER_MAP[n.type] ?? 'pm',
      entityId: n.id,
      energy: (n.data.energy as number) ?? statusToEnergy(n.data.status as string | undefined),
      // Pass through all data for the NodeInspector + subtitle descendance
      status: n.data.status,
      step_count: n.data.step_count,
      completed_step_count: n.data.completed_step_count,
      priority: n.data.priority,
      path: n.data.path,
      sha: n.data.sha,
      message: n.data.message,
      chosen_option: n.data.chosen_option,
      severity: n.data.severity,
      // Descendance counts for subtitle
      note_count: n.data.note_count,
      decision_count: n.data.decision_count,
      affected_file_count: n.data.affected_file_count,
      commit_count: n.data.commit_count,
      task_count: n.data.task_count,
      completed_task_count: n.data.completed_task_count,
      plan_count: n.data.plan_count,
      file_count: n.data.file_count,
      function_count: n.data.function_count,
      struct_count: n.data.struct_count,
      verification: n.data.verification,
      note_type: n.data.note_type,
      importance: n.data.importance,
      state_count: n.data.state_count,
      energy_value: n.data.energy_value,
      cohesion: n.data.cohesion,
      // Chat session data
      model: n.data.model,
      messageCount: n.data.messageCount,
      totalCostUsd: n.data.totalCostUsd,
      // Feature graph data
      description: n.data.description,
      entity_count: n.data.entity_count,
    } as Record<string, unknown>,
  })) as unknown as IntelligenceNode[]
}

function toIntelligenceEdges(
  links: { source: string; target: string; type: string }[],
): IntelligenceEdge[] {
  return links.map((l, i) => ({
    id: `e-${l.source}-${l.target}-${i}`,
    source: l.source,
    target: l.target,
    data: {
      relationType: l.type,
      layer: 'pm',
    } as Record<string, unknown>,
  })) as unknown as IntelligenceEdge[]
}

// ── Feature Graph Toggle Chip ────────────────────────────────────────────────

function FeatureGraphChip({
  fg,
  active,
  onToggle,
  onHoverStart,
  onHoverEnd,
}: {
  fg: FeatureGraphDetail
  active: boolean
  onToggle: () => void
  onHoverStart?: () => void
  onHoverEnd?: () => void
}) {
  const entityCount = fg.entities?.length ?? fg.entity_count ?? 0
  return (
    <button
      onClick={onToggle}
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium transition-all duration-200 border ${
        active
          ? 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/50 shadow-[0_0_8px_rgba(232,121,249,0.2)]'
          : 'bg-white/[0.04] text-gray-500 border-white/[0.08] hover:bg-white/[0.08] hover:text-gray-400'
      }`}
      title={`${fg.name} — ${entityCount} entities${fg.description ? `\n${fg.description}` : ''}`}
    >
      <Network className="w-3 h-3" />
      <span className="truncate max-w-[120px]">{fg.name}</span>
      <span className={`text-[9px] px-1 py-0.5 rounded ${
        active ? 'bg-fuchsia-500/30 text-fuchsia-200' : 'bg-white/[0.06] text-gray-600'
      }`}>
        {entityCount}
      </span>
    </button>
  )
}

// ── Component ────────────────────────────────────────────────────────────────

interface PlanUniverse3DProps {
  planId: string
  planTitle?: string
  projectSlug?: string
}

export function PlanUniverse3D({ planId, planTitle, projectSlug }: PlanUniverse3DProps) {
  const { baseNodes, baseLinks, featureGraphs, isLoading, error } = usePlanUniverse(planId, planTitle, projectSlug)
  const setSelectedNodeId = useSetAtom(selectedNodeIdAtom)
  const setIntelligenceNodes = useSetAtom(intelligenceNodesAtom)
  const selectedNode = useAtomValue(selectedNodeAtom)
  const setHighlightedGroup = useSetAtom(highlightedGroupAtom)

  // Track which feature graphs are toggled on
  const [activeFeatureGraphIds, setActiveFeatureGraphIds] = useState<Set<string>>(new Set())
  // Show all FGs vs only connected ones
  const [showAllFeatureGraphs, setShowAllFeatureGraphs] = useState(false)

  // Clear selection and active FGs when plan changes
  useEffect(() => {
    setSelectedNodeId(null)
    setActiveFeatureGraphIds(new Set())
    setShowAllFeatureGraphs(false)
  }, [planId, setSelectedNodeId])

  // Compute which FGs are connected (have at least one entity matching a base graph node)
  // FG entity_id can be absolute paths (/Users/.../src/foo.rs) while base graph uses
  // affected_files which are often relative (src/foo.rs). We match by exact ID AND by
  // path suffix to catch both cases.
  const { connectedFGs, disconnectedFGs } = useMemo(() => {
    const baseNodeIds = new Set(baseNodes.map((n) => n.id))
    // Also collect raw file paths from base nodes for suffix matching
    const baseFilePaths = baseNodes
      .filter((n) => n.id.startsWith('file:'))
      .map((n) => n.id.slice(5)) // strip "file:" prefix

    const connected: typeof featureGraphs = []
    const disconnected: typeof featureGraphs = []

    for (const fg of featureGraphs) {
      const hasConnection = (fg.entities || []).some((entity) => {
        const eType = entity.entity_type.toLowerCase()
        if (eType === 'file') {
          // Exact match
          if (baseNodeIds.has(`file:${entity.entity_id}`)) return true
          // Suffix match: FG has absolute path, base has relative (or vice versa)
          return baseFilePaths.some((bp) =>
            entity.entity_id.endsWith(bp) || bp.endsWith(entity.entity_id),
          )
        }
        // Functions, structs, traits, enums — direct ID match
        return baseNodeIds.has(entity.entity_id)
      })
      if (hasConnection) {
        connected.push(fg)
      } else {
        disconnected.push(fg)
      }
    }
    return { connectedFGs: connected, disconnectedFGs: disconnected }
  }, [featureGraphs, baseNodes])

  const visibleFeatureGraphs = showAllFeatureGraphs
    ? [...connectedFGs, ...disconnectedFGs]
    : connectedFGs

  const toggleFeatureGraph = useCallback((fgId: string) => {
    setActiveFeatureGraphIds((prev) => {
      const next = new Set(prev)
      if (next.has(fgId)) {
        next.delete(fgId)
      } else {
        next.add(fgId)
      }
      return next
    })
  }, [])

  // Merge base graph + active feature graph overlays
  const { mergedNodes, mergedLinks } = useMemo(() => {
    if (activeFeatureGraphIds.size === 0) {
      return { mergedNodes: baseNodes, mergedLinks: baseLinks }
    }

    const existingNodeIds = new Set(baseNodes.map((n) => n.id))
    const allNodes = [...baseNodes]
    const allLinks = [...baseLinks]
    const addedIds = new Set(existingNodeIds)

    for (const fg of featureGraphs) {
      if (!activeFeatureGraphIds.has(fg.id)) continue

      const overlay = buildFeatureGraphOverlay(fg, planId, existingNodeIds)

      // Add overlay nodes (dedup against already added)
      for (const node of overlay.nodes) {
        if (!addedIds.has(node.id)) {
          addedIds.add(node.id)
          allNodes.push(node)
        }
      }
      // Add overlay links
      allLinks.push(...overlay.links)
    }

    return { mergedNodes: allNodes, mergedLinks: allLinks }
  }, [baseNodes, baseLinks, featureGraphs, activeFeatureGraphIds, planId])

  // Compute the set of node IDs belonging to a feature graph (for group highlighting)
  const computeFGGroupIds = useCallback((fg: FeatureGraphDetail): Set<string> => {
    const ids = new Set<string>()
    const fgHubId = `feature_graph:${fg.id}`
    ids.add(fgHubId)

    // Collect file paths from merged graph for suffix matching
    const baseFileIds = new Map<string, string>() // path → node id
    for (const n of mergedNodes) {
      if (n.id.startsWith('file:')) {
        baseFileIds.set(n.id.slice(5), n.id)
      }
    }

    for (const entity of fg.entities || []) {
      const eType = entity.entity_type.toLowerCase()
      if (eType === 'file') {
        const exactId = `file:${entity.entity_id}`
        if (mergedNodes.some((n) => n.id === exactId)) { ids.add(exactId); continue }
        // Suffix match
        for (const [bp, nodeId] of baseFileIds) {
          if (entity.entity_id.endsWith(bp) || bp.endsWith(entity.entity_id)) {
            ids.add(nodeId)
            break
          }
        }
      } else {
        if (mergedNodes.some((n) => n.id === entity.entity_id)) {
          ids.add(entity.entity_id)
        }
      }
    }

    // Also include commits that TOUCH files in the group
    for (const link of mergedLinks) {
      if (link.type === 'TOUCHES') {
        if (ids.has(link.source) || ids.has(link.target)) {
          ids.add(link.source)
          ids.add(link.target)
        }
      }
    }

    return ids
  }, [mergedNodes, mergedLinks])

  const handleFGHover = useCallback((fg: FeatureGraphDetail | null) => {
    if (fg) {
      setHighlightedGroup(computeFGGroupIds(fg))
    } else {
      setHighlightedGroup(null)
    }
  }, [computeFGGroupIds, setHighlightedGroup])

  // Clear group highlight on unmount
  useEffect(() => {
    return () => { setHighlightedGroup(null) }
  }, [setHighlightedGroup])

  // Transform → IntelligenceNode/Edge format
  const intelligenceNodes = useMemo(() => toIntelligenceNodes(mergedNodes), [mergedNodes])
  const intelligenceEdges = useMemo(() => toIntelligenceEdges(mergedLinks), [mergedLinks])

  // Populate intelligenceNodesAtom so NodeInspector's selectedNodeAtom derivation works
  useEffect(() => {
    setIntelligenceNodes(intelligenceNodes)
    return () => {
      setIntelligenceNodes((prev) => {
        if (prev.length > 0 && prev[0]?.id === intelligenceNodes[0]?.id) {
          return []
        }
        return prev
      })
    }
  }, [intelligenceNodes, setIntelligenceNodes])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[500px]">
        <div className="text-gray-400 animate-pulse text-sm">Loading 3D universe...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-[500px]">
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    )
  }

  if (baseNodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-[500px]">
        <p className="text-gray-500 text-sm">No data to visualize</p>
      </div>
    )
  }

  return (
    <div className="relative w-full h-[500px] rounded-lg overflow-hidden bg-[#0a0a0f]">
      <Graph3DErrorBoundary context="Plan Universe">
        <Suspense fallback={
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-400 animate-pulse text-sm">Loading 3D engine...</div>
          </div>
        }>
          <IntelligenceGraph3D
            nodes={intelligenceNodes}
            edges={intelligenceEdges}
          />
        </Suspense>
      </Graph3DErrorBoundary>

      {/* Feature Graph toggles — top-left overlay */}
      {featureGraphs.length > 0 && (
        <div className="absolute top-3 left-3 z-30 flex flex-col gap-1.5 max-w-[200px]">
          <div className="flex items-center gap-2 px-1 mb-0.5">
            <span className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">
              Feature Graphs
            </span>
            {disconnectedFGs.length > 0 && (
              <button
                onClick={() => setShowAllFeatureGraphs((v) => !v)}
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium transition-all duration-200 border ${
                  showAllFeatureGraphs
                    ? 'bg-white/[0.08] text-gray-400 border-white/[0.12]'
                    : 'bg-white/[0.03] text-gray-600 border-white/[0.06] hover:bg-white/[0.06] hover:text-gray-500'
                }`}
                title={showAllFeatureGraphs
                  ? `Hide ${disconnectedFGs.length} unconnected`
                  : `Show all (+${disconnectedFGs.length})`
                }
              >
                <Eye className="w-2.5 h-2.5" />
                {showAllFeatureGraphs ? 'Connected' : `+${disconnectedFGs.length}`}
              </button>
            )}
          </div>
          {visibleFeatureGraphs.map((fg) => (
            <FeatureGraphChip
              key={fg.id}
              fg={fg}
              active={activeFeatureGraphIds.has(fg.id)}
              onToggle={() => toggleFeatureGraph(fg.id)}
              onHoverStart={() => handleFGHover(fg)}
              onHoverEnd={() => handleFGHover(null)}
            />
          ))}
        </div>
      )}

      {/* NodeInspector — shown when a node is clicked */}
      {selectedNode && <NodeInspector />}
    </div>
  )
}

export default PlanUniverse3D
