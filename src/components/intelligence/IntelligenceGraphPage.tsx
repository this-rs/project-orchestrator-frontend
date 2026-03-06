import { lazy, Suspense, useCallback, useMemo, useState, useEffect, type MouseEvent as ReactMouseEvent } from 'react'
import { useParams } from 'react-router-dom'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  applyNodeChanges,
  type NodeChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Box, Grid3x3 } from 'lucide-react'

import { intelligenceNodeTypes } from './nodes'
import { intelligenceEdgeTypes } from './edges'
import { useIntelligenceGraph } from './useIntelligenceGraph'
import { useGraphWebSocket } from './useGraphWebSocket'
import { NodeInspector } from './NodeInspector'
import { LayerControls } from './LayerControls'
import { LiveIndicator } from './LiveIndicator'
import { SpreadingActivation, activationSearchOpenAtom } from './SpreadingActivation'
import { ENTITY_COLORS } from '@/constants/intelligence'
import {
  intelligenceLoadingAtom,
  intelligenceErrorAtom,
  hoveredNodeIdAtom,
  graphViewModeAtom,
  selectedNodeIdAtom,
} from '@/atoms/intelligence'
import { LoadingPage } from '@/components/ui/Spinner'
import { ErrorState } from '@/components/ui/ErrorState'
import { EmptyState } from '@/components/ui/EmptyState'
import type { IntelligenceNode, IntelligenceEdge } from '@/types/intelligence'

// Lazy-load the 3D component — Three.js (~300KB gz) only loaded when needed
const IntelligenceGraph3D = lazy(() => import('./graph3d/IntelligenceGraph3D'))

