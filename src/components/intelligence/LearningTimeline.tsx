// ============================================================================
// LEARNING TIMELINE — Temporal view of project intelligence evolution
// ============================================================================
//
// Aggregates timestamped events from notes, decisions, commits, and skills
// into a unified interactive timeline with:
// - Event markers colored by type on a horizontal time axis
// - Date range slider to filter the visible window
// - Sparkline evolution charts (cumulative notes, avg energy, etc.)
// - Activity heatmap (day × hour grid, like GitHub contributions)
//
// T5.3 Steps 1+2: Timeline + Sparklines
// ============================================================================

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  RefreshCw,
  Loader2,
  StickyNote,
  Scale,
  Sparkles,
  Calendar,
  Activity,
  TrendingUp,
  Play,
  Pause,
  RotateCcw,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { ErrorState } from '@/components/ui/ErrorState'
import { notesApi } from '@/services/notes'
import { decisionsApi } from '@/services/decisions'
import { skillsApi } from '@/services/skills'
import { projectsApi } from '@/services/projects'
import { useWorkspaceSlug } from '@/hooks'
import { workspacePath } from '@/utils/paths'
import type { Note, Skill, DecisionTimelineEntry } from '@/types'

// ============================================================================
// TYPES
// ============================================================================

type TimelineEventType = 'note_created' | 'note_confirmed' | 'decision' | 'commit' | 'skill_created' | 'skill_activated'

interface TimelineEvent {
  id: string
  type: TimelineEventType
  date: Date
  label: string
  detail?: string
  /** Full content for expanded preview (decisions, notes) */
  fullContent?: string
}

const EVENT_COLORS: Record<TimelineEventType, string> = {
  note_created: '#3B82F6',      // blue
  note_confirmed: '#4ade80',    // green
  decision: '#8B5CF6',          // violet
  commit: '#64748B',            // slate
  skill_created: '#EC4899',     // pink
  skill_activated: '#fbbf24',   // amber
}

const EVENT_ICONS: Record<TimelineEventType, string> = {
  note_created: '📝',
  note_confirmed: '✅',
  decision: '⚖️',
  commit: '📦',
  skill_created: '✨',
  skill_activated: '⚡',
}

// ============================================================================
// SPARKLINE — tiny SVG line chart
// ============================================================================

