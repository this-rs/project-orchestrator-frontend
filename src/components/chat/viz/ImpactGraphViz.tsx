/**
 * ImpactGraphViz — Mini graph showing files/symbols impacted by a change.
 *
 * Uses @xyflow/react (ReactFlow) with dagre layout for a clean DAG.
 * Nodes are colored by impact severity (direct vs transitive).
 *
 * Data schema (from backend build_impact_viz):
 * {
 *   target: string,
 *   direct_impacts: [{ path: string, symbols: string[] }],
 *   transitive_impacts: [{ path: string, symbols: string[] }],
 *   total_impacted: number
 * }
 */
import { useMemo, useCallback } from 'react'
import {
  ReactFlow,
  type Node,
  type Edge,
  Position,
  MarkerType,
  Background,
  BackgroundVariant,
} from '@xyflow/react'
import dagre from 'dagre'
import { FileCode, Target, ArrowRight } from 'lucide-react'
import type { VizBlockProps } from './registry'
import '@xyflow/react/dist/style.css'

// ============================================================================
// Types
// ============================================================================

interface ImpactEntry {
  path: string
  symbols?: string[]
}

// ============================================================================
// Dagre layout helper
// ============================================================================

function layoutGraph(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'LR', nodesep: 20, ranksep: 60 })

  for (const node of nodes) {
    g.setNode(node.id, { width: 180, height: 40 })
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target)
  }

  dagre.layout(g)

  return nodes.map((node) => {
    const pos = g.node(node.id)
    return {
      ...node,
      position: { x: pos.x - 90, y: pos.y - 20 },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    }
  })
}

// ============================================================================
// Node styling
// ============================================================================

function shortPath(p: string): string {
  const parts = p.split('/')
  return parts.length > 2 ? `…/${parts.slice(-2).join('/')}` : p
}

// ============================================================================
// Main component
// ============================================================================

export function ImpactGraphViz({ data, expanded = false }: VizBlockProps) {
  const target = (data.target as string) ?? 'unknown'
  const directImpacts = (data.direct_impacts as ImpactEntry[]) ?? []
  const transitiveImpacts = (data.transitive_impacts as ImpactEntry[]) ?? []
  const totalImpacted = (data.total_impacted as number) ?? 0

  const { nodes, edges } = useMemo(() => {
    const ns: Node[] = []
    const es: Edge[] = []

    // Center node (target)
    ns.push({
      id: 'target',
      data: {
        label: (
          <div className="flex items-center gap-1.5 text-[11px]">
            <Target className="w-3 h-3 text-indigo-400" />
            <span className="truncate font-medium">{shortPath(target)}</span>
          </div>
        ),
      },
      position: { x: 0, y: 0 },
      style: {
        background: 'rgba(99, 102, 241, 0.15)',
        border: '1px solid rgba(99, 102, 241, 0.3)',
        borderRadius: '8px',
        padding: '6px 10px',
        color: '#e5e7eb',
        fontSize: '11px',
        width: 180,
      },
    })

    // Direct impacts (red/orange)
    directImpacts.forEach((impact, i) => {
      const id = `direct-${i}`
      ns.push({
        id,
        data: {
          label: (
            <div className="flex items-center gap-1.5 text-[11px]">
              <FileCode className="w-3 h-3 text-red-400 shrink-0" />
              <span className="truncate">{shortPath(impact.path)}</span>
            </div>
          ),
        },
        position: { x: 0, y: 0 },
        style: {
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.25)',
          borderRadius: '8px',
          padding: '6px 10px',
          color: '#e5e7eb',
          fontSize: '11px',
          width: 180,
        },
      })
      es.push({
        id: `e-target-${id}`,
        source: 'target',
        target: id,
        animated: true,
        style: { stroke: 'rgba(239, 68, 68, 0.4)' },
        markerEnd: { type: MarkerType.ArrowClosed, color: 'rgba(239, 68, 68, 0.5)' },
      })
    })

    // Transitive impacts (yellow/amber) — max 6 in compact, all in expanded
    const maxTransitive = expanded ? transitiveImpacts.length : Math.min(transitiveImpacts.length, 6)
    transitiveImpacts.slice(0, maxTransitive).forEach((impact, i) => {
      const id = `transitive-${i}`
      // Connect to the closest direct impact, or target if none
      const sourceId = directImpacts.length > 0 ? `direct-${i % directImpacts.length}` : 'target'
      ns.push({
        id,
        data: {
          label: (
            <div className="flex items-center gap-1.5 text-[11px]">
              <FileCode className="w-3 h-3 text-amber-400 shrink-0" />
              <span className="truncate">{shortPath(impact.path)}</span>
            </div>
          ),
        },
        position: { x: 0, y: 0 },
        style: {
          background: 'rgba(245, 158, 11, 0.08)',
          border: '1px solid rgba(245, 158, 11, 0.2)',
          borderRadius: '8px',
          padding: '6px 10px',
          color: '#e5e7eb',
          fontSize: '11px',
          width: 180,
        },
      })
      es.push({
        id: `e-${sourceId}-${id}`,
        source: sourceId,
        target: id,
        style: { stroke: 'rgba(245, 158, 11, 0.3)', strokeDasharray: '4 2' },
        markerEnd: { type: MarkerType.ArrowClosed, color: 'rgba(245, 158, 11, 0.4)' },
      })
    })

    const laidOut = layoutGraph(ns, es)
    return { nodes: laidOut, edges: es }
  }, [target, directImpacts, transitiveImpacts, expanded])

  const onInit = useCallback((instance: { fitView: () => void }) => {
    setTimeout(() => instance.fitView(), 50)
  }, [])

  const graphHeight = expanded ? 400 : Math.min(250, Math.max(150, nodes.length * 45))

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center gap-2 text-[10px] text-gray-500">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-red-400/60" />
          <span>Direct ({directImpacts.length})</span>
        </div>
        <ArrowRight className="w-3 h-3" />
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-amber-400/60" />
          <span>Transitive ({transitiveImpacts.length})</span>
        </div>
        <span className="ml-auto">{totalImpacted} total</span>
      </div>

      {/* Graph */}
      <div style={{ height: graphHeight }} className="rounded-lg overflow-hidden border border-white/[0.06]">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onInit={onInit}
          fitView
          nodesDraggable={expanded}
          nodesConnectable={false}
          panOnDrag={expanded}
          zoomOnScroll={expanded}
          zoomOnPinch={expanded}
          zoomOnDoubleClick={false}
          proOptions={{ hideAttribution: true }}
          minZoom={0.5}
          maxZoom={2}
        >
          <Background variant={BackgroundVariant.Dots} color="rgba(255,255,255,0.03)" gap={16} size={1} />
        </ReactFlow>
      </div>
    </div>
  )
}
