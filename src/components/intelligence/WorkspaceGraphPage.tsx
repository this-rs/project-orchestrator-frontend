import { lazy, Suspense, useCallback, useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { Maximize, Minimize, PanelRightClose, PanelRightOpen, Sun } from 'lucide-react'

import { useWorkspaceIntelligenceGraph } from './useWorkspaceIntelligenceGraph'
import { NodeInspector } from './NodeInspector'
import { LayerControls } from './LayerControls'
import { SpreadingActivation, activationSearchOpenAtom } from './SpreadingActivation'
import { GraphLoadingProgress } from './GraphLoadingProgress'
import { graphFloat, graphControl } from './graphSurface'
import { GraphLegend } from './GraphLegend'
import { GraphSearchHint } from './GraphSearchHint'
import { GraphPanel } from './GraphPanel'
import {
  intelligenceLoadingAtom,
  intelligenceErrorAtom,
  selectedNodeIdAtom,
  hoveredProjectSlugAtom,
  graphBrightnessAtom,
} from '@/atoms/intelligence'
import { ErrorState } from '@/components/ui/ErrorState'
import { EmptyState } from '@/components/ui/EmptyState'
import { Graph3DErrorBoundary } from '@/components/ui/Graph3DErrorBoundary'
import { Branding } from '@/components/ui'
import { useT } from '@/i18n'
import { claimModK } from '@/components/anchors/askHereShortcut'

// Lazy-load the 3D component
const IntelligenceGraph3D = lazy(() => import('./graph3d/IntelligenceGraph3D'))

interface WorkspaceGraphPageProps {
  workspaceSlug: string
  /** When true, hides back navigation and adapts height for inline embedding */
  embedded?: boolean
}

export default function WorkspaceGraphPage({ workspaceSlug, embedded }: WorkspaceGraphPageProps) {
  const { t } = useT()
  const loading = useAtomValue(intelligenceLoadingAtom)
  const error = useAtomValue(intelligenceErrorAtom)
  const [searchOpen, setSearchOpen] = useAtom(activationSearchOpenAtom)
  const selectedNodeId = useAtomValue(selectedNodeIdAtom)
  const setHoveredProjectSlug = useSetAtom(hoveredProjectSlugAtom)
  const [graphBrightness, setGraphBrightness] = useAtom(graphBrightnessAtom)

  const {
    nodes: layoutedNodes,
    edges,
    allNodes,
    visibleLayers,
    toggleLayer,
    applyPreset,
    fetchGraph,
    // Workspace-specific
    projectMetas,
    activeProjectFilters,
    setActiveProjectFilters,
  } = useWorkspaceIntelligenceGraph(workspaceSlug)

  // Graph-level fullscreen (fills the app window, NOT OS fullscreen)
  const containerRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showCustomPanel, setShowCustomPanel] = useState(false)
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


  // Keyboard shortcut: Ctrl/Cmd+K
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

  const hasData = allNodes.length > 0
  const showError = !!error && !hasData
  const showEmpty = !loading && !error && !hasData

  // ── Graph content (shared between inline and fullscreen portal) ──────────
  const graphContent = (
    <div
      ref={containerRef}
      className={`overflow-hidden bg-surface-base ${
        isFullscreen
          ? 'fixed inset-0 z-[9999] bg-surface-base'
          : `relative ${embedded ? 'w-full h-[300px] sm:h-[450px] lg:h-[600px]' : '-mx-4 md:-mx-6 -mb-2'}`
      }`}
      style={{
        ...(!isFullscreen && {
          height: embedded ? undefined : 'calc(100dvh - 5rem)',
          minHeight: embedded ? '300px' : undefined,
        }),
      }}
    >
      {/* Layer controls (top-left) — includes project filter bar for workspace */}
      <LayerControls
        visibleLayers={visibleLayers}
        onToggleLayer={toggleLayer}
        onApplyPreset={applyPreset}
        customMode={showCustomPanel}
        onToggleCustom={() => setShowCustomPanel((v) => !v)}
        projectMetas={projectMetas}
        activeProjectFilters={activeProjectFilters}
        onToggleProjectFilter={(slug) => {
          setActiveProjectFilters((prev) => {
            const next = new Set(prev)
            if (next.has(slug)) next.delete(slug)
            else next.add(slug)
            return next
          })
        }}
        onClearProjectFilters={() => setActiveProjectFilters(new Set())}
        onHoverProject={setHoveredProjectSlug}
      />

      {/* Spreading Activation search (top-center) */}
      <SpreadingActivation projectSlug={undefined} />

      {/* ── Canvas: 3D only ────────────────────────────────────────────── */}
      <Graph3DErrorBoundary context="Workspace Graph">
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
            title={t('intelPage.graph.workspaceNoDataTitle')}
            description={t('intelPage.graph.workspaceNoDataDescription')}
          />
        </div>
      )}

      {/* Node Inspector (right sidebar) */}
      {selectedNodeId && !inspectorCollapsed && <NodeInspector isFullscreen={isFullscreen} />}

      {selectedNodeId && (
        <button
          onClick={() => setInspectorCollapsed((v) => !v)}
          className={`absolute top-[4.5rem] z-40 flex items-center gap-1 py-2 rounded-l-md text-[10px] font-medium bg-surface-popover/90 backdrop-blur-sm border border-r-0 border-border-subtle shadow-[var(--shadow-md)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-surface-highlight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-light)] transition-colors ${
            inspectorCollapsed
              ? 'right-0 px-2 rounded-r-md border-r border-border-subtle'
              : isFullscreen
                ? 'right-[24.75rem] px-1.5'
                : 'right-[18.75rem] px-1.5'
          }`}
          title={inspectorCollapsed ? t('intelPage.graph.showInspector') : t('intelPage.graph.hideInspector')}
        >
          {inspectorCollapsed ? <PanelRightOpen size={12} /> : <PanelRightClose size={12} />}
          {inspectorCollapsed ? t('intelPage.graph.details') : ''}
        </button>
      )}

      {/* Controls toolbar (bottom-right): brightness slider + fullscreen */}
      <div className="absolute bottom-3 right-3 z-40 flex flex-col items-center gap-1.5">
        {/* Brightness slider (vertical) — collapsible */}
        <GraphPanel
          id="brightness"
          title={t('intelPage.graph.panels.brightness')}
          icon={<Sun size={11} className="text-[var(--text-tertiary)] shrink-0" aria-hidden="true" />}
        >
          <div className="flex flex-col items-center gap-1 p-1">
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
        </GraphPanel>
        {/* Fullscreen toggle */}
        <div className={`flex items-center ${graphFloat} shadow-[var(--shadow-md)] p-0.5`}>
          <button
            onClick={toggleFullscreen}
            className={`flex items-center justify-center w-7 h-7 rounded-md text-[var(--text-secondary)] ${graphControl}`}
            title={isFullscreen ? t('intelPage.graph.exitFullscreenEsc') : t('intelPage.graph.fullscreen')}
          >
            {isFullscreen ? <Minimize size={13} /> : <Maximize size={13} />}
          </button>
        </div>
      </div>

      {/* Bottom-left section: loading progress + entity legend */}
      <div className="absolute bottom-3 left-3 z-40 flex flex-col items-start gap-2 pointer-events-none">
        {/* Loading progress — inline, non-blocking */}
        <GraphLoadingProgress />
        <GraphLegend visibleLayers={visibleLayers} />
        {/* Branding */}
        <Branding variant="inline" className="pl-1" />
      </div>

      {/* Keyboard shortcut hint (bottom-center), hidden when search is open */}
      {!searchOpen && <GraphSearchHint onOpen={() => setSearchOpen(true)} />}
    </div>
  )

  // In fullscreen, render via portal to escape MainLayout stacking context
  // (sidebar, header, chat panel all create stacking contexts that trap z-index)
  if (isFullscreen) {
    return createPortal(graphContent, document.body)
  }

  return graphContent
}
