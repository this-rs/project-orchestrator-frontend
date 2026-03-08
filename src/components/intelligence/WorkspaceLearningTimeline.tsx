// ============================================================================
// WORKSPACE LEARNING TIMELINE — Multi-project temporal intelligence view
// ============================================================================
//
// Aggregates events from all projects in a workspace into a unified timeline
// with a multi-project activity heatmap using dissociative project colors.
//
// Key differences from project LearningTimeline:
// - Fetches notes via workspace_slug (one call), skills/protocols per project
// - Each event carries a projectSlug/projectName for color coding
// - ActivityHeatmap renders stacked bars with per-project colors
// - Project legend + filter
// ============================================================================

import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react'
import {
  RefreshCw,
  Loader2,
  Calendar,
  Activity,
  TrendingUp,
  Play,
  Pause,
  RotateCcw,
  Box,
  Grid2x2,
  X,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { ErrorState } from '@/components/ui/ErrorState'
import { notesApi } from '@/services/notes'
import { decisionsApi } from '@/services/decisions'
import { skillsApi } from '@/services/skills'
import { workspacesApi } from '@/services'
import { intelligenceApi } from '@/services/intelligence'
import { PROJECT_COLORS } from '@/constants/intelligence'
import type { Note, Skill, DecisionTimelineEntry, Project } from '@/types'
import type { ProtocolRunApi } from '@/types/intelligence'

const ActivityHeatmap3D = lazy(() =>
  import('./ActivityHeatmap3D').then((m) => ({ default: m.ActivityHeatmap3D })),
)

// ============================================================================
// TYPES
// ============================================================================

type TimelineEventType = 'note_created' | 'note_confirmed' | 'decision' | 'commit' | 'skill_created' | 'skill_activated' | 'protocol_transition'

interface TimelineEvent {
  id: string
  type: TimelineEventType
  date: Date
  label: string
  detail?: string
  fullContent?: string
  /** Project this event belongs to */
  projectSlug?: string
  projectName?: string
}

const EVENT_COLORS: Record<TimelineEventType, string> = {
  note_created: '#3B82F6',
  note_confirmed: '#4ade80',
  decision: '#8B5CF6',
  commit: '#64748B',
  skill_created: '#EC4899',
  skill_activated: '#fbbf24',
  protocol_transition: '#F97316',
}

const EVENT_ICONS: Record<TimelineEventType, string> = {
  note_created: '📝',
  note_confirmed: '✅',
  decision: '⚖️',
  commit: '📦',
  skill_created: '✨',
  skill_activated: '⚡',
  protocol_transition: '🔄',
}

// ============================================================================
// SPARKLINE
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
          <defs>
            <linearGradient id={`grad-ws-${label.replace(/\s/g, '')}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.3" />
              <stop offset="100%" stopColor={color} stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <polygon points={areaPoints} fill={`url(#grad-ws-${label.replace(/\s/g, '')})`} />
          <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  )
}

// ============================================================================
// MULTI-PROJECT ACTIVITY HEATMAP — stacked per-project colors
// ============================================================================

interface HeatmapTooltipData {
  day: string
  hour: number
  count: number
  events: TimelineEvent[]
  rect: DOMRect
}

function WorkspaceActivityHeatmap({
  events,
  projectColorMap,
}: {
  events: TimelineEvent[]
  projectColorMap: Map<string, string>
}) {
  const [tooltip, setTooltip] = useState<HeatmapTooltipData | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Group events by day×hour×project
  const { grid, maxCount } = useMemo(() => {
    // grid[day][hour] = Map<projectSlug, count>
    const g: Map<string, number>[][] = Array.from({ length: 7 }, () =>
      Array.from({ length: 24 }, () => new Map()),
    )
    let totalMax = 0

    for (const ev of events) {
      const day = ev.date.getDay()
      const hour = ev.date.getHours()
      const slug = ev.projectSlug || '_global'
      const cell = g[day][hour]
      cell.set(slug, (cell.get(slug) || 0) + 1)
    }

    // Compute max total per cell
    for (const row of g) {
      for (const cell of row) {
        let total = 0
        for (const c of cell.values()) total += c
        if (total > totalMax) totalMax = total
      }
    }

    return { grid: g, maxCount: totalMax || 1 }
  }, [events])

  // Events grouped by cell for tooltip
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

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  const handleCellEnter = useCallback(
    (e: React.MouseEvent, day: number, hour: number) => {
      const cellEvents = eventsByCell.get(`${day}-${hour}`) || []
      if (cellEvents.length === 0) { setTooltip(null); return }
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      setTooltip({ day: days[day], hour, count: cellEvents.length, events: cellEvents, rect })
    },
    [eventsByCell],
  )

  const tooltipStyle = useMemo(() => {
    if (!tooltip || !containerRef.current) return {}
    const containerRect = containerRef.current.getBoundingClientRect()
    const x = tooltip.rect.left - containerRect.left + tooltip.rect.width / 2
    const y = tooltip.rect.top - containerRect.top
    return { left: `${x}px`, top: `${y}px`, transform: 'translate(-50%, -100%)' }
  }, [tooltip])

  // Get sorted project slugs for consistent stacking order
  const projectSlugs = useMemo(() => {
    const slugs = new Set<string>()
    for (const ev of events) {
      if (ev.projectSlug) slugs.add(ev.projectSlug)
    }
    return Array.from(slugs).sort()
  }, [events])

  return (
    <div ref={containerRef} className="relative space-y-1">
      {/* Hour labels */}
      <div className="flex items-center gap-px ml-8">
        {Array.from({ length: 24 }, (_, h) => (
          <div key={h} className="flex-1 text-center">
            {h % 6 === 0 && <span className="text-[8px] text-slate-700">{h}</span>}
          </div>
        ))}
      </div>

      {/* Grid rows */}
      {grid.map((row, day) => (
        <div key={day} className="flex items-center gap-px">
          <span className="text-[8px] text-slate-600 w-7 shrink-0 text-right pr-1">{days[day]}</span>
          {row.map((cell, hour) => {
            // Total for this cell
            let total = 0
            for (const c of cell.values()) total += c
            const intensity = total / maxCount

            // Build stacked gradient for multi-project cell
            if (total === 0) {
              return (
                <div
                  key={hour}
                  className="flex-1 aspect-square rounded-[2px] min-w-[6px]"
                  style={{ backgroundColor: '#1e293b' }}
                  onMouseEnter={(e) => handleCellEnter(e, day, hour)}
                  onMouseLeave={() => setTooltip(null)}
                />
              )
            }

            // Single project or multi-project stacked bar
            const segments: { color: string; ratio: number }[] = []
            for (const slug of projectSlugs) {
              const count = cell.get(slug) || 0
              if (count > 0) {
                segments.push({
                  color: projectColorMap.get(slug) || '#6B7280',
                  ratio: count / total,
                })
              }
            }
            // Global events (no project)
            const globalCount = cell.get('_global') || 0
            if (globalCount > 0) {
              segments.push({ color: '#64748B', ratio: globalCount / total })
            }

            // If only one segment, solid color
            const alpha = Math.max(0.2, intensity)
            if (segments.length <= 1) {
              const color = segments[0]?.color || '#22d3ee'
              return (
                <div
                  key={hour}
                  className="flex-1 aspect-square rounded-[2px] min-w-[6px] cursor-pointer hover:ring-1 hover:ring-cyan-400/40 hover:scale-125 hover:z-10 transition-all duration-100"
                  style={{
                    backgroundColor: `${color}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`,
                  }}
                  onMouseEnter={(e) => handleCellEnter(e, day, hour)}
                  onMouseLeave={() => setTooltip(null)}
                />
              )
            }

            // Multi-project: CSS linear-gradient with sharp stops
            let pos = 0
            const stops: string[] = []
            for (const seg of segments) {
              const start = pos
              const end = pos + seg.ratio * 100
              stops.push(`${seg.color}${Math.round(alpha * 255).toString(16).padStart(2, '0')} ${start.toFixed(1)}%`)
              stops.push(`${seg.color}${Math.round(alpha * 255).toString(16).padStart(2, '0')} ${end.toFixed(1)}%`)
              pos = end
            }

            return (
              <div
                key={hour}
                className="flex-1 aspect-square rounded-[2px] min-w-[6px] cursor-pointer hover:ring-1 hover:ring-cyan-400/40 hover:scale-125 hover:z-10 transition-all duration-100"
                style={{
                  background: `linear-gradient(to right, ${stops.join(', ')})`,
                }}
                onMouseEnter={(e) => handleCellEnter(e, day, hour)}
                onMouseLeave={() => setTooltip(null)}
              />
            )
          })}
        </div>
      ))}

      {/* Tooltip */}
      {tooltip && (
        <div className="absolute z-50 pointer-events-none mb-2" style={tooltipStyle}>
          <div className="bg-slate-900/95 backdrop-blur-sm border border-slate-700/80 rounded-lg px-3 py-2 shadow-xl min-w-[200px] max-w-[280px]">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-medium text-cyan-400">
                {tooltip.day} {tooltip.hour}:00–{tooltip.hour + 1}:00
              </span>
              <span className="text-[10px] text-slate-500 font-mono">
                {tooltip.count} event{tooltip.count !== 1 ? 's' : ''}
              </span>
            </div>
            {/* Group by project */}
            {(() => {
              const byProject = new Map<string, TimelineEvent[]>()
              for (const ev of tooltip.events) {
                const key = ev.projectName || ev.projectSlug || 'Global'
                const arr = byProject.get(key) || []
                arr.push(ev)
                byProject.set(key, arr)
              }
              return Array.from(byProject.entries()).map(([projName, evts]) => (
                <div key={projName} className="mb-1.5 last:mb-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{
                        backgroundColor: evts[0]?.projectSlug
                          ? projectColorMap.get(evts[0].projectSlug) || '#6B7280'
                          : '#64748B',
                      }}
                    />
                    <span className="text-[9px] font-medium text-slate-300">{projName}</span>
                    <span className="text-[8px] text-slate-600">({evts.length})</span>
                  </div>
                  {evts.slice(0, 3).map((ev) => (
                    <div key={ev.id} className="flex items-center gap-1.5 ml-3.5">
                      <div
                        className="w-1 h-1 rounded-full shrink-0"
                        style={{ backgroundColor: EVENT_COLORS[ev.type] }}
                      />
                      <span className="text-[8px] text-slate-500 truncate">{ev.label}</span>
                    </div>
                  ))}
                  {evts.length > 3 && (
                    <span className="text-[7px] text-slate-600 ml-3.5">+{evts.length - 3} more</span>
                  )}
                </div>
              ))
            })()}
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// TIMELINE TRACK — horizontal event markers (reused from LearningTimeline)
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
  projectColorMap,
}: {
  events: TimelineEvent[]
  startDate: Date
  endDate: Date
  onEventHover: (event: TimelineEvent | null) => void
  onEventClick: (event: TimelineEvent) => void
  hoveredId: string | null
  selectedId: string | null
  playbackPosition: number | null
  onSeek: (pos: number) => void
  confirmationWaves: { start: number; end: number; count: number }[]
  projectColorMap: Map<string, string>
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const range = endDate.getTime() - startDate.getTime() || 1

  const getPosition = (date: Date) =>
    ((date.getTime() - startDate.getTime()) / range) * 100

  // Drag-to-seek
  const draggingRef = useRef(false)

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    draggingRef.current = true
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    const rect = trackRef.current?.getBoundingClientRect()
    if (rect) {
      const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
      onSeek(pos)
    }
  }, [onSeek])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return
    const rect = trackRef.current?.getBoundingClientRect()
    if (rect) {
      const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
      onSeek(pos)
    }
  }, [onSeek])

  const handlePointerUp = useCallback(() => {
    draggingRef.current = false
  }, [])

  return (
    <div
      ref={trackRef}
      className="relative h-20 bg-slate-900/50 rounded-lg border border-slate-800 cursor-crosshair select-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Confirmation wave bands */}
      {confirmationWaves.map((wave, i) => {
        const left = getPosition(new Date(wave.start))
        const right = getPosition(new Date(wave.end))
        const width = Math.max(0.5, right - left)
        return (
          <div
            key={i}
            className="absolute top-0 bottom-0 bg-emerald-500/8 border-l border-r border-emerald-500/20"
            style={{ left: `${left}%`, width: `${width}%` }}
          />
        )
      })}

      {/* Time grid (every ~25%) */}
      {[0.25, 0.5, 0.75].map((frac) => (
        <div
          key={frac}
          className="absolute top-0 bottom-0 w-px bg-slate-800/50"
          style={{ left: `${frac * 100}%` }}
        />
      ))}

      {/* Event markers — colored by PROJECT (not event type) */}
      {events.map((ev) => {
        const left = getPosition(ev.date)
        const isHovered = ev.id === hoveredId
        const isSelected = ev.id === selectedId
        // Use project color if available, fallback to event type color
        const color = ev.projectSlug
          ? projectColorMap.get(ev.projectSlug) || EVENT_COLORS[ev.type]
          : EVENT_COLORS[ev.type]

        return (
          <div
            key={ev.id}
            className={`absolute top-1/2 -translate-y-1/2 rounded-full transition-all duration-150 ${
              isSelected
                ? 'w-3 h-3 ring-2 ring-cyan-400/60 z-20'
                : isHovered
                  ? 'w-2.5 h-2.5 z-10'
                  : 'w-1.5 h-1.5'
            }`}
            style={{
              left: `${left}%`,
              backgroundColor: color,
              transform: 'translate(-50%, -50%)',
              boxShadow: isHovered || isSelected ? `0 0 6px ${color}80` : undefined,
            }}
            onMouseEnter={(e) => { e.stopPropagation(); onEventHover(ev) }}
            onMouseLeave={(e) => { e.stopPropagation(); onEventHover(null) }}
            onClick={(e) => { e.stopPropagation(); onEventClick(ev) }}
          />
        )
      })}

      {/* Playback cursor */}
      {playbackPosition !== null && (
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-cyan-400 z-30"
          style={{ left: `${playbackPosition * 100}%` }}
        >
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-cyan-400 rounded-full border-2 border-slate-900" />
        </div>
      )}
    </div>
  )
}