function Sparkline({
  data,
  color,
  label,
  currentValue,
  width = 200,
  height = 40,
}: {
  data: number[]
  color: string
  label: string
  currentValue: string
  width?: number
  height?: number
}) {
  if (data.length < 2) return null

  const max = Math.max(...data, 1)
  const min = Math.min(...data, 0)
  const range = max - min || 1
  const step = width / (data.length - 1)

  const points = data
    .map((v, i) => `${i * step},${height - ((v - min) / range) * (height - 4) - 2}`)
    .join(' ')

  // Fill area
  const areaPoints = `0,${height} ${points} ${width},${height}`

  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-slate-500">{label}</span>
          <span className="text-[11px] font-bold tabular-nums" style={{ color }}>
            {currentValue}
          </span>
        </div>
        <svg width={width} height={height} className="w-full" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
          {/* Gradient fill */}
          <defs>
            <linearGradient id={`grad-${label.replace(/\s/g, '')}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.3" />
              <stop offset="100%" stopColor={color} stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <polygon
            points={areaPoints}
            fill={`url(#grad-${label.replace(/\s/g, '')})`}
          />
          <polyline
            points={points}
            fill="none"
            stroke={color}
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
      </div>
    </div>
  )
}

// ============================================================================
// ACTIVITY HEATMAP — day × hour grid (GitHub-style)
// ============================================================================

interface HeatmapTooltipData {
  day: string
  hour: number
  count: number
  events: TimelineEvent[]
  rect: DOMRect
}

function ActivityHeatmap({ events, color }: { events: TimelineEvent[]; color: string }) {
  const [tooltip, setTooltip] = useState<HeatmapTooltipData | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Group by day-of-week (0=Sun) × hour (0-23)
  const grid = useMemo(() => {
    const counts: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0))
    for (const ev of events) {
      const day = ev.date.getDay()
      const hour = ev.date.getHours()
      counts[day][hour]++
    }
    return counts
  }, [events])

  // Events grouped by day×hour for tooltip detail
  const eventsByCell = useMemo(() => {
    const map = new Map<string, TimelineEvent[]>()
    for (const ev of events) {
      const key = `${ev.date.getDay()}-${ev.date.getHours()}`
      const arr = map.get(key) || []
      arr.push(ev)
      map.set(key, arr)
    }
    return map
  }, [events])

  const maxCount = useMemo(() => {
    let m = 0
    for (const row of grid) for (const v of row) if (v > m) m = v
    return m || 1
  }, [grid])

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  const handleCellEnter = useCallback(
    (e: React.MouseEvent, day: number, hour: number, count: number) => {
      if (count === 0) { setTooltip(null); return }
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const cellEvents = eventsByCell.get(`${day}-${hour}`) || []
      setTooltip({ day: days[day], hour, count, events: cellEvents, rect })
    },
    [eventsByCell, days],
  )

  // Compute tooltip position relative to container
  const tooltipStyle = useMemo(() => {
    if (!tooltip || !containerRef.current) return {}
    const containerRect = containerRef.current.getBoundingClientRect()
    const x = tooltip.rect.left - containerRect.left + tooltip.rect.width / 2
    const y = tooltip.rect.top - containerRect.top
    return {
      left: `${x}px`,
      top: `${y}px`,
      transform: 'translate(-50%, -100%)',
    }
  }, [tooltip])

  return (
    <div ref={containerRef} className="relative space-y-1">
      {/* Hour labels */}
      <div className="flex items-center gap-px ml-8">
        {Array.from({ length: 24 }, (_, h) => (
          <div key={h} className="flex-1 text-center">
            {h % 6 === 0 && (
              <span className="text-[8px] text-slate-700">{h}</span>
            )}
          </div>
        ))}
      </div>
      {/* Grid rows */}
      {grid.map((row, day) => (
        <div key={day} className="flex items-center gap-px">
          <span className="text-[8px] text-slate-600 w-7 shrink-0 text-right pr-1">{days[day]}</span>
          {row.map((count, hour) => {
            const intensity = count / maxCount
            return (
              <div
                key={hour}
                className={`flex-1 aspect-square rounded-[2px] min-w-[6px] transition-all duration-100 ${
                  count > 0 ? 'cursor-pointer hover:ring-1 hover:ring-cyan-400/40 hover:scale-125 hover:z-10' : ''
                }`}
                style={{
                  backgroundColor: count === 0
                    ? '#1e293b'
                    : `${color}${Math.round(Math.max(0.15, intensity) * 255).toString(16).padStart(2, '0')}`,
                }}
                onMouseEnter={(e) => handleCellEnter(e, day, hour, count)}
                onMouseLeave={() => setTooltip(null)}
              />
            )
          })}
        </div>
      ))}

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute z-50 pointer-events-none mb-2"
          style={tooltipStyle}
        >
          <div className="bg-slate-900/95 backdrop-blur-sm border border-slate-700/80 rounded-lg px-3 py-2 shadow-xl min-w-[180px] max-w-[260px]">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-medium text-cyan-400">
                {tooltip.day} {tooltip.hour}:00–{tooltip.hour + 1}:00
              </span>
              <span className="text-[10px] text-slate-500 font-mono">
                {tooltip.count} event{tooltip.count !== 1 ? 's' : ''}
              </span>
            </div>
            {/* List up to 4 events */}
            <div className="space-y-1">
              {tooltip.events.slice(0, 4).map((ev) => (
                <div key={ev.id} className="flex items-center gap-1.5">
                  <div
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: EVENT_COLORS[ev.type] }}
                  />
                  <span className="text-[9px] text-slate-400 truncate">{ev.label}</span>
                </div>
              ))}
              {tooltip.events.length > 4 && (
                <span className="text-[8px] text-slate-600">
                  +{tooltip.events.length - 4} more
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// TIMELINE TRACK — horizontal event markers
// ============================================================================

function TimelineTrack({
  events,
  startDate,
  endDate,
  onEventHover,
  onEventClick,
  hoveredId,
  selectedId,
  playbackPosition,
  onSeek,
  confirmationWaves,
}: {
  events: TimelineEvent[]
  startDate: Date
  endDate: Date
  onEventHover: (ev: TimelineEvent | null) => void
  onEventClick: (ev: TimelineEvent) => void
  hoveredId: string | null
  selectedId: string | null
  /** 0–1 normalized playback cursor position, null = no playback */
  playbackPosition: number | null
  /** Called when user drags (seeks) on the track — value is 0–1 normalized */
  onSeek?: (pos: number) => void
  /** Confirmation wave zones to render as background bands */
  confirmationWaves?: { start: number; end: number; count: number }[]
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const seekingRef = useRef(false)
  const range = endDate.getTime() - startDate.getTime() || 1
  const cursorTs = playbackPosition !== null
    ? startDate.getTime() + playbackPosition * range
    : null

  /** Convert a clientX coordinate to a 0–1 position on the track */
  const clientXToPos = useCallback(
    (clientX: number) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return 0
      return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    },
    [],
  )

  const handleTrackPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!onSeek) return
      // Only seek on left click, and not if clicking on an event marker
      if (e.button !== 0) return
      const target = e.target as HTMLElement
      // Don't start seek if clicking on an event marker (has cursor-pointer)
      if (target.closest('[data-event-marker]')) return

      seekingRef.current = true
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      const pos = clientXToPos(e.clientX)
      onSeek(pos)
    },
    [onSeek, clientXToPos],
  )

  const handleTrackPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!seekingRef.current || !onSeek) return
      const pos = clientXToPos(e.clientX)
      onSeek(pos)
    },
    [onSeek, clientXToPos],
  )

  const handleTrackPointerUp = useCallback(() => {
    seekingRef.current = false
  }, [])

  return (
    <div
      ref={containerRef}
      className="relative h-14 bg-slate-800/30 rounded-lg border border-slate-700/30 overflow-hidden select-none touch-none"
      style={{ cursor: onSeek ? 'crosshair' : undefined }}
      onPointerDown={handleTrackPointerDown}
      onPointerMove={handleTrackPointerMove}
      onPointerUp={handleTrackPointerUp}
    >
      {/* Time grid lines */}
      {Array.from({ length: 5 }, (_, i) => {
        const pct = (i + 1) * 20
        const date = new Date(startDate.getTime() + (range * pct) / 100)
        return (
          <div
            key={i}
            className="absolute top-0 bottom-0 border-l border-slate-800"
            style={{ left: `${pct}%` }}
          >
            <span className="absolute -bottom-4 left-0 -translate-x-1/2 text-[8px] text-slate-700 font-mono whitespace-nowrap">
              {date.toLocaleDateString('en', { month: 'short', day: 'numeric' })}
            </span>
          </div>
        )
      })}

      {/* Playback cursor line */}
      {playbackPosition !== null && (
        <div
          className="absolute top-0 bottom-0 w-px z-20 pointer-events-none"
          style={{
            left: `${playbackPosition * 100}%`,
            background: 'linear-gradient(to bottom, #22d3ee, #06b6d4)',
            boxShadow: '0 0 6px #22d3ee60, 0 0 12px #22d3ee30',
          }}
        >
          {/* Cursor head — visible drag handle */}
          <div
            className="absolute -top-1.5 -translate-x-1/2 w-3 h-3 rounded-full bg-cyan-400 pointer-events-auto cursor-grab active:cursor-grabbing"
            style={{ boxShadow: '0 0 8px #22d3ee80, 0 0 0 2px rgba(34,211,238,0.3)' }}
          />
          {/* Bottom handle */}
          <div
            className="absolute -bottom-1.5 -translate-x-1/2 w-3 h-3 rounded-full bg-cyan-400 pointer-events-auto cursor-grab active:cursor-grabbing"
            style={{ boxShadow: '0 0 8px #22d3ee80, 0 0 0 2px rgba(34,211,238,0.3)' }}
          />
        </div>
      )}

      {/* "Revealed" region tint during playback */}
      {playbackPosition !== null && (
        <div
          className="absolute top-0 bottom-0 left-0 pointer-events-none z-[1]"
          style={{
            width: `${playbackPosition * 100}%`,
            background: 'linear-gradient(to right, rgba(34,211,238,0.04), rgba(34,211,238,0.08))',
          }}
        />
      )}

      {/* Confirmation wave bands */}
      {confirmationWaves?.map((wave, i) => {
        const startTs = startDate.getTime()
        const r = endDate.getTime() - startTs || 1
        // Add padding around single-point waves so they're visible
        const pad = Math.max(r * 0.008, 3_600_000) // at least ~1h visual width
        const leftPct = Math.max(0, ((wave.start - pad - startTs) / r) * 100)
        const rightPct = Math.min(100, ((wave.end + pad - startTs) / r) * 100)
        const widthPct = rightPct - leftPct

        return (
          <div
            key={`wave-${i}`}
            className="absolute top-0 bottom-0 z-[2] pointer-events-none"
            style={{
              left: `${leftPct}%`,
              width: `${widthPct}%`,
              background: 'linear-gradient(to bottom, rgba(74,222,128,0.12), rgba(74,222,128,0.04))',
              borderLeft: '1px solid rgba(74,222,128,0.25)',
              borderRight: '1px solid rgba(74,222,128,0.25)',
            }}
          >
            {/* Wave label */}
            <div className="absolute top-0.5 left-1/2 -translate-x-1/2 flex items-center gap-0.5 whitespace-nowrap">
              <span className="text-[7px] font-medium text-emerald-400/70 uppercase tracking-wider">
                ✅ {wave.count}
              </span>
            </div>
          </div>
        )
      })}

      {/* Event markers */}
      {events.map((ev) => {
        const x = ((ev.date.getTime() - startDate.getTime()) / range) * 100
        if (x < 0 || x > 100) return null
        const color = EVENT_COLORS[ev.type]
        const isHovered = ev.id === hoveredId
        const isSelected = ev.id === selectedId
        const isHighlighted = isHovered || isSelected
        // During playback, dim events past the cursor
        const isPastCursor = cursorTs !== null && ev.date.getTime() > cursorTs
        const opacity = isPastCursor ? 0.15 : 1

        return (
          <div
            key={ev.id}
            data-event-marker
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 cursor-pointer"
            style={{
              left: `${x}%`,
              transform: `translate(-50%, -50%) scale(${isHighlighted ? 1.8 : 1})`,
              zIndex: isSelected ? 11 : isHovered ? 10 : 1,
              opacity,
              transition: 'opacity 0.3s ease, transform 0.15s ease',
            }}
            onMouseEnter={() => onEventHover(ev)}
            onMouseLeave={() => onEventHover(null)}
            onClick={(e) => { e.stopPropagation(); onEventClick(ev) }}
          >
            <div
              className="w-2.5 h-2.5 rounded-full border"
              style={{
                backgroundColor: `${color}${isHighlighted ? 'ff' : 'aa'}`,
                borderColor: isSelected ? '#22d3ee' : isHovered ? '#fff' : `${color}60`,
                boxShadow: isSelected
                  ? `0 0 8px ${color}60, 0 0 0 2px #22d3ee40`
                  : isHovered
                    ? `0 0 8px ${color}60`
                    : 'none',
              }}
            />
          </div>
        )
      })}
    </div>
  )
}

