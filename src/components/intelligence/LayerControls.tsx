import { memo } from 'react'
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

const presetIcons: Record<string, typeof Layers> = {
  Code2,
  BookOpen,
  Brain,
  KanbanSquare,
  Zap,
  Layers,
  Workflow,
}

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
}

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
}: LayerControlsProps) {
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

  return (
    <div className="absolute top-3 left-3 z-40 flex flex-col gap-2">
      {/* Presets bar — always visible */}
      <div className="flex gap-1 rounded-lg bg-slate-900/90 backdrop-blur-sm border border-slate-700 p-1">
        {VISIBILITY_PRESETS.map((preset) => {
          const Icon = presetIcons[preset.icon] ?? Layers
          const isActive = activeMode === preset.id && !customMode
          return (
            <button
              key={preset.id}
              onClick={() => { onApplyPreset(preset.id); if (customMode) onToggleCustom() }}
              className={`flex items-center gap-1 rounded-md px-2 py-1.5 text-[10px] font-medium transition-colors ${
                isActive
                  ? 'bg-blue-500/20 text-blue-300 ring-1 ring-blue-500/40'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
              title={preset.description}
            >
              <Icon size={12} />
              {preset.label}
            </button>
          )
        })}
        {/* Custom mode toggle */}
        <button
          onClick={onToggleCustom}
          className={`flex items-center gap-1 rounded-md px-2 py-1.5 text-[10px] font-medium transition-colors ${
            customMode
              ? 'bg-orange-500/20 text-orange-300 ring-1 ring-orange-500/40'
              : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
          }`}
          title="Custom layer configuration"
        >
          <SlidersHorizontal size={12} />
          Custom
        </button>
        {/* All Edges toggle — always visible */}
        <div className="w-px h-5 bg-slate-700/60 mx-0.5 self-center" />
        <button
          onClick={() => setShowAllEdges(!showAllEdges)}
          className={`flex items-center gap-1 rounded-md px-2 py-1.5 text-[10px] font-medium transition-colors ${
            showAllEdges
              ? 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40'
              : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
          }`}
          title={showAllEdges ? 'Show only priority edges (budget mode)' : `Show all edges (${hiddenEdgeCount} hidden)`}
        >
          {showAllEdges ? <Eye size={12} /> : <EyeOff size={12} />}
          {showAllEdges ? 'All Edges' : `Edges${hiddenEdgeCount > 0 ? ` (${hiddenEdgeCount})` : ''}`}
        </button>
      </div>

      {/* ── View buttons — workspace project views ───── */}
      {projectMetas && projectMetas.length > 1 && onToggleProjectFilter && onClearProjectFilters && (
        <div className="flex items-center gap-1 rounded-lg bg-slate-900/90 backdrop-blur-sm border border-slate-700 p-1 self-start">
          <LayoutGrid size={11} className="text-slate-500 shrink-0 ml-0.5" />
          <span className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider px-0.5 shrink-0">Views</span>
          <div className="w-px h-4 bg-slate-700/60 shrink-0" />
          {/* "All" button */}
          <button
            onClick={onClearProjectFilters}
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-all whitespace-nowrap ${
              !hasFilters
                ? 'bg-violet-500/20 text-violet-300 ring-1 ring-violet-500/40'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
            title="Show all projects"
          >
            All
          </button>
          {/* Per-project buttons */}
          {projectMetas.map((p, i) => {
            const color = PROJECT_COLORS[i % PROJECT_COLORS.length]
            const isActive = activeProjectFilters?.has(p.slug) ?? false
            return (
              <button
                key={p.slug}
                onClick={() => onToggleProjectFilter(p.slug)}
                className={`flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-slate-700/70 text-white ring-1 ring-slate-500/50'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
                title={`${p.name} (${p.node_count} nodes)${isActive ? ' — click to deselect' : ''}`}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0 transition-opacity"
                  style={{ backgroundColor: color, opacity: isActive || !hasFilters ? 1 : 0.35 }}
                />
                {p.name}
              </button>
            )
          })}
          {hasFilters && (
            <button
              onClick={onClearProjectFilters}
              className="flex items-center shrink-0 rounded-md p-0.5 text-amber-400 hover:text-amber-300 transition-colors"
              title="Clear all filters"
            >
              <X size={10} />
            </button>
          )}
        </div>
      )}

      {/* ── Detail panels — only visible in Custom mode ─────────────── */}
      {customMode && (
        <>
          {/* Layer toggles */}
          <div className="flex flex-col gap-0.5 rounded-lg bg-slate-900/90 backdrop-blur-sm border border-slate-700 p-1.5">
            {LAYER_ORDER.map((layerId) => {
              const layer = LAYERS[layerId]
              const visible = visibleLayers.has(layerId)
              const isLoading = loadingLayers.has(layerId)
              return (
                <button
                  key={layerId}
                  onClick={() => onToggleLayer(layerId)}
                  className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors ${
                    visible
                      ? 'text-slate-200 bg-slate-800/50'
                      : 'text-slate-500 hover:text-slate-400'
                  }`}
                >
                  <div
                    className="w-2.5 h-2.5 rounded-full shrink-0 transition-opacity"
                    style={{
                      backgroundColor: layer.color,
                      opacity: visible ? 1 : 0.3,
                    }}
                  />
                  {visible ? <Eye size={12} /> : <EyeOff size={12} />}
                  <span className="font-medium">{layer.label}</span>
                  {isLoading ? (
                    <div
                      className="w-3 h-3 border-[1.5px] border-t-transparent rounded-full animate-spin ml-auto shrink-0"
                      style={{ borderColor: layer.color, borderTopColor: 'transparent' }}
                    />
                  ) : (
                    <span className="text-[10px] text-slate-500 ml-auto">z{layer.zIndex}</span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Overlay toggles */}
          <div className="flex flex-col gap-0.5 rounded-lg bg-slate-900/90 backdrop-blur-sm border border-slate-700 p-1.5">
            <button
              onClick={() => setHeatmapEnabled(!heatmapEnabled)}
              className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors ${
                heatmapEnabled
                  ? 'text-amber-300 bg-amber-950/40'
                  : 'text-slate-500 hover:text-slate-400'
              }`}
              title="Color note nodes by energy level (red=low, green=high)"
            >
              <Flame size={12} className={heatmapEnabled ? 'text-amber-400' : ''} />
              <span className="font-medium">Energy Heatmap</span>
            </button>
            <button
              onClick={() => setTouchesEnabled(!touchesEnabled)}
              className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors ${
                touchesEnabled
                  ? 'text-green-300 bg-green-950/40'
                  : 'text-slate-500 hover:text-slate-400'
              }`}
              title="Highlight file nodes by churn score (commit frequency)"
            >
              <GitCommitHorizontal size={12} className={touchesEnabled ? 'text-green-400' : ''} />
              <span className="font-medium">Churn Heatmap</span>
            </button>
            <button
              onClick={() => setSearchOpen(true)}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-slate-500 hover:text-cyan-400 hover:bg-cyan-950/30 transition-colors"
              title="Search to visualize spreading activation (⌘K)"
            >
              <Search size={12} />
              <span className="font-medium">Activation</span>
              <kbd className="ml-auto text-[9px] px-1 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-slate-600">⌘K</kbd>
            </button>
            <button
              onClick={() => setCommunityHulls(!communityHulls)}
              className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors ${
                communityHulls
                  ? 'text-blue-300 bg-blue-950/40'
                  : 'text-slate-500 hover:text-slate-400'
              }`}
              title="Show community cluster hulls in 3D view (Louvain communities)"
            >
              <Hexagon size={12} className={communityHulls ? 'text-blue-400' : ''} />
              <span className="font-medium">Communities</span>
            </button>
          </div>

          {/* Fabric controls — CO_CHANGED threshold slider */}
          {visibleLayers.has('fabric') && (
            <div className="flex flex-col gap-1 rounded-lg bg-slate-900/90 backdrop-blur-sm border border-slate-700 p-2">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <GitFork size={12} className="text-orange-300" />
                <span className="font-medium">Co-Change</span>
                <span className="ml-auto text-[10px] text-slate-500">
                  min {coChangeThreshold}
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={20}
                step={1}
                value={coChangeThreshold}
                onChange={(e) => setCoChangeThreshold(Number(e.target.value))}
                className="w-full h-1 rounded-lg appearance-none cursor-pointer accent-orange-400"
                style={{
                  background: `linear-gradient(to right, #FB923C ${((coChangeThreshold - 1) / 19) * 100}%, #334155 ${((coChangeThreshold - 1) / 19) * 100}%)`,
                }}
                title={`Hide CO_CHANGED edges with fewer than ${coChangeThreshold} co-changes`}
              />
              <div className="flex justify-between text-[9px] text-slate-600">
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
