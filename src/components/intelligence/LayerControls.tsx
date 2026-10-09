import { memo } from 'react'
import { useT, type MessageKey } from '@/i18n'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import type { IntelligenceLayer, VisibilityMode } from '@/types/intelligence'
import { LAYERS, LAYER_ORDER, VISIBILITY_PRESETS } from '@/constants/intelligence'
import { energyHeatmapAtom, touchesHeatmapAtom, coChangeThresholdAtom, loadingLayersAtom, showCommunityHullsAtom, visibilityModeAtom, showAllEdgesAtom, hiddenEdgeCountAtom } from '@/atoms/intelligence'
import { activationSearchOpenAtom } from './SpreadingActivation'
import {
  Eye,
  EyeOff,
  Code2,
  BookOpen,
  Brain,
  KanbanSquare,
  Zap,
  Layers,
  Flame,
  Search,
  GitCommitHorizontal,
  GitFork,
  SlidersHorizontal,
  Workflow,
  Hexagon,
  X,
  LayoutGrid,
} from 'lucide-react'
import { PROJECT_COLORS } from '@/constants/intelligence'
import { ViewTabs, type ViewTab } from '@/components/ui'
import { glassFlat, iconButton, segmentItem, segmented } from '@/components/ui/classes'

const presetIcons: Record<string, typeof Layers> = {
  Code2,
  BookOpen,
  Brain,
  KanbanSquare,
  Zap,
  Layers,
  Workflow,
}

/** The "Custom" entry of the presets strip: not a preset, it opens the detail panels. */
const CUSTOM_TAB = 'custom'

/** One item of a segmented control (`.seg-item`, DESIGN.md § Matière): 36px tap target on phones, 32px on desktop. */
const segItem = `${segmentItem} shrink-0 h-9 md:h-8 px-3 text-xs font-medium whitespace-nowrap gap-1.5`
/** An opaque floating panel for the controls that are not a segmented control (the slider). */
const panel = 'rounded-xl border border-white/[0.08] bg-surface-popover'

export interface ProjectMeta {
  slug: string
  name: string
  node_count: number
}

interface LayerControlsProps {
  visibleLayers: Set<IntelligenceLayer>
  onToggleLayer: (layer: IntelligenceLayer) => void
  onApplyPreset: (preset: VisibilityMode) => void
  /** When true, expanded detail panels (layer toggles, overlays, fabric) are shown */
  customMode: boolean
  /** Toggle custom mode on/off */
  onToggleCustom: () => void
  /** Workspace project list for view buttons */
  projectMetas?: ProjectMeta[]
  activeProjectFilters?: Set<string>
  onToggleProjectFilter?: (slug: string) => void
  onClearProjectFilters?: () => void
  /** Hover a project slug to highlight its nodes in the 3D graph */
  onHoverProject?: (slug: string | null) => void
}

/**
 * The controls of the intelligence graph (top-left overlay). Only the CONTROLS wear the
 * design system: the presets are one segmented control (`ViewTabs`), every toggle is a
 * `seg-item` with `aria-pressed`, icon buttons are `iconButton` — flat, because several of
 * them float over the canvas at once. The colours of the layers, projects and entities are
 * data (`constants/intelligence.ts`) and are never changed here.
 */
