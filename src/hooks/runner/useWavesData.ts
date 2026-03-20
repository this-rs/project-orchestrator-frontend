/**
 * useWavesData — fetches wave computation results for a plan.
 *
 * Re-fetches automatically:
 * - On a 5-second polling interval (while the run is active)
 * - When task CRUD events arrive via the EventBus (taskRefreshAtom bump)
 *
 * This ensures the dashboard always reflects the real task statuses from the
 * backend instead of relying on stale mount-time data.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAtomValue } from 'jotai'
import { plansApi } from '@/services/plans'
import { taskRefreshAtom } from '@/atoms'
import type { WaveComputationResult } from '@/types'

/** Default polling interval while a run is active (ms). */
const POLL_INTERVAL_MS = 5_000

export function useWavesData(planId: string | undefined, isRunning?: boolean) {
  const [waves, setWaves] = useState<WaveComputationResult | null>(null)
  const [loading, setLoading] = useState(false)
  const planIdRef = useRef(planId)
  planIdRef.current = planId

  // Subscribe to task CRUD events — when tasks are updated (completed/failed),
  // the EventBus bumps this counter, triggering a re-fetch.
  const taskRefresh = useAtomValue(taskRefreshAtom)

  const fetchWaves = useCallback(async () => {
    const id = planIdRef.current
    if (!id) return
    try {
      const data = await plansApi.getWaves(id)
      // Only update if still looking at the same plan
      if (planIdRef.current === id) {
        setWaves(data)
      }
    } catch {
      if (planIdRef.current === id) {
        setWaves(null)
      }
    }
  }, [])

  // Initial fetch + re-fetch when planId or taskRefresh changes
  useEffect(() => {
    if (!planId) {
      setWaves(null)
      return
    }
    setLoading(true)
    fetchWaves().finally(() => setLoading(false))
  }, [planId, taskRefresh, fetchWaves])

  // Polling: re-fetch every 5s while the run is active
  useEffect(() => {
    if (!planId || isRunning === false) return

    const timer = setInterval(fetchWaves, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [planId, isRunning, fetchWaves])

  return { waves, loading, refetch: fetchWaves }
}
