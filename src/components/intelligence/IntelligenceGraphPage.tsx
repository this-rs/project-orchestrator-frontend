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
import { useGraphWebSocket } from './useGraphWebSocket'
import { NodeInspector } from './NodeInspector'
import { LayerControls } from './LayerControls'
import { LiveIndicator } from './LiveIndicator'
import { SpreadingActivation, activationSearchOpenAtom } from './SpreadingActivation'
import { ENTITY_COLORS } from '@/constants/intelligence'
import { intelligenceLoadingAtom, intelligenceErrorAtom, hoveredNodeIdAtom } from '@/atoms/intelligence'
import { LoadingPage } from '@/components/ui/Spinner'
import { ErrorState } from '@/components/ui/ErrorState'
import { EmptyState } from '@/components/ui/EmptyState'
import type { IntelligenceNode, IntelligenceEdge } from '@/types/intelligence'

export default function IntelligenceGraphPage() {
  const { projectSlug } = useParams<{ slug: string; projectSlug: string }>()
  const loading = useAtomValue(intelligenceLoadingAtom)
  const error = useAtomValue(intelligenceErrorAtom)
  const setSearchOpen = useSetAtom(activationSearchOpenAtom)
  const hoveredNodeId = useAtomValue(hoveredNodeIdAtom)
  const setHoveredNodeId = useSetAtom(hoveredNodeIdAtom)

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

  // Real-time WebSocket updates
  const { connected: wsConnected, lastEventAt } = useGraphWebSocket(projectSlug)

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
        // Custom edges — pass highlight hints via data (extra fields ignored by TS)
        return {
          ...edge,
          data: {
            ...edge.data!,
            _highlighted: isConnected,
            _hasHover: true,
          } as IntelligenceEdge['data'],
        }
      }
      // Default edges — apply opacity directly via style
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
    <div className="relative h-full w-full">
      {/* Synapse + co-change animation keyframes + dark theme overrides for Controls & MiniMap */}
      <style>{`
        @keyframes synapse-flow {
          to { stroke-dashoffset: -20; }
        }

        /* ============================================================
           WebSocket real-time animations
           ============================================================ */

        /* Node: fly-in — scale up + fade in on creation */
        .ws-anim-fly-in {
          animation: ws-node-fly-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
        }
        @keyframes ws-node-fly-in {
          from { opacity: 0; transform: scale(0.2); }
          to   { opacity: 1; transform: scale(1); }
        }

        /* Node: flash — brightness pulse on attribute update */
        .ws-anim-flash {
          animation: ws-node-flash 0.6s ease-out !important;
        }
        @keyframes ws-node-flash {
          0%   { filter: brightness(1); }
          30%  { filter: brightness(1.8) drop-shadow(0 0 8px rgba(255, 255, 255, 0.4)); }
          100% { filter: brightness(1); }
        }

        /* Node: community — outline flash on community reassignment */
        .ws-anim-community {
          animation: ws-node-community 0.8s ease-out !important;
        }
        @keyframes ws-node-community {
          0%   { outline: 2px solid transparent; outline-offset: 2px; }
          25%  { outline: 2px solid #818CF8; outline-offset: 2px; }
          50%  { outline: 2px solid #818CF8; outline-offset: 4px; }
          100% { outline: 2px solid transparent; outline-offset: 2px; }
        }

        /* Edge: draw-in — stroke draws progressively on creation */
        @keyframes ws-edge-draw-in {
          from { stroke-dashoffset: 200; opacity: 0.3; }
          to   { stroke-dashoffset: 0; opacity: 1; }
        }

        /* Edge: fade-out — opacity fade before removal */
        @keyframes ws-edge-fade-out {
          from { opacity: 1; }
          to   { opacity: 0; }
        }

        /* Edge: pulse — brightness flash on reinforcement */
        @keyframes ws-edge-pulse {
          0%   { filter: brightness(1); }
          30%  { filter: brightness(2.5) drop-shadow(0 0 6px currentColor); }
          100% { filter: brightness(1); }
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
        edges={highlightedEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
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
