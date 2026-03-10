// ============================================================================
// useMilestoneGraphData — Transforms milestone detail into MilestoneGraphData
// ============================================================================
//
// Unlike useTaskGraphData (which fetches its own data), this hook simply
// transforms already-fetched MilestoneDetail / ProjectMilestoneDetail
// into the MilestoneGraphData bundle expected by MilestoneGraphAdapter.
//
// Both MilestoneDetailPage and ProjectMilestoneDetailPage already fetch
// the enriched milestone response — no extra API calls needed.
// ============================================================================

import { useMemo } from 'react'
import type { MilestonePlanSummary, MilestoneProgress } from '@/types'
import type { MilestoneGraphData } from '@/adapters/MilestoneGraphAdapter'

interface UseMilestoneGraphDataParams {
  milestoneId: string | undefined
  milestoneTitle: string
  milestoneStatus: string
  plans: MilestonePlanSummary[]
  progress: MilestoneProgress | null
}

interface UseMilestoneGraphDataReturn {
  data: MilestoneGraphData | null
}

export function useMilestoneGraphData({
  milestoneId,
  milestoneTitle,
  milestoneStatus,
  plans,
  progress,
}: UseMilestoneGraphDataParams): UseMilestoneGraphDataReturn {
  const data = useMemo<MilestoneGraphData | null>(() => {
    if (!milestoneId || !progress) return null
    return {
      milestoneId,
      milestoneTitle,
      milestoneStatus,
      plans,
      progress,
    }
  }, [milestoneId, milestoneTitle, milestoneStatus, plans, progress])

  return { data }
}