// ============================================================================
// RANGE SLIDER
// ============================================================================

function RangeSlider({
  min,
  max,
  start,
  end,
  onChange,
}: {
  min: number
  max: number
  start: number
  end: number
  onChange: (start: number, end: number) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const dragging = useRef<'start' | 'end' | null>(null)
  const range = max - min || 1
  const leftPct = ((start - min) / range) * 100
  const rightPct = ((end - min) / range) * 100

  const getValueFromX = useCallback(
    (clientX: number) => {
      const rect = trackRef.current?.getBoundingClientRect()
      if (!rect) return start
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      return min + pct * range
    },
    [min, range, start],
  )

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      const val = getValueFromX(e.clientX)
      // Determine which thumb is closer
      const distToStart = Math.abs(val - start)
      const distToEnd = Math.abs(val - end)
      dragging.current = distToStart <= distToEnd ? 'start' : 'end'
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      // Immediately update
      if (dragging.current === 'start') {
        const clamped = Math.min(val, end)
        onChange(clamped, end)
      } else {
        const clamped = Math.max(val, start)
        onChange(start, clamped)
      }
    },
    [getValueFromX, start, end, onChange],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return
      const val = getValueFromX(e.clientX)
      if (dragging.current === 'start') {
        const clamped = Math.min(val, end)
        onChange(clamped, end)
      } else {
        const clamped = Math.max(val, start)
        onChange(start, clamped)
      }
    },
    [getValueFromX, start, end, onChange],
  )

  const handlePointerUp = useCallback(() => {
    dragging.current = null
  }, [])

  return (
    <div className="px-1.5">
      <div
        ref={trackRef}
        className="relative h-6 select-none cursor-pointer touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* Background track */}
        <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-1 bg-slate-800 rounded-full" />

        {/* Active range */}
        <div
          className="absolute top-1/2 -translate-y-1/2 h-1 bg-cyan-500/50 rounded-full"
          style={{ left: `${leftPct}%`, width: `${rightPct - leftPct}%` }}
        />

        {/* Left thumb */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-cyan-400 border-2 border-slate-900 shadow-sm z-30 pointer-events-none"
          style={{ left: `${leftPct}%` }}
        />
        {/* Right thumb */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-cyan-400 border-2 border-slate-900 shadow-sm z-30 pointer-events-none"
          style={{ left: `${rightPct}%` }}
        />
      </div>
    </div>
  )
}

// ============================================================================
// EVENT TOOLTIP
// ============================================================================

function EventTooltip({ event }: { event: TimelineEvent }) {
  const color = EVENT_COLORS[event.type]
  return (
    <div className="bg-slate-900/95 backdrop-blur-sm border border-slate-700/80 rounded-lg px-3 py-2 shadow-xl max-w-[260px]">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-xs">{EVENT_ICONS[event.type]}</span>
        <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color }}>
          {event.type.replace(/_/g, ' ')}
        </span>
      </div>
      <p className="text-[11px] text-slate-300 leading-snug line-clamp-2">{event.label}</p>
      <p className="text-[9px] text-slate-600 mt-1 font-mono">
        {event.date.toLocaleString('en', {
          month: 'short', day: 'numeric', year: 'numeric',
          hour: '2-digit', minute: '2-digit',
        })}
      </p>
      {event.detail && (
        <p className="text-[9px] text-slate-500 mt-0.5">{event.detail}</p>
      )}
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface LearningTimelineProps {
  /** When true, hides back navigation header for inline embedding */
  embedded?: boolean
  /** Explicit slug — avoids useParams when embedded */
  projectSlug?: string
}

export default function LearningTimeline(props: LearningTimelineProps) {
  const params = useParams<{ projectSlug: string }>()
  const projectSlug = props.projectSlug ?? params.projectSlug
  const wsSlug = useWorkspaceSlug()
  const navigate = useNavigate()

  // Data
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  // Interaction
  const [hoveredEvent, setHoveredEvent] = useState<TimelineEvent | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null)

  // Date range
  const [dateRange, setDateRange] = useState<{ start: number; end: number }>({ start: 0, end: 0 })

  // Playback
  const [playing, setPlaying] = useState(false)
  const [playbackPos, setPlaybackPos] = useState<number | null>(null) // 0–1
  const [playbackSpeed, setPlaybackSpeed] = useState(1) // 1x, 2x, 4x
  const playbackRef = useRef<number | null>(null)
  const lastFrameRef = useRef<number>(0)

  // ── Build events from API data ──────────────────────────────────────
  const buildEvents = useCallback(
    (notes: Note[], decisionEntries: DecisionTimelineEntry[], skills: Skill[]): TimelineEvent[] => {
      const evts: TimelineEvent[] = []

      // Notes
      for (const n of notes) {
        evts.push({
          id: `note-${n.id}`,
          type: 'note_created',
          date: new Date(n.created_at),
          label: n.content.slice(0, 80),
          detail: `${n.note_type} (${n.importance})`,
        })
        if (n.last_confirmed_at) {
          const confirmedAt = new Date(n.last_confirmed_at)
          const cycleMs = confirmedAt.getTime() - new Date(n.created_at).getTime()
          const cycleLabel = cycleMs < 60_000 ? '< 1 min (auto)'
            : cycleMs < 3_600_000 ? `${Math.round(cycleMs / 60_000)} min`
            : cycleMs < 86_400_000 ? `${Math.round(cycleMs / 3_600_000)}h`
            : `${Math.round(cycleMs / 86_400_000)}d`
          evts.push({
            id: `note-confirm-${n.id}`,
            type: 'note_confirmed',
            date: confirmedAt,
            label: `Confirmed: ${n.content.slice(0, 60)}`,
            detail: `Cycle: ${cycleLabel}`,
          })
        }
      }

      // Decisions (unwrap from timeline entry)
      for (const entry of decisionEntries) {
        const d = entry.decision
        evts.push({
          id: `dec-${d.id}`,
          type: 'decision',
          date: new Date(d.decided_at),
          label: d.description.slice(0, 80),
          detail: d.chosen_option ? `Chose: ${d.chosen_option}` : undefined,
          fullContent: d.description,
        })
      }

      // Skills
      for (const s of skills) {
        evts.push({
          id: `skill-${s.id}`,
          type: 'skill_created',
          date: new Date(s.created_at),
          label: s.name,
          detail: `${s.note_count} notes, ${s.decision_count} decisions`,
        })
        if (s.last_activated) {
          evts.push({
            id: `skill-act-${s.id}`,
            type: 'skill_activated',
            date: new Date(s.last_activated),
            label: `Activated: ${s.name}`,
          })
        }
      }

      return evts.sort((a, b) => a.date.getTime() - b.date.getTime())
    },
    [],
  )

  // ── Fetch all data ──────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!projectSlug) return
    setError(null)
    try {
      const projectData = await projectsApi.get(projectSlug)
      const projectId = projectData.id

      const [notesRes, decisionsRes, skillsRes] = await Promise.allSettled([
        notesApi.getProjectNotes(projectId),
        decisionsApi.getTimeline({}),
        skillsApi.list({ project_id: projectId, limit: 200 }),
      ])

      const notes = notesRes.status === 'fulfilled' ? notesRes.value.items : []
      const decisions = decisionsRes.status === 'fulfilled' ? decisionsRes.value : []
      const skills = skillsRes.status === 'fulfilled' ? skillsRes.value.items : []

      const allEvents = buildEvents(notes, decisions, skills)
      setEvents(allEvents)

      // Initialize date range to full span
      if (allEvents.length > 0) {
        const minTs = allEvents[0].date.getTime()
        const maxTs = allEvents[allEvents.length - 1].date.getTime()
        const padding = (maxTs - minTs) * 0.02 || 86400000 // at least 1 day padding
        setDateRange({ start: minTs - padding, end: maxTs + padding })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load timeline data')
    }
  }, [projectSlug, buildEvents])

  useEffect(() => {
    setLoading(true)
    fetchData().finally(() => setLoading(false))
  }, [fetchData])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await fetchData()
    setRefreshing(false)
  }, [fetchData])

  // ── Filtered events by date range ───────────────────────────────────
  const filteredEvents = useMemo(() => {
    if (dateRange.start === 0 && dateRange.end === 0) return events
    return events.filter(
      (e) => e.date.getTime() >= dateRange.start && e.date.getTime() <= dateRange.end,
    )
  }, [events, dateRange])

  // ── Playback animation loop ─────────────────────────────────────────
  useEffect(() => {
    if (!playing) {
      if (playbackRef.current) cancelAnimationFrame(playbackRef.current)
      playbackRef.current = null
      return
    }

    // Duration: 10s at 1x → full sweep
    const durationMs = 10000 / playbackSpeed

    const animate = (now: number) => {
      if (lastFrameRef.current === 0) lastFrameRef.current = now
      const elapsed = now - lastFrameRef.current
      const delta = elapsed / durationMs

      setPlaybackPos((prev) => {
        const next = (prev ?? 0) + delta
        if (next >= 1) {
          setPlaying(false)
          return 1
        }
        return next
      })

      lastFrameRef.current = now
      playbackRef.current = requestAnimationFrame(animate)
    }

    lastFrameRef.current = 0
    playbackRef.current = requestAnimationFrame(animate)

    return () => {
      if (playbackRef.current) cancelAnimationFrame(playbackRef.current)
    }
  }, [playing, playbackSpeed])

  const handlePlay = useCallback(() => {
    if (playbackPos === null || playbackPos >= 1) {
      setPlaybackPos(0)
    }
    setPlaying(true)
  }, [playbackPos])

  const handlePause = useCallback(() => {
    setPlaying(false)
  }, [])

  const handleReset = useCallback(() => {
    setPlaying(false)
    setPlaybackPos(null)
  }, [])

  /** Seek to a specific 0–1 position (from track drag) */
  const handleSeek = useCallback((pos: number) => {
    setPlaying(false)
    setPlaybackPos(pos)
  }, [])

  // ── Confirmation waves (clusters of note_confirmed events) ─────────
  const confirmationWaves = useMemo(() => {
    const confirms = filteredEvents
      .filter((e) => e.type === 'note_confirmed')
      .sort((a, b) => a.date.getTime() - b.date.getTime())

    if (confirms.length === 0) return []

    // Merge confirmations within 12 hours of each other into waves
    const MERGE_GAP = 12 * 60 * 60 * 1000
    const waves: { start: number; end: number; count: number; events: TimelineEvent[] }[] = []
    let wave = { start: confirms[0].date.getTime(), end: confirms[0].date.getTime(), count: 1, events: [confirms[0]] }

    for (let i = 1; i < confirms.length; i++) {
      const ts = confirms[i].date.getTime()
      if (ts - wave.end <= MERGE_GAP) {
        wave.end = ts
        wave.count++
        wave.events.push(confirms[i])
      } else {
        waves.push(wave)
        wave = { start: ts, end: ts, count: 1, events: [confirms[i]] }
      }
    }
    waves.push(wave)

    return waves
  }, [filteredEvents])

  // Current playback timestamp
  const playbackTimestamp = useMemo(() => {
    if (playbackPos === null) return null
    const range = dateRange.end - dateRange.start
    return dateRange.start + playbackPos * range
  }, [playbackPos, dateRange])

  // Events visible at current playback position
  const playbackVisibleCount = useMemo(() => {
    if (playbackTimestamp === null) return filteredEvents.length
    return filteredEvents.filter((e) => e.date.getTime() <= playbackTimestamp).length
  }, [filteredEvents, playbackTimestamp])

  // Most recent event at playback cursor
  const currentPlaybackEvent = useMemo(() => {
    if (playbackTimestamp === null) return null
    const visible = filteredEvents.filter((e) => e.date.getTime() <= playbackTimestamp)
    return visible.length > 0 ? visible[visible.length - 1] : null
  }, [filteredEvents, playbackTimestamp])

  // Is the playback cursor inside a confirmation wave?
  const currentPlaybackWave = useMemo(() => {
    if (playbackTimestamp === null) return null
    return confirmationWaves.find(
      (w) => playbackTimestamp >= w.start && playbackTimestamp <= w.end,
    ) ?? null
  }, [playbackTimestamp, confirmationWaves])

  // Decisions revealed up to current playback cursor (for scrub reading)
  const revealedDecisions = useMemo(() => {
    if (playbackTimestamp === null) return []
    return filteredEvents
      .filter((e) => e.type === 'decision' && e.date.getTime() <= playbackTimestamp)
      .reverse() // most recent first
  }, [filteredEvents, playbackTimestamp])

  // ── Sparkline data (cumulative time series) ─────────────────────────
  const sparklines = useMemo(() => {
    if (events.length === 0) return null

    // Divide the time range into ~30 buckets
    const buckets = 30
    const minTs = dateRange.start || events[0].date.getTime()
    const maxTs = dateRange.end || events[events.length - 1].date.getTime()
    const step = (maxTs - minTs) / buckets || 1

    const notesCumul: number[] = []
    const decisionsCumul: number[] = []
    const skillsCumul: number[] = []
    const velocity: number[] = []

    for (let i = 0; i <= buckets; i++) {
      const threshold = minTs + step * i
      const beforeEvents = events.filter((e) => e.date.getTime() <= threshold)
      notesCumul.push(beforeEvents.filter((e) => e.type === 'note_created').length)
      decisionsCumul.push(beforeEvents.filter((e) => e.type === 'decision').length)
      skillsCumul.push(beforeEvents.filter((e) => e.type === 'skill_created').length)
    }

    // Velocity = derivative of notes (delta per bucket)
    for (let i = 0; i < notesCumul.length; i++) {
      velocity.push(i === 0 ? 0 : notesCumul[i] - notesCumul[i - 1])
    }

    const lastNotes = notesCumul[notesCumul.length - 1]
    const lastDecs = decisionsCumul[decisionsCumul.length - 1]
    const lastSkills = skillsCumul[skillsCumul.length - 1]
    const maxVel = Math.max(...velocity)

    return {
      notes: { data: notesCumul, value: String(lastNotes) },
      decisions: { data: decisionsCumul, value: String(lastDecs) },
      skills: { data: skillsCumul, value: String(lastSkills) },
      velocity: { data: velocity, value: `${maxVel}/period` },
    }
  }, [events, dateRange])

  // ── Event type counts ───────────────────────────────────────────────
  const typeCounts = useMemo(() => {
    const counts: Record<TimelineEventType, number> = {
      note_created: 0,
      note_confirmed: 0,
      decision: 0,
      commit: 0,
      skill_created: 0,
      skill_activated: 0,
    }
    for (const e of filteredEvents) counts[e.type]++
    return counts
  }, [filteredEvents])

  // ── Loading / Error ─────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={32} className="text-cyan-400 animate-spin" />
          <p className="text-sm text-slate-500">Loading timeline data…</p>
        </div>
      </div>
    )
  }

  if (error) return <ErrorState description={error} onRetry={handleRefresh} />

  const startDate = new Date(dateRange.start)
  const endDate = new Date(dateRange.end)

  return (
    <div className="py-6 space-y-5 max-w-6xl">
      {/* ── Header (hidden in embedded mode) ─────────────────────────── */}
      {!props.embedded && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(workspacePath(wsSlug, `/projects/${projectSlug}/intelligence`))}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-slate-400 hover:text-slate-300 hover:bg-slate-800 transition-colors"
            >
              <ArrowLeft size={14} />
            </button>
            <div>
              <h1 className="text-lg font-bold text-slate-200 flex items-center gap-2">
                <Calendar size={18} className="text-cyan-400" />
                Learning Timeline
              </h1>
              <p className="text-[11px] text-slate-500">
                Knowledge evolution over time for{' '}
                <span className="text-slate-400 font-medium">{projectSlug}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Event count badges */}
            <div className="flex items-center gap-2">
              {typeCounts.note_created > 0 && (
                <div className="flex items-center gap-1 text-[10px] text-slate-500">
                  <StickyNote size={10} className="text-blue-400" />
                  {typeCounts.note_created}
                </div>
              )}
              {typeCounts.decision > 0 && (
                <div className="flex items-center gap-1 text-[10px] text-slate-500">
                  <Scale size={10} className="text-violet-400" />
                  {typeCounts.decision}
                </div>
              )}
              {typeCounts.skill_created > 0 && (
                <div className="flex items-center gap-1 text-[10px] text-slate-500">
                  <Sparkles size={10} className="text-pink-400" />
                  {typeCounts.skill_created}
                </div>
              )}
            </div>

            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>
      )}

      {/* ── Sparklines Grid ───────────────────────────────────────────── */}
      {sparklines && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="py-3 px-3">
              <Sparkline
                data={sparklines.notes.data}
                color="#3B82F6"
                label="Total Notes"
                currentValue={sparklines.notes.value}
              />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 px-3">
              <Sparkline
                data={sparklines.decisions.data}
                color="#8B5CF6"
                label="Decisions"
                currentValue={sparklines.decisions.value}
              />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 px-3">
              <Sparkline
                data={sparklines.skills.data}
                color="#EC4899"
                label="Skills"
                currentValue={sparklines.skills.value}
              />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 px-3">
              <Sparkline
                data={sparklines.velocity.data}
                color="#22d3ee"
                label="Learning Velocity"
                currentValue={sparklines.velocity.value}
              />
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Timeline Track ────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Activity size={16} className="text-cyan-400" />
            Event Timeline
            <span className="text-[10px] text-slate-600 font-normal ml-auto">
              {playbackPos !== null
                ? `${playbackVisibleCount} / ${filteredEvents.length} events`
                : `${filteredEvents.length} events`}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <div className="text-center py-8 text-slate-600 text-sm">
              No events found. Create notes, decisions, or skills to populate the timeline.
            </div>
          ) : (
            <div className="space-y-4">
              {/* Playback controls */}
              <div className="flex items-center gap-2">
                {playing ? (
                  <button
                    onClick={handlePause}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 border border-cyan-500/30 transition-colors text-xs font-medium"
                  >
                    <Pause size={12} />
                    Pause
                  </button>
                ) : (
                  <button
                    onClick={handlePlay}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 border border-cyan-500/30 transition-colors text-xs font-medium"
                  >
                    <Play size={12} />
                    {playbackPos !== null && playbackPos < 1 ? 'Resume' : 'Play'}
                  </button>
                )}
                {playbackPos !== null && (
                  <button
                    onClick={handleReset}
                    className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-slate-500 hover:text-slate-400 hover:bg-slate-800 transition-colors"
                  >
                    <RotateCcw size={11} />
                    Reset
                  </button>
                )}
                {/* Speed control — slow | fast with separator */}
                <div className="flex items-center gap-0.5 ml-2">
                  {/* Slow speeds (< 1×) */}
                  {[0.1, 0.25, 0.5].map((speed) => (
                    <button
                      key={speed}
                      onClick={() => setPlaybackSpeed(speed)}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
                        playbackSpeed === speed
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                          : 'text-slate-600 hover:text-slate-400 border border-transparent'
                      }`}
                      title={`${Math.round(1 / speed)}× slower`}
                    >
                      {speed}×
                    </button>
                  ))}

                  {/* Separator */}
                  <div className="w-px h-4 bg-slate-700 mx-1" />

                  {/* Normal & fast speeds (≥ 1×) */}
                  {[1, 2, 4].map((speed) => (
                    <button
                      key={speed}
                      onClick={() => setPlaybackSpeed(speed)}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
                        playbackSpeed === speed
                          ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
                          : 'text-slate-600 hover:text-slate-400 border border-transparent'
                      }`}
                    >
                      {speed}×
                    </button>
                  ))}
                </div>

                {/* Playback date display */}
                {playbackTimestamp !== null && (
                  <span className="text-[10px] font-mono text-slate-500 ml-auto tabular-nums">
                    {new Date(playbackTimestamp).toLocaleDateString('en', {
                      month: 'short', day: 'numeric', year: 'numeric',
                    })}
                  </span>
                )}
              </div>

              {/* "Now playing" event card — visible during play AND seek */}
              {currentPlaybackEvent && playbackPos !== null && (
                <div className="flex items-center gap-2">
                  <div
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border flex-1 min-w-0 ${playing ? 'animate-pulse' : ''}`}
                    style={{
                      backgroundColor: `${EVENT_COLORS[currentPlaybackEvent.type]}08`,
                      borderColor: `${EVENT_COLORS[currentPlaybackEvent.type]}30`,
                    }}
                  >
                    <span className="text-sm">{EVENT_ICONS[currentPlaybackEvent.type]}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] text-slate-300 truncate">{currentPlaybackEvent.label}</p>
                      <p className="text-[9px] text-slate-600">{currentPlaybackEvent.detail}</p>
                    </div>
                    <span className="text-[9px] font-mono text-slate-600 shrink-0">
                      {currentPlaybackEvent.date.toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>

                  {/* Confirmation wave indicator */}
                  {currentPlaybackWave && (
                    <div className="shrink-0 flex items-center gap-1.5 px-2.5 py-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5">
                      <span className="text-sm">✅</span>
                      <div>
                        <p className="text-[10px] font-medium text-emerald-400">
                          Confirmation phase
                        </p>
                        <p className="text-[9px] text-slate-500">
                          {currentPlaybackWave.count} note{currentPlaybackWave.count > 1 ? 's' : ''} confirmed
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Timeline */}
              <div className="relative">
                <TimelineTrack
                  events={filteredEvents}
                  startDate={startDate}
                  endDate={endDate}
                  onEventHover={setHoveredEvent}
                  onEventClick={(ev) =>
                    setSelectedEvent((prev) => (prev?.id === ev.id ? null : ev))
                  }
                  hoveredId={hoveredEvent?.id ?? null}
                  selectedId={selectedEvent?.id ?? null}
                  playbackPosition={playbackPos}
                  onSeek={handleSeek}
                  confirmationWaves={confirmationWaves}
                />
                {/* Date labels under the track */}
                <div className="flex justify-between mt-1 px-0.5">
                  <span className="text-[9px] text-slate-700 font-mono">
                    {startDate.toLocaleDateString('en', { month: 'short', day: 'numeric', year: '2-digit' })}
                  </span>
                  <span className="text-[9px] text-slate-700 font-mono">
                    {endDate.toLocaleDateString('en', { month: 'short', day: 'numeric', year: '2-digit' })}
                  </span>
                </div>
              </div>

              {/* Date range slider */}
              <div>
                <p className="text-[9px] text-slate-600 uppercase tracking-wider mb-1">Date Range</p>
                <RangeSlider
                  min={events[0].date.getTime()}
                  max={events[events.length - 1].date.getTime()}
                  start={dateRange.start}
                  end={dateRange.end}
                  onChange={(s, e) => setDateRange({ start: s, end: e })}
                />
              </div>

              {/* ── Revealed Decisions (scrub-to-read feed) ─────────── */}
              {revealedDecisions.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Scale size={13} className="text-violet-400" />
                    <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                      Decisions
                    </span>
                    <span className="text-[9px] text-slate-600 tabular-nums">
                      {revealedDecisions.length} revealed
                    </span>
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
                    {revealedDecisions.map((dec, idx) => {
                      const isLatest = idx === 0
                      return (
                        <div
                          key={dec.id}
                          className={`px-3 py-2 rounded-lg border transition-all duration-300 ${
                            isLatest
                              ? 'border-violet-500/40 bg-violet-500/8'
                              : 'border-slate-700/40 bg-slate-800/30 opacity-60'
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <span className="text-xs mt-0.5 shrink-0">⚖️</span>
                            <div className="min-w-0 flex-1">
                              <p className={`text-[11px] leading-relaxed ${
                                isLatest ? 'text-slate-200' : 'text-slate-400'
                              }`}>
                                {dec.fullContent || dec.label}
                              </p>
                              {dec.detail && (
                                <p className={`text-[10px] mt-0.5 font-medium ${
                                  isLatest ? 'text-violet-400' : 'text-violet-400/60'
                                }`}>
                                  {dec.detail}
                                </p>
                              )}
                            </div>
                            <span className="text-[8px] font-mono text-slate-600 shrink-0 mt-0.5">
                              {dec.date.toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Pinned (selected) + hovered event detail — side by side */}
              {(selectedEvent || hoveredEvent) && (
                <div className="flex items-start justify-center gap-3 flex-wrap">
                  {selectedEvent && (
                    <div className="relative">
                      <EventTooltip event={selectedEvent} />
                      {/* Unpin button */}
                      <button
                        onClick={() => setSelectedEvent(null)}
                        className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-slate-700 hover:bg-slate-600 text-slate-400 hover:text-slate-200 flex items-center justify-center text-[9px] leading-none transition-colors"
                        title="Unpin"
                      >
                        ×
                      </button>
                    </div>
                  )}
                  {hoveredEvent && hoveredEvent.id !== selectedEvent?.id && (
                    <EventTooltip event={hoveredEvent} />
                  )}
                </div>
              )}

              {/* Event type legend */}
              <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-800">
                {(Object.entries(EVENT_COLORS) as [TimelineEventType, string][]).map(([type, color]) => (
                  typeCounts[type] > 0 && (
                    <div key={type} className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                      <span className="text-[9px] text-slate-500">
                        {type.replace(/_/g, ' ')} ({typeCounts[type]})
                      </span>
                    </div>
                  )
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Activity Heatmap ──────────────────────────────────────────── */}
      {filteredEvents.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <TrendingUp size={16} className="text-emerald-400" />
              Activity Heatmap
              <span className="text-[10px] text-slate-600 font-normal ml-auto">
                Day × Hour
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ActivityHeatmap events={filteredEvents} color="#22d3ee" />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
