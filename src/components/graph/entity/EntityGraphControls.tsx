import { Minus, Plus, RotateCcw } from 'lucide-react'
import {
  NEIGHBORHOOD_LAYERS,
  type NeighborhoodDepth,
  type NeighborhoodLayer,
} from '@/services/neighborhood'
import { LAYER_META } from './entityVisuals'

export interface EntityGraphControlsProps {
  depth: NeighborhoodDepth
  onDepthChange: (d: NeighborhoodDepth) => void
  /** Live slider value 0..1 (the request itself is debounced by the parent). */
  relief: number
  onReliefChange: (v: number) => void
  layers: ReadonlySet<NeighborhoodLayer>
  onToggleLayer: (l: NeighborhoodLayer) => void
  layerCounts: Partial<Record<NeighborhoodLayer, number>>
  onReset: () => void
  onZoom: (factor: number) => void
}

const DEPTHS: NeighborhoodDepth[] = [1, 2, 3]

const chip =
  'inline-flex items-center gap-1 h-8 min-w-8 px-2.5 rounded-md text-xs font-medium transition-colors select-none'

/**
 * Always-visible, touch-sized controls (≥ 32 px targets, nothing hover-only).
 */
export function EntityGraphControls({
  depth,
  onDepthChange,
  relief,
  onReliefChange,
  layers,
  onToggleLayer,
  layerCounts,
  onReset,
  onZoom,
}: EntityGraphControlsProps) {
  return (
    <div className="flex flex-col gap-2 text-xs text-gray-300">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {/* Depth — segmented control */}
        <div className="flex items-center gap-2">
          <span id="eg-depth-label" className="text-gray-500">
            Depth
          </span>
          <div
            role="group"
            aria-labelledby="eg-depth-label"
            className="inline-flex rounded-lg bg-white/[0.04] p-0.5 border border-white/[0.06]"
          >
            {DEPTHS.map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={depth === d}
                aria-label={`Depth ${d}`}
                onClick={() => onDepthChange(d)}
                className={`${chip} justify-center ${
                  depth === d
                    ? 'bg-indigo-500/25 text-indigo-200'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        {/* Relief — maps to min_weight */}
        <label className="flex items-center gap-2 flex-1 min-w-[180px]">
          <span className="text-gray-500">Relief</span>
          <input
            type="range"
            min={0}
            max={0.9}
            step={0.05}
            value={relief}
            onChange={(e) => onReliefChange(Number(e.target.value))}
            aria-label="Relief"
            aria-valuetext={`${Math.round(relief * 100)} %`}
            className="flex-1 h-8 accent-indigo-400 cursor-pointer"
          />
          <span className="w-9 text-right tabular-nums text-gray-400">
            {Math.round(relief * 100)}%
          </span>
        </label>

        <div className="flex items-center gap-1 ml-auto">
          <button
            type="button"
            onClick={() => onZoom(1 / 1.3)}
            aria-label="Zoom out"
            className={`${chip} justify-center text-gray-400 hover:text-gray-200 bg-white/[0.04]`}
          >
            <Minus size={14} />
          </button>
          <button
            type="button"
            onClick={() => onZoom(1.3)}
            aria-label="Zoom in"
            className={`${chip} justify-center text-gray-400 hover:text-gray-200 bg-white/[0.04]`}
          >
            <Plus size={14} />
          </button>
          <button
            type="button"
            onClick={onReset}
            aria-label="Reset view"
            className={`${chip} text-gray-400 hover:text-gray-200 bg-white/[0.04]`}
          >
            <RotateCcw size={13} />
            <span className="hidden sm:inline">Reset</span>
          </button>
        </div>
      </div>

      {/* Layers */}
      <div role="group" aria-label="Layers" className="flex flex-wrap gap-1.5">
        {NEIGHBORHOOD_LAYERS.map((l) => {
          const meta = LAYER_META[l]
          const on = layers.has(l)
          const count = layerCounts[l]
          return (
            <button
              key={l}
              type="button"
              aria-pressed={on}
              onClick={() => onToggleLayer(l)}
              title={meta.description}
              className={`${chip} border ${
                on
                  ? 'border-white/10 bg-white/[0.06] text-gray-200'
                  : 'border-transparent text-gray-500 line-through'
              }`}
            >
              <span
                aria-hidden
                className="inline-block w-2 h-2 rounded-full"
                style={{ backgroundColor: meta.color, opacity: on ? 1 : 0.35 }}
              />
              {meta.label}
              {count !== undefined && <span className="tabular-nums text-gray-500">{count}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
