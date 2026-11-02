import { memo, type ReactNode } from 'react'
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
import { graphChip, graphControl, graphDot, graphField, graphGroupTitle } from './graphSurface'
import { GraphPanel } from './GraphPanel'

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
 * The controls of the intelligence graph (top-left overlay), in the po-graph grammar: ONE compact
 * panel (15.5rem), presets as a 4-column grid, toggles as 11px chips, groups separated by a
 * hairline. Nothing spans the screen. Layer / project / entity colours are data and stay as is.
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

  const presetTabs: { id: string; label: string; icon: ReactNode }[] = [
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
    <GraphPanel
      id="layers"
      title={t('intelGraph.controls.layers')}
      icon={<Layers size={13} className="text-[var(--text-tertiary)]" aria-hidden="true" />}
      className="absolute top-3 left-3 z-40 w-[min(15.5rem,calc(100%-1.5rem))]"
    >
      <div className="flex flex-col gap-2 p-2">
        {/* Presets — one tight 4-column grid (two rows), the active one lit; no full-width strip */}
        <div role="tablist" aria-label={t('intelGraph.controls.presets')} className="grid grid-cols-4 gap-0.5">
          {presetTabs.map((tab) => {
            const selected = (customMode ? CUSTOM_TAB : activeMode) === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => selectPreset(tab.id)}
                title={tab.label}
                className="inline-flex h-auto min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1.5 text-[10px] font-medium leading-tight text-[var(--text-tertiary)] transition-colors hover:bg-surface-highlight hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-light)] aria-selected:bg-surface-highlight aria-selected:text-[var(--text-primary)] [&_svg]:size-3.5"
              >
                {tab.icon}
                <span className="w-full truncate text-center text-[10px] leading-tight">{tab.label}</span>
              </button>
            )
          })}
        </div>

        {/* Edges budget — one quiet line, not a segmented control of its own */}
        <button
          type="button"
          onClick={() => setShowAllEdges(!showAllEdges)}
          aria-pressed={showAllEdges}
          className={`${graphChip} justify-start`}
          title={showAllEdges ? t('intelGraph.controls.edgesPriorityTitle') : t('intelGraph.controls.edgesAllTitle', { count: hiddenEdgeCount })}
        >
          {showAllEdges ? <Eye size={13} aria-hidden="true" /> : <EyeOff size={13} aria-hidden="true" />}
          {showAllEdges ? t('intelGraph.controls.allEdges') : t('intelGraph.controls.edges')}
          {!showAllEdges && hiddenEdgeCount > 0 && <span className="ml-auto tabular-nums font-normal">{hiddenEdgeCount}</span>}
        </button>

        {/* ── Views — workspace project filters (multi-select), wrapping chips ───── */}
        {projectMetas && projectMetas.length > 1 && onToggleProjectFilter && onClearProjectFilters && (
          <section className="flex flex-col gap-1 border-t border-border-subtle pt-2">
            <div className="flex items-center gap-1 px-1">
              <LayoutGrid size={11} className="text-[var(--text-tertiary)]" aria-hidden="true" />
              <p className={graphGroupTitle} aria-hidden="true">{t('intelGraph.controls.views')}</p>
              {hasFilters && (
                <button
                  type="button"
                  onClick={onClearProjectFilters}
                  aria-label={t('intelGraph.controls.clearFilters')}
                  title={t('intelGraph.controls.clearFilters')}
                  className={`ml-auto rounded-md p-0.5 text-[var(--text-tertiary)] ${graphControl}`}
                >
                  <X size={12} aria-hidden="true" />
                </button>
              )}
            </div>
            <div role="group" aria-label={t('intelGraph.controls.projectViews')} className="flex flex-wrap gap-0.5">
              <button type="button" onClick={onClearProjectFilters} aria-pressed={!hasFilters} className={graphChip} title={t('intelGraph.controls.showAllProjects')}>
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
                    className={graphChip}
                    title={`${t(p.node_count === 1 ? 'intelGraph.controls.projectNodesOne' : 'intelGraph.controls.projectNodesOther', { name: p.name, count: p.node_count })}${isActive ? t('intelGraph.controls.deselectHint') : ''}`}
                  >
                    <span className={graphDot} style={{ backgroundColor: color, opacity: isActive || !hasFilters ? 1 : 0.35 }} aria-hidden="true" />
                    {p.name}
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {/* ── Detail panels — only visible in Custom mode ─────────────── */}
        {customMode && (
          <>
            <section className="flex flex-col gap-1 border-t border-border-subtle pt-2">
              <p className={`${graphGroupTitle} px-1`} aria-hidden="true">{t('intelGraph.controls.layers')}</p>
              <div role="group" aria-label={t('intelGraph.controls.layers')} className="flex flex-col gap-0.5">
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
                      className={`${graphChip} justify-start`}
                      title={t(`intelGraph.layer.${layerId}.description` as MessageKey)}
                    >
                      <span className={graphDot} style={{ backgroundColor: layer.color, opacity: visible ? 1 : 0.3 }} aria-hidden="true" />
                      {visible ? <Eye size={13} aria-hidden="true" /> : <EyeOff size={13} aria-hidden="true" />}
                      <span>{t(`intelGraph.layer.${layerId}.label` as MessageKey)}</span>
                      {isLoading ? (
                        <span
                          role="status"
                          aria-label={t('intelGraph.controls.loadingLayer', { layer: t(`intelGraph.layer.${layerId}.label` as MessageKey) })}
                          className="ml-auto h-3 w-3 shrink-0 animate-spin rounded-full border-[1.5px] motion-reduce:animate-none"
                          style={{ borderColor: layer.color, borderTopColor: 'transparent' }}
                        />
                      ) : (
                        <span className="ml-auto text-[10px] font-normal tabular-nums">z{layer.zIndex}</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </section>

            <section className="flex flex-col gap-1 border-t border-border-subtle pt-2">
              <p className={`${graphGroupTitle} px-1`} aria-hidden="true">{t('intelGraph.controls.overlays')}</p>
              <div role="group" aria-label={t('intelGraph.controls.overlays')} className="flex flex-col gap-0.5">
                <button type="button" onClick={() => setHeatmapEnabled(!heatmapEnabled)} aria-pressed={heatmapEnabled} className={`${graphChip} justify-start`} title={t('intelGraph.controls.energyTitle')}>
                  <Flame size={13} aria-hidden="true" />
                  {t('intelGraph.controls.energy')}
                </button>
                <button type="button" onClick={() => setTouchesEnabled(!touchesEnabled)} aria-pressed={touchesEnabled} className={`${graphChip} justify-start`} title={t('intelGraph.controls.churnTitle')}>
                  <GitCommitHorizontal size={13} aria-hidden="true" />
                  {t('intelGraph.controls.churn')}
                </button>
                <button type="button" onClick={() => setSearchOpen(true)} className={`${graphChip} justify-start`} title={t('intelGraph.controls.activationTitle')}>
                  <Search size={13} aria-hidden="true" />
                  {t('intelGraph.controls.activation')}
                  <kbd className="ml-auto rounded border border-border-subtle px-1 font-mono text-[10px] font-normal">⌘K</kbd>
                </button>
                <button type="button" onClick={() => setCommunityHulls(!communityHulls)} aria-pressed={communityHulls} className={`${graphChip} justify-start`} title={t('intelGraph.controls.communitiesTitle')}>
                  <Hexagon size={13} aria-hidden="true" />
                  {t('intelGraph.controls.communities')}
                </button>
              </div>
            </section>

            {/* Fabric controls — CO_CHANGED threshold slider */}
            {visibleLayers.has('fabric') && (
              <div className={`${graphField} flex flex-col gap-1`}>
                <label htmlFor="co-change-threshold" className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)]">
                  <GitFork size={13} className="text-[var(--text-tertiary)]" aria-hidden="true" />
                  <span className="font-medium">{t('intelGraph.controls.coChange')}</span>
                  <span className="ml-auto tabular-nums text-[var(--text-tertiary)]">{t('intelGraph.controls.coChangeMin', { n: coChangeThreshold })}</span>
                </label>
                <input
                  id="co-change-threshold"
                  type="range"
                  min={1}
                  max={20}
                  step={1}
                  value={coChangeThreshold}
                  onChange={(e) => setCoChangeThreshold(Number(e.target.value))}
                  className="h-8 w-full cursor-pointer accent-[var(--color-primary-light)]"
                  aria-valuetext={t('intelGraph.controls.coChangeValue', { n: coChangeThreshold })}
                  title={t('intelGraph.controls.coChangeTitle', { n: coChangeThreshold })}
                />
                <div className="flex justify-between text-[10px] tabular-nums text-[var(--text-tertiary)]">
                  <span>1</span>
                  <span>10</span>
                  <span>20</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </GraphPanel>
  )
}

export const LayerControls = memo(LayerControlsComponent)