export default function IntelligenceGraphPage() {
  const { projectSlug } = useParams<{ slug: string; projectSlug: string }>()
  const loading = useAtomValue(intelligenceLoadingAtom)
  const error = useAtomValue(intelligenceErrorAtom)
  const setSearchOpen = useSetAtom(activationSearchOpenAtom)
  const hoveredNodeId = useAtomValue(hoveredNodeIdAtom)
  const setHoveredNodeId = useSetAtom(hoveredNodeIdAtom)
  const [viewMode, setViewMode] = useAtom(graphViewModeAtom)
  const selectedNodeId = useAtomValue(selectedNodeIdAtom)

  const {
    nodes: layoutedNodes,
    edges,
    setSelectedNodeId,
    visibleLayers,
    toggleLayer,
    applyPreset,
    fetchGraph,
  } = useIntelligenceGraph(projectSlug)

  // Real-time WebSocket updates
  const { connected: wsConnected, lastEventAt } = useGraphWebSocket(projectSlug)

  // ── Local node state for drag persistence (2D mode) ─────────────────────
  const [nodes, setLocalNodes] = useState<IntelligenceNode[]>([])

  useEffect(() => {
    setLocalNodes(layoutedNodes)
  }, [layoutedNodes])

  const onNodesChange = useCallback(
    (changes: NodeChange<IntelligenceNode>[]) => {
      setLocalNodes((prev) => applyNodeChanges(changes, prev))
    },
    [],
  )

  const onNodeClick = useCallback(
    (_event: ReactMouseEvent, node: IntelligenceNode) => {
      setSelectedNodeId(node.id === selectedNodeId ? null : node.id)
    },
    [selectedNodeId, setSelectedNodeId],
  )

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null)
  }, [setSelectedNodeId])

  // Hover handlers for propagation path highlighting
  const onNodeMouseEnter = useCallback(
    (_event: ReactMouseEvent, node: IntelligenceNode) => {
      setHoveredNodeId(node.id)
    },
    [setHoveredNodeId],
  )

  const onNodeMouseLeave = useCallback(() => {
    setHoveredNodeId(null)
  }, [setHoveredNodeId])

  // Propagation path highlighting — dim non-connected edges on hover
  const highlightedEdges = useMemo((): IntelligenceEdge[] => {
    if (!hoveredNodeId) return edges
    return edges.map((edge): IntelligenceEdge => {
      const isConnected = edge.source === hoveredNodeId || edge.target === hoveredNodeId
      if (edge.type && edge.type !== 'default') {
        return {
          ...edge,
          data: {
            ...edge.data!,
            _highlighted: isConnected,
            _hasHover: true,
          } as IntelligenceEdge['data'],
        }
      }
      return {
        ...edge,
        style: {
          ...edge.style,
          opacity: isConnected ? 1 : 0.1,
          strokeWidth: isConnected ? ((edge.style?.strokeWidth as number) ?? 1) * 1.5 : edge.style?.strokeWidth,
          transition: 'opacity 200ms, stroke-width 200ms',
        },
      }
    })
  }, [edges, hoveredNodeId])

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
    <div className="relative w-full -mx-4 md:-mx-6 -mb-2" style={{ height: 'calc(100dvh - 5rem)' }}>
      {/* 2D-only CSS (synapse animations, dark theme overrides) */}
      {viewMode === '2d' && (
        <style>{`
          @keyframes synapse-flow {
            to { stroke-dashoffset: -20; }
          }
          .ws-anim-fly-in {
            animation: ws-node-fly-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
          }
          @keyframes ws-node-fly-in {
            from { opacity: 0; transform: scale(0.2); }
            to   { opacity: 1; transform: scale(1); }
          }
          .ws-anim-flash {
            animation: ws-node-flash 0.6s ease-out !important;
          }
          @keyframes ws-node-flash {
            0%   { filter: brightness(1); }
            30%  { filter: brightness(1.8) drop-shadow(0 0 8px rgba(255, 255, 255, 0.4)); }
            100% { filter: brightness(1); }
          }
          .ws-anim-community {
            animation: ws-node-community 0.8s ease-out !important;
          }
          @keyframes ws-node-community {
            0%   { outline: 2px solid transparent; outline-offset: 2px; }
            25%  { outline: 2px solid #818CF8; outline-offset: 2px; }
            50%  { outline: 2px solid #818CF8; outline-offset: 4px; }
            100% { outline: 2px solid transparent; outline-offset: 2px; }
          }
          @keyframes ws-edge-draw-in {
            from { stroke-dashoffset: 200; opacity: 0.3; }
            to   { stroke-dashoffset: 0; opacity: 1; }
          }
          @keyframes ws-edge-fade-out {
            from { opacity: 1; }
            to   { opacity: 0; }
          }
          @keyframes ws-edge-pulse {
            0%   { filter: brightness(1); }
            30%  { filter: brightness(2.5) drop-shadow(0 0 6px currentColor); }
            100% { filter: brightness(1); }
          }
          input[type="range"]::-webkit-slider-thumb {
            -webkit-appearance: none;
            width: 12px; height: 12px; border-radius: 50%;
            background: #FB923C; cursor: pointer;
            border: 2px solid #1e293b;
            box-shadow: 0 0 4px rgba(251, 146, 60, 0.4);
          }
          input[type="range"]::-moz-range-thumb {
            width: 12px; height: 12px; border-radius: 50%;
            background: #FB923C; cursor: pointer;
            border: 2px solid #1e293b;
          }
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
          .react-flow__minimap {
            background: #0f172a !important;
            border-color: #334155 !important;
          }
        `}</style>
      )}

      {/* Layer controls (top-left overlay) */}
      <LayerControls
        visibleLayers={visibleLayers}
        onToggleLayer={toggleLayer}
        onApplyPreset={applyPreset}
      />

      {/* 2D/3D toggle (top-left, below LayerControls) */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 bg-slate-800/90 backdrop-blur-sm rounded-lg border border-slate-700 p-0.5">
        <button
          onClick={() => setViewMode('2d')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            viewMode === '2d'
              ? 'bg-blue-600 text-white'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
          }`}
        >
          <Grid3x3 size={14} />
          2D
        </button>
        <button
          onClick={() => setViewMode('3d')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            viewMode === '3d'
              ? 'bg-blue-600 text-white'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
          }`}
        >
          <Box size={14} />
          3D
        </button>
      </div>

      {/* Spreading Activation search overlay (top-center) */}
      <SpreadingActivation projectSlug={projectSlug} />

      {/* ── Canvas: 2D or 3D ───────────────────────────────────────────── */}
      {viewMode === '2d' ? (
        <ReactFlow
          nodes={nodes}
          edges={highlightedEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onNodeMouseEnter={onNodeMouseEnter}
          onNodeMouseLeave={onNodeMouseLeave}
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
      ) : (
        <Suspense fallback={
          <div className="w-full h-full flex items-center justify-center bg-slate-950">
            <div className="text-slate-500 text-sm flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              Loading 3D engine...
            </div>
          </div>
        }>
          <IntelligenceGraph3D nodes={layoutedNodes} edges={edges} />
        </Suspense>
      )}

      {/* Node Inspector (right sidebar overlay) */}
      {selectedNodeId && <NodeInspector />}

      {/* Live indicator (top-right) */}
      <div className="absolute top-3 right-3 z-10">
        <LiveIndicator connected={wsConnected} lastEventAt={lastEventAt} />
      </div>

      {/* Keyboard shortcut hint (bottom-center) */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 text-[10px] text-slate-600">
        <kbd className="px-1 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono">⌘K</kbd>
        {' '}Spreading Activation
      </div>
    </div>
  )
}
