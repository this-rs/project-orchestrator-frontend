import { useCallback, useMemo, useEffect, type MouseEvent as ReactMouseEvent } from 'react'
import { useParams } from 'react-router-dom'
import { useAtomValue, useSetAtom } from 'jotai'
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
import { SpreadingActivation, activationSearchOpenAtom } from './SpreadingActivation'
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
  const setSearchOpen = useSetAtom(activationSearchOpenAtom)

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

  // Keyboard shortcut: Ctrl/Cmd+K to open spreading activation search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [setSearchOpen])

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
      {/* Synapse + co-change animation keyframes + dark theme overrides for Controls & MiniMap */}
      <style>{`
        @keyframes synapse-flow {
          to { stroke-dashoffset: -20; }
        }
        /* Range slider thumb for dark theme */
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: #FB923C;
          cursor: pointer;
          border: 2px solid #1e293b;
          box-shadow: 0 0 4px rgba(251, 146, 60, 0.4);
        }
        input[type="range"]::-moz-range-thumb {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: #FB923C;
          cursor: pointer;
          border: 2px solid #1e293b;
        }
        /* ReactFlow Controls — dark theme */
        .react-flow__controls {
          box-shadow: 0 0 6px rgba(0,0,0,0.4) !important;
        }
        .react-flow__controls-button {
          background: #1e293b !important;
          border-color: #334155 !important;
          fill: #e2e8f0 !important;
          color: #e2e8f0 !important;
        }
        .react-flow__controls-button:hover {
          background: #334155 !important;
        }
        .react-flow__controls-button svg {
          fill: #e2e8f0 !important;
        }
        /* MiniMap — dark theme node visibility */
        .react-flow__minimap {
          background: #0f172a !important;
          border-color: #334155 !important;
        }
      `}</style>

      {/* Layer controls (top-left overlay) */}
      <LayerControls
        visibleLayers={visibleLayers}
        onToggleLayer={toggleLayer}
        onApplyPreset={applyPreset}
      />

      {/* Spreading Activation search overlay (top-center) */}
      <SpreadingActivation projectSlug={projectSlug} />

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
        colorMode="dark"
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

      {/* Keyboard shortcut hint (bottom-center) */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 text-[10px] text-slate-600">
        <kbd className="px-1 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono">⌘K</kbd>
        {' '}Spreading Activation
      </div>
    </div>
  )
}
