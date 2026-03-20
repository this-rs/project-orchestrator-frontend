/**
 * useLatestPlanRun — fetches the most recent PlanRun for a plan (historical fallback).
 */

import { useState, useEffect } from 'react'
import { runnerApi } from '@/services/runner'
import type { PlanRun } from '@/services/runner'

export function useLatestPlanRun(planId: string | undefined) {
  const [planRun, setPlanRun] = useState<PlanRun | null>(null)

  useEffect(() => {
    if (!planId) return
    runnerApi.listPlanRuns(planId, 1).then((runs) => {
      if (runs.length > 0) setPlanRun(runs[0])
    }).catch(() => {})
  }, [planId])

  return planRun
}
