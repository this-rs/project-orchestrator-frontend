/**
 * useWavesData — fetches wave computation results for a plan.
 */

import { useState, useEffect } from 'react'
import { plansApi } from '@/services/plans'
import type { WaveComputationResult } from '@/types'

export function useWavesData(planId: string | undefined) {
  const [waves, setWaves] = useState<WaveComputationResult | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!planId) return
    setLoading(true)
    plansApi.getWaves(planId).then((data) => {
      setWaves(data)
    }).catch(() => {
      setWaves(null)
    }).finally(() => {
      setLoading(false)
    })
  }, [planId])

  return { waves, loading }
}
