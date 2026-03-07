/**
 * RadarChart — Shared SVG radar chart component.
 *
 * Extracted from ContextRadarViz.tsx for reuse across intelligence views.
 * Pure SVG implementation (no recharts dependency).
 *
 * @example
 * ```tsx
 * <RadarChart
 *   axes={[
 *     { name: 'Phase', value: 0.8 },
 *     { name: 'Structure', value: 0.6 },
 *     { name: 'Domain', value: 0.9 },
 *   ]}
 *   size="md"
 *   color="#6366f1"
 * />
 * ```
 */
import { useMemo } from 'react'

// ============================================================================
// Types
// ============================================================================

export interface RadarAxis {
  /** Axis label */
  name: string
  /** Value in [0, 1] — normalized */
  value: number
}

export type RadarSize = 'sm' | 'md' | 'lg'

export interface RadarChartProps {
  /** Axes with normalized values (0-1) */
  axes: RadarAxis[]
  /** Chart size preset */
  size?: RadarSize
  /** Primary color for data polygon and points (CSS color) */
  color?: string
  /** Whether to show value labels on hover or always */
  showLabels?: boolean
  /** Grid line color (CSS rgba) */
  gridColor?: string
  /** Whether to show the overall score badge */
  overallScore?: number
  /** CSS class for the container */
  className?: string
}

// ============================================================================
// Size presets
// ============================================================================

const SIZE_CONFIG: Record<RadarSize, { svgSize: number; radius: number; cssClass: string; fontSize: number }> = {
  sm: { svgSize: 160, radius: 55, cssClass: 'w-32 h-32', fontSize: 7 },
  md: { svgSize: 200, radius: 75, cssClass: 'w-48 h-48', fontSize: 8 },
  lg: { svgSize: 260, radius: 100, cssClass: 'w-80 h-80', fontSize: 9 },
}

const LEVELS = 4

// ============================================================================
// SVG helpers
// ============================================================================

function polarToCartesian(center: number, angle: number, r: number): [number, number] {
  // Start from top (- PI/2 offset)
  const a = angle - Math.PI / 2
  return [center + r * Math.cos(a), center + r * Math.sin(a)]
}

// ============================================================================
// Main component
// ============================================================================

export function RadarChart({
  axes,
  size = 'md',
  color = '#6366f1',
  showLabels = true,
  gridColor = 'rgba(255,255,255,0.06)',
  overallScore,
  className,
}: RadarChartProps) {
  const config = SIZE_CONFIG[size]
  const { svgSize, radius, fontSize } = config
  const center = svgSize / 2

  const n = axes.length
  const angleStep = n > 0 ? (2 * Math.PI) / n : 0

  const { gridLines, axisLines, dataPolygon, labels, dataPoints } = useMemo(() => {
    if (n === 0) return { gridLines: [], axisLines: [], dataPolygon: '', labels: [], dataPoints: [] }

    // Grid circles (concentric polygons)
    const gLines: string[] = []
    for (let level = 1; level <= LEVELS; level++) {
      const r = (radius / LEVELS) * level
      const points = Array.from({ length: n }, (_, i) => {
        const [x, y] = polarToCartesian(center, i * angleStep, r)
        return `${x},${y}`
      })
      gLines.push(points.join(' '))
    }

    // Axis lines from center to outer edge
    const aLines = Array.from({ length: n }, (_, i) => {
      const [x, y] = polarToCartesian(center, i * angleStep, radius)
      return { x1: center, y1: center, x2: x, y2: y }
    })

    // Data polygon
    const dPoints = axes.map((axis, i) => {
      const clamped = Math.min(Math.max(axis.value, 0), 1)
      const [x, y] = polarToCartesian(center, i * angleStep, radius * clamped)
      return { x, y, value: clamped }
    })
    const poly = dPoints.map(p => `${p.x},${p.y}`).join(' ')

    // Axis labels
    const lbls = axes.map((axis, i) => {
      const [x, y] = polarToCartesian(center, i * angleStep, radius + 16)
      return { x, y, name: axis.name, value: axis.value }
    })

    return { gridLines: gLines, axisLines: aLines, dataPolygon: poly, labels: lbls, dataPoints: dPoints }
  }, [axes, n, angleStep, center, radius])

  if (n === 0) {
    return <div className="text-xs text-gray-600 italic px-2 py-4">No radar data available.</div>
  }

  // Color with alpha for fill
  const fillColor = color.startsWith('#')
    ? `${color}26` // ~15% opacity
    : color.replace(/[\d.]+\)$/, '0.15)')
  const strokeColor = color.startsWith('#')
    ? `${color}99` // ~60% opacity
    : color.replace(/[\d.]+\)$/, '0.6)')
  const pointColor = color.startsWith('#')
    ? `${color}cc` // ~80% opacity
    : color.replace(/[\d.]+\)$/, '0.8)')

  const viewBoxPad = 20
  const viewBox = `${-viewBoxPad} ${-10} ${svgSize + viewBoxPad * 2} ${svgSize + viewBoxPad}`

  return (
    <div className={`flex flex-col items-center gap-1 ${className ?? ''}`}>
      {/* Overall score badge */}
      {overallScore != null && (
        <div className="text-xs text-gray-400">
          Score: <span className="font-mono" style={{ color }}>{(overallScore * 100).toFixed(0)}%</span>
        </div>
      )}

      {/* SVG Radar */}
      <svg
        viewBox={viewBox}
        className={config.cssClass}
        role="img"
        aria-label="Radar chart"
      >
        {/* Grid polygons */}
        {gridLines.map((points, i) => (
          <polygon
            key={`grid-${i}`}
            points={points}
            fill="none"
            stroke={gridColor}
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
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth={1.5}
        />

        {/* Data points */}
        {dataPoints.map((point, i) => (
          <circle
            key={`point-${i}`}
            cx={point.x}
            cy={point.y}
            r={size === 'sm' ? 2 : 3}
            fill={pointColor}
            stroke={color}
            strokeWidth={1}
          />
        ))}

        {/* Labels */}
        {showLabels && labels.map((lbl, i) => (
          <text
            key={`label-${i}`}
            x={lbl.x}
            y={lbl.y}
            textAnchor="middle"
            dominantBaseline="middle"
            className={`fill-gray-400`}
            style={{ fontSize: `${fontSize}px` }}
          >
            {lbl.name}
          </text>
        ))}
      </svg>
    </div>
  )
}
