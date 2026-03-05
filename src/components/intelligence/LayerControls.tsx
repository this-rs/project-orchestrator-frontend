import { memo } from 'react'
import { useAtom } from 'jotai'
import type { IntelligenceLayer, VisibilityMode } from '@/types/intelligence'
import { LAYERS, LAYER_ORDER, VISIBILITY_PRESETS } from '@/constants/intelligence'
import { energyHeatmapAtom } from '@/atoms/intelligence'
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
} from 'lucide-react'

const presetIcons: Record<string, typeof Layers> = {
  Code2,
  BookOpen,
  Brain,
  KanbanSquare,
  Zap,
  Layers,
}

interface LayerControlsProps {
  visibleLayers: Set<IntelligenceLayer>
  onToggleLayer: (layer: IntelligenceLayer) => void
  onApplyPreset: (preset: VisibilityMode) => void
}

function LayerControlsComponent({
  visibleLayers,
  onToggleLayer,
  onApplyPreset,
}: LayerControlsProps) {
  const [heatmapEnabled, setHeatmapEnabled] = useAtom(energyHeatmapAtom)

  return (
    <div className="absolute top-3 left-3 z-10 flex flex-col gap-2">
      {/* Presets */}
      <div className="flex gap-1 rounded-lg bg-slate-900/90 backdrop-blur-sm border border-slate-700 p-1">
        {VISIBILITY_PRESETS.map((preset) => {
          const Icon = presetIcons[preset.icon] ?? Layers
          return (
            <button
              key={preset.id}
              onClick={() => onApplyPreset(preset.id)}
              className="flex items-center gap-1 rounded-md px-2 py-1.5 text-[10px] font-medium text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
              title={preset.description}
            >
              <Icon size={12} />
              {preset.label}
            </button>
          )
        })}
      </div>

      {/* Layer toggles */}
      <div className="flex flex-col gap-0.5 rounded-lg bg-slate-900/90 backdrop-blur-sm border border-slate-700 p-1.5">
        {LAYER_ORDER.map((layerId) => {
          const layer = LAYERS[layerId]
          const visible = visibleLayers.has(layerId)
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
              <span className="text-[10px] text-slate-500 ml-auto">z{layer.zIndex}</span>
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
      </div>
    </div>
  )
}

export const LayerControls = memo(LayerControlsComponent)
