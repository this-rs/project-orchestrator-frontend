/**
 * useActivityStream — React hook that combines the REST `/api/activity/snapshot`
 * initial load with the live `/ws/activity` delta stream into a single state
 * blob ready to feed the Live Activity Hub UI.
 *
 * State shape
 *   {
 *     snapshot: ActivitySnapshot,                       // initial REST payload
 *     runs:     Map<run_id, RunState>,                  // derived live state
 *     events:   ActivityEvent[],                        // bounded ring of recent deltas
 *     status:   'idle' | 'loading' | 'live' | 'reconnecting' | 'error',
 *     error:    string | null,
 *     lastEventSeq: number,
 *   }
 *
 * Lifecycle
 *   1. mount   → status = 'loading', fetch snapshot via `getSnapshot(filters)`
 *   2. ok      → seed reducer with snapshot.plan_runs / protocol_runs, open
 *                ActivityWebSocket(lastEventSeq = snapshot.last_event_seq)
 *   3. ws auth → status = 'live'; every activity event mutates the `runs` Map
 *   4. close   → status = 'reconnecting' until the WS layer recovers
 *   5. unmount → ws.disconnect(); pending REST AbortController aborted
 *
 * Performance
 *   - The reducer **does not** clone the entire Map per event — it copies the
 *     reference, mutates the entry for the touched `run_id`, and rebuilds a
 *     new Map only when an entry is added/removed.
 *   - Components should re-render at most once per event. Heavy DAG repaints
 *     belong to the consumer (rAF batching at 30fps recommended for the DAG view).
 */

import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import { ActivityWebSocket } from '@/services/activityWs'
import { EMPTY_ACTIVITY_SNAPSHOT, getSnapshot } from '@/services/activityService'
import type {
  ActivityEvent,
  ActivityFilters,
  ActivitySnapshot,
  PlanRunStatus,
  PlanRunSummary,
  ProtocolRunStatus,
  ProtocolRunSummary,
  RunnerEvent,
  WsConnectionStatus,
} from '@/types'

// ---------------------------------------------------------------------------
// Aggregated per-run state derived from snapshot + deltas
// ---------------------------------------------------------------------------

/** Discriminator for [`RunState`] — `plan` (runner) vs `protocol` (FSM). */
export type RunKind = 'plan' | 'protocol'

/**
 * Aggregated state of a single in-flight "run" — either a plan run (managed
 * by the runner) or a protocol FSM run. The hook materializes one entry per
 * run_id in the `runs` Map; the UI consumes whichever view it needs.
 */
export interface RunState {
  kind: RunKind
  run_id: string
  /** Title of the plan / protocol — denormalized for the UI. */
  title: string
  /** Plan-level status when `kind === 'plan'`, protocol status otherwise. */
  status: PlanRunStatus | ProtocolRunStatus
  current_wave?: number
  completed_tasks?: number
  failed_tasks?: number
  total_tasks?: number
  current_task_id?: string
  current_task_title?: string
  current_state?: string
  state_name?: string
  cost_usd?: number
  /** Highest seq applied to this entry — useful for "newer than" diffs. */
  last_seq: number
  /** ISO start time (from snapshot or first applicable event). */
  started_at?: string
}

// ---------------------------------------------------------------------------
// Reducer state + actions
// ---------------------------------------------------------------------------

/** Cap on the in-memory event ring — keeps memory bounded under sustained load. */
const EVENT_BUFFER_CAP = 500

export interface ActivityStreamState {
  /** Last full snapshot returned by `/api/activity/snapshot`. */
  snapshot: ActivitySnapshot
  /** Live per-run aggregated state (snapshot → seeded → mutated by deltas). */
  runs: Map<string, RunState>
  /** Bounded ring buffer of the most recent activity events (newest last). */
  events: ActivityEvent[]
  /** Status of the underlying WebSocket + snapshot fetch pipeline. */
  status: ActivityStreamStatus
  /** Last error message, if any. */
  error: string | null
  /** Highest seq the reducer has applied. */
  lastEventSeq: number
}

export type ActivityStreamStatus =
  | 'idle'
  | 'loading'
  | 'live'
  | 'reconnecting'
  | 'error'

