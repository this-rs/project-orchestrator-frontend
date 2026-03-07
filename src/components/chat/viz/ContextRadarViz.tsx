/**
 * ContextRadarViz — 5-axis radar chart for context relevance scoring.
 *
 * Delegates rendering to the shared RadarChart component.
 *
 * Data schema (from backend build_radar_viz):
 * {
 *   dimensions: [{ name: string, value: number, max: number }],
 *   overall_score?: number
 * }
 */
import type { VizBlockProps } from './registry'
import { RadarChart } from '@/components/ui/RadarChart'
import type { RadarAxis } from '@/components/ui/RadarChart'

// ============================================================================
// Types
// ============================================================================

interface RadarDimension {
  name: string
  value: number
  max: number
}

// ============================================================================
// Main component
// ============================================================================

export function ContextRadarViz({ data, expanded = false }: VizBlockProps) {
  const dimensions = (data.dimensions as RadarDimension[]) ?? []
  const overallScore = data.overall_score as number | undefined

  if (dimensions.length === 0) {
    return <div className="text-xs text-gray-600 italic px-2 py-4">No radar data available.</div>
  }

  // Normalize dimensions to [0, 1] axes
  const axes: RadarAxis[] = dimensions.map((dim) => ({
    name: dim.name,
    value: dim.max > 0 ? Math.min(dim.value / dim.max, 1) : 0,
  }))

  return (
    <div className="flex flex-col items-center gap-2">
      <RadarChart
        axes={axes}
        size={expanded ? 'lg' : 'md'}
        overallScore={overallScore}
      />

      {/* Legend values (expanded mode) */}
      {expanded && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-gray-500 justify-center">
          {dimensions.map((dim, i) => (
            <div key={i} className="flex items-center gap-1">
              <span className="text-gray-400">{dim.name}:</span>
              <span className="font-mono text-indigo-400">{dim.value.toFixed(1)}</span>
              <span className="text-gray-600">/ {dim.max}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
