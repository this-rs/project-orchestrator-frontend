import { useCallback, useEffect, useRef, useState } from 'react'
import type { CostBasis } from '@/types/provider'
import { getEventBus } from '@/services'
import { chatApi } from '@/services/chat'
import type { CrudEvent, DetachedSession } from '@/types'

/** Info about an active detached run (child session or plan runner task) */
export interface DetachedRun {
  sessionId: string
  title: string
  model: string
  isStreaming: boolean
  costUsd?: number
  /** Where `costUsd` comes from. Absent = `reported`. */
  costBasis?: CostBasis | null
  startedAt: string
  /** If spawned by a runner, the plan ID */
  planId?: string
  /** If spawned by a runner, the run ID */
  runId?: string
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

function toDetachedRun(s: DetachedSession): DetachedRun {
  return {
    sessionId: s.id,
    title: s.title || `Run ${s.id.slice(0, 8)}`,
    model: s.model,
    isStreaming: s.is_streaming,
    costUsd: s.total_cost_usd,
    costBasis: s.cost_basis,
    startedAt: s.created_at,
    planId: s.spawned_by?.type === 'runner' ? s.spawned_by.plan_id : undefined,
    runId: s.spawned_by?.type === 'runner' ? s.spawned_by.run_id : undefined,
  }
}

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

  const fetchChildren = useCallback(async () => {
    if (!sessionIdRef.current) {
      setRuns([])
      return
    }
    setIsLoading(true)
    try {
      const children = await chatApi.getSessionChildren(sessionIdRef.current)
      if (sessionIdRef.current) {
        setRuns(children.map(toDetachedRun))
      }
    } catch {
      // API not available yet (backend T2 not deployed) — graceful fallback
      setRuns([])
    } finally {
      setIsLoading(false)
    }
  }, [])

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

      // New child session created — re-fetch to get the full data
      if (event.action === 'created') {
        // Check if the payload indicates this is a child of our session
        const payload = event.payload
        if (
          payload?.spawned_by &&
          typeof payload.spawned_by === 'object' &&
          (payload.spawned_by as Record<string, unknown>).parent_session_id === sessionId
        ) {
          fetchChildren()
        }
      }
    })

    return () => { off() }
  }, [sessionId, fetchChildren])

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

      const spawnedBy = payload.spawned_by as Record<string, unknown>
      const parentId = spawnedBy.parent_session_id as string | undefined
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
