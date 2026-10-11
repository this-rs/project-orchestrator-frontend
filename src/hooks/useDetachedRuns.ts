import { useCallback, useEffect, useRef, useState } from 'react'
import type { CostBasis } from '@/types/provider'
import { getEventBus } from '@/services'
import { chatApi } from '@/services/chat'
import type { CrudEvent, DetachedSession } from '@/types'
import { normalizeActivity } from '@/components/chat/sessionActivity'
import { readSpawnedBy, spawnedByParentId, spawnedByPlanId, spawnedByRunId, spawnedByToolUseId } from '@/utils/spawnedBy'

/** Info about an active detached run (child session or plan runner task) */
export interface DetachedRun {
  sessionId: string
  title: string
  model: string
  isStreaming: boolean
  costUsd?: number
  /** Where `costUsd` comes from. Absent = `reported`. */
  costBasis?: CostBasis | null
  /** Provider instance of the child. Absent = Claude Code. */
  providerId?: string | null
  startedAt: string
  /**
   * The plan this child works on, when its origin names one. Only a
   * `delegation` carries a `plan_id`: a runner/pipeline/gate child names its
   * `task_id` and its `run_id`. Reading `plan_id` off a `runner` origin, as this
   * hook used to, left `planId` undefined on every single child.
   */
  planId?: string
  /** The run this child belongs to (runner, pipeline, gate, triggered run). */
  runId?: string
  /** The task this child was opened for, when its origin names one. */
  taskId?: string
  /**
   * The parent's `Agent` tool-call id, for a child opened by a native-harness
   * sub-agent call. The sub-agent card joins on this.
   */
  toolUseId?: string
}

interface UseDetachedRunsResult {
  /** Active detached runs for this session */
  runs: DetachedRun[]
  /** Whether at least one run is currently streaming */
  hasActiveRuns: boolean
  /** Loading state for the initial fetch */
  isLoading: boolean
  /** Re-fetch children from the API */
  refresh: () => void
}

interface UseDetachedRunsOptions {
  /**
   * Any value that changes when the PARENT's own stream says a child may have
   * finished: an `Agent` call got its answer, or the parent's turn ended (see
   * `subagentSettleSignal`). Each change schedules one debounced refetch.
   *
   * Needed because a native-harness child (`agent_runtime`) sends no CRUD
   * `updated {is_streaming}` on backend main — only its own session's
   * `streaming_status` — so a child fetched mid-turn would otherwise stay
   * "running" until an unrelated `created` or a remount.
   */
  settleSignal?: string | number
}

export function toDetachedRun(s: DetachedSession): DetachedRun {
  const spawnedBy = readSpawnedBy(s.spawned_by)
  return {
    sessionId: s.id,
    title: s.title || `Run ${s.id.slice(0, 8)}`,
    model: s.model,
    // The children endpoint returns `ChatSession`, which says whether a child is
    // working only through `activity` — omitted when it is quiet. There is no
    // `is_streaming` on this response: reading it made every listed child look
    // finished, including one whose turn had just started.
    isStreaming: normalizeActivity(s.activity).streaming,
    costUsd: s.total_cost_usd,
    costBasis: s.cost_basis,
    providerId: s.provider_id,
    startedAt: s.created_at,
    planId: spawnedByPlanId(spawnedBy),
    runId: spawnedByRunId(spawnedBy),
    taskId: spawnedBy && 'task_id' in spawnedBy ? spawnedBy.task_id : undefined,
    toolUseId: spawnedByToolUseId(spawnedBy),
  }
}

/** Every field of a run, listed so that adding one to `DetachedRun` fails to compile here until it is compared. */
const RUN_FIELDS = [
  'sessionId', 'title', 'model', 'isStreaming', 'costUsd', 'costBasis', 'providerId',
  'startedAt', 'planId', 'runId', 'taskId', 'toolUseId',
] as const satisfies readonly (keyof DetachedRun)[]
type MissingRunField = Exclude<keyof DetachedRun, (typeof RUN_FIELDS)[number]>
// Compile-time check: every `DetachedRun` key is in RUN_FIELDS.
const RUN_FIELDS_COMPLETE: MissingRunField extends never ? true : never = true
void RUN_FIELDS_COMPLETE

function sameRun(a: DetachedRun, b: DetachedRun): boolean {
  return RUN_FIELDS.every((k) => a[k] === b[k])
}

/** Same runs, field for field: a refetch that changed nothing keeps the old array (and its identity). */
function sameRuns(a: readonly DetachedRun[], b: readonly DetachedRun[]): boolean {
  return a.length === b.length && a.every((run, i) => sameRun(run, b[i]))
}

