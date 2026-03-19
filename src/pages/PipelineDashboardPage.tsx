/**
 * PipelineDashboardPage — overview of all pipeline executions across plans.
 *
 * Features:
 *   - Stats cards: total runs, active, completed, failed
 *   - List of plans with active/recent pipeline runs
 *   - Pipeline run status with progress bars
 *   - Click-through to RunnerDashboard for detailed view
 *   - Quality gate results summary per run
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  RefreshCw,
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  Layers,
  ArrowRight,
  Activity,
  Gauge,
  GitBranch,
  Ban,
} from 'lucide-react'

import { plansApi, workspacesApi } from '@/services'
import { runnerApi } from '@/services/runner'
import type { RunSnapshot } from '@/services/runner'
import type { Plan, PlanStatus } from '@/types'
import {
  PageShell,
  Button,
  Badge,
  Card,
  CardContent,
  StatCard,
  ProgressBar,
  Select,
  SkeletonCard,
  ErrorState,
  EmptyState,
} from '@/components/ui'
import { useWorkspaceSlug } from '@/hooks'
import { workspacePath } from '@/utils/paths'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PlanWithRun {
  plan: Plan
  run: RunSnapshot | null
  runError: string | null
}

// ---------------------------------------------------------------------------
// Helpers
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

const runStatusConfig: Record<string, { label: string; variant: 'success' | 'error' | 'info' | 'default' | 'warning'; icon: typeof Play }> = {
  running:   { label: 'Running',   variant: 'info',    icon: Activity },
  completed: { label: 'Completed', variant: 'success', icon: CheckCircle2 },
  failed:    { label: 'Failed',    variant: 'error',   icon: XCircle },
  cancelled: { label: 'Cancelled', variant: 'default', icon: Ban },
}

// ---------------------------------------------------------------------------
// Filter
// ---------------------------------------------------------------------------

type ViewFilter = 'all' | 'active' | 'completed' | 'failed'

const filterTabs: { value: ViewFilter; label: string }[] = [
  { value: 'all', label: 'All Plans' },
  { value: 'active', label: 'Active Runs' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
]

// ---------------------------------------------------------------------------
// PipelineRunCard
// ---------------------------------------------------------------------------

function PipelineRunCard({
  planRun,
  onViewDetails,
}: {
  planRun: PlanWithRun
  onViewDetails: (planId: string) => void
}) {
  const { plan, run } = planRun

  // Only consider the run relevant if it matches this plan
  const isRunForThisPlan = run?.running && run.plan_id === plan.id
  const statusStr = isRunForThisPlan ? (run.status ?? 'running') : null
  const statusCfg = statusStr ? runStatusConfig[statusStr] ?? runStatusConfig.running : null
  const StatusIcon = statusCfg?.icon ?? Play
  const progressPercent = isRunForThisPlan ? Math.round(run.progress_pct ?? 0) : 0

  // Plan status color bar
  const planStatusColors: Record<PlanStatus, string> = {
    draft: 'border-l-gray-600',
    approved: 'border-l-blue-500',
    in_progress: 'border-l-indigo-500',
    completed: 'border-l-green-500',
    cancelled: 'border-l-gray-500',
  }

  return (
    <Card className={`border-l-4 ${planStatusColors[plan.status] ?? 'border-l-gray-600'}`}>
      <CardContent className="py-4">
        <div className="flex items-start justify-between gap-4">
          {/* Left: plan + run info */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-sm font-semibold text-gray-100 truncate">
                {plan.title}
              </h3>
              {statusCfg && (
                <Badge variant={statusCfg.variant}>
                  <StatusIcon className="w-3 h-3 mr-1" />
                  {statusCfg.label}
                </Badge>
              )}
            </div>

            {isRunForThisPlan && run ? (
              <>
                {/* Run metrics */}
                <div className="flex flex-wrap items-center gap-4 text-xs text-gray-400 mt-2">
                  {run.current_wave != null && (
                    <div className="flex items-center gap-1">
                      <Layers className="w-3 h-3 text-gray-500" />
                      <span>Wave {(run.current_wave ?? 0) + 1}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-gray-500" />
                    <span>{run.tasks_completed ?? 0} / {run.tasks_total ?? 0} tasks</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-gray-500" />
                    <span className="font-mono tabular-nums">{formatElapsed(run.elapsed_secs ?? 0)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="font-mono tabular-nums text-gray-500">{formatCost(run.cost_usd)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <GitBranch className="w-3 h-3 text-gray-500" />
                    <span>{(run.active_agents ?? []).length} agent{(run.active_agents ?? []).length !== 1 ? 's' : ''}</span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mt-3">
                  <ProgressBar value={progressPercent} />
                </div>
              </>
            ) : (
              <p className="text-xs text-gray-500 mt-1">
                No active pipeline run
              </p>
            )}
          </div>

          {/* Right: action */}
          {isRunForThisPlan && (
            <button
              onClick={() => onViewDetails(plan.id)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-indigo-400 hover:bg-indigo-500/10 transition-colors cursor-pointer flex-shrink-0"
            >
              Details
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PipelineDashboardPage() {
  const wsSlug = useWorkspaceSlug()
  const navigate = useNavigate()

  // Project filter
  const [projects, setProjects] = useState<{ id: string; name: string; slug: string }[]>([])
  const [projectFilter, setProjectFilter] = useState<string>('all')

  useEffect(() => {
    if (!wsSlug) return
    workspacesApi
      .listProjects(wsSlug)
      .then(setProjects)
      .catch(() => {})
  }, [wsSlug])

  const projectOptions = useMemo(
    () => [
      { value: 'all', label: 'All Projects' },
      ...projects.map((p) => ({ value: p.id, label: p.name })),
    ],
    [projects],
  )

  const [planRuns, setPlanRuns] = useState<PlanWithRun[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [viewFilter, setViewFilter] = useState<ViewFilter>('all')

  // ── Fetch ────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Fetch in-progress and completed plans
      const projectId = projectFilter !== 'all' ? projectFilter : undefined
      const params: Record<string, string | number | undefined> = {
        limit: 50,
        offset: 0,
        workspace_slug: wsSlug,
        project_id: projectId,
      }

      const plansResult = await plansApi.list(params)
      const rawPlans: Plan[] = plansResult.items ?? plansResult

      // Only keep actionable plans (approved / in_progress) — skip draft, completed, cancelled
      const relevantStatuses: PlanStatus[] = ['approved', 'in_progress']

      // Deduplicate plans by id (API may return duplicates from multi-project scopes)
      const seen = new Set<string>()
      const plans = rawPlans.filter(p => {
        if (!relevantStatuses.includes(p.status)) return false
        if (seen.has(p.id)) return false
        seen.add(p.id)
        return true
      })

      // For each plan, try to fetch its runner status
      const results = await Promise.all(
        plans.map(async (plan) => {
          try {
            const run = await runnerApi.getStatus(plan.id)
            return { plan, run, runError: null } as PlanWithRun
          } catch {
            return { plan, run: null, runError: null } as PlanWithRun
          }
        })
      )

      setPlanRuns(results)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load pipeline data')
    } finally {
      setLoading(false)
    }
  }, [wsSlug, projectFilter, refreshKey])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Auto-refresh active runs
  useEffect(() => {
    const hasActive = planRuns.some(pr => pr.run?.running && pr.run.plan_id === pr.plan.id)
    if (!hasActive) return

    const timer = setInterval(() => {
      setRefreshKey(k => k + 1)
    }, 5000)

    return () => clearInterval(timer)
  }, [planRuns])

  // ── Handlers ─────────────────────────────────────────────────────────
  const handleRefresh = () => setRefreshKey(k => k + 1)

  const handleViewDetails = (planId: string) => {
    navigate(workspacePath(wsSlug, `/plans/${planId}/runner`))
  }

  // ── Helper: is the run relevant for this plan? ─────────────────────
  const isActiveRun = (pr: PlanWithRun) => pr.run?.running && pr.run.plan_id === pr.plan.id
  const runStatus = (pr: PlanWithRun) => isActiveRun(pr) ? (pr.run?.status ?? 'running') : null

  // ── Filter ───────────────────────────────────────────────────────────
  const filteredPlanRuns = useMemo(() => {
    switch (viewFilter) {
      case 'active':
        return planRuns.filter(pr => runStatus(pr) === 'running')
      case 'completed':
        return planRuns.filter(pr => runStatus(pr) === 'completed')
      case 'failed':
        return planRuns.filter(pr => runStatus(pr) === 'failed' || runStatus(pr) === 'cancelled')
      default:
        return planRuns
    }
  }, [planRuns, viewFilter])

  // ── Stats ────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const withRuns = planRuns.filter(pr => isActiveRun(pr))
    return {
      totalPlans: planRuns.length,
      activeRuns: withRuns.filter(pr => runStatus(pr) === 'running').length,
      completedRuns: withRuns.filter(pr => runStatus(pr) === 'completed').length,
      failedRuns: withRuns.filter(pr => runStatus(pr) === 'failed' || runStatus(pr) === 'cancelled').length,
      totalCost: withRuns.reduce((acc, pr) => acc + (pr.run?.cost_usd ?? 0), 0),
    }
  }, [planRuns])

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <PageShell
      title="Pipeline Dashboard"
      description="Pipeline executions across all plans — quality gates, waves, and progress"
      actions={
        <div className="flex items-center gap-2">
          <Select
            options={projectOptions}
            value={projectFilter}
            onChange={setProjectFilter}
          />
          <Button variant="secondary" onClick={handleRefresh} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      }
    >
      {/* Stats cards */}
      {!loading && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <StatCard
            icon={<Gauge className="w-5 h-5" />}
            label="Total Plans"
            value={stats.totalPlans}
            accent="border-indigo-500"
          />
          <StatCard
            icon={<Activity className="w-5 h-5" />}
            label="Active Runs"
            value={stats.activeRuns}
            accent="border-blue-500"
          />
          <StatCard
            icon={<CheckCircle2 className="w-5 h-5" />}
            label="Completed"
            value={stats.completedRuns}
            accent="border-green-500"
          />
          <StatCard
            icon={<XCircle className="w-5 h-5" />}
            label="Failed"
            value={stats.failedRuns}
            accent="border-red-500"
          />
          <StatCard
            icon={<Clock className="w-5 h-5" />}
            label="Total Cost"
            value={parseFloat(stats.totalCost.toFixed(2))}
            prefix="$"
            accent="border-yellow-500"
          />
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex items-center gap-1 mb-6 border-b border-white/[0.06]">
        {filterTabs.map((tab) => {
          let count = 0
          if (tab.value === 'all') count = planRuns.length
          else if (tab.value === 'active') count = stats.activeRuns
          else if (tab.value === 'completed') count = stats.completedRuns
          else if (tab.value === 'failed') count = stats.failedRuns

          return (
            <button
              key={tab.value}
              onClick={() => setViewFilter(tab.value)}
              className={`px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 cursor-pointer ${
                viewFilter === tab.value
                  ? 'border-indigo-500 text-white'
                  : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              {tab.label} ({count})
            </button>
          )
        })}
      </div>

      {/* Content */}
      {error ? (
        <ErrorState title="Failed to load pipeline data" description={error} onRetry={handleRefresh} />
      ) : loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} lines={3} />
          ))}
        </div>
      ) : filteredPlanRuns.length === 0 ? (
        <EmptyState
          title="No pipeline runs found"
          description={
            viewFilter === 'all'
              ? 'No plans found in this workspace. Create a plan and run its pipeline to see it here.'
              : `No ${viewFilter} pipeline runs.`
          }
          action={
            viewFilter !== 'all' ? (
              <Button variant="secondary" onClick={() => setViewFilter('all')}>
                Show all plans
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {/* Plans with active runs first, then by status */}
          {filteredPlanRuns
            .sort((a, b) => {
              // Active runs first
              const aActive = isActiveRun(a) ? 0 : 1
              const bActive = isActiveRun(b) ? 0 : 1
              if (aActive !== bActive) return aActive - bActive
              // Then by plan title
              return a.plan.title.localeCompare(b.plan.title)
            })
            .map((planRun) => (
              <PipelineRunCard
                key={planRun.plan.id}
                planRun={planRun}
                onViewDetails={handleViewDetails}
              />
            ))}
        </div>
      )}
    </PageShell>
  )
}
