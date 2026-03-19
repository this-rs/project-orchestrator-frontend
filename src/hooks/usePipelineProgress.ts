import { useCallback, useEffect, useRef, useState } from 'react'
import { runnerApi } from '@/services/runner'
import { getEventBus } from '@/services'
import type { CrudEvent } from '@/types'
import type { GateResult, ProgressScoreResponse } from '@/types/chat'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PipelineProgressData {
  /** Gate results for the run */
  gates: GateResult[]
  /** Progress score and dimensions */
  progress: ProgressScoreResponse | null
  /** Whether the initial fetch is in progress */
  isLoading: boolean
  /** Error message if fetch failed */
  error: string | null
  /** Force refresh from API */
  refresh: () => void
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Hook that combines REST fetch + WebSocket events for pipeline progress.
 *
 * - Fetches gate results and progress score on mount.
 * - Listens to CrudEvents (entity_type=runner) for real-time updates.
 * - Re-fetches when a runner event indicates progress changed.
 */
export function usePipelineProgress(runId: string | null): PipelineProgressData {
  const [gates, setGates] = useState<GateResult[]>([])
  const [progress, setProgress] = useState<ProgressScoreResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const runIdRef = useRef(runId)
  runIdRef.current = runId

  const fetchData = useCallback(async () => {
    const id = runIdRef.current
    if (!id) {
      setGates([])
      setProgress(null)
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const [gatesRes, progressRes] = await Promise.all([
        runnerApi.getGates(id),
        runnerApi.getProgress(id),
      ])

      if (runIdRef.current === id) {
        setGates(gatesRes.gates)
        setProgress(progressRes)
      }
    } catch (err) {
      if (runIdRef.current === id) {
        setError(err instanceof Error ? err.message : 'Failed to fetch pipeline progress')
      }
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Fetch on mount and when runId changes
  useEffect(() => {
    fetchData()
  }, [runId, fetchData])

  // Listen for runner CrudEvents to trigger re-fetches
  useEffect(() => {
    if (!runId) return

    const bus = getEventBus()
    const off = bus.on((event: CrudEvent) => {
      // Re-fetch when runner or plan events indicate progress changed.
      // Runner events may arrive with entity_type 'runner' (not in the
      // EntityType union yet) — use a string cast for forward compat.
      const et = event.entity_type as string
      if ((et === 'runner' || et === 'plan') && event.entity_id === runId) {
        fetchData()
      }
    })

    return () => { off() }
  }, [runId, fetchData])

  return { gates, progress, isLoading, error, refresh: fetchData }
}