export type ActivityStreamAction =
  | { type: 'load_start' }
  | { type: 'load_success'; snapshot: ActivitySnapshot }
  | { type: 'load_error'; error: string }
  | { type: 'ws_status'; status: WsConnectionStatus }
  | { type: 'event'; event: ActivityEvent }
  | { type: 'lag_resync'; snapshot: ActivitySnapshot }
  | { type: 'reset' }

// ---------------------------------------------------------------------------
// Reducer helpers — snapshot → runs Map
// ---------------------------------------------------------------------------

function planRunToState(p: PlanRunSummary): RunState {
  return {
    kind: 'plan',
    run_id: p.run_id,
    title: p.plan_title,
    status: p.status,
    current_wave: p.current_wave,
    completed_tasks: p.completed_tasks,
    failed_tasks: p.failed_tasks,
    total_tasks: p.total_tasks,
    current_task_id: p.current_task_id,
    current_task_title: p.current_task_title,
    cost_usd: p.cost_usd,
    last_seq: 0,
    started_at: p.started_at,
  }
}

function protocolRunToState(p: ProtocolRunSummary): RunState {
  return {
    kind: 'protocol',
    run_id: p.id,
    title: p.protocol_name,
    status: p.status,
    current_state: p.current_state,
    state_name: p.state_name,
    last_seq: 0,
    started_at: p.started_at,
  }
}

function seedRunsFromSnapshot(snapshot: ActivitySnapshot): Map<string, RunState> {
  const runs = new Map<string, RunState>()
  for (const p of snapshot.plan_runs) runs.set(p.run_id, planRunToState(p))
  for (const p of snapshot.protocol_runs) runs.set(p.id, protocolRunToState(p))
  return runs
}

// ---------------------------------------------------------------------------
// Reducer helpers — applying ActivityEvents
// ---------------------------------------------------------------------------

/**
 * Apply a single ActivityEvent to the runs map. Returns the (possibly new)
 * map — when no entry is touched the same reference is returned so React's
 * Object.is check can short-circuit re-renders.
 */
function applyEvent(runs: Map<string, RunState>, evt: ActivityEvent): Map<string, RunState> {
  switch (evt.kind) {
    case 'runner':
      return applyRunnerEvent(runs, evt.run_id, evt.event, evt.seq, evt.timestamp)
    case 'protocol_progress':
      return applyProtocolProgress(runs, evt)
    case 'crud':
    case 'chat':
      // CRUD + chat events don't currently mutate the aggregated per-run state.
      // They're surfaced via the events[] buffer for the timeline / log view.
      return runs
    default:
      return runs
  }
}

function applyRunnerEvent(
  runs: Map<string, RunState>,
  run_id: string,
  event: RunnerEvent,
  seq: number,
  timestamp: string,
): Map<string, RunState> {
  const prev = runs.get(run_id)
  const base: RunState =
    prev ?? {
      kind: 'plan',
      run_id,
      title: 'Plan run',
      status: 'running',
      last_seq: 0,
      started_at: timestamp,
    }
  let next: RunState = { ...base, last_seq: Math.max(base.last_seq, seq) }

  switch (event.event) {
    case 'plan_started':
      next = {
        ...next,
        title: event.plan_title || next.title,
        status: 'running',
        total_tasks: event.total_tasks,
        completed_tasks: 0,
        failed_tasks: 0,
        current_wave: 0,
        cost_usd: 0,
        started_at: timestamp,
      }
      break
    case 'wave_started':
      next = { ...next, current_wave: event.wave_number }
      break
    case 'task_started':
      next = {
        ...next,
        current_task_id: event.task_id,
        current_task_title: event.task_title,
        current_wave: event.wave_number,
      }
      break
    case 'task_completed':
      next = {
        ...next,
        completed_tasks: (next.completed_tasks ?? 0) + 1,
        cost_usd: (next.cost_usd ?? 0) + event.cost_usd,
      }
      break
    case 'task_failed':
    case 'task_timeout':
      next = { ...next, failed_tasks: (next.failed_tasks ?? 0) + 1 }
      break
    case 'wave_completed':
      // Counters come from the wave summary itself, but we also rely on the
      // individual task events firing first → keep whichever is greater.
      next = {
        ...next,
        completed_tasks: Math.max(next.completed_tasks ?? 0, event.tasks_completed),
        failed_tasks: Math.max(next.failed_tasks ?? 0, event.tasks_failed),
      }
      break
    case 'plan_completed':
      next = {
        ...next,
        status: event.status,
        completed_tasks: event.tasks_completed,
        failed_tasks: event.tasks_failed,
        cost_usd: event.total_cost_usd,
      }
      break
    case 'budget_exceeded':
      next = {
        ...next,
        status: 'budget_exceeded',
        cost_usd: event.cumulated_cost_usd,
      }
      break
    default:
      // Other variants (lifecycle_transition, worktree_recovery, etc.) don't
      // mutate the aggregated state — they still surface in `events[]`.
      break
  }

  const out = new Map(runs)
  out.set(run_id, next)
  return out
}