// ============================================================================
// RANGE SLIDER
// ============================================================================

function RangeSlider({
  min, max, start, end, onChange,
}: {
  min: number; max: number; start: number; end: number
  onChange: (start: number, end: number) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef<'start' | 'end' | null>(null)

  const pct = (v: number) => ((v - min) / (max - min || 1)) * 100

  const handlePointer = useCallback(
    (e: React.PointerEvent, thumb: 'start' | 'end') => {
      draggingRef.current = thumb
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    },
    [],
  )

  const handleMove = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current || !trackRef.current) return
      const rect = trackRef.current.getBoundingClientRect()
      const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
      const val = min + frac * (max - min)
      if (draggingRef.current === 'start') {
        onChange(Math.min(val, end - (max - min) * 0.01), end)
      } else {
        onChange(start, Math.max(val, start + (max - min) * 0.01))
      }
    },
    [min, max, start, end, onChange],
  )

  const handleUp = useCallback(() => { draggingRef.current = null }, [])

  return (
    <div
      ref={trackRef}
      className="relative h-6 select-none"
      onPointerMove={handleMove}
      onPointerUp={handleUp}
    >
      <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-1 bg-slate-800 rounded-full" />
      <div
        className="absolute top-1/2 -translate-y-1/2 h-1 bg-cyan-500/40 rounded-full"
        style={{ left: `${pct(start)}%`, width: `${pct(end) - pct(start)}%` }}
      />
      {/* Thumbs */}
      {(['start', 'end'] as const).map((thumb) => (
        <div
          key={thumb}
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-cyan-400 border-2 border-slate-900 cursor-grab active:cursor-grabbing z-10 hover:scale-125 transition-transform"
          style={{ left: `${pct(thumb === 'start' ? start : end)}%` }}
          onPointerDown={(e) => handlePointer(e, thumb)}
        />
      ))}
      {/* Labels */}
      <div className="flex justify-between mt-2 px-0.5">
        <span className="text-[8px] text-slate-600 font-mono">
          {new Date(start).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
        </span>
        <span className="text-[8px] text-slate-600 font-mono">
          {new Date(end).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
        </span>
      </div>
    </div>
  )
}

// ============================================================================
// EVENT TOOLTIP
// ============================================================================

function EventTooltip({ event, projectColorMap }: { event: TimelineEvent; projectColorMap: Map<string, string> }) {
  const projColor = event.projectSlug ? projectColorMap.get(event.projectSlug) : undefined
  return (
    <div
      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border max-w-sm"
      style={{
        backgroundColor: `${EVENT_COLORS[event.type]}08`,
        borderColor: `${EVENT_COLORS[event.type]}30`,
      }}
    >
      <span className="text-sm">{EVENT_ICONS[event.type]}</span>
      <div className="min-w-0">
        <p className="text-[11px] text-slate-300 truncate">{event.label}</p>
        <div className="flex items-center gap-2">
          {event.detail && <p className="text-[9px] text-slate-600">{event.detail}</p>}
          {event.projectName && (
            <span className="flex items-center gap-1 text-[8px] text-slate-500">
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: projColor || '#6B7280' }} />
              {event.projectName}
            </span>
          )}
        </div>
      </div>
      <span className="text-[9px] font-mono text-slate-600 shrink-0">
        {event.date.toLocaleDateString('en', { month: 'short', day: 'numeric' })}
      </span>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface WorkspaceLearningTimelineProps {
  embedded?: boolean
  workspaceSlug: string
}

export default function WorkspaceLearningTimeline({ embedded, workspaceSlug }: WorkspaceLearningTimelineProps) {
  // Data
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  // Interaction
  const [hoveredEvent, setHoveredEvent] = useState<TimelineEvent | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null)
  const [activeProjectFilter, setActiveProjectFilter] = useState<string | null>(null)

  // Date range
  const [dateRange, setDateRange] = useState<{ start: number; end: number }>({ start: 0, end: 0 })

  // Playback
  const [playing, setPlaying] = useState(false)
  const [playbackPos, setPlaybackPos] = useState<number | null>(null)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const [heatmapMode, setHeatmapMode] = useState<'2d' | '3d'>('2d')
  const playbackRef = useRef<number | null>(null)
  const lastFrameRef = useRef<number>(0)

  // Project color map
  const projectColorMap = useMemo(() => {
    const map = new Map<string, string>()
    projects.forEach((p, i) => {
      map.set(p.slug, PROJECT_COLORS[i % PROJECT_COLORS.length])
    })
    return map
  }, [projects])

  // ── Build events from API data ──────────────────────────────────────
  const buildEvents = useCallback(
    (
      notes: (Note & { _projectSlug?: string; _projectName?: string })[],
      decisionEntries: DecisionTimelineEntry[],
      skills: (Skill & { _projectSlug?: string; _projectName?: string })[],
      protocolRuns: (ProtocolRunApi & { _projectSlug?: string; _projectName?: string })[] = [],
    ): TimelineEvent[] => {
      const evts: TimelineEvent[] = []

      for (const n of notes) {
        evts.push({
          id: `note-${n.id}`,
          type: 'note_created',
          date: new Date(n.created_at),
          label: n.content.slice(0, 80),
          detail: `${n.note_type} (${n.importance})`,
          projectSlug: n._projectSlug,
          projectName: n._projectName,
        })
        if (n.last_confirmed_at) {
          const confirmedAt = new Date(n.last_confirmed_at)
          const cycleMs = confirmedAt.getTime() - new Date(n.created_at).getTime()
          const cycleLabel = cycleMs < 60_000 ? '< 1 min'
            : cycleMs < 3_600_000 ? `${Math.round(cycleMs / 60_000)} min`
            : cycleMs < 86_400_000 ? `${Math.round(cycleMs / 3_600_000)}h`
            : `${Math.round(cycleMs / 86_400_000)}d`
          evts.push({
            id: `note-confirm-${n.id}`,
            type: 'note_confirmed',
            date: confirmedAt,
            label: `Confirmed: ${n.content.slice(0, 60)}`,
            detail: `Cycle: ${cycleLabel}`,
            projectSlug: n._projectSlug,
            projectName: n._projectName,
          })
        }
      }

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

      for (const s of skills) {
        evts.push({
          id: `skill-${s.id}`,
          type: 'skill_created',
          date: new Date(s.created_at),
          label: s.name,
          detail: `${s.note_count} notes, ${s.decision_count} decisions`,
          projectSlug: s._projectSlug,
          projectName: s._projectName,
        })
        if (s.last_activated) {
          evts.push({
            id: `skill-act-${s.id}`,
            type: 'skill_activated',
            date: new Date(s.last_activated),
            label: `Activated: ${s.name}`,
            projectSlug: s._projectSlug,
            projectName: s._projectName,
          })
        }
      }

      for (const run of protocolRuns) {
        for (const visit of run.states_visited) {
          evts.push({
            id: `proto-${run.id}-${visit.state_id}`,
            type: 'protocol_transition',
            date: new Date(visit.entered_at),
            label: visit.state_name,
            detail: visit.trigger
              ? `${visit.trigger} → ${visit.state_name}`
              : `Started: ${visit.state_name}`,
            projectSlug: run._projectSlug,
            projectName: run._projectName,
          })
        }
      }

      return evts.sort((a, b) => a.date.getTime() - b.date.getTime())
    },
    [],
  )

  // ── Fetch all data (workspace-wide) ─────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!workspaceSlug) return
    setError(null)
    try {
      // Get workspace projects
      const overview = await workspacesApi.getOverview(workspaceSlug) as unknown as { projects: Project[] }
      const wsProjects = overview.projects || []
      setProjects(wsProjects)

      // Build project lookup
      const projectById = new Map<string, Project>()
      for (const p of wsProjects) projectById.set(p.id, p)

      // 1. Fetch ALL notes via workspace_slug (one paginated call)
      const fetchAllNotes = async () => {
        const all: (Note & { _projectSlug?: string; _projectName?: string })[] = []
        let offset = 0
        const limit = 100
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const page = await notesApi.list({ workspace_slug: workspaceSlug, limit, offset })
          for (const note of page.items) {
            // Notes have project_id — resolve to slug/name
            const proj = note.project_id ? projectById.get(note.project_id) : undefined
            all.push({
              ...note,
              _projectSlug: proj?.slug,
              _projectName: proj?.name,
            })
          }
          if (all.length >= page.total || page.items.length < limit) break
          offset += limit
        }
        return all
      }

      // 2. Fetch skills per project in parallel
      const fetchAllSkills = async () => {
        const results = await Promise.allSettled(
          wsProjects.map(async (proj) => {
            const all: (Skill & { _projectSlug?: string; _projectName?: string })[] = []
            let offset = 0
            const limit = 100
            // eslint-disable-next-line no-constant-condition
            while (true) {
              const page = await skillsApi.list({ project_id: proj.id, limit, offset })
              for (const s of page.items) {
                all.push({ ...s, _projectSlug: proj.slug, _projectName: proj.name })
              }
              if (all.length >= page.total || page.items.length < limit) break
              offset += limit
            }
            return all
          }),
        )
        return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
      }

      // 3. Fetch protocol runs per project in parallel
      const fetchAllProtocolRuns = async () => {
        const results = await Promise.allSettled(
          wsProjects.map(async (proj) => {
            try {
              const protocols = await intelligenceApi.listProtocols(proj.id)
              if (!protocols.items.length) return []
              const runResults = await Promise.allSettled(
                protocols.items.map((p) => intelligenceApi.listRuns(p.id)),
              )
              return runResults.flatMap((r) =>
                r.status === 'fulfilled'
                  ? r.value.items.map((run) => ({
                      ...run,
                      _projectSlug: proj.slug,
                      _projectName: proj.name,
                    }))
                  : [],
              )
            } catch {
              return []
            }
          }),
        )
        return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
      }

      const [notesRes, decisionsRes, skillsRes, runsRes] = await Promise.allSettled([
        fetchAllNotes(),
        decisionsApi.getTimeline({}),
        fetchAllSkills(),
        fetchAllProtocolRuns(),
      ])

      const notes = notesRes.status === 'fulfilled' ? notesRes.value : []
      const decisions = decisionsRes.status === 'fulfilled' ? decisionsRes.value : []
      const skills = skillsRes.status === 'fulfilled' ? skillsRes.value : []
      const runs = runsRes.status === 'fulfilled' ? runsRes.value : []

      const allEvents = buildEvents(notes, decisions, skills, runs)
      setEvents(allEvents)

      if (allEvents.length > 0) {
        const minTs = allEvents[0].date.getTime()
        const maxTs = allEvents[allEvents.length - 1].date.getTime()
        const padding = (maxTs - minTs) * 0.02 || 86400000
        setDateRange({ start: minTs - padding, end: maxTs + padding })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workspace timeline data')
    }
  }, [workspaceSlug, buildEvents])

  useEffect(() => {
    setLoading(true)
    fetchData().finally(() => setLoading(false))
  }, [fetchData])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await fetchData()
    setRefreshing(false)
  }, [fetchData])

  // ── Filtered events ─────────────────────────────────────────────────
  const filteredEvents = useMemo(() => {
    let evts = events
    // Date range filter
    if (dateRange.start !== 0 || dateRange.end !== 0) {
      evts = evts.filter(
        (e) => e.date.getTime() >= dateRange.start && e.date.getTime() <= dateRange.end,
      )
    }
    // Project filter
    if (activeProjectFilter) {
      evts = evts.filter((e) => e.projectSlug === activeProjectFilter)
    }
    return evts
  }, [events, dateRange, activeProjectFilter])

  // ── Playback ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!playing) {
      if (playbackRef.current) cancelAnimationFrame(playbackRef.current)
      playbackRef.current = null
      return
    }
    const durationMs = 10000 / playbackSpeed
    const animate = (now: number) => {
      if (lastFrameRef.current === 0) lastFrameRef.current = now
      const elapsed = now - lastFrameRef.current
      const delta = elapsed / durationMs
      setPlaybackPos((prev) => {
        const next = (prev ?? 0) + delta
        if (next >= 1) { setPlaying(false); return 1 }
        return next
      })
      lastFrameRef.current = now
      playbackRef.current = requestAnimationFrame(animate)
    }
    lastFrameRef.current = 0
    playbackRef.current = requestAnimationFrame(animate)
    return () => { if (playbackRef.current) cancelAnimationFrame(playbackRef.current) }
  }, [playing, playbackSpeed])

  const handlePlay = useCallback(() => {
    if (playbackPos === null || playbackPos >= 1) setPlaybackPos(0)
    setPlaying(true)
  }, [playbackPos])

  const handlePause = useCallback(() => setPlaying(false), [])
  const handleReset = useCallback(() => { setPlaying(false); setPlaybackPos(null) }, [])
  const handleSeek = useCallback((pos: number) => { setPlaying(false); setPlaybackPos(pos) }, [])

  // ── Confirmation waves ──────────────────────────────────────────────
  const confirmationWaves = useMemo(() => {
    const confirms = filteredEvents
      .filter((e) => e.type === 'note_confirmed')
      .sort((a, b) => a.date.getTime() - b.date.getTime())
    if (confirms.length === 0) return []
    const MERGE_GAP = 12 * 60 * 60 * 1000
    const waves: { start: number; end: number; count: number }[] = []
    let wave = { start: confirms[0].date.getTime(), end: confirms[0].date.getTime(), count: 1 }
    for (let i = 1; i < confirms.length; i++) {
      const ts = confirms[i].date.getTime()
      if (ts - wave.end <= MERGE_GAP) { wave.end = ts; wave.count++ }
      else { waves.push(wave); wave = { start: ts, end: ts, count: 1 } }
    }
    waves.push(wave)
    return waves
  }, [filteredEvents])

  const playbackTimestamp = useMemo(() => {
    if (playbackPos === null) return null
    return dateRange.start + playbackPos * (dateRange.end - dateRange.start)
  }, [playbackPos, dateRange])

  const playbackVisibleCount = useMemo(() => {
    if (playbackTimestamp === null) return filteredEvents.length
    return filteredEvents.filter((e) => e.date.getTime() <= playbackTimestamp).length
  }, [filteredEvents, playbackTimestamp])

  const currentPlaybackEvent = useMemo(() => {
    if (playbackTimestamp === null) return null
    const visible = filteredEvents.filter((e) => e.date.getTime() <= playbackTimestamp)
    return visible.length > 0 ? visible[visible.length - 1] : null
  }, [filteredEvents, playbackTimestamp])

  // ── Sparklines ──────────────────────────────────────────────────────
  const sparklines = useMemo(() => {
    if (events.length === 0) return null
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
      const before = events.filter((e) => e.date.getTime() <= threshold)
      notesCumul.push(before.filter((e) => e.type === 'note_created').length)
      decisionsCumul.push(before.filter((e) => e.type === 'decision').length)
      skillsCumul.push(before.filter((e) => e.type === 'skill_created').length)
    }
    for (let i = 0; i < notesCumul.length; i++) {
      velocity.push(i === 0 ? 0 : notesCumul[i] - notesCumul[i - 1])
    }
    return {
      notes: { data: notesCumul, value: String(notesCumul[notesCumul.length - 1]) },
      decisions: { data: decisionsCumul, value: String(decisionsCumul[decisionsCumul.length - 1]) },
      skills: { data: skillsCumul, value: String(skillsCumul[skillsCumul.length - 1]) },
      velocity: { data: velocity, value: `${Math.max(...velocity)}/period` },
    }
  }, [events, dateRange])

  // Event type counts
  const typeCounts = useMemo(() => {
    const counts: Record<TimelineEventType, number> = {
      note_created: 0, note_confirmed: 0, decision: 0, commit: 0,
      skill_created: 0, skill_activated: 0, protocol_transition: 0,
    }
    for (const e of filteredEvents) counts[e.type]++
    return counts
  }, [filteredEvents])

  const sliderBounds = useMemo(() => {
    if (events.length === 0) return { min: 0, max: 1 }
    const minTs = events[0].date.getTime()
    const maxTs = events[events.length - 1].date.getTime()
    const padding = (maxTs - minTs) * 0.02 || 86400000
    return { min: minTs - padding, max: maxTs + padding }
  }, [events])

  // ── Render ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={32} className="text-cyan-400 animate-spin" />
          <p className="text-sm text-slate-500">Loading workspace timeline…</p>
        </div>
      </div>
    )
  }

  if (error) return <ErrorState description={error} onRetry={handleRefresh} />

  const startDate = new Date(dateRange.start)
  const endDate = new Date(dateRange.end)

  return (
    <div className="py-4 space-y-5 w-full">
      {/* ── Header ── */}
      {!embedded && (
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2">
              <Calendar size={18} className="text-cyan-400" />
              Workspace Timeline
            </h2>
            <p className="text-[11px] text-slate-500">
              Knowledge evolution across {projects.length} project{projects.length !== 1 ? 's' : ''}
            </p>
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
      )}

      {/* ── Project legend + filter ── */}
      {projects.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[9px] text-slate-600 uppercase tracking-wider mr-1">Projects:</span>
          {projects.map((p, i) => {
            const color = PROJECT_COLORS[i % PROJECT_COLORS.length]
            const isActive = activeProjectFilter === p.slug
            const isFiltered = activeProjectFilter && !isActive
            return (
              <button
                key={p.slug}
                onClick={() => setActiveProjectFilter(isActive ? null : p.slug)}
                className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] transition-all border ${
                  isActive
                    ? 'bg-slate-700/60 text-white border-slate-600'
                    : isFiltered
                      ? 'text-slate-600 border-transparent hover:border-slate-700'
                      : 'text-slate-400 border-slate-700/50 hover:border-slate-600'
                }`}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: color, opacity: isFiltered ? 0.3 : 1 }}
                />
                {p.name}
              </button>
            )
          })}
          {activeProjectFilter && (
            <button
              onClick={() => setActiveProjectFilter(null)}
              className="text-[9px] text-amber-400 hover:text-amber-300 flex items-center gap-0.5 ml-1"
            >
              <X size={10} />
              Clear
            </button>
          )}
        </div>
      )}

      {/* ── Sparklines ── */}
      {sparklines && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><CardContent className="py-3 px-3">
            <Sparkline data={sparklines.notes.data} color="#3B82F6" label="Total Notes" currentValue={sparklines.notes.value} />
          </CardContent></Card>
          <Card><CardContent className="py-3 px-3">
            <Sparkline data={sparklines.decisions.data} color="#8B5CF6" label="Decisions" currentValue={sparklines.decisions.value} />
          </CardContent></Card>
          <Card><CardContent className="py-3 px-3">
            <Sparkline data={sparklines.skills.data} color="#EC4899" label="Skills" currentValue={sparklines.skills.value} />
          </CardContent></Card>
          <Card><CardContent className="py-3 px-3">
            <Sparkline data={sparklines.velocity.data} color="#22d3ee" label="Learning Velocity" currentValue={sparklines.velocity.value} />
          </CardContent></Card>
        </div>
      )}

      {/* ── Timeline Track ── */}
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
              No events found. Create notes, decisions, or skills in your projects.
            </div>
          ) : (
            <div className="space-y-4">
              {/* Playback controls */}
              <div className="flex items-center gap-2">
                {playing ? (
                  <button onClick={handlePause} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 border border-cyan-500/30 transition-colors text-xs font-medium">
                    <Pause size={12} /> Pause
                  </button>
                ) : (
                  <button onClick={handlePlay} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 border border-cyan-500/30 transition-colors text-xs font-medium">
                    <Play size={12} /> {playbackPos !== null && playbackPos < 1 ? 'Resume' : 'Play'}
                  </button>
                )}
                {playbackPos !== null && (
                  <button onClick={handleReset} className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-slate-500 hover:text-slate-400 hover:bg-slate-800 transition-colors">
                    <RotateCcw size={11} /> Reset
                  </button>
                )}
                <div className="flex items-center gap-0.5 ml-2">
                  {[0.1, 0.25, 0.5].map((speed) => (
                    <button key={speed} onClick={() => setPlaybackSpeed(speed)}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
                        playbackSpeed === speed ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' : 'text-slate-600 hover:text-slate-400 border border-transparent'
                      }`}>{speed}×</button>
                  ))}
                  <div className="w-px h-4 bg-slate-700 mx-1" />
                  {[1, 2, 4].map((speed) => (
                    <button key={speed} onClick={() => setPlaybackSpeed(speed)}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
                        playbackSpeed === speed ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40' : 'text-slate-600 hover:text-slate-400 border border-transparent'
                      }`}>{speed}×</button>
                  ))}
                </div>
                {playbackTimestamp !== null && (
                  <span className="text-[10px] font-mono text-slate-500 ml-auto tabular-nums">
                    {new Date(playbackTimestamp).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                )}
              </div>

              {/* Now playing card */}
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
                      <div className="flex items-center gap-2">
                        <p className="text-[9px] text-slate-600">{currentPlaybackEvent.detail}</p>
                        {currentPlaybackEvent.projectName && (
                          <span className="flex items-center gap-1 text-[8px] text-slate-500">
                            <span
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ backgroundColor: currentPlaybackEvent.projectSlug ? projectColorMap.get(currentPlaybackEvent.projectSlug) : '#6B7280' }}
                            />
                            {currentPlaybackEvent.projectName}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-[9px] font-mono text-slate-600 shrink-0">
                      {currentPlaybackEvent.date.toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                </div>
              )}

              {/* Track */}
              <div className="relative">
                <TimelineTrack
                  events={filteredEvents}
                  startDate={startDate}
                  endDate={endDate}
                  onEventHover={setHoveredEvent}
                  onEventClick={(ev) => setSelectedEvent((prev) => (prev?.id === ev.id ? null : ev))}
                  hoveredId={hoveredEvent?.id ?? null}
                  selectedId={selectedEvent?.id ?? null}
                  playbackPosition={playbackPos}
                  onSeek={handleSeek}
                  confirmationWaves={confirmationWaves}
                  projectColorMap={projectColorMap}
                />
                <div className="flex justify-between mt-1 px-0.5">
                  <span className="text-[9px] text-slate-700 font-mono">
                    {startDate.toLocaleDateString('en', { month: 'short', day: 'numeric', year: '2-digit' })}
                  </span>
                  <span className="text-[9px] text-slate-700 font-mono">
                    {endDate.toLocaleDateString('en', { month: 'short', day: 'numeric', year: '2-digit' })}
                  </span>
                </div>
              </div>

              {/* Range slider */}
              <div>
                <p className="text-[9px] text-slate-600 uppercase tracking-wider mb-1">Date Range</p>
                <RangeSlider
                  min={sliderBounds.min} max={sliderBounds.max}
                  start={dateRange.start} end={dateRange.end}
                  onChange={(s, e) => setDateRange({ start: s, end: e })}
                />
              </div>

              {/* Selected/hovered event */}
              {(selectedEvent || hoveredEvent) && (
                <div className="flex items-start justify-center gap-3 flex-wrap">
                  {selectedEvent && (
                    <div className="relative">
                      <EventTooltip event={selectedEvent} projectColorMap={projectColorMap} />
                      <button
                        onClick={() => setSelectedEvent(null)}
                        className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-slate-700 hover:bg-slate-600 text-slate-400 hover:text-slate-200 flex items-center justify-center text-[9px] leading-none transition-colors"
                      >×</button>
                    </div>
                  )}
                  {hoveredEvent && hoveredEvent.id !== selectedEvent?.id && (
                    <EventTooltip event={hoveredEvent} projectColorMap={projectColorMap} />
                  )}
                </div>
              )}

              {/* Legend */}
              <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-800">
                {(Object.entries(EVENT_COLORS) as [TimelineEventType, string][]).map(([type, color]) => (
                  typeCounts[type] > 0 && (
                    <div key={type} className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                      <span className="text-[9px] text-slate-500">{type.replace(/_/g, ' ')} ({typeCounts[type]})</span>
                    </div>
                  )
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Activity Heatmap (multi-project) ── */}
      {filteredEvents.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <TrendingUp size={16} className="text-emerald-400" />
              Activity Heatmap
              <span className="text-[10px] text-slate-600 font-normal ml-1">
                ({projects.length} project{projects.length !== 1 ? 's' : ''})
              </span>
              <div className="ml-auto flex items-center gap-1">
                <button
                  onClick={() => setHeatmapMode('2d')}
                  className={`p-1 rounded transition-colors ${heatmapMode === '2d' ? 'bg-slate-700 text-cyan-400' : 'text-slate-600 hover:text-slate-400'}`}
                  title="2D Grid"
                ><Grid2x2 size={14} /></button>
                <button
                  onClick={() => setHeatmapMode('3d')}
                  className={`p-1 rounded transition-colors ${heatmapMode === '3d' ? 'bg-slate-700 text-cyan-400' : 'text-slate-600 hover:text-slate-400'}`}
                  title="3D Scene"
                ><Box size={14} /></button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {heatmapMode === '2d' ? (
              <WorkspaceActivityHeatmap
                events={filteredEvents}
                projectColorMap={projectColorMap}
              />
            ) : (
              <Suspense fallback={
                <div className="flex items-center justify-center h-[360px] text-slate-600">
                  <Loader2 size={20} className="animate-spin mr-2" />
                  Loading 3D scene…
                </div>
              }>
                <ActivityHeatmap3D events={filteredEvents} projectColorMap={projectColorMap} />
              </Suspense>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
