import { Minus, Plus, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui'
import { glassFlat, iconButton, segmentItem, segmented } from '@/components/ui/classes'
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

/** One item of a segmented control (`.seg-item`): 36px tap target on phones, 32px on desktop. */
const segItem = `${segmentItem} h-9 md:h-8 px-3 text-xs font-medium whitespace-nowrap`

/**
 * Always-visible, touch-sized controls (≥ 36 px targets, nothing hover-only).
 * Material: the segmented glass control of DESIGN.md (depth, layers), glass icon
 * buttons (zoom), flat because they sit over a canvas that may hold many of them.
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
          <div role="group" aria-labelledby="eg-depth-label" className={segmented}>
            {DEPTHS.map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={depth === d}
                aria-label={`Depth ${d}`}
                onClick={() => onDepthChange(d)}
                className={`${segItem} min-w-9 md:min-w-8`}
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
            className="flex-1 h-9 accent-indigo-400 cursor-pointer"
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
            className={`${iconButton('ghost', 'size-9 md:size-8')} ${glassFlat}`}
          >
            <Minus size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => onZoom(1.3)}
            aria-label="Zoom in"
            className={`${iconButton('ghost', 'size-9 md:size-8')} ${glassFlat}`}
          >
            <Plus size={14} aria-hidden="true" />
          </button>
          <Button type="button" variant="ghost" size="sm" flat onClick={onReset} aria-label="Reset view">
            <RotateCcw size={13} aria-hidden="true" />
            <span className="hidden sm:inline">Reset</span>
          </Button>
        </div>
      </div>

      {/* Layers — multi-select: each item carries its own pressed state */}
      <div role="group" aria-label="Layers" className={`${segmented} flex-wrap`}>
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
              className={`${segItem} gap-1.5`}
            >
              <span
                aria-hidden
                className="inline-block w-2 h-2 rounded-full"
                style={{ backgroundColor: meta.color, opacity: on ? 1 : 0.35 }}
              />
              {meta.label}
              {count !== undefined && <span className={`tabular-nums font-normal ${on ? 'text-indigo-100/80' : 'text-gray-500'}`}>{count}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
