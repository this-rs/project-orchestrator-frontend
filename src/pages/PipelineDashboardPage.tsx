/**
 * PipelineDashboardPage — history of all pipeline runs across plans.
 *
 * Primary view: list of PlanRun records from the backend (not plans).
 * Features:
 *   - Stats cards: total runs, running, completed, failed
 *   - Filterable list of historical runs sorted by started_at desc
 *   - Infinite scroll pagination (loads 20 runs per page)
 *   - Click-through to RunnerDashboard for detailed view
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  RefreshCw,
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  Activity,
  Gauge,
  GitBranch,
  Ban,
  DollarSign,
  Users,
  Loader2,
  FileText,
  Rocket,
} from 'lucide-react'

import { runnerApi } from '@/services/runner'
import type { PlanRun } from '@/services/runner'
import { plansApi } from '@/services'
import type { Plan } from '@/types'
import {
  PageShell,
  Button,
  Badge,
  Card,
  CardContent,
  StatCard,
  ProgressBar,
  SkeletonCard,
  ErrorState,
  EmptyState,
} from '@/components/ui'
import { useWorkspaceSlug } from '@/hooks'
import { workspacePath } from '@/utils/paths'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20

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

function triggerLabel(triggered_by: PlanRun['triggered_by']): string {
  if (typeof triggered_by === 'string') return triggered_by
  if ('Manual' in triggered_by) return 'Manual'
  if ('Trigger' in triggered_by) return 'Event Trigger'
  if ('Schedule' in triggered_by) return 'Schedule'
  return 'Unknown'
}

const runStatusConfig: Record<string, { label: string; variant: 'success' | 'error' | 'info' | 'default' | 'warning'; icon: typeof Play }> = {
  Running:   { label: 'Running',   variant: 'info',    icon: Activity },
  Completed: { label: 'Completed', variant: 'success', icon: CheckCircle2 },
  Failed:    { label: 'Failed',    variant: 'error',   icon: XCircle },
  Cancelled: { label: 'Cancelled', variant: 'default', icon: Ban },
}

// ---------------------------------------------------------------------------
// Filter
// ---------------------------------------------------------------------------

type ViewFilter = 'all' | 'running' | 'completed' | 'failed'

const filterTabs: { value: ViewFilter; label: string }[] = [
  { value: 'all', label: 'All Runs' },
  { value: 'running', label: 'Running' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
]

/** Map filter to backend status param */
function filterToStatus(f: ViewFilter): string | undefined {
  switch (f) {
    case 'running': return 'running'
    case 'completed': return 'completed'
    case 'failed': return 'failed'
    default: return undefined
  }
}

// ---------------------------------------------------------------------------
// RunCard
// ---------------------------------------------------------------------------

