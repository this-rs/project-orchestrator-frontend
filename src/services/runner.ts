/**
 * Runner service — polls the plan runner status endpoint and exposes
 * a React hook for real-time runner dashboard data.
 *
 * GET /api/plans/{id}/run/status -> RunSnapshot
 *
 * NOTE: The backend returns a global RunStatus (one runner at a time).
 * Fields like plan_id, status, current_wave are optional (null when no run).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError, buildQuery } from './api'

// ---------------------------------------------------------------------------
// Types — aligned with backend RunStatus
// ---------------------------------------------------------------------------

export type AgentStatus = 'spawning' | 'running' | 'verifying' | 'completed' | 'failed'

export interface ActiveAgentSnapshot {
  task_id: string
  task_title: string
  session_id: string | null
  elapsed_secs: number
  cost_usd: number
  status: AgentStatus
}

/**
 * Matches backend `RunStatus` from `runner/runner.rs`.
 *
 * The endpoint is global — a single runner processes one plan at a time.
 * When no run is active, `running` is false and optional fields are null.
 */
export interface RunSnapshot {
  running: boolean
  run_id: string | null
  plan_id: string | null
  status: 'running' | 'completed' | 'failed' | 'cancelled' | null
  current_wave: number | null
  current_task_id: string | null
  current_task_title: string | null
  active_agents: ActiveAgentSnapshot[]
  progress_pct: number
  tasks_completed: number
  tasks_total: number
  elapsed_secs: number
  cost_usd: number
}

/**
 * Virtual wave snapshot built from active_agents for display purposes.
 * The backend doesn't return wave structure — we group agents by wave.
 */
export interface WaveSnapshot {
  wave_index: number
  agents: ActiveAgentSnapshot[]
}

/**
 * Historical plan run record (from Neo4j PlanRun nodes).
 * Returned by GET /api/runs and GET /api/plans/{id}/runs.
 */
export interface PlanRun {
  run_id: string
  plan_id: string
  total_tasks: number
  current_wave: number
  current_task_id: string | null
  current_task_title: string | null
  active_agents: ActiveAgentSnapshot[]
  completed_tasks: string[]
  failed_tasks: string[]
  git_branch: string
  started_at: string
  completed_at: string | null
  status: 'Running' | 'Completed' | 'Failed' | 'Cancelled'
  cost_usd: number
  triggered_by: string | { Manual: null } | { Trigger: { trigger_id: string } } | { Schedule: { cron: string } }
  project_id: string | null
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export const runnerApi = {
  /** List all plan runs across all plans (history). */
  listAllRuns: (params?: { limit?: number; offset?: number; status?: string }) =>
    api.get<PlanRun[]>(`/runs${buildQuery(params ?? {})}`),

  /** List runs for a specific plan. */
  listPlanRuns: (planId: string, limit?: number) =>
    api.get<PlanRun[]>(`/plans/${planId}/runs${buildQuery({ limit })}`),

  getStatus: (planId: string) =>
    api.get<RunSnapshot>(`/plans/${planId}/run/status`),

  /**
   * Cancel an active run. The backend will gracefully stop all running agents.
   *
   * - 404 → no active run for this plan
   * - 409 → cancellation already in progress
   */
  cancelRun: async (planId: string): Promise<void> => {
    try {
      await api.post<void>(`/plans/${planId}/run/cancel`)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 404) {
          throw new Error('No active run to cancel')
        }
        if (err.status === 409) {
          throw new Error('Cancellation already in progress')
        }
      }
      throw err
    }
  },
}

// ---------------------------------------------------------------------------
// Hook: useRunnerStatus
// ---------------------------------------------------------------------------

interface UseRunnerStatusResult {
  snapshot: RunSnapshot | null
  isRunning: boolean
  error: string | null
  /** Force an immediate refresh */
  refresh: () => void
}

/**
 * Polls the runner status for a given plan at a configurable interval.
 *
 * - While the run is active (status=running), polling continues.
 * - Once completed/failed/cancelled, polling stops automatically.
 * - On error, the last known snapshot is preserved and error is set.
 */
export function useRunnerStatus(
  planId: string | undefined,
  intervalMs: number = 2000,
): UseRunnerStatusResult {
  const [snapshot, setSnapshot] = useState<RunSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const planIdRef = useRef(planId)
  planIdRef.current = planId

  const fetchStatus = useCallback(async () => {
    const id = planIdRef.current
    if (!id) return

    try {
      const data = await runnerApi.getStatus(id)
      // Only update if we're still looking at the same plan
      if (planIdRef.current === id) {
        setSnapshot(data)
        setError(null)

        // Stop polling when the run is no longer active
        if (!data.running && timerRef.current) {
          clearInterval(timerRef.current)
          timerRef.current = null
        }
      }
    } catch (err) {
      if (planIdRef.current === id) {
        setError(err instanceof Error ? err.message : 'Failed to fetch runner status')
      }
    }
  }, [])

  // Start / restart polling when planId changes
  useEffect(() => {
    if (!planId) {
      setSnapshot(null)
      setError(null)
      return
    }

    // Fetch immediately
    fetchStatus()

    // Set up polling
    timerRef.current = setInterval(fetchStatus, intervalMs)

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [planId, intervalMs, fetchStatus])

  const isRunning = snapshot?.running === true

  return { snapshot, isRunning, error, refresh: fetchStatus }
}