function LayerControlsComponent({
  visibleLayers,
  onToggleLayer,
  onApplyPreset,
  customMode,
  onToggleCustom,
  projectMetas,
  activeProjectFilters,
  onToggleProjectFilter,
  onClearProjectFilters,
  onHoverProject,
}: LayerControlsProps) {
  const { t } = useT()
  const [heatmapEnabled, setHeatmapEnabled] = useAtom(energyHeatmapAtom)
  const [touchesEnabled, setTouchesEnabled] = useAtom(touchesHeatmapAtom)
  const [coChangeThreshold, setCoChangeThreshold] = useAtom(coChangeThresholdAtom)
  const [communityHulls, setCommunityHulls] = useAtom(showCommunityHullsAtom)
  const setSearchOpen = useSetAtom(activationSearchOpenAtom)
  const loadingLayers = useAtomValue(loadingLayersAtom)
  const activeMode = useAtomValue(visibilityModeAtom)
  const [showAllEdges, setShowAllEdges] = useAtom(showAllEdgesAtom)
  const hiddenEdgeCount = useAtomValue(hiddenEdgeCountAtom)

  const hasFilters = activeProjectFilters ? activeProjectFilters.size > 0 : false

  const presetTabs: ViewTab<string>[] = [
    ...VISIBILITY_PRESETS.map((preset) => {
      const Icon = presetIcons[preset.icon] ?? Layers
      return { id: preset.id as string, label: t(`intelGraph.preset.${preset.id}` as MessageKey), icon: <Icon /> }
    }),
    { id: CUSTOM_TAB, label: t('intelGraph.controls.custom'), icon: <SlidersHorizontal /> },
  ]
  const selectPreset = (id: string) => {
    if (id === CUSTOM_TAB) {
      if (!customMode) onToggleCustom()
      return
    }
    onApplyPreset(id as VisibilityMode)
    if (customMode) onToggleCustom()
  }

  return (
    <div className="absolute top-3 left-3 z-40 flex max-w-[calc(100%-1.5rem)] flex-col items-start gap-2">
      {/* Presets — one segmented control (scrolls in its own strip on phones) + the edges toggle */}
      <div className="flex max-w-full flex-wrap items-center gap-2">
        <ViewTabs tabs={presetTabs} value={customMode ? CUSTOM_TAB : activeMode} onChange={selectPreset} label={t('intelGraph.controls.presets')} className="min-w-0" />
        <div className={segmented}>
          <button
            type="button"
            onClick={() => setShowAllEdges(!showAllEdges)}
            aria-pressed={showAllEdges}
            className={segItem}
            title={showAllEdges ? t('intelGraph.controls.edgesPriorityTitle') : t('intelGraph.controls.edgesAllTitle', { count: hiddenEdgeCount })}
          >
            {showAllEdges ? <Eye size={14} aria-hidden="true" /> : <EyeOff size={14} aria-hidden="true" />}
            {showAllEdges ? t('intelGraph.controls.allEdges') : t('intelGraph.controls.edges')}
            {!showAllEdges && hiddenEdgeCount > 0 && <span className="tabular-nums font-normal text-gray-500">{hiddenEdgeCount}</span>}
          </button>
        </div>
      </div>

      {/* ── Views — workspace project filters (multi-select) ───── */}
      {projectMetas && projectMetas.length > 1 && onToggleProjectFilter && onClearProjectFilters && (
        <div className="flex max-w-full items-center gap-1">
          <div
            role="group"
            aria-label={t('intelGraph.controls.projectViews')}
            className={`${segmented} max-w-full overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}
          >
            <span className="inline-flex shrink-0 items-center gap-1 pl-2 pr-1 text-[11px] text-gray-500" aria-hidden="true">
              <LayoutGrid size={12} />
              {t('intelGraph.controls.views')}
            </span>
            <button type="button" onClick={onClearProjectFilters} aria-pressed={!hasFilters} className={segItem} title={t('intelGraph.controls.showAllProjects')}>
              {t('intelGraph.controls.all')}
            </button>
            {projectMetas.map((p, i) => {
              const color = PROJECT_COLORS[i % PROJECT_COLORS.length]
              const isActive = activeProjectFilters?.has(p.slug) ?? false
              return (
                <button
                  key={p.slug}
                  type="button"
                  onClick={() => onToggleProjectFilter(p.slug)}
                  onMouseEnter={() => onHoverProject?.(p.slug)}
                  onMouseLeave={() => onHoverProject?.(null)}
                  aria-pressed={isActive}
                  className={segItem}
                  title={`${t(p.node_count === 1 ? 'intelGraph.controls.projectNodesOne' : 'intelGraph.controls.projectNodesOther', { name: p.name, count: p.node_count })}${isActive ? t('intelGraph.controls.deselectHint') : ''}`}
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: color, opacity: isActive || !hasFilters ? 1 : 0.35 }}
                    aria-hidden="true"
                  />
                  {p.name}
                </button>
              )
            })}
          </div>
          {hasFilters && (
            <button
              type="button"
              onClick={onClearProjectFilters}
              aria-label={t('intelGraph.controls.clearFilters')}
              title={t('intelGraph.controls.clearFilters')}
              className={`${iconButton('ghost', 'size-9 md:size-8')} ${glassFlat}`}
            >
              <X size={14} aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      {/* ── Detail panels — only visible in Custom mode ─────────────── */}
      {customMode && (
        <>
          {/* Layer toggles */}
          <div role="group" aria-label={t('intelGraph.controls.layers')} className={`${segmented} flex-col items-stretch`}>
            {LAYER_ORDER.map((layerId) => {
              const layer = LAYERS[layerId]
              const visible = visibleLayers.has(layerId)
              const isLoading = loadingLayers.has(layerId)
              return (
                <button
                  key={layerId}
                  type="button"
                  onClick={() => onToggleLayer(layerId)}
                  aria-pressed={visible}
                  className={`${segItem} justify-start gap-2`}
                  title={t(`intelGraph.layer.${layerId}.description` as MessageKey)}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: layer.color, opacity: visible ? 1 : 0.3 }}
                    aria-hidden="true"
                  />
                  {visible ? <Eye size={14} aria-hidden="true" /> : <EyeOff size={14} aria-hidden="true" />}
                  <span>{t(`intelGraph.layer.${layerId}.label` as MessageKey)}</span>
                  {isLoading ? (
                    <span
                      role="status"
                      aria-label={t('intelGraph.controls.loadingLayer', { layer: t(`intelGraph.layer.${layerId}.label` as MessageKey) })}
                      className="ml-auto h-3 w-3 shrink-0 animate-spin rounded-full border-[1.5px] motion-reduce:animate-none"
                      style={{ borderColor: layer.color, borderTopColor: 'transparent' }}
                    />
                  ) : (
                    <span className="ml-auto text-[11px] font-normal tabular-nums text-gray-500">z{layer.zIndex}</span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Overlay toggles */}
          <div role="group" aria-label={t('intelGraph.controls.overlays')} className={`${segmented} flex-col items-stretch`}>
            <button
              type="button"
              onClick={() => setHeatmapEnabled(!heatmapEnabled)}
              aria-pressed={heatmapEnabled}
              className={`${segItem} justify-start gap-2`}
              title={t('intelGraph.controls.energyTitle')}
            >
              <Flame size={14} aria-hidden="true" />
              {t('intelGraph.controls.energy')}
            </button>
            <button
              type="button"
              onClick={() => setTouchesEnabled(!touchesEnabled)}
              aria-pressed={touchesEnabled}
              className={`${segItem} justify-start gap-2`}
              title={t('intelGraph.controls.churnTitle')}
            >
              <GitCommitHorizontal size={14} aria-hidden="true" />
              {t('intelGraph.controls.churn')}
            </button>
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className={`${segItem} justify-start gap-2`}
              title={t('intelGraph.controls.activationTitle')}
            >
              <Search size={14} aria-hidden="true" />
              {t('intelGraph.controls.activation')}
              <kbd className="ml-auto rounded border border-white/[0.08] px-1 py-0.5 font-mono text-[11px] font-normal text-gray-500">⌘K</kbd>
            </button>
            <button
              type="button"
              onClick={() => setCommunityHulls(!communityHulls)}
              aria-pressed={communityHulls}
              className={`${segItem} justify-start gap-2`}
              title={t('intelGraph.controls.communitiesTitle')}
            >
              <Hexagon size={14} aria-hidden="true" />
              {t('intelGraph.controls.communities')}
            </button>
          </div>

          {/* Fabric controls — CO_CHANGED threshold slider */}
          {visibleLayers.has('fabric') && (
            <div className={`${panel} flex flex-col gap-1 p-2`}>
              <label htmlFor="co-change-threshold" className="flex items-center gap-2 text-xs text-gray-300">
                <GitFork size={14} className="text-gray-500" aria-hidden="true" />
                <span className="font-medium">{t('intelGraph.controls.coChange')}</span>
                <span className="ml-auto text-[11px] tabular-nums text-gray-500">{t('intelGraph.controls.coChangeMin', { n: coChangeThreshold })}</span>
              </label>
              <input
                id="co-change-threshold"
                type="range"
                min={1}
                max={20}
                step={1}
                value={coChangeThreshold}
                onChange={(e) => setCoChangeThreshold(Number(e.target.value))}
                className="h-9 w-full cursor-pointer accent-indigo-400"
                aria-valuetext={t('intelGraph.controls.coChangeValue', { n: coChangeThreshold })}
                title={t('intelGraph.controls.coChangeTitle', { n: coChangeThreshold })}
              />
              <div className="flex justify-between text-[11px] tabular-nums text-gray-500">
                <span>1</span>
                <span>10</span>
                <span>20</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export const LayerControls = memo(LayerControlsComponent)
