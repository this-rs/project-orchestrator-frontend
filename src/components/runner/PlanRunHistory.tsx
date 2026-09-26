/**
 * PlanRunHistory — compact run history list for embedding in Plan / Milestone
 * detail pages: the latest runs of one or several plans as PlanRunRows.
 */

import { useState, useEffect, useCallback } from 'react'
import { EmptyState, EntityList, EntityListSkeleton } from '@/components/ui'
import { runnerApi } from '@/services/runner'
import type { PlanRun } from '@/services/runner'
import { useWorkspaceSlug } from '@/hooks'
import { workspacePath } from '@/utils/paths'
import { PlanRunRow } from './PlanRunRow'

interface PlanRunHistoryProps {
  /** Single plan ID or array of plan IDs (for milestone aggregate view). */
  planIds: string | string[]
  /** Maximum runs to show (default: 5). */
  maxRuns?: number
  /** Show plan title on each row (useful for milestone view with multiple plans). */
  showPlanTitle?: boolean
  /** Map of planId → title for display (when showPlanTitle is true). */
  planTitleMap?: Record<string, string>
}

export function PlanRunHistory({ planIds, maxRuns = 5, showPlanTitle = false, planTitleMap = {} }: PlanRunHistoryProps) {
  const wsSlug = useWorkspaceSlug()
  const [runs, setRuns] = useState<PlanRun[]>([])
  const [loading, setLoading] = useState(true)

  const ids = Array.isArray(planIds) ? planIds : [planIds]
  const idsKey = JSON.stringify(ids)

  const fetchRuns = useCallback(async () => {
    const planIdList: string[] = JSON.parse(idsKey)
    if (planIdList.length === 0) {
      setRuns([])
      setLoading(false)
      return
    }
    try {
      const results = await Promise.all(planIdList.map((id) => runnerApi.listPlanRuns(id, maxRuns).catch(() => [])))
      const allRuns = results
        .flat()
        .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
        .slice(0, maxRuns)
      setRuns(allRuns)
    } catch {
      setRuns([])
    } finally {
      setLoading(false)
    }
  }, [idsKey, maxRuns])

  useEffect(() => {
    fetchRuns()
  }, [fetchRuns])

  // Auto-refresh while a run is active
  useEffect(() => {
    const hasActive = runs.some((r) => r.status === 'running')
    if (!hasActive) return
    const timer = setInterval(fetchRuns, 5000)
    return () => clearInterval(timer)
  }, [runs, fetchRuns])

  if (loading) return <EntityListSkeleton rows={3} />

  if (runs.length === 0) {
    return <EmptyState size="sm" title="No pipeline runs yet" description="Runs appear here once the plan has been executed." />
  }

  return (
    <EntityList aria-label="Pipeline runs">
      {runs.map((run) => {
        const planTitle = run.plan_title || planTitleMap[run.plan_id] || `Plan ${run.plan_id.slice(0, 8)}`
        return (
          <PlanRunRow
            key={run.run_id}
            run={run}
            title={showPlanTitle ? planTitle : `Run ${run.run_id.slice(0, 8)}`}
            href={workspacePath(wsSlug, `/plans/${run.plan_id}/runner`)}
          />
        )
      })}
    </EntityList>
  )
}
