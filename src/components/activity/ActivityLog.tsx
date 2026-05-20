/**
 * ActivityLog — bottom panel of the Live Activity Hub.
 *
 * A terminal-style scrolling stream that surfaces ALL `ActivityEvent`s
 * (runner / chat / crud / protocol_progress) via the shared `LogLine`
 * renderer (ANSI-aware). Features:
 *
 *   - Custom fixed-row virtualization (no extra dep) — only the visible
 *     window + a small overscan is rendered, so 10k+ events scroll smoothly.
 *   - Full-text search via `logSearchAtom`.
 *   - Severity filter via `logSeverityFilterAtom`.
 *   - Auto-scroll toggle via `logAutoScrollAtom` — pinned to the bottom when
 *     enabled; the user can break-out by scrolling up (auto-disables).
 *   - Click-to-jump: clicking a row publishes the corresponding `run_id`
 *     into `highlightedRunIdAtom`, which the ActivityHub page consumes to
 *     scroll the matching RunCard into view + apply a 1s pulse.
 *
 * The component is fully driven by props (events array + onJumpToRun callback)
 * so it stays testable and reusable outside the page if needed.
 */

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useAtom } from 'jotai'
import {
  ArrowDownToLine,
  Filter as FilterIcon,
  Pause,
  Play,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import type { ActivityEvent } from '@/types'
import {
  ALL_LOG_SEVERITIES,
  type ActivityLogSeverity,
  logAutoScrollAtom,
  logSearchAtom,
  logSeverityFilterAtom,
} from '@/atoms'
import { stripAnsi } from '@/utils/ansi'
import { LogLine } from './LogLine'

// ---------------------------------------------------------------------------
// Event → rendered row mapping
// ---------------------------------------------------------------------------

/** Row materialized from a single ActivityEvent — what the virtualizer renders. */
interface LogRow {
  /** Stable key — `seq` is monotonic across the EventBus. */
  key: number
  seq: number
  timestamp: string
  severity: ActivityLogSeverity
  /** Raw text (may include ANSI escapes). */
  text: string
  /** Short label (run_id/session_id/entity_id slice) shown as `[xxxx]`. */
  source: string
  /** Underlying run_id when the event belongs to a plan / protocol run. */
  runId: string | null
}

function shortId(id: string | undefined | null): string {
  if (!id) return ''
  return id.length > 8 ? id.slice(0, 8) : id
}

function eventToRow(evt: ActivityEvent): LogRow {
  switch (evt.kind) {
    case 'runner': {
      const e = evt.event
      const sev = runnerSeverity(e.event)
      return {
        key: evt.seq,
        seq: evt.seq,
        timestamp: evt.timestamp,
        severity: sev,
        text: runnerText(e),
        source: shortId(evt.run_id),
        runId: evt.run_id,
      }
    }
    case 'protocol_progress': {
      const sev: ActivityLogSeverity =
        evt.status === 'failed'
          ? 'error'
          : evt.status === 'completed'
            ? 'success'
            : evt.status === 'cancelled'
              ? 'warn'
              : 'info'
      const progress = evt.progress
        ? ` (${evt.progress.sub_action} ${evt.progress.processed}/${evt.progress.total})`
        : ''
      return {
        key: evt.seq,
        seq: evt.seq,
        timestamp: evt.timestamp,
        severity: sev,
        text: `protocol → ${evt.state_name} [${evt.current_state}]${progress}`,
        source: shortId(evt.run_id),
        runId: evt.run_id,
      }
    }
    case 'chat': {
      const e = evt.event
      const sev: ActivityLogSeverity = chatSeverity(e)
      return {
        key: evt.seq,
        seq: evt.seq,
        timestamp: evt.timestamp,
        severity: sev,
        text: chatText(e),
        source: shortId(evt.run_id ?? evt.session_id),
        runId: evt.run_id ?? null,
      }
    }
    case 'crud': {
      const action = evt.action
      const sev: ActivityLogSeverity = action === 'deleted' ? 'warn' : 'info'
      return {
        key: evt.seq,
        seq: evt.seq,
        timestamp: evt.timestamp,
        severity: sev,
        text: `${evt.entity_type} ${action} ${shortId(evt.entity_id)}`,
        source: shortId(evt.entity_id),
        runId: null,
      }
    }
    default: {
      // Exhaustiveness: a new ActivityEvent variant should be added above.
      const _exhaustive: never = evt
      void _exhaustive
      return {
        key: 0,
        seq: 0,
        timestamp: new Date().toISOString(),
        severity: 'debug',
        text: 'unknown event',
        source: '',
        runId: null,
      }
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function runnerSeverity(name: any): ActivityLogSeverity {
  if (typeof name !== 'string') return 'info'
  if (name.includes('failed') || name.includes('error') || name === 'cwd_mismatch')
    return 'error'
  if (name.includes('timeout') || name === 'budget_exceeded') return 'warn'
  if (name === 'plan_completed' || name === 'task_completed' || name === 'wave_completed')
    return 'success'
  return 'info'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function runnerText(e: any): string {
  const ev = e?.event
  switch (ev) {
    case 'plan_started':
      return `plan_started "${e.plan_title}" (${e.total_tasks} tasks, ${e.total_waves} waves)`
    case 'wave_started':
      return `wave_started #${e.wave_number} — ${e.task_count} task(s)`
    case 'task_started':
      return `task_started w${e.wave_number}: ${e.task_title}`
    case 'task_completed':
      return `task_completed: ${e.task_title} ($${e.cost_usd.toFixed(2)}, ${e.duration_secs}s)`
    case 'task_failed':
      return `task_failed: ${e.task_title} — ${e.reason} (attempt ${e.attempts})`
    case 'task_timeout':
      return `task_timeout: ${e.task_title} (${e.duration_secs}s)`
    case 'wave_completed':
      return `wave_completed #${e.wave_number}: ✓${e.tasks_completed} ✗${e.tasks_failed}`
    case 'plan_completed':
      return `plan_completed → ${e.status} ($${e.total_cost_usd?.toFixed?.(2) ?? 0}, ${e.total_duration_secs}s)`
    case 'budget_exceeded':
      return `budget_exceeded: $${e.cumulated_cost_usd?.toFixed?.(2) ?? 0} > $${e.limit_usd?.toFixed?.(2) ?? 0}`
    case 'runner_error':
      return `runner_error: ${e.message}`
    case 'cwd_mismatch':
      return `cwd_mismatch: ${e.cwd} ≠ ${e.root_path}`
    case 'lifecycle_transition':
      return `lifecycle: ${e.from_state} → ${e.to_state} (${e.trigger})`
    default:
      return ev ? String(ev) : 'runner_event'
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function chatSeverity(e: any): ActivityLogSeverity {
  const t = e?.type
  if (t === 'error' || t === 'session_error') return 'error'
  if (t === 'retrying' || t === 'compaction_started') return 'warn'
  if (t === 'result' && e.is_error) return 'error'
  if (t === 'result') return 'success'
  return 'info'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function chatText(e: any): string {
  const t = e?.type
  switch (t) {
    case 'user_message':
      return `user: ${truncate(e.content)}`
    case 'assistant_text':
      return `assistant: ${truncate(e.content)}`
    case 'thinking':
      return `thinking: ${truncate(e.content)}`
    case 'tool_use':
      return `tool_use: ${e.tool} ${shortId(e.id)}`
    case 'tool_result':
      return `tool_result: ${shortId(e.id)} ${e.is_error ? '(error)' : ''}`
    case 'permission_request':
      return `permission_request: ${e.tool}`
    case 'permission_decision':
      return `permission_decision: ${e.allow ? 'allow' : 'deny'} ${shortId(e.id)}`
    case 'error':
      return `error: ${e.message}`
    case 'result':
      return `result: ${e.is_error ? 'error' : 'ok'} (${e.duration_ms}ms${e.cost_usd ? `, $${e.cost_usd.toFixed(4)}` : ''})`
    case 'session_error':
      return `session_error: ${e.reason} — ${e.message}`
    case 'retrying':
      return `retrying ${e.attempt}/${e.max_attempts} in ${e.delay_ms}ms — ${e.error_message}`
    case 'system_init':
      return `system_init: ${e.model ?? ''} (${e.tools?.length ?? 0} tools)`
    case 'model_changed':
      return `model_changed → ${e.model}`
    case 'permission_mode_changed':
      return `permission_mode → ${e.mode}`
    case 'background_output':
      return `[bg ${e.source}] ${truncate(e.content)}`
    default:
      return t ? `chat ${t}` : 'chat_event'
  }
}

function truncate(s: string, max: number = 200): string {
  if (!s) return ''
  return s.length > max ? `${s.slice(0, max)}…` : s
}

// ---------------------------------------------------------------------------
// Custom fixed-row virtualization (no extra deps).
// ---------------------------------------------------------------------------

const ROW_HEIGHT = 20 // px — matches `text-[11px] leading-5` rows
const OVERSCAN = 8

interface VirtualListProps {
  rows: LogRow[]
  containerRef: React.RefObject<HTMLDivElement | null>
  highlightedRunId: string | null
  onJumpToRun?: (runId: string) => void
  autoScroll: boolean
  setAutoScroll: (v: boolean) => void
}

const VirtualList = memo(function VirtualList({
  rows,
  containerRef,
  highlightedRunId,
  onJumpToRun,
  autoScroll,
  setAutoScroll,
}: VirtualListProps) {
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(400)

  // Measure viewport once + on resize.
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    setViewportHeight(el.clientHeight)
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setViewportHeight(entry.contentRect.height)
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [containerRef])

  const onScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const target = e.currentTarget
      const top = target.scrollTop
      setScrollTop(top)
      // Detect user scroll-up → break out of auto-follow.
      const atBottom =
        target.scrollHeight - top - target.clientHeight < ROW_HEIGHT * 2
      if (autoScroll && !atBottom) {
        setAutoScroll(false)
      }
    },
    [autoScroll, setAutoScroll],
  )

  const total = rows.length
  const totalHeight = total * ROW_HEIGHT
  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
  const endIdx = Math.min(
    total,
    Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN,
  )
  const visible = rows.slice(startIdx, endIdx)
  const offsetY = startIdx * ROW_HEIGHT

  // Pin to bottom when auto-follow is on and new events arrive.
  useEffect(() => {
    if (!autoScroll) return
    const el = containerRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [autoScroll, total, containerRef])

  return (
    <div
      ref={containerRef}
      onScroll={onScroll}
      className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-black/40"
      role="log"
      aria-live="polite"
      aria-relevant="additions"
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div
          style={{
            transform: `translateY(${offsetY}px)`,
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
          }}
        >
          {visible.map((row) => (
            <div key={row.key} style={{ height: ROW_HEIGHT }}>
              <LogLine
                text={row.text}
                severity={row.severity}
                timestamp={row.timestamp}
                source={row.source}
                highlighted={
                  highlightedRunId != null && row.runId === highlightedRunId
                }
                onClick={
                  row.runId && onJumpToRun ? () => onJumpToRun(row.runId!) : undefined
                }
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
})

// ---------------------------------------------------------------------------
// ActivityLog component
// ---------------------------------------------------------------------------

export interface ActivityLogProps {
  /** Live events buffer — most recent last. */
  events: ActivityEvent[]
  /** Called when the user clicks a log line; receives the originating run_id. */
  onJumpToRun?: (runId: string) => void
  /** Optional handler to clear the buffer (page-level). */
  onClear?: () => void
  /** Total height of the panel (CSS dimension). Defaults to 240px. */
  height?: number | string
  /** Optional run_id to highlight (controlled by parent). */
  highlightedRunId?: string | null
  className?: string
}

const SEVERITY_BADGE: Record<ActivityLogSeverity, string> = {
  debug: 'bg-gray-500/20 text-gray-300',
  info: 'bg-blue-500/20 text-blue-300',
  warn: 'bg-amber-500/20 text-amber-300',
  error: 'bg-red-500/20 text-red-300',
  success: 'bg-green-500/20 text-green-300',
}

export function ActivityLog({
  events,
  onJumpToRun,
  onClear,
  height = 240,
  highlightedRunId = null,
  className = '',
}: ActivityLogProps) {
  const [search, setSearch] = useAtom(logSearchAtom)
  const [severities, setSeverities] = useAtom(logSeverityFilterAtom)
  const [autoScroll, setAutoScroll] = useAtom(logAutoScrollAtom)
  const containerRef = useRef<HTMLDivElement>(null)

  // Build rows once per `events` change. `eventToRow` is pure and cheap so
  // mapping the whole buffer is fine (cap = EVENT_BUFFER_CAP in the hook).
  const allRows = useMemo(() => events.map(eventToRow), [events])

  const lowerSearch = search.trim().toLowerCase()
  const sevFilterSet = useMemo(() => new Set(severities), [severities])
  const filteredRows = useMemo(() => {
    if (!lowerSearch && sevFilterSet.size === 0) return allRows
    return allRows.filter((r) => {
      if (sevFilterSet.size > 0 && !sevFilterSet.has(r.severity)) return false
      if (lowerSearch) {
        const haystack = (
          stripAnsi(r.text) +
          ' ' +
          r.source +
          ' ' +
          (r.runId ?? '')
        ).toLowerCase()
        if (!haystack.includes(lowerSearch)) return false
      }
      return true
    })
  }, [allRows, lowerSearch, sevFilterSet])

  const toggleSeverity = useCallback(
    (s: ActivityLogSeverity) => {
      setSeverities((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))
    },
    [setSeverities],
  )

  const totalLabel = `${filteredRows.length}${filteredRows.length !== events.length ? ` / ${events.length}` : ''}`

  return (
    <div
      className={`flex flex-col bg-surface-raised border border-border-subtle rounded-lg overflow-hidden ${className}`}
      style={{ height }}
      aria-label="Activity log"
    >
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-border-subtle bg-white/[0.02] flex-shrink-0">
        <FilterIcon className="w-3.5 h-3.5 text-gray-500" aria-hidden />
        <span className="text-[11px] uppercase tracking-widest text-gray-500 mr-1">Log</span>

        <span className="text-[11px] text-gray-400 tabular-nums">{totalLabel} events</span>

        {/* Severity chips */}
        <div className="flex items-center gap-1 ml-2">
          {ALL_LOG_SEVERITIES.map((s) => {
            const active = severities.includes(s) || severities.length === 0
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggleSeverity(s)}
                aria-pressed={severities.includes(s)}
                className={`
                  px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider transition-opacity
                  ${SEVERITY_BADGE[s]}
                  ${active ? 'opacity-100' : 'opacity-40'}
                `.replace(/\s+/g, ' ').trim()}
              >
                {s}
              </button>
            )
          })}
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-xs ml-auto">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" aria-hidden />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search log…"
            className="w-full pl-7 pr-7 py-1 bg-black/40 border border-border-default rounded text-[11px] text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500/40"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 text-gray-500 hover:text-gray-300"
              aria-label="Clear search"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Auto-scroll toggle */}
        <button
          type="button"
          onClick={() => setAutoScroll(!autoScroll)}
          aria-pressed={autoScroll}
          title={autoScroll ? 'Pause auto-scroll' : 'Resume auto-scroll'}
          className={`p-1 rounded transition-colors ${
            autoScroll
              ? 'text-green-400 hover:bg-white/[0.06]'
              : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.06]'
          }`}
        >
          {autoScroll ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
        </button>

        {/* Jump to bottom */}
        <button
          type="button"
          onClick={() => {
            const el = containerRef.current
            if (el) el.scrollTop = el.scrollHeight
            setAutoScroll(true)
          }}
          title="Jump to latest"
          className="p-1 rounded text-gray-400 hover:text-gray-200 hover:bg-white/[0.06]"
        >
          <ArrowDownToLine className="w-3.5 h-3.5" />
        </button>

        {onClear && (
          <button
            type="button"
            onClick={onClear}
            title="Clear log"
            className="p-1 rounded text-gray-500 hover:text-red-400 hover:bg-white/[0.06]"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Virtualized rows */}
      {filteredRows.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-gray-600 text-xs">
          {events.length === 0
            ? 'Waiting for activity…'
            : 'No events match the current filter.'}
        </div>
      ) : (
        <VirtualList
          rows={filteredRows}
          containerRef={containerRef}
          highlightedRunId={highlightedRunId}
          onJumpToRun={onJumpToRun}
          autoScroll={autoScroll}
          setAutoScroll={setAutoScroll}
        />
      )}
    </div>
  )
}

export default ActivityLog
