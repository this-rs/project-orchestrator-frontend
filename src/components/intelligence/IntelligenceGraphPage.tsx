import { lazy, Suspense, useCallback, useState, useEffect, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useParams } from 'react-router-dom'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { Maximize, Minimize, PanelRightClose, PanelRightOpen, Search, Sun } from 'lucide-react'

import { useIntelligenceGraph } from './useIntelligenceGraph'
import { useGraphWebSocket } from './useGraphWebSocket'
import { useProtocolRunEvents } from './useProtocolRunEvents'
import { NodeInspector } from './NodeInspector'
import { LayerControls } from './LayerControls'
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
import { useT, type MessageKey } from '@/i18n'
import { claimModK } from '@/components/anchors/askHereShortcut'

// ── Entity legend data ──────────────────────────────────────────────────────
const ENTITY_LEGEND: { layer: IntelligenceLayer; types: { key: string; label: MessageKey }[] }[] = [
  { layer: 'code', types: [
    { key: 'file', label: 'intelPage.graph.legend.file' },
    { key: 'function', label: 'intelPage.graph.legend.function' },
    { key: 'struct', label: 'intelPage.graph.legend.struct' },
    { key: 'trait', label: 'intelPage.graph.legend.trait' },
    { key: 'enum', label: 'intelPage.graph.legend.enum' },
    { key: 'feature_graph', label: 'intelPage.graph.legend.featureGraph' },
  ]},
  { layer: 'knowledge', types: [
    { key: 'note', label: 'intelPage.graph.legend.note' },
    { key: 'decision', label: 'intelPage.graph.legend.decision' },
    { key: 'constraint', label: 'intelPage.graph.legend.constraint' },
  ]},
  { layer: 'skills', types: [
    { key: 'skill', label: 'intelPage.graph.legend.skill' },
  ]},
  { layer: 'behavioral', types: [
    { key: 'protocol', label: 'intelPage.graph.legend.protocol' },
    { key: 'protocol_state', label: 'intelPage.graph.legend.state' },
  ]},
  { layer: 'pm', types: [
    { key: 'plan', label: 'intelPage.graph.legend.plan' },
    { key: 'task', label: 'intelPage.graph.legend.task' },
    { key: 'step', label: 'intelPage.graph.legend.step' },
    { key: 'milestone', label: 'intelPage.graph.legend.milestone' },
    { key: 'release', label: 'intelPage.graph.legend.release' },
  ]},
  { layer: 'chat', types: [
    { key: 'chat_session', label: 'intelPage.graph.legend.chatSession' },
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
  const { t } = useT()
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
  useGraphWebSocket(projectSlug)
  // Protocol run events — update runStatus overlay on ProtocolNodes
  useProtocolRunEvents()

  // Graph-level fullscreen (fills the app window, NOT OS fullscreen)
  const containerRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  // Custom mode — shows LayerControls panel
  const [showCustomPanel, setShowCustomPanel] = useState(false)
  // Inspector collapsed
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false)

  // Stable DOM host for the graph. The graph is ALWAYS rendered through a
  // portal into this one node, and the NODE is moved (placeholder <-> body) on
  // fullscreen toggle. Switching between `return graphContent` and
  // `createPortal(graphContent, body)` would put the tree at two different
  // positions, so React would unmount + remount it: new WebGL context, empty
  // layout -> the graph vanished from the canvas on enter/exit fullscreen.
  const placeholderRef = useRef<HTMLDivElement>(null)
  const [host] = useState<HTMLDivElement>(() => {
    const el = document.createElement('div')
    el.dataset.graphHost = ''
    return el
  })
  useLayoutEffect(() => {
    const target = isFullscreen ? document.body : placeholderRef.current
    if (!target) return
    host.className = isFullscreen
      ? 'fixed inset-0 z-[9999] bg-surface-base'
      : 'absolute inset-0'
    if (host.parentNode !== target) target.appendChild(host)
    // Let every size observer re-measure once the node is in its new parent.
    const raf = requestAnimationFrame(() => window.dispatchEvent(new Event('resize')))
    return () => cancelAnimationFrame(raf)
  }, [isFullscreen, host])
  useEffect(() => () => { host.remove() }, [host])

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
    // This screen owns Cmd+K while mounted: « Demander ici » leaves it alone.
    const release = claimModK()
    return () => {
      release()
      window.removeEventListener('keydown', handleKeyDown)
    }
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
      className="relative h-full w-full overflow-hidden bg-surface-base"
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
          <div className="absolute inset-0 flex items-center justify-center bg-surface-base">
            <div className="text-[var(--text-tertiary)] text-sm flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
              {t('intelPage.graph.loading3d')}
            </div>
          </div>
        }>
          <IntelligenceGraph3D nodes={layoutedNodes} edges={edges} />
        </Suspense>
      </Graph3DErrorBoundary>

      {/* ── Overlay states ── */}
      {showError && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-surface-base/80 backdrop-blur-sm">
          <ErrorState description={error!} onRetry={fetchGraph} />
        </div>
      )}
      {showEmpty && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-surface-base/80 backdrop-blur-sm">
          <EmptyState
            variant="search"
            title={t('intelPage.graph.noDataTitle')}
            description={t('intelPage.graph.noDataDescription')}
          />
        </div>
      )}

      {/* Node Inspector (right sidebar overlay) — collapsible, wider in fullscreen */}
      {selectedNodeId && !inspectorCollapsed && <NodeInspector isFullscreen={isFullscreen} />}

      {/* Inspector collapse/expand toggle — tab stuck to left edge of panel */}
      {selectedNodeId && (
        <button
          onClick={() => setInspectorCollapsed((v) => !v)}
          className={`absolute top-[4.5rem] z-40 flex items-center gap-1 py-2 rounded-l-md text-[10px] font-medium bg-surface-raised/90 backdrop-blur-sm border border-r-0 border-border-default shadow-[var(--shadow-md)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-surface-highlight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-light)] transition-colors ${
            inspectorCollapsed
              ? 'right-0 px-2 rounded-r-md border-r border-border-default'
              : isFullscreen
                ? 'right-[24.75rem] px-1.5'
                : 'right-[20.75rem] px-1.5'
          }`}
          title={inspectorCollapsed ? t('intelPage.graph.showInspector') : t('intelPage.graph.hideInspector')}
          aria-label={inspectorCollapsed ? t('intelPage.graph.showInspector') : t('intelPage.graph.hideInspector')}
          aria-expanded={!inspectorCollapsed}
        >
          {inspectorCollapsed ? <PanelRightOpen size={12} /> : <PanelRightClose size={12} />}
          {inspectorCollapsed ? t('intelPage.graph.details') : ''}
        </button>
      )}

      {/* Controls (bottom-right): brightness slider stacked above fullscreen */}
      <div className="absolute bottom-3 right-3 z-40 flex flex-col items-center gap-1.5">
        {/* Brightness slider (vertical) */}
        <div className="flex flex-col items-center gap-1 bg-surface-raised/90 backdrop-blur-sm rounded-lg border border-border-default shadow-[var(--shadow-md)] p-1">
          <Sun size={11} className="text-[var(--text-tertiary)] shrink-0" aria-hidden="true" />
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={graphBrightness}
            onChange={(e) => setGraphBrightness(parseFloat(e.target.value))}
            className="graph-brightness-slider"
            title={t('intelPage.graph.brightness', { percent: Math.round(graphBrightness * 100) })}
            aria-label={t('intelPage.graph.brightness', { percent: Math.round(graphBrightness * 100) })}
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
        <div className="flex items-center bg-surface-raised/90 backdrop-blur-sm rounded-lg border border-border-default shadow-[var(--shadow-md)] p-0.5">
          <button
            onClick={toggleFullscreen}
            className="flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-surface-highlight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-light)] transition-colors"
            aria-pressed={isFullscreen}
            aria-label={isFullscreen ? t('intelPage.graph.exitFullscreen') : t('intelPage.graph.fullscreen')}
            title={isFullscreen ? t('intelPage.graph.exitFullscreen') : t('intelPage.graph.fullscreen')}
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
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-surface-raised/80 backdrop-blur-sm border border-border-default shadow-[var(--shadow-md)] px-3 py-2 max-w-md pointer-events-auto">
          {ENTITY_LEGEND
            .filter((group) => visibleLayers.has(group.layer))
            .flatMap((group) => group.types)
            .map((entry) => {
              const color = ENTITY_COLORS[entry.key as keyof typeof ENTITY_COLORS] ?? '#6B7280'
              return (
                <span
                  key={entry.key}
                  className="flex items-center gap-1.5 text-[10px] text-[var(--text-secondary)] cursor-pointer hover:text-[var(--text-primary)] transition-colors"
                  onMouseEnter={() => setLegendHoveredType(entry.key)}
                  onMouseLeave={() => setLegendHoveredType(null)}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  {t(entry.label)}
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
        className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2.5 px-4 py-2 rounded-full bg-surface-raised/90 backdrop-blur-sm border border-border-strong shadow-[var(--shadow-md)] text-[var(--text-primary)] hover:text-[var(--color-primary-light)] hover:border-[var(--color-primary)]/60 hover:bg-surface-raised hover:shadow-[var(--shadow-lg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-light)] transition-[color,background-color,border-color,box-shadow] group cursor-pointer"
        aria-label={t('intelPage.graph.spreadingActivation')}
        aria-keyshortcuts="Meta+K Control+K"
      >
        <Search size={14} className="text-[var(--text-secondary)] group-hover:text-[var(--color-primary-light)] transition-colors" aria-hidden="true" />
        <span className="text-xs font-medium">{t('intelPage.graph.spreadingActivation')}</span>
        <kbd className="text-[11px] px-1.5 py-0.5 rounded-md bg-surface-highlight border border-border-default font-mono text-[var(--text-secondary)] group-hover:text-[var(--color-primary-light)] group-hover:border-[var(--color-primary)]/40 transition-colors">
          ⌘K
        </kbd>
      </button>}
    </div>
  )

  // The placeholder keeps the inline footprint; the host (and the graph in it)
  // is moved to <body> in fullscreen to escape MainLayout stacking contexts.
  return (
    <div
      ref={placeholderRef}
      className={`relative ${props.embedded ? 'w-full' : '-mx-4 md:-mx-6 -mb-2'}`}
      style={{ height: props.embedded ? '600px' : 'calc(100dvh - 5rem)' }}
    >
      {createPortal(graphContent, host)}
    </div>
  )
}