function RunCard({
  run,
  planTitle,
  onViewDetails,
}: {
  run: PlanRun
  planTitle: string
  onViewDetails: (planId: string) => void
}) {
  const statusCfg = runStatusConfig[run.status] ?? runStatusConfig.Running
  const StatusIcon = statusCfg.icon
  const progress = progressPct(run)
  const elapsed = elapsedSecs(run)

  const statusColors: Record<string, string> = {
    Running: 'border-l-blue-500',
    Completed: 'border-l-green-500',
    Failed: 'border-l-red-500',
    Cancelled: 'border-l-gray-500',
  }

  return (
    <Card className={`border-l-4 ${statusColors[run.status] ?? 'border-l-gray-600'}`}>
      <CardContent className="py-4">
        <div className="flex items-start justify-between gap-4">
          {/* Left: run info */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-sm font-semibold text-gray-100 truncate">
                {planTitle}
              </h3>
              <Badge variant={statusCfg.variant}>
                <StatusIcon className="w-3 h-3 mr-1" />
                {statusCfg.label}
              </Badge>
            </div>

            {/* Run metrics */}
            <div className="flex flex-wrap items-center gap-4 text-xs text-gray-400 mt-2">
              <div className="flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-gray-500" />
                <span>{run.completed_tasks.length}/{run.total_tasks} tasks</span>
              </div>
              {run.failed_tasks.length > 0 && (
                <div className="flex items-center gap-1">
                  <XCircle className="w-3 h-3 text-red-400" />
                  <span className="text-red-400">{run.failed_tasks.length} failed</span>
                </div>
              )}
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-gray-500" />
                <span className="font-mono tabular-nums">{formatElapsed(elapsed)}</span>
              </div>
              <div className="flex items-center gap-1">
                <DollarSign className="w-3 h-3 text-gray-500" />
                <span className="font-mono tabular-nums">{formatCost(run.cost_usd)}</span>
              </div>
              <div className="flex items-center gap-1">
                <Users className="w-3 h-3 text-gray-500" />
                <span>{run.active_agents?.length ?? 0} active</span>
              </div>
              {run.git_branch && (
                <div className="flex items-center gap-1">
                  <GitBranch className="w-3 h-3 text-gray-500" />
                  <span className="font-mono text-gray-500 truncate max-w-[120px]">{run.git_branch}</span>
                </div>
              )}
              <span className="text-gray-600">{triggerLabel(run.triggered_by)}</span>
              <span className="text-gray-600">{formatDate(run.started_at)}</span>
            </div>

            {/* Progress bar */}
            <div className="mt-3">
              <ProgressBar value={progress} />
            </div>
          </div>

          {/* Right: action */}
          <button
            onClick={() => onViewDetails(run.plan_id)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-indigo-400 hover:bg-indigo-500/10 transition-colors cursor-pointer flex-shrink-0"
          >
            Details
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
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

  const [runs, setRuns] = useState<PlanRun[]>([])
  const [readyPlans, setReadyPlans] = useState<Plan[]>([])
  const [planTitles, setPlanTitles] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewFilter, setViewFilter] = useState<ViewFilter>('all')
  const [hasMore, setHasMore] = useState(true)

  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const planTitlesRef = useRef<Map<string, string>>(new Map())

  // ── Fetch plan titles for new plan IDs ─────────────────────────────────
  const fetchPlanTitles = useCallback(async (newRuns: PlanRun[]) => {
    const existing = planTitlesRef.current
    const newPlanIds = [...new Set(newRuns.map(r => r.plan_id))].filter(id => !existing.has(id))
    if (newPlanIds.length === 0) return

    await Promise.all(
      newPlanIds.map(async (pid) => {
        try {
          const plan = await plansApi.get(pid)
          if (plan?.title) existing.set(pid, plan.title)
        } catch {
          // Plan may have been deleted
        }
      })
    )
    planTitlesRef.current = new Map(existing)
    setPlanTitles(new Map(existing))
  }, [])

  // ── Initial fetch ──────────────────────────────────────────────────────
  const fetchInitial = useCallback(async () => {
    setLoading(true)
    setError(null)
    setRuns([])
    setHasMore(true)
    planTitlesRef.current = new Map()

    try {
      const status = filterToStatus(viewFilter)
      const [batch, approvedRes, inProgressRes] = await Promise.all([
        runnerApi.listAllRuns({ limit: PAGE_SIZE, offset: 0, status, workspace_slug: wsSlug }),
        plansApi.list({ status: 'approved', limit: 50, workspace_slug: wsSlug }),
        plansApi.list({ status: 'in_progress', limit: 50, workspace_slug: wsSlug }),
      ])
      setRuns(batch)
      setHasMore(batch.length >= PAGE_SIZE)

      // Merge approved + in_progress plans for "ready to run" section
      const approved = approvedRes.items ?? approvedRes ?? []
      const inProgress = inProgressRes.items ?? inProgressRes ?? []
      const seen = new Set<string>()
      const merged: Plan[] = []
      for (const p of [...(inProgress as Plan[]), ...(approved as Plan[])]) {
        if (!seen.has(p.id)) { seen.add(p.id); merged.push(p) }
      }
      setReadyPlans(merged)

      await fetchPlanTitles(batch)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load pipeline data')
    } finally {
      setLoading(false)
    }
  }, [viewFilter, wsSlug, fetchPlanTitles])

  // ── Load more (infinite scroll) ────────────────────────────────────────
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)

    try {
      const status = filterToStatus(viewFilter)
      const batch = await runnerApi.listAllRuns({
        limit: PAGE_SIZE,
        offset: runs.length,
        status,
        workspace_slug: wsSlug,
      })

      if (batch.length < PAGE_SIZE) {
        setHasMore(false)
      }

      if (batch.length > 0) {
        // Deduplicate by run_id
        const existingIds = new Set(runs.map(r => r.run_id))
        const newRuns = batch.filter(r => !existingIds.has(r.run_id))
        if (newRuns.length > 0) {
          setRuns(prev => [...prev, ...newRuns])
          await fetchPlanTitles(newRuns)
        }
      }
    } catch {
      // Silently fail on load-more — the user still has existing data
    } finally {
      setLoadingMore(false)
    }
  }, [loadingMore, hasMore, viewFilter, wsSlug, runs, fetchPlanTitles])

  // ── Effects ────────────────────────────────────────────────────────────

  // Initial fetch on mount and when filter changes
  useEffect(() => {
    fetchInitial()
  }, [fetchInitial])

  // Auto-refresh if any run is active (poll every 5s)
  useEffect(() => {
    const hasActive = runs.some(r => r.status === 'Running')
    if (!hasActive) return

    const timer = setInterval(() => {
      fetchInitial()
    }, 5000)

    return () => clearInterval(timer)
  }, [runs, fetchInitial])

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadMore()
        }
      },
      { rootMargin: '200px' },
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [loadMore])

  // ── Handlers ─────────────────────────────────────────────────────────
  const handleRefresh = () => fetchInitial()

  const handleViewDetails = (planId: string) => {
    navigate(workspacePath(wsSlug, `/plans/${planId}/runner`))
  }

  // ── Stats (computed from loaded runs — approximate) ────────────────────
  const stats = useMemo(() => ({
    totalRuns: runs.length,
    running: runs.filter(r => r.status === 'Running').length,
    completed: runs.filter(r => r.status === 'Completed').length,
    failed: runs.filter(r => r.status === 'Failed' || r.status === 'Cancelled').length,
    totalCost: runs.reduce((acc, r) => acc + (r.cost_usd ?? 0), 0),
  }), [runs])

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <PageShell
      title="Pipeline Dashboard"
      description="Run history across all plans — status, cost, and progress"
      actions={
        <Button variant="secondary" onClick={handleRefresh} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      }
    >
      {/* Stats cards */}
      {!loading && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <StatCard
            icon={<Gauge className="w-5 h-5" />}
            label="Total Runs"
            value={stats.totalRuns}
            accent="border-indigo-500"
          />
          <StatCard
            icon={<Activity className="w-5 h-5" />}
            label="Running"
            value={stats.running}
            accent="border-blue-500"
          />
          <StatCard
            icon={<CheckCircle2 className="w-5 h-5" />}
            label="Completed"
            value={stats.completed}
            accent="border-green-500"
          />
          <StatCard
            icon={<XCircle className="w-5 h-5" />}
            label="Failed"
            value={stats.failed}
            accent="border-red-500"
          />
          <StatCard
            icon={<DollarSign className="w-5 h-5" />}
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
          if (tab.value === 'all') count = runs.length
          else if (tab.value === 'running') count = stats.running
          else if (tab.value === 'completed') count = stats.completed
          else if (tab.value === 'failed') count = stats.failed

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
      ) : runs.length === 0 ? (
        <EmptyState
          title="No pipeline runs yet"
          description={
            viewFilter === 'all'
              ? 'No pipeline runs have been recorded yet. Run a plan to see its execution history here.'
              : `No ${viewFilter} runs.`
          }
          action={
            viewFilter !== 'all' ? (
              <Button variant="secondary" onClick={() => setViewFilter('all')}>
                Show all runs
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {runs.map((run) => (
            <RunCard
              key={run.run_id}
              run={run}
              planTitle={planTitles.get(run.plan_id) ?? `Plan ${run.plan_id.slice(0, 8)}...`}
              onViewDetails={handleViewDetails}
            />
          ))}

          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} className="h-1" />

          {/* Loading more indicator */}
          {loadingMore && (
            <div className="flex items-center justify-center py-4 text-gray-400 text-sm gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading more runs...
            </div>
          )}

          {/* End of list */}
          {!hasMore && runs.length > PAGE_SIZE && (
            <div className="text-center py-4 text-gray-600 text-xs">
              All {runs.length} runs loaded
            </div>
          )}
        </div>
      )}

      {/* Ready to run plans */}
      {!loading && readyPlans.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center gap-2 mb-4">
            <Rocket className="w-4 h-4 text-indigo-400" />
            <h2 className="text-sm font-semibold text-gray-200">Plans Ready to Run</h2>
            <span className="text-xs text-gray-500">({readyPlans.length})</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {readyPlans.map((plan) => (
              <Card
                key={plan.id}
                className="hover:border-indigo-500/30 transition-colors cursor-pointer"
                onClick={() => navigate(workspacePath(wsSlug, `/plans/${plan.id}`))}
              >
                <CardContent className="py-3">
                  <div className="flex items-start gap-3">
                    <FileText className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-medium text-gray-100 truncate">{plan.title}</h3>
                      {plan.description && (
                        <p className="text-xs text-gray-500 mt-1 line-clamp-2">{plan.description}</p>
                      )}
                      <div className="flex items-center gap-3 mt-2">
                        <Badge variant={plan.status === 'in_progress' ? 'info' : 'warning'}>
                          {plan.status === 'in_progress' ? 'In Progress' : 'Approved'}
                        </Badge>
                        {plan.priority > 0 && (
                          <span className="text-xs text-gray-600">Priority {plan.priority}</span>
                        )}
                      </div>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-gray-600 flex-shrink-0 mt-0.5" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </PageShell>
  )
}
