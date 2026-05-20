/**
 * ActivityHub — main page at `/workspace/:slug/activity` (the Live Activity Hub).
 *
 * Layout
 *   ┌────────────┬──────────────────────────────────────────────┐
 *   │            │  header (status + counts + refresh)          │
 *   │  sidebar   │──────────────────────────────────────────────│
 *   │  280px     │  responsive grid of RunCards (autofill,      │
 *   │            │  minmax 320px) — one card per active run /   │
 *   │            │  protocol / chat session                     │
 *   └────────────┴──────────────────────────────────────────────┘
 *
 * The page is fully driven by:
 *   - `activityFiltersAtom`   → derived filters payload (project + entity_types + statuses)
 *   - `useActivityStream`     → REST snapshot + WS subscription
 *   - `timeRangeAtom`         → client-side cutoff applied to `RunState.started_at`
 *
 * Event-replay strategy
 *   The hook already handles snapshot → WS chained bootstrap (load_start →
 *   load_success → ws_status). We just surface its `status` in the header so
 *   the user knows whether they're seeing a stale snapshot or live deltas.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { useSearchParams } from 'react-router-dom'
import { Activity as ActivityIcon, RefreshCw, AlertCircle, Sparkles } from 'lucide-react'
import {
  activityFiltersAtom,
  highlightedRunIdAtom,
  particleOverlayEnabledAtom,
  selectedEntityTypesAtom,
  selectedProjectIdAtom,
  selectedStatusesAtom,
  timeRangeAtom,
  timeRangeCutoffMs,
  type ActivityEntityKind,
  type ActivityStatusFilter,
} from '@/atoms'
import { Button, EmptyState, PageShell, Spinner } from '@/components/ui'
import {
  ActivityLog,
  ActivityParticleOverlay,
  ActivitySidebar,
  RunCard,
  type RunCardItem,
} from '@/components/activity'
import { useActivityStream } from '@/hooks/useActivityStream'
import type { RunState } from '@/hooks/useActivityStream'
import type { ChatSessionSummary, PlanRunSummary, ProtocolRunSummary } from '@/types'

// ---------------------------------------------------------------------------
// Filtering helpers
// ---------------------------------------------------------------------------

function statusMatches(status: string, filter: ActivityStatusFilter[]): boolean {
  if (filter.length === 0) return true
  return filter.includes(status as ActivityStatusFilter)
}

function entityMatches(kind: ActivityEntityKind, filter: ActivityEntityKind[]): boolean {
  if (filter.length === 0) return true
  return filter.includes(kind)
}

function startedAfter(startedAt: string | undefined, cutoffMs: number | null): boolean {
  if (cutoffMs == null) return true
  if (!startedAt) return true // unknown start time → don't filter out
  const t = Date.parse(startedAt)
  if (Number.isNaN(t)) return true
  return t >= cutoffMs
}

// ---------------------------------------------------------------------------
// Build the ordered list of `RunCardItem`s
// ---------------------------------------------------------------------------

interface BuildItemsArgs {
  runs: Map<string, RunState>
  planSummaries: PlanRunSummary[]
  protocolSummaries: ProtocolRunSummary[]
  chatSessions: ChatSessionSummary[]
  entityFilter: ActivityEntityKind[]
  statusFilter: ActivityStatusFilter[]
  cutoffMs: number | null
}

function buildItems({
  runs,
  planSummaries,
  protocolSummaries,
  chatSessions,
  entityFilter,
  statusFilter,
  cutoffMs,
}: BuildItemsArgs): RunCardItem[] {
  const items: RunCardItem[] = []

  // Index summaries by id so we can stitch plan_id / protocol_id back onto
  // the live RunState (which is keyed by run_id only).
  const planIndex = new Map(planSummaries.map((p) => [p.run_id, p]))
  const protocolIndex = new Map(protocolSummaries.map((p) => [p.id, p]))

  for (const run of runs.values()) {
    const kind: ActivityEntityKind = run.kind === 'protocol' ? 'protocol' : 'plan'
    if (!entityMatches(kind, entityFilter)) continue
    if (!statusMatches(run.status, statusFilter)) continue
    if (!startedAfter(run.started_at, cutoffMs)) continue

    if (run.kind === 'protocol') {
      const summary = protocolIndex.get(run.run_id)
      items.push({
        type: 'protocol',
        run,
        protocolId: summary?.protocol_id ?? null,
      })
    } else {
      const summary = planIndex.get(run.run_id)
      items.push({
        type: 'plan',
        run,
        planId: summary?.plan_id ?? null,
      })
    }
  }

  // Chat sessions live outside the runs Map — they come from the snapshot
  // and only the WS chat events refresh them (no aggregated state yet).
  if (entityMatches('chat', entityFilter)) {
    for (const session of chatSessions) {
      if (!startedAfter(session.updated_at, cutoffMs)) continue
      items.push({ type: 'chat', session })
    }
  }

  // Stable ordering: running first, then by recency.
  return items.sort((a, b) => {
    const aRunning = isItemRunning(a) ? 0 : 1
    const bRunning = isItemRunning(b) ? 0 : 1
    if (aRunning !== bRunning) return aRunning - bRunning
    const aTs = itemTimestamp(a)
    const bTs = itemTimestamp(b)
    return bTs - aTs
  })
}

function isItemRunning(item: RunCardItem): boolean {
  if (item.type === 'chat') return false
  return item.run.status === 'running'
}

function itemTimestamp(item: RunCardItem): number {
  const iso = item.type === 'chat' ? item.session.updated_at : item.run.started_at
  if (!iso) return 0
  const t = Date.parse(iso)
  return Number.isNaN(t) ? 0 : t
}

// ---------------------------------------------------------------------------
// Status header strip
// ---------------------------------------------------------------------------

function StreamStatusBadge({ status, error }: { status: string; error: string | null }) {
  if (status === 'error' && error) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-red-500/15 text-red-300 text-xs">
        <AlertCircle className="w-3.5 h-3.5" />
        {error}
      </span>
    )
  }
  if (status === 'loading') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/[0.06] text-gray-400 text-xs">
        <Spinner size="sm" />
        Loading snapshot…
      </span>
    )
  }
  if (status === 'reconnecting') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-500/15 text-amber-300 text-xs">
        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
        Reconnecting…
      </span>
    )
  }
  if (status === 'live') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-green-500/15 text-green-300 text-xs">
        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
        Live
      </span>
    )
  }
  return null
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export function ActivityHub() {
  // Sync `?project=<id>` URL param into the atom so deep links work and
  // tray/sidebar navigation can pre-select a project.
  const [searchParams, setSearchParams] = useSearchParams()
  const [projectId, setProjectId] = useAtom(selectedProjectIdAtom)
  useEffect(() => {
    const urlProject = searchParams.get('project')
    if (urlProject && urlProject !== projectId) {
      setProjectId(urlProject)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])
  // Mirror the atom back into the URL so refreshes preserve the selection.
  useEffect(() => {
    const urlProject = searchParams.get('project')
    if (projectId && urlProject !== projectId) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.set('project', projectId)
          return next
        },
        { replace: true },
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  const filters = useAtomValue(activityFiltersAtom)
  const entityFilter = useAtomValue(selectedEntityTypesAtom)
  const statusFilter = useAtomValue(selectedStatusesAtom)
  const range = useAtomValue(timeRangeAtom)

  const { snapshot, runs, events, status, error, resync } = useActivityStream(filters)

  // ── Click-to-jump from ActivityLog → matching RunCard ────────────────────
  // The log line publishes a run_id; we resolve the card via `data-run-id` on
  // the wrapper, scroll it into view, and apply a 1s pulse class.
  const gridRef = useRef<HTMLDivElement>(null)
  const [highlightedRunId, setHighlightedRunId] = useAtom(highlightedRunIdAtom)
  const [particleEnabled, setParticleEnabled] = useAtom(particleOverlayEnabledAtom)
  const handleJumpToRun = useCallback(
    (runId: string) => {
      const grid = gridRef.current
      if (!grid) return
      const escaped = runId.replace(/["\\]/g, '\\$&')
      const card = grid.querySelector<HTMLElement>(`[data-run-id="${escaped}"]`)
      if (!card) return
      card.scrollIntoView({ behavior: 'smooth', block: 'center' })
      // Remove any leftover pulse before re-applying — restart animation.
      card.classList.remove('activity-jump-pulse')
      // Force a reflow so the class re-addition restarts the animation.
      void card.offsetWidth
      card.classList.add('activity-jump-pulse')
      setHighlightedRunId(runId)
      window.setTimeout(() => {
        card.classList.remove('activity-jump-pulse')
        setHighlightedRunId((prev) => (prev === runId ? null : prev))
      }, 1100)
    },
    [setHighlightedRunId],
  )

  // Trigger a re-evaluation of the cutoff every minute so the time-range
  // filter doesn't silently drift on long-running sessions.
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000)
    return () => clearInterval(id)
  }, [])
  const cutoffMs = useMemo(() => timeRangeCutoffMs(range), [range, tick])

  const items = useMemo(
    () =>
      buildItems({
        runs,
        planSummaries: snapshot.plan_runs,
        protocolSummaries: snapshot.protocol_runs,
        chatSessions: snapshot.chat_sessions,
        entityFilter,
        statusFilter,
        cutoffMs,
      }),
    [runs, snapshot, entityFilter, statusFilter, cutoffMs],
  )

  // Pre-computed counts surfaced in the sidebar summary
  const counts = useMemo(() => {
    let plans = 0
    let protocols = 0
    let chats = 0
    for (const item of items) {
      if (item.type === 'plan') plans++
      else if (item.type === 'protocol') protocols++
      else chats++
    }
    return { plans, protocols, chats }
  }, [items])

  return (
    <PageShell
      title="Activity"
      description="Live view of plan runs, protocol FSMs, and chat sessions"
      actions={
        <div className="flex items-center gap-2">
          <StreamStatusBadge status={status} error={error} />
          <Button
            variant="ghost"
            onClick={() => setParticleEnabled(!particleEnabled)}
            aria-pressed={particleEnabled}
            title={particleEnabled ? 'Disable particle overlay' : 'Enable particle overlay'}
          >
            <Sparkles
              className={`w-4 h-4 mr-1.5 ${particleEnabled ? 'text-indigo-300' : 'text-gray-500'}`}
            />
            Particles
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              void resync()
            }}
          >
            <RefreshCw className="w-4 h-4 mr-1.5" /> Refresh
          </Button>
        </div>
      }
    >
      <div
        className="grid gap-4 min-h-[60vh]"
        style={{ gridTemplateColumns: 'minmax(0, 280px) minmax(0, 1fr)' }}
      >
        {/* Sidebar — sticky on desktop, stacked on mobile */}
        <div className="hidden md:block">
          <ActivitySidebar
            summary={
              <div className="space-y-0.5">
                <div>
                  <span className="text-indigo-300 font-medium">{counts.plans}</span> plan run{counts.plans !== 1 ? 's' : ''}
                </div>
                <div>
                  <span className="text-purple-300 font-medium">{counts.protocols}</span> protocol run{counts.protocols !== 1 ? 's' : ''}
                </div>
                <div>
                  <span className="text-emerald-300 font-medium">{counts.chats}</span> chat session{counts.chats !== 1 ? 's' : ''}
                </div>
              </div>
            }
          />
        </div>

        {/* Mobile: condensed sidebar */}
        <details className="md:hidden col-span-full bg-surface-raised border border-border-subtle rounded-lg">
          <summary className="px-3 py-2 text-sm text-gray-200 cursor-pointer">
            Filters ({counts.plans + counts.protocols + counts.chats} items)
          </summary>
          <div className="p-2">
            <ActivitySidebar />
          </div>
        </details>

        {/* Main grid */}
        <section className="min-w-0">
          {status === 'loading' && items.length === 0 ? (
            <div className="flex items-center justify-center h-[60vh] text-gray-400">
              <Spinner /> <span className="ml-2 text-sm">Loading initial snapshot…</span>
            </div>
          ) : !filters ? (
            <EmptyState
              title="Pick a project"
              description="Select a project in the sidebar to see live activity."
              icon={<ActivityIcon className="w-8 h-8 text-gray-500" />}
            />
          ) : items.length === 0 ? (
            <EmptyState
              title="No active runs"
              description={
                statusFilter.length > 0 || entityFilter.length > 0
                  ? 'Try adjusting the filters in the sidebar.'
                  : 'When a plan, protocol, or chat session starts, it will appear here in real time.'
              }
              icon={<ActivityIcon className="w-8 h-8 text-gray-500" />}
            />
          ) : (
            <div className="relative">
              <div
                ref={gridRef}
                className="grid gap-3 relative"
                style={{
                  gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                }}
              >
                {items.map((item) => {
                  const id =
                    item.type === 'chat'
                      ? item.session.id
                      : item.run.run_id
                  const key =
                    item.type === 'chat' ? `chat:${id}` : `${item.type}:${id}`
                  return (
                    <div key={key} data-run-id={id} className="min-w-0">
                      <RunCard item={item} />
                    </div>
                  )
                })}
                <ActivityParticleOverlay events={events} gridRef={gridRef} />
              </div>
            </div>
          )}

          {/* Bottom panel — central activity log (terminal-style, ANSI-aware). */}
          <div className="mt-4">
            <ActivityLog
              events={events}
              onJumpToRun={handleJumpToRun}
              highlightedRunId={highlightedRunId}
              height={260}
            />
          </div>
        </section>
      </div>
    </PageShell>
  )
}

export default ActivityHub
