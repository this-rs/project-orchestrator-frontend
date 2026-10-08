/**
 * GanttTimeline — Horizontal Gantt-style timeline for protocol runs.
 *
 * Renders each run as a horizontal bar positioned relative to the overall
 * time window. Bars are color-coded by status. Hovering a bar shows a tooltip
 * with protocol name, duration, status, and state history.
 *
 * Features:
 *   - X axis = time, auto-scaled from run durations
 *   - Bars colored by status (pending/running/completed/failed/cancelled)
 *   - Rich tooltip on hover with state history entries
 *   - Optional click handler per run
 */

import { useMemo, useState, useRef, useEffect } from 'react'
import type { RunStatus } from './RunStatusBadge'
import { formatRunDuration } from './RunTreeView'

// ============================================================================
// TYPES
// ============================================================================

export interface GanttStateEntry {
  state_name: string
  entered_at: string
  exited_at?: string | null
  duration_ms?: number
}

export interface GanttRun {
  id: string
  protocol_name: string
  status: RunStatus
  started_at: string
  finished_at?: string | null
  /** Depth in the tree (0 = root). Used for row ordering. */
  depth?: number
  /** State history for tooltip display */
  state_history?: GanttStateEntry[]
}

interface GanttTimelineProps {
  runs: GanttRun[]
  /** Reference start time. If not given, uses the earliest run start. */
  parentStartTime?: Date
  /** Callback when a bar is clicked */
  onRunClick?: (runId: string) => void
  /** Additional CSS class */
  className?: string
}

// ============================================================================
// HELPERS
// ============================================================================

const statusBarColor: Record<RunStatus, string> = {
  pending:   'bg-gray-500/40',
  running:   'bg-cyan-500/70',
  completed: 'bg-green-500/60',
  failed:    'bg-red-500/60',
  cancelled: 'bg-gray-500/30',
}

const statusBarBorder: Record<RunStatus, string> = {
  pending:   'border-gray-500/30',
  running:   'border-cyan-400/50',
  completed: 'border-green-400/40',
  failed:    'border-red-400/40',
  cancelled: 'border-gray-600/30',
}

/** Row height in px */
const ROW_HEIGHT = 28
/** Vertical gap between rows */
const ROW_GAP = 4
/** Minimum bar width in percent to remain clickable */
const MIN_BAR_WIDTH_PCT = 1.5

function formatDurationMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const secs = Math.floor(ms / 1000)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  const remSecs = secs % 60
  return `${mins}m ${remSecs}s`
}

// ============================================================================
// TOOLTIP
// ============================================================================

interface TooltipData {
  run: GanttRun & { _start: number; _end: number }
  x: number
  y: number
}

