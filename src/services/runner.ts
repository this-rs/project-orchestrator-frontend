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
import type { GateResultsResponse, ProgressScoreResponse } from '@/types/chat'

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
  status: 'running' | 'completed' | 'failed' | 'cancelled' | 'budget_exceeded' | null
  current_wave: number | null
  current_task_id: string | null
  current_task_title: string | null
  active_agents: ActiveAgentSnapshot[]
  progress_pct: number
  tasks_completed: number
  tasks_total: number
  elapsed_secs: number
  cost_usd: number
  max_cost_usd: number
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
  /** Plan title enriched by the backend (available on list endpoints). */
  plan_title?: string
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
  status: 'running' | 'completed' | 'failed' | 'cancelled' | 'budget_exceeded'
  cost_usd: number
  triggered_by: string | { chat: { session_id: string | null } } | { schedule: { trigger_id: string } } | { webhook: { trigger_id: string; payload_hash: string | null } } | { event: { trigger_id: string; source_event: string } }
  project_id: string | null
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export interface StartRunResponse {
  run_id: string
  plan_id: string
  total_waves: number
  total_tasks: number
}

export const runnerApi = {
  /**
   * Start a plan run. The backend spawns agents and executes tasks in wave order.
   * Returns 202 Accepted with run metadata.
   * Throws 409 if the plan already has an active run.
   */
  startRun: async (planId: string, cwd: string, projectSlug?: string, maxCostUsd?: number): Promise<StartRunResponse> => {
    const body: Record<string, unknown> = { cwd, triggered_by: 'manual' }
    if (projectSlug) body.project_slug = projectSlug
    if (maxCostUsd !== undefined && maxCostUsd > 0) body.max_cost_usd = maxCostUsd
    return api.post<StartRunResponse>(`/plans/${planId}/run`, body)
  },

  /** List all plan runs across all plans (history), optionally scoped to a workspace. */
  listAllRuns: (params?: { limit?: number; offset?: number; status?: string; workspace_slug?: string }) =>
    api.get<PlanRun[]>(`/runs${buildQuery(params ?? {})}`),

  /** List runs for a specific plan. */
  listPlanRuns: (planId: string, limit?: number) =>
    api.get<PlanRun[]>(`/plans/${planId}/runs${buildQuery({ limit })}`),

  getStatus: (planId: string) =>
    api.get<RunSnapshot>(`/plans/${planId}/run/status`),

  /** Get gate results for a pipeline run. */
  getGates: (runId: string) =>
    api.get<GateResultsResponse>(`/runs/${runId}/gates`),

  /** Get progress score for a pipeline run. */
  getProgress: (runId: string) =>
    api.get<ProgressScoreResponse>(`/runs/${runId}/progress`),

  /**
   * Update the budget limit of a running execution.
   * Takes effect immediately on the next budget check in the execution loop.
   */
  updateBudget: async (planId: string, maxCostUsd: number): Promise<void> => {
    await api.patch<void>(`/plans/${planId}/run/budget`, { max_cost_usd: maxCostUsd })
  },

  /**
   * Cancel an active run. The backend will gracefully stop all running agents.
   *
   * - 404 → no active run for this plan
   * - 409 → cancellation already in progress
   */
  /** Retry a failed task within a run. */
  retryTask: async (planId: string, taskId: string): Promise<void> => {
    await api.post<void>(`/plans/${planId}/run/tasks/${taskId}/retry`)
  },

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
