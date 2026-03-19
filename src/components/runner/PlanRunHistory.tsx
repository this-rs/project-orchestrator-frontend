/**
 * PlanRunHistory — compact run history list for embedding in Plan/Milestone detail pages.
 *
 * Fetches and displays historical PlanRun records for one or more plan IDs.
 * Reuses the visual patterns from PipelineDashboardPage's RunCard.
 */

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  Activity,
  GitBranch,
  Ban,
  DollarSign,
  Users,
  Loader2,
} from 'lucide-react'
import { Badge, ProgressBar } from '@/components/ui'
import { runnerApi } from '@/services/runner'
import type { PlanRun } from '@/services/runner'
import { useWorkspaceSlug } from '@/hooks'
import { workspacePath } from '@/utils/paths'

// ---------------------------------------------------------------------------
// Helpers (same as PipelineDashboardPage)
// ---------------------------------------------------------------------------

function formatElapsed(secs: number): string {
  if (secs < 60) return `${Math.floor(secs)}s`
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}m ${String(s).padStart(2, '0')}s`
}

function formatCost(usd: number | undefined | null): string {
  return `$${(usd ?? 0).toFixed(2)}`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`
  return d.toLocaleDateString()
}

function elapsedSecs(run: PlanRun): number {
  const start = new Date(run.started_at).getTime()
  const end = run.completed_at ? new Date(run.completed_at).getTime() : Date.now()
  return (end - start) / 1000
}

function progressPct(run: PlanRun): number {
  if (run.total_tasks === 0) return 0
  return Math.round(((run.completed_tasks.length + run.failed_tasks.length) / run.total_tasks) * 100)
}

const runStatusConfig: Record<string, { label: string; variant: 'success' | 'error' | 'info' | 'default' | 'warning'; icon: typeof Play }> = {
  running:         { label: 'Running',         variant: 'info',    icon: Activity },
  completed:       { label: 'Completed',       variant: 'success', icon: CheckCircle2 },
  failed:          { label: 'Failed',          variant: 'error',   icon: XCircle },
  cancelled:       { label: 'Cancelled',       variant: 'default', icon: Ban },
  budget_exceeded: { label: 'Budget Exceeded', variant: 'warning', icon: Ban },
}

const statusBorderColors: Record<string, string> = {
  running:         'border-l-blue-500',
  completed:       'border-l-green-500',
  failed:          'border-l-red-500',
  cancelled:       'border-l-gray-500',
  budget_exceeded: 'border-l-yellow-500',
}

// ---------------------------------------------------------------------------
// CompactRunRow
// ---------------------------------------------------------------------------

function CompactRunRow({
  run,
  planTitle,
  showPlanTitle = false,
  onViewDetails,
}: {
  run: PlanRun
  planTitle?: string
  showPlanTitle?: boolean
  onViewDetails: (planId: string) => void
}) {
  const statusCfg = runStatusConfig[run.status] ?? runStatusConfig.running
  const StatusIcon = statusCfg.icon
  const progress = progressPct(run)
  const elapsed = elapsedSecs(run)

  return (
    <div className={`border-l-4 ${statusBorderColors[run.status] ?? 'border-l-gray-600'} bg-white/[0.04] rounded-r-lg p-3 hover:bg-white/[0.06] transition-colors`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1.5">
            {showPlanTitle && planTitle && (
              <span className="text-sm font-medium text-gray-200 truncate">{planTitle}</span>
            )}
            <Badge variant={statusCfg.variant}>
              <StatusIcon className="w-3 h-3 mr-1" />
              {statusCfg.label}
            </Badge>
            <span className="text-xs text-gray-600">{formatDate(run.started_at)}</span>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-gray-500" />
              {run.completed_tasks.length}/{run.total_tasks}
            </span>
            {run.failed_tasks.length > 0 && (
              <span className="flex items-center gap-1 text-red-400">
                <XCircle className="w-3 h-3" />
                {run.failed_tasks.length} failed
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3 text-gray-500" />
              <span className="font-mono tabular-nums">{formatElapsed(elapsed)}</span>
            </span>
            <span className="flex items-center gap-1">
              <DollarSign className="w-3 h-3 text-gray-500" />
              <span className="font-mono tabular-nums">{formatCost(run.cost_usd)}</span>
            </span>
            <span className="flex items-center gap-1">
              <Users className="w-3 h-3 text-gray-500" />
              {run.active_agents?.length ?? 0}
            </span>
            {run.git_branch && (
              <span className="flex items-center gap-1">
                <GitBranch className="w-3 h-3 text-gray-500" />
                <span className="font-mono text-gray-500 truncate max-w-[100px]">{run.git_branch}</span>
              </span>
            )}
          </div>

          <div className="mt-2">
            <ProgressBar value={progress} />
          </div>
        </div>

        <button
          onClick={() => onViewDetails(run.plan_id)}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-indigo-400 hover:bg-indigo-500/10 transition-colors cursor-pointer flex-shrink-0"
        >
          Details
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// PlanRunHistory
// ---------------------------------------------------------------------------

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

export function PlanRunHistory({
  planIds,
  maxRuns = 5,
  showPlanTitle = false,
  planTitleMap = {},
}: PlanRunHistoryProps) {
  const wsSlug = useWorkspaceSlug()
  const navigate = useNavigate()
  const [runs, setRuns] = useState<PlanRun[]>([])
  const [loading, setLoading] = useState(true)

  const ids = Array.isArray(planIds) ? planIds : [planIds]

  const fetchRuns = useCallback(async () => {
    if (ids.length === 0) {
      setRuns([])
      setLoading(false)
      return
    }

    try {
      // Fetch runs for all plan IDs in parallel
      const results = await Promise.all(
        ids.map((id) => runnerApi.listPlanRuns(id, maxRuns).catch(() => []))
      )
      // Merge and sort by started_at desc
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(ids), maxRuns])

  useEffect(() => {
    fetchRuns()
  }, [fetchRuns])

  // Auto-refresh if any run is active
  useEffect(() => {
    const hasActive = runs.some((r) => r.status === 'running')
    if (!hasActive) return
    const timer = setInterval(fetchRuns, 5000)
    return () => clearInterval(timer)
  }, [runs, fetchRuns])

  const handleViewDetails = (planId: string) => {
    navigate(workspacePath(wsSlug, `/plans/${planId}/runner`))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6 text-gray-500 text-sm gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading runs...
      </div>
    )
  }

  if (runs.length === 0) {
    return (
      <p className="text-sm text-gray-500 py-4 text-center">
        No pipeline runs recorded yet
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {runs.map((run) => (
        <CompactRunRow
          key={run.run_id}
          run={run}
          planTitle={run.plan_title || planTitleMap[run.plan_id] || `Plan ${run.plan_id.slice(0, 8)}`}
          showPlanTitle={showPlanTitle}
          onViewDetails={handleViewDetails}
        />
      ))}
    </div>
  )
}