/** How long a burst of unrelated `created` events may coalesce into one fetch. */
const CREATED_FETCH_DEBOUNCE_MS = 250

/**
 * Hook that tracks detached child sessions for a given parent session.
 * Combines:
 * 1. Initial fetch via chatApi.getSessionChildren
 * 2. Real-time updates via CrudEvents (chat_session entity_type)
 *
 * Returns the list of detached runs with streaming status.
 */
export function useDetachedRuns(sessionId: string | null, options: UseDetachedRunsOptions = {}): UseDetachedRunsResult {
  const { settleSignal } = options
  const [runs, setRuns] = useState<DetachedRun[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const sessionIdRef = useRef(sessionId)
  sessionIdRef.current = sessionId

  // Generation counter: every call to `fetchChildren` takes a ticket, and only
  // the ticket matching the CURRENT value when its response lands may write
  // `runs`. Today's backend sends no `spawned_by` on the `created` CRUD event
  // (see the comment below), so the fallback fetch fires for every session
  // created anywhere in the deployment — a pipeline wave opening N sessions
  // means N concurrent requests. Without this guard the LAST RESPONSE TO LAND
  // wins, not the last one sent: an earlier, shorter list resolving after a
  // later one would rewrite `runs` backwards and make a just-created child
  // disappear again.
  const requestIdRef = useRef(0)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Which session the CURRENT `runs` state actually belongs to. `sessionIdRef`
  // only says which session is being VIEWED right now, which on a failed
  // fetch is not the same question: a transient failure refetching for the
  // session already on screen should keep showing its (still honest) old
  // list, but a failure refetching for a session we just switched to must
  // not keep showing the PREVIOUS session's children under the new one.
  const runsSessionIdRef = useRef<string | null>(null)

  // Children seen to FINISH (`updated {is_streaming: false}`) while the latest
  // fetch is IN FLIGHT. The CRUD channel and the HTTP answer are not ordered
  // with respect to each other, so an event that lands during the fetch may be
  // older OR newer than the answer. Only a `false` is kept: applied late it is
  // never wrong for long (a child that restarts sends a new `true`), whereas a
  // late `true` would show a finished child as running with nothing to clear
  // it. A `true` landing during the fetch drops any `false` buffered for that
  // child, so the answer decides. The `updated` handler cannot apply these
  // itself to a child the list does not hold yet (a sub-agent whose turn ends
  // within the fetch would keep its spinner). Reset on every send; null while
  // no fetch is in flight, so nothing accumulates between fetches.
  const finishedInFlightRef = useRef<Set<string> | null>(null)

  const fetchChildren = useCallback(async () => {
    if (!sessionIdRef.current) {
      setRuns([])
      runsSessionIdRef.current = null
      return
    }
    const sessionAtRequest = sessionIdRef.current
    const requestId = ++requestIdRef.current
    finishedInFlightRef.current = new Set()
    setIsLoading(true)
    try {
      const children = await chatApi.getSessionChildren(sessionAtRequest)
      // Stale-response guard (see requestIdRef above). Also refuses to write
      // if `sessionId` moved on under us while the request was in flight.
      if (requestId === requestIdRef.current && sessionIdRef.current === sessionAtRequest) {
        const finished = finishedInFlightRef.current
        const next = children.map((c) => {
          const run = toDetachedRun(c)
          return run.isStreaming && finished?.has(run.sessionId) ? { ...run, isStreaming: false } : run
        })
        // Keep the previous array when nothing changed: every `created` in the
        // deployment ends in one of these fetches, and a fresh-but-equal array
        // would re-render every consumer of the children list for nothing.
        setRuns((prev) => (sameRuns(prev, next) ? prev : next))
        runsSessionIdRef.current = sessionAtRequest
      }
    } catch {
      // API not available yet (backend T2 not deployed), or a transient
      // failure on one of a burst of fetches fired by unrelated sessions
      // being created elsewhere. Keep the previous list rather than blanking
      // it — UNLESS that previous list belongs to a DIFFERENT session than
      // the one this request was for (`runsSessionIdRef`): e.g. the user
      // switched from session A (whose children are still sitting in `runs`)
      // to session B, and the fetch fired for B failed. There is no honest
      // "previous list" for B to fall back to — A's children are not B's,
      // and leaving them in place would let the sub-agent card link the user
      // from B into one of A's children. Guarded by `requestId`, exactly
      // like the success path and `finally` below, so a late-arriving stale
      // failure cannot clobber a newer request's (success OR failure)
      // already-applied result.
      if (requestId === requestIdRef.current && runsSessionIdRef.current !== sessionAtRequest) {
        setRuns([])
        runsSessionIdRef.current = sessionAtRequest
      }
    } finally {
      if (requestId === requestIdRef.current) {
        finishedInFlightRef.current = null
        setIsLoading(false)
      }
    }
  }, [])

  // Coalesces a burst of `created` events (e.g. a pipeline wave opening many
  // sessions at once) into a single trailing fetch, so N creations cost one
  // re-render of the children list — and at most one new `runs` array (none when
  // the list is unchanged), hence one ChatSessionProvider re-render — rather than N.
  const scheduleFetch = useCallback(() => {
    if (debounceTimerRef.current !== null) return
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null
      fetchChildren()
    }, CREATED_FETCH_DEBOUNCE_MS)
  }, [fetchChildren])

  // Fetch on mount and when sessionId changes
  useEffect(() => {
    fetchChildren()
  }, [sessionId, fetchChildren])

  // Listen to CrudEvents for real-time streaming status updates
  useEffect(() => {
    if (!sessionId) return

    const bus = getEventBus()
    const off = bus.on((event: CrudEvent) => {
      if (event.entity_type !== 'chat_session') return

      // Update streaming status of existing child sessions
      if (
        event.action === 'updated' &&
        event.payload &&
        typeof event.payload.is_streaming === 'boolean'
      ) {
        const isStreaming = event.payload.is_streaming
        const finished = finishedInFlightRef.current
        if (finished) {
          if (isStreaming) finished.delete(event.entity_id)
          else finished.add(event.entity_id)
        }
        const costUsd = typeof event.payload.total_cost_usd === 'number' ? event.payload.total_cost_usd : undefined
        setRuns(prev => {
          const idx = prev.findIndex(r => r.sessionId === event.entity_id)
          if (idx === -1) return prev
          const run = prev[idx]
          const nextRun = { ...run, isStreaming, ...(costUsd !== undefined ? { costUsd } : {}) }
          // A repeated or cost-only-unchanged update keeps the array (no re-render).
          if (sameRun(run, nextRun)) return prev
          const updated = [...prev]
          updated[idx] = nextRun
          return updated
        })
      }

      // New session created — re-fetch to get the full data.
      //
      // The payload carries `spawned_by` only on a backend that sends it (a
      // sibling PR adds the field). When it IS there we re-fetch only for our
      // own children; when it is NOT — which is every `created` event on
      // today's backend (`manager.rs` and `chat_handlers.rs` send neither
      // `spawned_by` nor a parent id in this payload) — the event says
      // nothing about the parent and the only honest answer is to ask the
      // children endpoint, debounced, which answers with ours alone.
      // Skipping the fetch here is what used to make a sub-agent's
      // conversation invisible until the panel was remounted.
      if (event.action === 'created') {
        const spawnedBy = readSpawnedBy(event.payload?.spawned_by)
        if (!spawnedBy || spawnedByParentId(spawnedBy) === sessionId) {
          scheduleFetch()
        }
      }
    })

    return () => {
      off()
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = null
      }
    }
  }, [sessionId, scheduleFetch])

  // The parent's stream said a child may have finished: ask again, debounced.
  // The baseline is reset on a session change (that change fetches already),
  // so only a change WITHIN a session schedules a refetch.
  const settleRef = useRef({ sessionId, settleSignal })
  useEffect(() => {
    const prev = settleRef.current
    settleRef.current = { sessionId, settleSignal }
    if (!sessionId || prev.sessionId !== sessionId || prev.settleSignal === settleSignal) return
    scheduleFetch()
  }, [sessionId, settleSignal, scheduleFetch])

  const hasActiveRuns = runs.some(r => r.isStreaming)

  return { runs, hasActiveRuns, isLoading, refresh: fetchChildren }
}

