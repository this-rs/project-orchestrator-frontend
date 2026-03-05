import { useCallback, useMemo, type MouseEvent as ReactMouseEvent } from 'react'
import { useParams } from 'react-router-dom'
import { useAtomValue } from 'jotai'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { intelligenceNodeTypes } from './nodes'
import { intelligenceEdgeTypes } from './edges'
import { useIntelligenceGraph } from './useIntelligenceGraph'
import { NodeInspector } from './NodeInspector'
import { LayerControls } from './LayerControls'
import { ENTITY_COLORS } from '@/constants/intelligence'
import { intelligenceLoadingAtom, intelligenceErrorAtom } from '@/atoms/intelligence'
import { LoadingPage } from '@/components/ui/Spinner'
import { ErrorState } from '@/components/ui/ErrorState'
import { EmptyState } from '@/components/ui/EmptyState'
import type { IntelligenceNode } from '@/types/intelligence'

export default function IntelligenceGraphPage() {
  const { projectSlug } = useParams<{ slug: string; projectSlug: string }>()
  const loading = useAtomValue(intelligenceLoadingAtom)
  const error = useAtomValue(intelligenceErrorAtom)

  const {
    nodes,
    edges,
    selectedNodeId,
    setSelectedNodeId,
    visibleLayers,
    toggleLayer,
    applyPreset,
    fetchGraph,
  } = useIntelligenceGraph(projectSlug)

  const onNodeClick = useCallback(
    (_event: ReactMouseEvent, node: IntelligenceNode) => {
      setSelectedNodeId(node.id === selectedNodeId ? null : node.id)
    },
    [selectedNodeId, setSelectedNodeId],
  )

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null)
  }, [setSelectedNodeId])

  // MiniMap node color based on entity type
  const miniMapNodeColor = useCallback((node: IntelligenceNode) => {
    const entityType = (node.data as { entityType?: string })?.entityType
    return entityType
      ? ENTITY_COLORS[entityType as keyof typeof ENTITY_COLORS] ?? '#6B7280'
      : '#6B7280'
  }, [])

  // Memoize node & edge types to prevent ReactFlow re-registration
  const nodeTypes = useMemo(() => intelligenceNodeTypes, [])
  const edgeTypes = useMemo(() => intelligenceEdgeTypes, [])

  if (loading && nodes.length === 0) {
    return <LoadingPage />
  }

  if (error && nodes.length === 0) {
    return <ErrorState description={error} onRetry={fetchGraph} />
  }

  if (!loading && nodes.length === 0) {
    return (
      <EmptyState
        variant="search"
        title="No intelligence data"
        description="Sync your project to populate the intelligence graph."
      />
    )
  }

  return (
    <div className="relative h-full w-full">
      {/* Synapse animation keyframes */}
      <style>{`
        @keyframes synapse-flow {
          to { stroke-dashoffset: -20; }
        }
      `}</style>

      {/* Layer controls (top-left overlay) */}
      <LayerControls
        visibleLayers={visibleLayers}
        onToggleLayer={toggleLayer}
        onApplyPreset={applyPreset}
      />

      {/* ReactFlow Canvas */}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.1}
        maxZoom={2.5}
        proOptions={{ hideAttribution: true }}
        nodesDraggable
        nodesConnectable={false}
        panOnDrag
        zoomOnScroll
        zoomOnPinch
      >
        <Background color="#1e293b" gap={24} size={1} />
        <Controls showInteractive={false} className="!bg-slate-800 !border-slate-700" />
        <MiniMap
          nodeColor={miniMapNodeColor}
          maskColor="rgba(15, 23, 42, 0.8)"
          className="!bg-slate-900 !border-slate-700"
          pannable
          zoomable
        />
      </ReactFlow>

      {/* Node Inspector (right sidebar overlay) */}
      {selectedNodeId && <NodeInspector />}
    </div>
  )
}
