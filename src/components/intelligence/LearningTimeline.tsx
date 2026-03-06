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

function ActivityHeatmap({ events, color }: { events: TimelineEvent[]; color: string }) {
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

  const maxCount = useMemo(() => {
    let m = 0
    for (const row of grid) for (const v of row) if (v > m) m = v
    return m || 1
  }, [grid])

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  return (
    <div className="space-y-1">
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
                className="flex-1 aspect-square rounded-[2px] min-w-[6px]"
                style={{
                  backgroundColor: count === 0
                    ? '#1e293b'
                    : `${color}${Math.round(Math.max(0.15, intensity) * 255).toString(16).padStart(2, '0')}`,
                }}
                title={`${days[day]} ${hour}:00 — ${count} event${count !== 1 ? 's' : ''}`}
              />
            )
          })}
        </div>
      ))}
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
  hoveredId,
  playbackPosition,
}: {
  events: TimelineEvent[]
  startDate: Date
  endDate: Date
  onEventHover: (ev: TimelineEvent | null) => void
  hoveredId: string | null
  /** 0–1 normalized playback cursor position, null = no playback */
  playbackPosition: number | null
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const range = endDate.getTime() - startDate.getTime() || 1
  const cursorTs = playbackPosition !== null
    ? startDate.getTime() + playbackPosition * range
    : null

  return (
    <div ref={containerRef} className="relative h-14 bg-slate-800/30 rounded-lg border border-slate-700/30 overflow-hidden">
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
          {/* Cursor head */}
          <div
            className="absolute -top-1 -translate-x-1/2 w-2 h-2 rounded-full bg-cyan-400"
            style={{ boxShadow: '0 0 6px #22d3ee80' }}
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

      {/* Event markers */}
      {events.map((ev) => {
        const x = ((ev.date.getTime() - startDate.getTime()) / range) * 100
        if (x < 0 || x > 100) return null
        const color = EVENT_COLORS[ev.type]
        const isHovered = ev.id === hoveredId
        // During playback, dim events past the cursor
        const isPastCursor = cursorTs !== null && ev.date.getTime() > cursorTs
        const opacity = isPastCursor ? 0.15 : 1

        return (
          <div
            key={ev.id}
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 cursor-pointer"
            style={{
              left: `${x}%`,
              transform: `translate(-50%, -50%) scale(${isHovered ? 1.8 : 1})`,
              zIndex: isHovered ? 10 : 1,
              opacity,
              transition: 'opacity 0.3s ease, transform 0.15s ease',
            }}
            onMouseEnter={() => onEventHover(ev)}
            onMouseLeave={() => onEventHover(null)}
          >
            <div
              className="w-2.5 h-2.5 rounded-full border"
              style={{
                backgroundColor: `${color}${isHovered ? 'ff' : 'aa'}`,
                borderColor: isHovered ? '#fff' : `${color}60`,
                boxShadow: isHovered ? `0 0 8px ${color}60` : 'none',
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
  const range = max - min || 1
  const leftPct = ((start - min) / range) * 100
  const rightPct = ((end - min) / range) * 100

  return (
    <div className="relative h-6 select-none">
      {/* Background track */}
      <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-1 bg-slate-800 rounded-full" />

      {/* Active range */}
      <div
        className="absolute top-1/2 -translate-y-1/2 h-1 bg-cyan-500/50 rounded-full"
        style={{ left: `${leftPct}%`, width: `${rightPct - leftPct}%` }}
      />

      {/* Left thumb */}
      <input
        type="range"
        min={min}
        max={max}
        value={start}
        onChange={(e) => {
          const v = Number(e.target.value)
          if (v < end) onChange(v, end)
        }}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
        style={{ pointerEvents: 'auto' }}
      />

      {/* Right thumb */}
      <input
        type="range"
        min={min}
        max={max}
        value={end}
        onChange={(e) => {
          const v = Number(e.target.value)
          if (v > start) onChange(start, v)
        }}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
        style={{ pointerEvents: 'auto' }}
      />

      {/* Visual thumbs */}
      <div
        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-cyan-400 border-2 border-slate-900 shadow-sm z-30 pointer-events-none"
        style={{ left: `${leftPct}%` }}
      />
      <div
        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-cyan-400 border-2 border-slate-900 shadow-sm z-30 pointer-events-none"
        style={{ left: `${rightPct}%` }}
      />
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
          evts.push({
            id: `note-confirm-${n.id}`,
            type: 'note_confirmed',
            date: new Date(n.last_confirmed_at),
            label: `Confirmed: ${n.content.slice(0, 60)}`,
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
                {/* Speed control */}
                <div className="flex items-center gap-1 ml-2">
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

              {/* "Now playing" event card */}
              {currentPlaybackEvent && playing && (
                <div
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border animate-pulse"
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
              )}

              {/* Timeline */}
              <div className="relative">
                <TimelineTrack
                  events={filteredEvents}
                  startDate={startDate}
                  endDate={endDate}
                  onEventHover={setHoveredEvent}
                  hoveredId={hoveredEvent?.id ?? null}
                  playbackPosition={playbackPos}
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
                  onChange={(start, end) => setDateRange({ start, end })}
                />
              </div>

              {/* Hovered event detail */}
              {hoveredEvent && (
                <div className="flex justify-center">
                  <EventTooltip event={hoveredEvent} />
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
