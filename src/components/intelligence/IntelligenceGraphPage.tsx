import { lazy, Suspense, useCallback, useMemo, useState, useEffect, useRef, type MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { useParams } from 'react-router-dom'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  applyNodeChanges,
  type NodeChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Box, Grid3x3, Maximize, Minimize, PanelRightClose, PanelRightOpen, Search } from 'lucide-react'

import { intelligenceNodeTypes } from './nodes'
import { intelligenceEdgeTypes } from './edges'
import { useIntelligenceGraph } from './useIntelligenceGraph'
import { useGraphWebSocket } from './useGraphWebSocket'
import { useProtocolRunEvents } from './useProtocolRunEvents'
import { NodeInspector } from './NodeInspector'
import { LayerControls } from './LayerControls'
import { LiveIndicator } from './LiveIndicator'
import { SpreadingActivation, activationSearchOpenAtom, activationStateAtom } from './SpreadingActivation'
import { GraphLoadingProgress } from './GraphLoadingProgress'
import { ENTITY_COLORS } from '@/constants/intelligence'
import {
  intelligenceLoadingAtom,
  intelligenceErrorAtom,
  hoveredNodeIdAtom,
  graphViewModeAtom,
  selectedNodeIdAtom,
  legendHoveredTypeAtom,
} from '@/atoms/intelligence'
import { ErrorState } from '@/components/ui/ErrorState'
import { EmptyState } from '@/components/ui/EmptyState'
import type { IntelligenceNode, IntelligenceEdge, IntelligenceLayer } from '@/types/intelligence'

// ── Entity legend data ──────────────────────────────────────────────────────
const ENTITY_LEGEND: { layer: IntelligenceLayer; types: { key: string; label: string }[] }[] = [
  { layer: 'code', types: [
    { key: 'file', label: 'File' },
    { key: 'function', label: 'Function' },
    { key: 'struct', label: 'Struct' },
    { key: 'trait', label: 'Trait' },
    { key: 'enum', label: 'Enum' },
    { key: 'feature_graph', label: 'Feature Graph' },
  ]},
  { layer: 'knowledge', types: [
    { key: 'note', label: 'Note' },
    { key: 'decision', label: 'Decision' },
    { key: 'constraint', label: 'Constraint' },
  ]},
  { layer: 'skills', types: [
    { key: 'skill', label: 'Skill' },
  ]},
  { layer: 'behavioral', types: [
    { key: 'protocol', label: 'Protocol' },
    { key: 'protocol_state', label: 'State' },
  ]},
  { layer: 'pm', types: [
    { key: 'plan', label: 'Plan' },
    { key: 'task', label: 'Task' },
    { key: 'step', label: 'Step' },
    { key: 'milestone', label: 'Milestone' },
    { key: 'release', label: 'Release' },
  ]},
  { layer: 'chat', types: [
    { key: 'chat_session', label: 'Chat Session' },
  ]},
]

// ── Auto fit-view on container resize / navigation ──────────────────────────
// Placed as a child of <ReactFlow> so useReactFlow() hooks into the provider.
// Debounced ResizeObserver triggers fitView when container dimensions change
// (sidebar toggle, window resize, navigation between projects).
function AutoFitView({ containerRef }: { containerRef: React.RefObject<HTMLDivElement | null> }) {
  const { fitView } = useReactFlow()

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    let timeout: ReturnType<typeof setTimeout> | null = null
    const observer = new ResizeObserver(() => {
      if (timeout) clearTimeout(timeout)
      timeout = setTimeout(() => {
        fitView({ padding: 0.15, duration: 200 })
      }, 200)
    })

    observer.observe(el)
    return () => {
      observer.disconnect()
      if (timeout) clearTimeout(timeout)
    }
  }, [containerRef, fitView])

  return null
}

// Lazy-load the 3D component — Three.js (~300KB gz) only loaded when needed
const IntelligenceGraph3D = lazy(() => import('./graph3d/IntelligenceGraph3D'))

interface IntelligenceGraphPageProps {
  /** When true, hides back navigation and adapts height for inline embedding */
  embedded?: boolean
  /** Explicit slug — avoids useParams when embedded */
  projectSlug?: string
}