// ============================================================================
// Standalone atom-style tracker for SessionList (lightweight, no API calls)
// ============================================================================

export interface ActiveRunInfo {
  runCount: number
  /**
   * Always true: a parent is in the tracker's map only while at least one of
   * its children is running (`runCount >= 1`). Kept for the callers' shape.
   */
  hasStreaming: boolean
}

/** A child the tracker has seen created, keyed by its own session id. */
interface TrackedChild {
  parentId: string
  active: boolean
}

/**
 * How many children the tracker remembers. A finished child is kept (it can
 * start another turn) until this many are tracked; then the ones that finished
 * EARLIEST are forgotten first, so the map cannot grow without bound. Only if
 * every tracked child is still running is the oldest running one forgotten:
 * past that degenerate point its parent is undercounted (never stuck).
 */
export const ACTIVE_RUN_TRACKER_CAPACITY = 256

/**
 * An `updated {is_streaming}` can reach us BEFORE the child's `created`: the
 * backend starts the child's first turn before it emits `created`, so a turn
 * that ends at once sends its `false` first. The last such state is remembered
 * per (not yet tracked) id, at most this many ids, oldest forgotten first...
 */
export const ACTIVE_RUN_TRACKER_PENDING_CAPACITY = 256
/** ...and for this long: a `created` that comes later uses its own default. */
export const ACTIVE_RUN_TRACKER_PENDING_TTL_MS = 60_000

