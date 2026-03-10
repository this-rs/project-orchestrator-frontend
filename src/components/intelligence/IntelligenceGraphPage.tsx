import { lazy, Suspense, useCallback, useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useParams } from 'react-router-dom'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { Maximize, Minimize, PanelRightClose, PanelRightOpen, Search, Sun } from 'lucide-react'

import { useIntelligenceGraph } from './useIntelligenceGraph'
import { useGraphWebSocket } from './useGraphWebSocket'
import { useProtocolRunEvents } from './useProtocolRunEvents'
import { NodeInspector } from './NodeInspector'
import { LayerControls } from './LayerControls'
import { LiveIndicator } from './LiveIndicator'
import { SpreadingActivation, activationSearchOpenAtom } from './SpreadingActivation'
import { GraphLoadingProgress } from './GraphLoadingProgress'
import { ENTITY_COLORS } from '@/constants/intelligence'
import {
  intelligenceLoadingAtom,
  intelligenceErrorAtom,
  selectedNodeIdAtom,
  legendHoveredTypeAtom,
  graphBrightnessAtom,
} from '@/atoms/intelligence'
import { ErrorState } from '@/components/ui/ErrorState'
import { EmptyState } from '@/components/ui/EmptyState'
import { Graph3DErrorBoundary } from '@/components/ui/Graph3DErrorBoundary'
import { Branding } from '@/components/ui'
import type { IntelligenceLayer } from '@/types/intelligence'

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
  const selectedNodeId = useAtomValue(selectedNodeIdAtom)
  const setLegendHoveredType = useSetAtom(legendHoveredTypeAtom)
  const [graphBrightness, setGraphBrightness] = useAtom(graphBrightnessAtom)

  const {
    nodes: layoutedNodes,
    edges,
    allNodes,
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

      {/* ── Canvas: 3D ───────────────────────────────────────────────── */}
      <Graph3DErrorBoundary context="Intelligence Graph">
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
      </Graph3DErrorBoundary>

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
            description="The intelligence graph visualizes notes, decisions, skills, and their neural connections. Sync your project and create knowledge entries to populate it."
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

      {/* Controls (bottom-right): brightness slider stacked above fullscreen */}
      <div className="absolute bottom-3 right-3 z-40 flex flex-col items-center gap-1.5">
        {/* Brightness slider (vertical) */}
        <div className="flex flex-col items-center gap-1 bg-slate-800/90 backdrop-blur-sm rounded-lg border border-slate-700 p-1">
          <Sun size={11} className="text-slate-500 shrink-0" />
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={graphBrightness}
            onChange={(e) => setGraphBrightness(parseFloat(e.target.value))}
            className="graph-brightness-slider"
            title={`Brightness: ${Math.round(graphBrightness * 100)}%`}
            style={{
              writingMode: 'vertical-lr',
              direction: 'rtl',
              width: '14px',
              height: '80px',
              appearance: 'none',
              WebkitAppearance: 'none',
              background: 'transparent',
              cursor: 'pointer',
            }}
          />
        </div>
        {/* Fullscreen */}
        <div className="flex items-center bg-slate-800/90 backdrop-blur-sm rounded-lg border border-slate-700 p-0.5">
          <button
            onClick={toggleFullscreen}
            className="flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition-colors"
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize size={13} /> : <Maximize size={13} />}
          </button>
        </div>
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
        <Branding variant="inline" className="pl-1" />
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
