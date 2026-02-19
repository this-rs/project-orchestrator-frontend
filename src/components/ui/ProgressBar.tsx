import { useEffect, useState } from 'react'
import { useReducedMotion } from '@/utils/motion'

interface ProgressBarProps {
  value: number
  max?: number
  showLabel?: boolean
  size?: 'sm' | 'md' | 'lg'
  /** Enable shimmer animation (e.g. for in-progress tasks) */
  shimmer?: boolean
  /** Use dynamic gradient coloring (red→yellow→green). Default: false (indigo) */
  gradient?: boolean
  className?: string
}

const sizeStyles = {
  sm: 'h-1',
  md: 'h-2',
  lg: 'h-3',
}

/**
 * Interpolate a color between red → yellow → green based on percentage (0–100).
 * Returns an HSL string for smooth color transitions.
 */
function percentageToHsl(pct: number): string {
  // Hue: 0 (red) → 45 (yellow-orange) → 130 (green)
  const hue = pct <= 50
    ? (pct / 50) * 45          // 0→45
    : 45 + ((pct - 50) / 50) * 85 // 45→130
  const sat = pct <= 50 ? 85 : 70 + (pct / 100) * 15
  const lit = 50 + (pct / 100) * 8
  return `hsl(${hue}, ${sat}%, ${lit}%)`
}

export function ProgressBar({
  value,
  max = 100,
  showLabel = false,
  size = 'md',
  shimmer = false,
  gradient = false,
  className = '',
}: ProgressBarProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100))
  const reducedMotion = useReducedMotion()

  // Mount animation: start at 0 width, transition to target
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    if (reducedMotion) {
      setMounted(true)
      return
    }
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [reducedMotion])

  const displayWidth = mounted ? percentage : 0
  const color = gradient ? percentageToHsl(percentage) : undefined
  const glowColor = gradient ? percentageToHsl(percentage) : 'rgb(99 102 241)' // indigo-500

  return (
    <div className={className}>
      {showLabel && (
        <div className="flex justify-between text-sm text-gray-400 mb-1">
          <span>Progress</span>
          <span>{percentage.toFixed(0)}%</span>
        </div>
      )}
      <div className={`w-full bg-white/[0.08] rounded-full overflow-hidden ${sizeStyles[size]}`}>
        <div
          className={`h-full rounded-full ${!gradient ? 'bg-indigo-500' : ''} ${shimmer && !reducedMotion && percentage < 100 ? 'progress-shimmer' : ''}`}
          style={{
            width: `${displayWidth}%`,
            transition: reducedMotion ? 'none' : 'width 800ms ease-out, background-color 400ms ease, box-shadow 400ms ease',
            ...(gradient ? { backgroundColor: color } : {}),
            ...(size !== 'sm' ? { boxShadow: `0 0 ${size === 'lg' ? 8 : 6}px ${glowColor}40` } : {}),
          }}
        />
      </div>
    </div>
  )
}