interface PendingStreaming {
  streaming: boolean
  at: number
}

function countByParent(children: Map<string, TrackedChild>): Map<string, ActiveRunInfo> {
  const counts = new Map<string, ActiveRunInfo>()
  for (const { parentId, active } of children.values()) {
    if (!active) continue
    const runCount = (counts.get(parentId)?.runCount ?? 0) + 1
    counts.set(parentId, { runCount, hasStreaming: true })
  }
  return counts
}

function sameCounts(a: Map<string, ActiveRunInfo>, b: Map<string, ActiveRunInfo>): boolean {
  if (a.size !== b.size) return false
  for (const [k, v] of a) {
    const w = b.get(k)
    if (!w || w.runCount !== v.runCount) return false
  }
  return true
}

/**
 * Hook that tracks active run counts per parent session via CrudEvents only.
 * Used by SessionList for the compact indicator — no API calls.
 *
 * Children are tracked by their OWN session id. Only the `created` event names
 * the parent (`payload.spawned_by`); the backend's `updated` events are kept
 * minimal and never carry `spawned_by`, so a finish (`is_streaming: false`) is
 * matched to its parent through the child id remembered at creation. Counting
 * per child (not per event) also makes a multi-turn child, or a second
 * `created` for the same id (provider switch), count once. An `is_streaming`
 * that arrives before its `created` is held (bounded, short-lived) and applied
 * when `created` comes, so a child that ended first is not counted forever.
 */
export function useActiveRunTracker(): Map<string, ActiveRunInfo> {
  const [activeRuns, setActiveRuns] = useState<Map<string, ActiveRunInfo>>(() => new Map())
  const childrenRef = useRef<Map<string, TrackedChild>>(new Map())
  const pendingRef = useRef<Map<string, PendingStreaming>>(new Map())

  useEffect(() => {
    const children = childrenRef.current
    const pending = pendingRef.current
    const publish = () => {
      const next = countByParent(children)
      setActiveRuns(prev => (sameCounts(prev, next) ? prev : next))
    }

    const bus = getEventBus()
    const off = bus.on((event: CrudEvent) => {
      if (event.entity_type !== 'chat_session') return
      const childId = event.entity_id
      if (!childId) return
      const payload = event.payload

      if (event.action === 'created') {
        if (children.has(childId)) return
        // No API call here: without a readable parent in the payload there is
        // nothing to count against.
        const parentId = spawnedByParentId(readSpawnedBy(payload?.spawned_by))
        // A state seen before this `created` (the turn already started, or
        // already ended) wins over the default "running"; a stale one does not.
        const early = pending.get(childId)
        pending.delete(childId)
        const fresh = early && Date.now() - early.at <= ACTIVE_RUN_TRACKER_PENDING_TTL_MS
        if (!parentId) return
        children.set(childId, { parentId, active: fresh ? early.streaming : true })
        // Bound the memory: forget the earliest finished children first (the
        // map's order puts a child at the end when it finishes), and only if
        // every tracked child is still running, the oldest of all.
        if (children.size > ACTIVE_RUN_TRACKER_CAPACITY) {
          for (const [id, c] of children) {
            if (children.size <= ACTIVE_RUN_TRACKER_CAPACITY) break
            if (!c.active) children.delete(id)
          }
          for (const id of children.keys()) {
            if (children.size <= ACTIVE_RUN_TRACKER_CAPACITY) break
            children.delete(id)
          }
        }
        publish()
        return
      }

      if (event.action === 'updated' && typeof payload?.is_streaming === 'boolean') {
        const tracked = children.get(childId)
        if (!tracked) {
          // Not created yet (or never ours): remember the last state, bounded.
          pending.delete(childId)
          pending.set(childId, { streaming: payload.is_streaming, at: Date.now() })
          if (pending.size > ACTIVE_RUN_TRACKER_PENDING_CAPACITY) {
            const oldest = pending.keys().next().value
            if (oldest !== undefined) pending.delete(oldest)
          }
          return
        }
        if (tracked.active === payload.is_streaming) return
        tracked.active = payload.is_streaming
        if (!tracked.active) {
          // Move it to the end: eviction then follows finish order.
          children.delete(childId)
          children.set(childId, tracked)
        }
        publish()
        return
      }

      if (event.action === 'deleted') {
        pending.delete(childId)
        if (children.delete(childId)) publish()
      }
    })

    return () => { off() }
  }, [])

  return activeRuns
}
