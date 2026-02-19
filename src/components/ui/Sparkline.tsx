import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from '@/utils/motion'

interface SparklineProps {
  /** Array of numeric data points (min 2) */
  data: number[]
  /** Stroke color (CSS color or Tailwind-compatible) */
  color?: string
  /** SVG width */
  width?: number
  /** SVG height */
  height?: number
  /** Stroke width in SVG units */
  strokeWidth?: number
  /** Whether to show an area fill under the line */
  fill?: boolean
  /** Fill opacity (0-1) */
  fillOpacity?: number
  /** Animation duration in ms (0 to disable) */
  animationDuration?: number
  /** Additional CSS class */
  className?: string
}

/**
 * Lightweight sparkline chart using inline SVG.
 * Draws a polyline from normalized data points with an optional
 * stroke-dashoffset "draw" animation on mount.
 *
 * @example
 * <Sparkline data={[3, 7, 4, 8, 2, 6, 9]} color="#818cf8" />
 * <Sparkline data={[10, 8, 6, 3, 1]} color="#f87171" fill />
 */
export function Sparkline({
  data,
  color = '#818cf8',
  width = 80,
  height = 28,
  strokeWidth = 1.5,
  fill = false,
  fillOpacity = 0.15,
  animationDuration = 1000,
  className = '',
}: SparklineProps) {
  const polylineRef = useRef<SVGPolylineElement>(null)
  const [drawn, setDrawn] = useState(false)
  const reducedMotion = useReducedMotion()

  // Normalize data to SVG coordinates
  const padding = strokeWidth
  const points = normalizePoints(data, width, height, padding)
  const pointsStr = points.map((p) => `${p[0]},${p[1]}`).join(' ')

  // Area fill path (line + close to bottom-right → bottom-left)
  const fillPoints = fill
    ? `${pointsStr} ${width - padding},${height - padding} ${padding},${height - padding}`
    : ''

  // Animate stroke-dashoffset on mount
  useEffect(() => {
    const el = polylineRef.current
    if (!el || reducedMotion || animationDuration <= 0) {
      setDrawn(true)
      return
    }

    const totalLength = el.getTotalLength()
    el.style.strokeDasharray = `${totalLength}`
    el.style.strokeDashoffset = `${totalLength}`

    // Force reflow then animate
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    el.getBoundingClientRect()
    el.style.transition = `stroke-dashoffset ${animationDuration}ms ease-out`
    el.style.strokeDashoffset = '0'

    const timer = setTimeout(() => setDrawn(true), animationDuration)
    return () => clearTimeout(timer)
  }, [animationDuration, reducedMotion])

  if (data.length < 2) return null

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      {/* Area fill */}
      {fill && (
        <polygon
          points={fillPoints}
          fill={color}
          opacity={drawn || reducedMotion ? fillOpacity : 0}
          style={
            !reducedMotion && animationDuration > 0
              ? { transition: `opacity ${animationDuration * 0.5}ms ease-out ${animationDuration * 0.3}ms` }
              : undefined
          }
        />
      )}
      {/* Line */}
      <polyline
        ref={polylineRef}
        points={pointsStr}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Normalize data array to SVG coordinate pairs */
function normalizePoints(
  data: number[],
  width: number,
  height: number,
  padding: number,
): [number, number][] {
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1

  const usableW = width - padding * 2
  const usableH = height - padding * 2

  return data.map((val, i) => {
    const x = padding + (i / (data.length - 1)) * usableW
    const y = padding + (1 - (val - min) / range) * usableH
    return [x, y]
  })
}