export default function IntelligenceGraphPage(props: IntelligenceGraphPageProps) {
  const params = useParams<{ slug: string; projectSlug: string }>()
  const projectSlug = props.projectSlug ?? params.projectSlug
  const loading = useAtomValue(intelligenceLoadingAtom)
  const error = useAtomValue(intelligenceErrorAtom)
  const [searchOpen, setSearchOpen] = useAtom(activationSearchOpenAtom)
  const hoveredNodeId = useAtomValue(hoveredNodeIdAtom)
  const setHoveredNodeId = useSetAtom(hoveredNodeIdAtom)
  const [viewMode, setViewMode] = useAtom(graphViewModeAtom)
  const selectedNodeId = useAtomValue(selectedNodeIdAtom)
  const activation = useAtomValue(activationStateAtom)
  const setLegendHoveredType = useSetAtom(legendHoveredTypeAtom)

  const {
    nodes: layoutedNodes,
    edges,
    allNodes,
    setSelectedNodeId,
    visibleLayers,
    toggleLayer,
    applyPreset,
    fetchGraph,
  } = useIntelligenceGraph(projectSlug)

  // Real-time WebSocket updates
  const { connected: wsConnected, lastEventAt } = useGraphWebSocket(projectSlug)
  // Protocol run events — update runStatus overlay on ProtocolNodes
  useProtocolRunEvents()

  // Graph-level fullscreen (fills the app window, NOT OS fullscreen)
  const containerRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  // Custom mode — shows LayerControls panel
  const [showCustomPanel, setShowCustomPanel] = useState(false)
  // Inspector collapsed
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false)

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((v) => !v)
  }, [])

  // Escape key exits graph fullscreen
  useEffect(() => {
    if (!isFullscreen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullscreen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isFullscreen])

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

  // ── CSS-driven edge highlighting (zero JS overhead on hover) ──────────────
  // Default edges are dimmed/highlighted via dynamic <style> + data-testid selectors.
  // Custom edges (synapse, co_changed, affects) read atoms directly.
  // Only during spreading activation do we fall back to JS for default edges.
  const activationActive = activation.phase !== 'idle'

  /** CSS rules for hover/selection highlighting of default edges.
   *  Edge IDs use `|` separator: `e|source|target|idx` → data-testid="rf__edge-e|src|tgt|idx"
   *  Substring match `[data-testid*="|nodeId|"]` reliably targets connected edges. */
  const highlightCss = useMemo(() => {
    // During activation, JS handles default edges (can't express Set membership in CSS)
    if (activationActive) return ''
    if (!hoveredNodeId && !selectedNodeId) return ''

    const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    let css = `.react-flow__edge-default .react-flow__edge-path { opacity: 0.1; transition: opacity 200ms, stroke 200ms, stroke-width 200ms; }\n`

    // Selection highlighting (cyan) — listed first, lower CSS specificity priority
    if (selectedNodeId) {
      const e = esc(selectedNodeId)
      css += `.react-flow__edge-default[data-testid*="|${e}|"] .react-flow__edge-path { opacity: 1; stroke: #22D3EE; stroke-width: 2px; }\n`
    }
    // Hover highlighting (amber) — listed second, takes priority over selection
    if (hoveredNodeId) {
      const e = esc(hoveredNodeId)
      css += `.react-flow__edge-default[data-testid*="|${e}|"] .react-flow__edge-path { opacity: 1; stroke: #F59E0B; stroke-width: 2px; }\n`
    }

    return css
  }, [hoveredNodeId, selectedNodeId, activationActive])

  /** During spreading activation, apply JS-based dimming to default edges.
   *  Custom edges handle their own activation via activationStateAtom.
   *  This useMemo does NOT depend on hoveredNodeId — hover is CSS-only even during activation. */
  const displayEdges = useMemo(() => {
    if (!activationActive) return edges

    const activatedNodeIds = new Set([...activation.directIds, ...activation.propagatedIds])

    return edges.map((edge): IntelligenceEdge => {
      // Custom edges handle their own activation highlighting via atoms
      if (edge.type && edge.type !== 'default') return edge

      const isActivationRelevant = activatedNodeIds.has(edge.source) && activatedNodeIds.has(edge.target)

      if (!isActivationRelevant) {
        return {
          ...edge,
          style: { ...edge.style, opacity: 0.04, transition: 'opacity 300ms' },
        }
      }
      return {
        ...edge,
        style: { ...edge.style, stroke: '#22D3EE', transition: 'opacity 300ms, stroke 300ms' },
      }
    })
  }, [edges, activationActive, activation.directIds, activation.propagatedIds])

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

  // Determine overlay states — use allNodes (raw API data) instead of layouted nodes
  // because in 3D mode the dagre worker doesn't run, so local `nodes` stays empty.
  const hasData = allNodes.length > 0
  const showError = !!error && !hasData
  const showEmpty = !loading && !error && !hasData

  // ── Graph content (shared between inline and fullscreen portal) ──────────
  const graphContent = (
    <div
      ref={containerRef}
      className={`overflow-hidden bg-[#0f172a] ${
        isFullscreen
          ? 'fixed inset-0 z-[9999] bg-slate-950'
          : `relative ${props.embedded ? 'w-full' : '-mx-4 md:-mx-6 -mb-2'}`
      }`}
      style={{
        ...(!isFullscreen && {
          height: props.embedded ? '600px' : 'calc(100dvh - 5rem)',
        }),
      }}
    >
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
          @keyframes fsm-pulse {
            0%, 100% { opacity: 0.3; }
            50% { opacity: 0.7; }
          }
          .fsm-state-pulse {
            animation: fsm-pulse 2s ease-in-out infinite;
          }
          @keyframes fsm-edge-flow {
            to { stroke-dashoffset: -16; }
          }
          .fsm-edge-active {
            stroke-dasharray: 8 4;
            animation: fsm-edge-flow 1s linear infinite;
          }
          @keyframes fsm-progress {
            0% { opacity: 0.8; }
            50% { opacity: 1; }
            100% { opacity: 0.8; }
          }
          .fsm-progress-bar {
            animation: fsm-progress 1.5s ease-in-out infinite;
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

      {/* Dynamic CSS for edge hover/selection highlighting — zero JS per hover event */}
      {highlightCss && <style>{highlightCss}</style>}

      {/* Layer controls (top-left overlay) — presets always visible, details in Custom mode */}
      <LayerControls
        visibleLayers={visibleLayers}
        onToggleLayer={toggleLayer}
        onApplyPreset={applyPreset}
        customMode={showCustomPanel}
        onToggleCustom={() => setShowCustomPanel((v) => !v)}
      />

      {/* Spreading Activation search overlay (top-center) */}
      <SpreadingActivation projectSlug={projectSlug} />

      {/* ── Canvas: 2D or 3D ───────────────────────────────────────────── */}
      {viewMode === '2d' ? (
        <ReactFlowProvider>
          <ReactFlow
            nodes={nodes}
            edges={displayEdges}
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
            <AutoFitView containerRef={containerRef} />
          </ReactFlow>
        </ReactFlowProvider>
      ) : (
        <Suspense fallback={
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950">
            <div className="text-slate-500 text-sm flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              Loading 3D engine...
            </div>
          </div>
        }>
          <IntelligenceGraph3D nodes={layoutedNodes} edges={edges} />
        </Suspense>
      )}

      {/* ── Overlay states ── */}
      {showError && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
          <ErrorState description={error!} onRetry={fetchGraph} />
        </div>
      )}
      {showEmpty && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
          <EmptyState
            variant="search"
            title="No intelligence data"
            description="Sync your project to populate the intelligence graph."
          />
        </div>
      )}

      {/* Node Inspector (right sidebar overlay) — collapsible, wider in fullscreen */}
      {selectedNodeId && !inspectorCollapsed && <NodeInspector isFullscreen={isFullscreen} />}

      {/* Inspector collapse/expand toggle — tab stuck to left edge of panel */}
      {selectedNodeId && (
        <button
          onClick={() => setInspectorCollapsed((v) => !v)}
          className={`absolute top-[4.5rem] z-40 flex items-center gap-1 py-2 rounded-l-md text-[10px] font-medium bg-slate-800/90 backdrop-blur-sm border border-r-0 border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-700/80 transition-all duration-200 ${
            inspectorCollapsed
              ? 'right-0 px-2 rounded-r-md border-r border-slate-700'
              : isFullscreen
                ? 'right-[24.75rem] px-1.5'
                : 'right-[20.75rem] px-1.5'
          }`}
          title={inspectorCollapsed ? 'Show inspector' : 'Hide inspector'}
        >
          {inspectorCollapsed ? <PanelRightOpen size={12} /> : <PanelRightClose size={12} />}
          {inspectorCollapsed ? 'Details' : ''}
        </button>
      )}

      {/* Live indicator (top-right) */}
      <div className="absolute top-3 right-3 z-40">
        <LiveIndicator connected={wsConnected} lastEventAt={lastEventAt} />
      </div>

      {/* 2D/3D toggle + Fullscreen (bottom-right) */}
      <div className="absolute bottom-3 right-3 z-40 flex items-center gap-1 bg-slate-800/90 backdrop-blur-sm rounded-lg border border-slate-700 p-0.5">
        <button
          onClick={() => setViewMode('2d')}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
            viewMode === '2d'
              ? 'bg-blue-600 text-white'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
          }`}
        >
          <Grid3x3 size={13} />
          2D
        </button>
        <button
          onClick={() => setViewMode('3d')}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
            viewMode === '3d'
              ? 'bg-blue-600 text-white'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
          }`}
        >
          <Box size={13} />
          3D
        </button>
        <div className="w-px h-5 bg-slate-700 mx-0.5" />
        <button
          onClick={toggleFullscreen}
          className="flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition-colors"
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        >
          {isFullscreen ? <Minimize size={13} /> : <Maximize size={13} />}
        </button>
      </div>

      {/* Bottom-left section: loading progress + entity legend */}
      <div className="absolute bottom-3 left-3 z-40 flex flex-col items-start gap-2 pointer-events-none">
        {/* Loading progress — inline, non-blocking */}
        <GraphLoadingProgress />
        {/* Entity legend */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-slate-900/80 backdrop-blur-sm border border-slate-700/60 px-3 py-2 max-w-md pointer-events-auto">
          {ENTITY_LEGEND
            .filter((group) => visibleLayers.has(group.layer))
            .flatMap((group) => group.types)
            .map((t) => {
              const color = ENTITY_COLORS[t.key as keyof typeof ENTITY_COLORS] ?? '#6B7280'
              return (
                <span
                  key={t.key}
                  className="flex items-center gap-1.5 text-[10px] text-slate-400 cursor-pointer hover:text-slate-200 transition-colors"
                  onMouseEnter={() => setLegendHoveredType(t.key)}
                  onMouseLeave={() => setLegendHoveredType(null)}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  {t.label}
                </span>
              )
            })}
        </div>
        {/* Branding */}
        <span className="text-[9px] text-slate-600 tracking-wide pointer-events-none pl-1">
          Made by Freedom From Scratch
        </span>
      </div>

      {/* Keyboard shortcut hint (bottom-center) — prominent CTA, hidden when search is open */}
      {!searchOpen && <button
        onClick={() => setSearchOpen(true)}
        className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2.5 px-4 py-2 rounded-full bg-slate-800/90 backdrop-blur-sm border border-slate-600/80 text-slate-300 hover:text-cyan-300 hover:border-cyan-500/50 hover:bg-slate-800 hover:shadow-lg hover:shadow-cyan-500/10 transition-all duration-200 group cursor-pointer"
      >
        <Search size={14} className="text-slate-400 group-hover:text-cyan-400 transition-colors" />
        <span className="text-xs font-medium">Spreading Activation</span>
        <kbd className="text-[11px] px-1.5 py-0.5 rounded-md bg-slate-700/80 border border-slate-600 font-mono text-slate-400 group-hover:text-cyan-300 group-hover:border-cyan-500/40 transition-colors">
          ⌘K
        </kbd>
      </button>}
    </div>
  )

  // In fullscreen, render via portal to escape MainLayout stacking context
  // (sidebar, header, chat panel all create stacking contexts that trap z-index)
  if (isFullscreen) {
    return createPortal(graphContent, document.body)
  }

  return graphContent
}