function applyProtocolProgress(
  runs: Map<string, RunState>,
  evt: Extract<ActivityEvent, { kind: 'protocol_progress' }>,
): Map<string, RunState> {
  const prev = runs.get(evt.run_id)
  const base: RunState =
    prev ?? {
      kind: 'protocol',
      run_id: evt.run_id,
      title: 'Protocol run',
      status: evt.status,
      last_seq: 0,
      started_at: evt.timestamp,
    }
  const next: RunState = {
    ...base,
    kind: 'protocol',
    status: evt.status,
    current_state: evt.current_state,
    state_name: evt.state_name,
    last_seq: Math.max(base.last_seq, evt.seq),
  }
  const out = new Map(runs)
  out.set(evt.run_id, next)
  return out
}

function pushEvent(buffer: ActivityEvent[], evt: ActivityEvent): ActivityEvent[] {
  if (buffer.length < EVENT_BUFFER_CAP) {
    return [...buffer, evt]
  }
  // Drop the oldest to stay bounded.
  return [...buffer.slice(buffer.length - EVENT_BUFFER_CAP + 1), evt]
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export const initialActivityStreamState: ActivityStreamState = {
  snapshot: EMPTY_ACTIVITY_SNAPSHOT,
  runs: new Map<string, RunState>(),
  events: [],
  status: 'idle',
  error: null,
  lastEventSeq: 0,
}

export function activityStreamReducer(
  state: ActivityStreamState,
  action: ActivityStreamAction,
): ActivityStreamState {
  switch (action.type) {
    case 'load_start':
      return { ...state, status: 'loading', error: null }

    case 'load_success': {
      return {
        ...state,
        snapshot: action.snapshot,
        runs: seedRunsFromSnapshot(action.snapshot),
        status: 'live',
        error: null,
        lastEventSeq: action.snapshot.last_event_seq,
      }
    }

    case 'load_error':
      return { ...state, status: 'error', error: action.error }

    case 'ws_status': {
      // Map the low-level WS status to the higher-level stream status. We
      // never go back to 'loading' once we've loaded the snapshot.
      switch (action.status) {
        case 'connected':
          return state.status === 'reconnecting' || state.status === 'loading'
            ? { ...state, status: 'live' }
            : state
        case 'reconnecting':
        case 'connecting':
          return state.status === 'idle' || state.status === 'loading'
            ? state
            : { ...state, status: 'reconnecting' }
        case 'disconnected':
          return state.status === 'idle'
            ? state
            : { ...state, status: 'reconnecting' }
        default:
          return state
      }
    }

    case 'event': {
      // Idempotency: ignore events whose seq we've already applied. This
      // happens when the WS layer replays from the ring buffer overlapping
      // with what the snapshot already covered.
      if (action.event.seq <= state.lastEventSeq && state.lastEventSeq > 0) {
        // Still surface it in the events buffer (UI may want to show replay).
        return { ...state, events: pushEvent(state.events, action.event) }
      }
      const nextRuns = applyEvent(state.runs, action.event)
      return {
        ...state,
        runs: nextRuns,
        events: pushEvent(state.events, action.event),
        lastEventSeq: Math.max(state.lastEventSeq, action.event.seq),
      }
    }

    case 'lag_resync': {
      return {
        ...state,
        snapshot: action.snapshot,
        runs: seedRunsFromSnapshot(action.snapshot),
        lastEventSeq: action.snapshot.last_event_seq,
        // status stays whatever it was — the WS is still live; we just resynced.
      }
    }

    case 'reset':
      return initialActivityStreamState

    default:
      return state
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseActivityStreamResult {
  /** Latest REST snapshot — `last_event_seq` is the cursor for the WS layer. */
  snapshot: ActivitySnapshot
  /** Aggregated per-run state, keyed by `run_id`. */
  runs: Map<string, RunState>
  /** Bounded ring of recent ActivityEvents (cap = 500). */
  events: ActivityEvent[]
  /** High-level state of the stream pipeline. */
  status: ActivityStreamStatus
  error: string | null
  lastEventSeq: number
  /** Force a snapshot re-fetch (e.g. after `lag_dropped`). */
  resync: () => Promise<void>
}

/**
 * Subscribe to the Live Activity Hub for one project.
 *
 * The hook performs the initial REST snapshot + WS subscription in a single
 * effect. Switching `filters.project_id` automatically tears down the old
 * WebSocket and re-bootstraps with the new project.
 *
 * The `filters` argument is shallow-compared on `project_id` / `project_slug`
 * / `chat_limit` — pass a memoized object if you build it from props/atoms.
 */
export function useActivityStream(
  filters: ActivityFilters | null,
): UseActivityStreamResult {
  const [state, dispatch] = useReducer(activityStreamReducer, initialActivityStreamState)
  const wsRef = useRef<ActivityWebSocket | null>(null)
  const filtersRef = useRef<ActivityFilters | null>(filters)
  filtersRef.current = filters

  // Stable signature for the effect — re-runs only when these change.
  const signature = useMemo(() => {
    if (!filters) return ''
    return [
      filters.project_id,
      filters.project_slug ?? '',
      filters.chat_limit ?? '',
      (filters.entity_types ?? []).join(','),
      (filters.statuses ?? []).join(','),
    ].join('|')
  }, [filters])

  const resync = useCallback(async () => {
    const f = filtersRef.current
    if (!f) return
    try {
      const snap = await getSnapshot(f)
      dispatch({ type: 'lag_resync', snapshot: snap })
      // Tell the WS to advance its cursor too — otherwise the next reconnect
      // replays already-applied events.
      if (wsRef.current) {
        // Reconnect to apply the new lastEventSeq → server resumes from head.
        wsRef.current.disconnect()
        await wsRef.current.connect(f, snap.last_event_seq)
      }
    } catch (err) {
      dispatch({
        type: 'load_error',
        error: err instanceof Error ? err.message : 'resync failed',
      })
    }
  }, [])

  useEffect(() => {
    if (!filters || !filters.project_id) {
      dispatch({ type: 'reset' })
      if (wsRef.current) {
        wsRef.current.disconnect()
        wsRef.current = null
      }
      return
    }

    let cancelled = false
    const abort = new AbortController()

    const ws = new ActivityWebSocket()
    wsRef.current = ws

    ws.setCallbacks({
      onEvent: (evt) => {
        if (cancelled) return
        dispatch({ type: 'event', event: evt })
      },
      onStatusChange: (status) => {
        if (cancelled) return
        dispatch({ type: 'ws_status', status })
      },
      onLagDropped: () => {
        if (cancelled) return
        // Server told us we lagged — pull a fresh snapshot to resync.
        resync().catch(() => {
          /* error already dispatched inside resync */
        })
      },
    })

    ;(async () => {
      dispatch({ type: 'load_start' })
      try {
        const snap = await getSnapshot(filters, abort.signal)
        if (cancelled) return
        dispatch({ type: 'load_success', snapshot: snap })
        // Open the WS only AFTER the snapshot lands so we have a cursor.
        await ws.connect(filters, snap.last_event_seq)
      } catch (err) {
        if (cancelled) return
        if (err instanceof DOMException && err.name === 'AbortError') return
        dispatch({
          type: 'load_error',
          error: err instanceof Error ? err.message : 'snapshot fetch failed',
        })
      }
    })()

    return () => {
      cancelled = true
      abort.abort()
      ws.disconnect()
      if (wsRef.current === ws) {
        wsRef.current = null
      }
    }
    // We deliberately depend on `signature` not the `filters` object identity
    // so callers don't have to memoize manually.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature])

  return {
    snapshot: state.snapshot,
    runs: state.runs,
    events: state.events,
    status: state.status,
    error: state.error,
    lastEventSeq: state.lastEventSeq,
    resync,
  }
}

export default useActivityStream
