import { useCallback, useEffect, useRef, useState } from 'react'
import type { CostBasis } from '@/types/provider'
import { getEventBus } from '@/services'
import { chatApi } from '@/services/chat'
import type { CrudEvent, DetachedSession } from '@/types'
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

export function toDetachedRun(s: DetachedSession): DetachedRun {
  const spawnedBy = readSpawnedBy(s.spawned_by)
  return {
    sessionId: s.id,
    title: s.title || `Run ${s.id.slice(0, 8)}`,
    model: s.model,
    isStreaming: s.is_streaming,
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
export function useDetachedRuns(sessionId: string | null): UseDetachedRunsResult {
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

  const fetchChildren = useCallback(async () => {
    if (!sessionIdRef.current) {
      setRuns([])
      runsSessionIdRef.current = null
      return
    }
    const sessionAtRequest = sessionIdRef.current
    const requestId = ++requestIdRef.current
    setIsLoading(true)
    try {
      const children = await chatApi.getSessionChildren(sessionAtRequest)
      // Stale-response guard (see requestIdRef above). Also refuses to write
      // if `sessionId` moved on under us while the request was in flight.
      if (requestId === requestIdRef.current && sessionIdRef.current === sessionAtRequest) {
        setRuns(children.map(toDetachedRun))
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
        setIsLoading(false)
      }
    }
  }, [])

  // Coalesces a burst of `created` events (e.g. a pipeline wave opening many
  // sessions at once) into a single trailing fetch, so N creations cost one
  // re-render of the children list — and one `childSessions` memo change,
  // hence one ChatSessionProvider re-render — rather than N.
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
        setRuns(prev => {
          const idx = prev.findIndex(r => r.sessionId === event.entity_id)
          if (idx === -1) return prev
          const updated = [...prev]
          updated[idx] = { ...updated[idx], isStreaming: event.payload.is_streaming as boolean }
          // Update cost if provided
          if (typeof event.payload.total_cost_usd === 'number') {
            updated[idx] = { ...updated[idx], costUsd: event.payload.total_cost_usd as number }
          }
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

  const hasActiveRuns = runs.some(r => r.isStreaming)

  return { runs, hasActiveRuns, isLoading, refresh: fetchChildren }
}

// ============================================================================
// Standalone atom-style tracker for SessionList (lightweight, no API calls)
// ============================================================================

export interface ActiveRunInfo {
  runCount: number
  /** True if at least one child is streaming */
  hasStreaming: boolean
}

/**
 * Hook that tracks active run counts per parent session via CrudEvents only.
 * Used by SessionList for the compact indicator — no API calls.
 *
 * Listens to chat_session CrudEvents where payload.spawned_by is set.
 * Maintains a Map<parentSessionId, ActiveRunInfo>.
 */
export function useActiveRunTracker(): Map<string, ActiveRunInfo> {
  const [activeRuns, setActiveRuns] = useState<Map<string, ActiveRunInfo>>(() => new Map())

  useEffect(() => {
    const bus = getEventBus()
    const off = bus.on((event: CrudEvent) => {
      if (event.entity_type !== 'chat_session') return

      const payload = event.payload
      if (!payload?.spawned_by) return

      // No API call here: without a readable parent in the payload there is
      // nothing to count against, so the row keeps the count it has.
      const parentId = spawnedByParentId(readSpawnedBy(payload.spawned_by))
      if (!parentId) return

      if (event.action === 'created') {
        setActiveRuns(prev => {
          const next = new Map(prev)
          const info = next.get(parentId) || { runCount: 0, hasStreaming: false }
          next.set(parentId, {
            runCount: info.runCount + 1,
            hasStreaming: true, // just created = probably streaming
          })
          return next
        })
      }

      if (event.action === 'updated' && typeof payload.is_streaming === 'boolean') {
        setActiveRuns(prev => {
          const next = new Map(prev)
          const info = next.get(parentId)
          if (!info) return prev
          if (!payload.is_streaming) {
            const newCount = Math.max(0, info.runCount - 1)
            if (newCount === 0) {
              next.delete(parentId)
            } else {
              next.set(parentId, { runCount: newCount, hasStreaming: newCount > 0 })
            }
          }
          return next
        })
      }
    })

    return () => { off() }
  }, [])

  return activeRuns
}
