/**
 * ContextRadarViz — 5-axis radar chart for context relevance scoring.
 *
 * Pure SVG implementation (no recharts dependency). Shows 5 normalized axes
 * with filled polygon overlay.
 *
 * Data schema (from backend build_radar_viz):
 * {
 *   dimensions: [{ name: string, value: number, max: number }],
 *   overall_score?: number
 * }
 */
import { useMemo } from 'react'
import type { VizBlockProps } from './registry'

// ============================================================================
// Types
// ============================================================================

interface RadarDimension {
  name: string
  value: number
  max: number
}

// ============================================================================
// SVG Radar helpers
// ============================================================================

const RADAR_SIZE = 200
const CENTER = RADAR_SIZE / 2
const RADIUS = 75
const LEVELS = 4

function polarToCartesian(angle: number, r: number): [number, number] {
  // Start from top (- PI/2 offset)
  const a = angle - Math.PI / 2
  return [CENTER + r * Math.cos(a), CENTER + r * Math.sin(a)]
}

// ============================================================================
// Main component
// ============================================================================

export function ContextRadarViz({ data, expanded = false }: VizBlockProps) {
  const dimensions = (data.dimensions as RadarDimension[]) ?? []
  const overallScore = data.overall_score as number | undefined

  const n = dimensions.length
  const angleStep = n > 0 ? (2 * Math.PI) / n : 0

  const { gridLines, axisLines, dataPolygon, labels } = useMemo(() => {
    if (n === 0) return { gridLines: [], axisLines: [], dataPolygon: '', labels: [] }

    // Grid circles (concentric polygons)
    const gLines: string[] = []
    for (let level = 1; level <= LEVELS; level++) {
      const r = (RADIUS / LEVELS) * level
      const points = Array.from({ length: n }, (_, i) => {
        const [x, y] = polarToCartesian(i * angleStep, r)
        return `${x},${y}`
      })
      gLines.push(points.join(' '))
    }

    // Axis lines from center to outer edge
    const aLines = Array.from({ length: n }, (_, i) => {
      const [x, y] = polarToCartesian(i * angleStep, RADIUS)
      return { x1: CENTER, y1: CENTER, x2: x, y2: y }
    })

    // Data polygon
    const dataPoints = dimensions.map((dim, i) => {
      const normalized = dim.max > 0 ? Math.min(dim.value / dim.max, 1) : 0
      const [x, y] = polarToCartesian(i * angleStep, RADIUS * normalized)
      return `${x},${y}`
    })
    const poly = dataPoints.join(' ')

    // Axis labels
    const lbls = dimensions.map((dim, i) => {
      const [x, y] = polarToCartesian(i * angleStep, RADIUS + 18)
      const normalized = dim.max > 0 ? dim.value / dim.max : 0
      return { x, y, name: dim.name, value: dim.value, normalized }
    })

    return { gridLines: gLines, axisLines: aLines, dataPolygon: poly, labels: lbls }
  }, [dimensions, n, angleStep])

  if (n === 0) {
    return <div className="text-xs text-gray-600 italic px-2 py-4">No radar data available.</div>
  }

  const size = expanded ? RADAR_SIZE + 60 : RADAR_SIZE + 40

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Overall score */}
      {overallScore != null && (
        <div className="text-xs text-gray-400">
          Overall: <span className="font-mono text-indigo-400">{(overallScore * 100).toFixed(0)}%</span>
        </div>
      )}

      {/* SVG Radar */}
      <svg
        viewBox={`${-20} ${-10} ${size} ${size}`}
        className={expanded ? 'w-80 h-80' : 'w-48 h-48'}
        role="img"
        aria-label="Context relevance radar chart"
      >
        {/* Grid polygons */}
        {gridLines.map((points, i) => (
          <polygon
            key={`grid-${i}`}
            points={points}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={0.5}
          />
        ))}

        {/* Axis lines */}
        {axisLines.map((line, i) => (
          <line
            key={`axis-${i}`}
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={0.5}
          />
        ))}

        {/* Data polygon */}
        <polygon
          points={dataPolygon}
          fill="rgba(99, 102, 241, 0.15)"
          stroke="rgba(99, 102, 241, 0.6)"
          strokeWidth={1.5}
        />

        {/* Data points */}
        {dimensions.map((dim, i) => {
          const normalized = dim.max > 0 ? Math.min(dim.value / dim.max, 1) : 0
          const [x, y] = polarToCartesian(i * angleStep, RADIUS * normalized)
          return (
            <circle
              key={`point-${i}`}
              cx={x}
              cy={y}
              r={3}
              fill="rgba(99, 102, 241, 0.8)"
              stroke="rgba(99, 102, 241, 1)"
              strokeWidth={1}
            />
          )
        })}

        {/* Labels */}
        {labels.map((lbl, i) => (
          <text
            key={`label-${i}`}
            x={lbl.x}
            y={lbl.y}
            textAnchor="middle"
            dominantBaseline="middle"
            className="text-[8px] fill-gray-400"
          >
            {lbl.name}
          </text>
        ))}
      </svg>

      {/* Legend values */}
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