function GanttTooltip({ data }: { data: TooltipData }) {
  const { run } = data

  return (
    <div
      className="fixed z-50 pointer-events-none max-w-[280px] bg-gray-900/95 border border-white/10 rounded-lg shadow-xl p-3 space-y-2"
      style={{ left: `${data.x + 12}px`, top: `${data.y - 8}px` }}
    >
      {/* Header */}
      <div className="space-y-1">
        <div className="text-xs font-medium text-gray-100">{run.protocol_name}</div>
        <div className="flex items-center gap-2 text-[10px] text-gray-500">
          <span className="font-mono tabular-nums">
            {formatRunDuration(run.started_at, run.finished_at)}
          </span>
          <span className="text-gray-600">|</span>
          <span className="capitalize">{run.status}</span>
        </div>
      </div>

      {/* State history */}
      {run.state_history && run.state_history.length > 0 && (
        <div className="space-y-1 border-t border-white/[0.06] pt-2">
          <div className="text-[10px] font-medium text-gray-500">
            State History
          </div>
          <div className="space-y-0.5 max-h-[120px] overflow-y-auto scrollbar-thin">
            {run.state_history.map((entry, i) => (
              <div key={i} className="flex items-center justify-between gap-3 text-[10px]">
                <span className="text-gray-400 truncate">{entry.state_name}</span>
                <span className="text-gray-600 font-mono tabular-nums shrink-0">
                  {entry.duration_ms != null
                    ? formatDurationMs(entry.duration_ms)
                    : entry.exited_at
                      ? formatDurationMs(
                          new Date(entry.exited_at).getTime() - new Date(entry.entered_at).getTime(),
                        )
                      : 'active'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// COMPONENT
// ============================================================================

export function GanttTimeline({ runs, parentStartTime, onRunClick, className = '' }: GanttTimelineProps) {
  const [tooltip, setTooltip] = useState<TooltipData | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Clear tooltip on scroll
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const clear = () => setTooltip(null)
    el.addEventListener('scroll', clear, { passive: true })
    return () => el.removeEventListener('scroll', clear)
  }, [])

  // Compute time window boundaries
  const { windowStart, windowEnd, sortedRuns } = useMemo(() => {
    if (runs.length === 0) return { windowStart: 0, windowEnd: 1, sortedRuns: [] }

    const now = Date.now()
    let minT = parentStartTime ? parentStartTime.getTime() : Infinity
    let maxT = -Infinity

    const withTimestamps = runs.map((run) => {
      const start = new Date(run.started_at).getTime()
      const end = run.finished_at ? new Date(run.finished_at).getTime() : now
      if (!parentStartTime && start < minT) minT = start
      if (end > maxT) maxT = end
      return { ...run, _start: start, _end: end }
    })

    // Sort by start time, then by depth
    withTimestamps.sort((a, b) => {
      const depthDiff = (a.depth ?? 0) - (b.depth ?? 0)
      return depthDiff !== 0 ? depthDiff : a._start - b._start
    })

    // Add a small buffer (2% each side) so bars don't touch edges
    const range = maxT - minT || 1000
    const buffer = range * 0.02

    return {
      windowStart: minT - buffer,
      windowEnd: maxT + buffer,
      sortedRuns: withTimestamps,
    }
  }, [runs, parentStartTime])

  if (sortedRuns.length === 0) {
    return (
      <div className={`text-xs text-gray-600 italic p-3 ${className}`}>
        No runs to display
      </div>
    )
  }

  const totalRange = windowEnd - windowStart

  // Time axis labels
  const startLabel = new Date(windowStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const endLabel = new Date(windowEnd).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  const totalHeight = sortedRuns.length * (ROW_HEIGHT + ROW_GAP)

  return (
    <div className={`${className}`} ref={containerRef}>
      {/* Time axis header */}
      <div className="flex items-center justify-between px-1 mb-1 text-[10px] text-gray-600 font-mono tabular-nums">
        <span>{startLabel}</span>
        <span>{endLabel}</span>
      </div>

      {/* Chart area */}
      <div
        className="relative bg-white/[0.02] rounded-lg border border-border-subtle overflow-hidden"
        style={{ height: `${totalHeight + 8}px` }}
      >
        {/* Vertical gridlines at 25%, 50%, 75% */}
        {[0.25, 0.5, 0.75].map((pct) => (
          <div
            key={pct}
            className="absolute top-0 bottom-0 w-px bg-white/[0.04]"
            style={{ left: `${pct * 100}%` }}
          />
        ))}

        {/* Run bars */}
        {sortedRuns.map((run, idx) => {
          const leftPct = ((run._start - windowStart) / totalRange) * 100
          const widthPct = Math.max(
            MIN_BAR_WIDTH_PCT,
            ((run._end - run._start) / totalRange) * 100,
          )
          const top = idx * (ROW_HEIGHT + ROW_GAP) + 4
          const isHovered = tooltip?.run.id === run.id

          return (
            <div
              key={run.id}
              className={`
                absolute flex items-center px-1.5 rounded border text-[10px] font-medium truncate
                transition-[filter,box-shadow] duration-(--duration-instant) cursor-pointer
                ${statusBarColor[run.status]} ${statusBarBorder[run.status]}
                ${isHovered ? 'brightness-125 shadow-lg z-10' : 'z-0'}
                ${run.status === 'running' ? 'animate-pulse' : ''}
              `}
              style={{
                left: `${leftPct}%`,
                width: `${widthPct}%`,
                top: `${top}px`,
                height: `${ROW_HEIGHT}px`,
              }}
              onClick={() => onRunClick?.(run.id)}
              onMouseEnter={(e) => {
                setTooltip({ run, x: e.clientX, y: e.clientY })
              }}
              onMouseMove={(e) => {
                setTooltip((prev) => prev?.run.id === run.id ? { ...prev, x: e.clientX, y: e.clientY } : prev)
              }}
              onMouseLeave={() => setTooltip(null)}
            >
              <span className="truncate text-gray-200">
                {run.protocol_name}
              </span>
            </div>
          )
        })}
      </div>

      {/* Tooltip portal */}
      {tooltip && <GanttTooltip data={tooltip} />}
    </div>
  )
}
