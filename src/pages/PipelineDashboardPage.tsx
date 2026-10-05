/**
 * PipelineDashboardPage — history of every pipeline run of the workspace.
 *
 *   Pipelines 20                                (PageShell, wide)
 *   [search] [filters ⚙] [↻]                     (FilterBar: status)
 *   20 runs loaded · 2 running · 15 completed · 3 failed · $12.30
 *   Today ▸ run rows … / Yesterday ▸ … / Older   (recency groups, load more)
 *   Ready to run 4 ▸ plan rows                   (approved / in-progress plans)
 *
 * Polls every 5 s while a run is active; infinite scroll loads 20 runs per page.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { RefreshCw } from 'lucide-react'
import { runnerApi } from '@/services/runner'
import type { PlanRun } from '@/services/runner'
import { plansApi } from '@/services/plans'
import type { Plan } from '@/types'
import {
  EmptyState,
  EntityList,
  EntityListSkeleton,
  EntityRow,
  ErrorState,
  FilterBar,
  ListGroup,
  LoadMoreSentinel,
  MetaLine,
  PageShell,
  PriorityText,
  RelativeTime,
  Section,
  Select,
  StatusDot,
  StatusText,
  focusRing,
  getStatusMeta,
  groupByRecency,
  pluralize,
  Button,
} from '@/components/ui'
import { PlanRunRow } from '@/components/runner/PlanRunRow'
import { Explainer } from '@/components/protocols/Explainer'
import { runCost } from '@/components/runner/shared'
import { COST_SUM_PARTIAL_HELP, formatCostSum, sumCosts } from '@/utils/cost'
import { useWorkspaceSlug } from '@/hooks'
import { workspacePath } from '@/utils/paths'
import { NOMENCLATURE } from '@/constants/nomenclature'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20

type StatusFilter = 'all' | 'running' | 'completed' | 'failed' | 'interrupted'

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'running', label: 'Running' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'interrupted', label: 'Interrupted' },
]

const FAILED_LIKE = new Set(['failed', 'cancelled', 'budget_exceeded', 'interrupted'])

function runTitle(run: PlanRun): string {
  return run.plan_title || `Plan ${run.plan_id.slice(0, 8)}…`
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PipelineDashboardPage() {
  const wsSlug = useWorkspaceSlug()

  const [runs, setRuns] = useState<PlanRun[]>([])
  const [readyPlans, setReadyPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [search, setSearch] = useState('')
  const [hasMore, setHasMore] = useState(true)

  const hasLoadedOnce = useRef(false)
  const runsRef = useRef(runs)
  runsRef.current = runs
  const loadingMoreRef = useRef(loadingMore)
  loadingMoreRef.current = loadingMore
  const hasMoreRef = useRef(hasMore)
  hasMoreRef.current = hasMore

  const statusParam = statusFilter === 'all' ? undefined : statusFilter

  // ── Initial fetch (also used by the poll — no skeleton after the first load)
  const fetchInitial = useCallback(async () => {
    const first = !hasLoadedOnce.current
    if (first) {
      setLoading(true)
      setError(null)
    }
    try {
      const [batch, approved, inProgress] = await Promise.all([
        runnerApi.listAllRuns({ limit: PAGE_SIZE, offset: 0, status: statusParam, workspace_slug: wsSlug }),
        plansApi.list({ status: 'approved', limit: 50, workspace_slug: wsSlug }),
        plansApi.list({ status: 'in_progress', limit: 50, workspace_slug: wsSlug }),
      ])
      setRuns(batch)
      setHasMore(batch.length >= PAGE_SIZE)
      const seen = new Set<string>()
      const merged: Plan[] = []
      for (const p of [...(inProgress.items ?? []), ...(approved.items ?? [])]) {
        if (!seen.has(p.id)) {
          seen.add(p.id)
          merged.push(p)
        }
      }
      setReadyPlans(merged)
      hasLoadedOnce.current = true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load pipeline runs')
    } finally {
      if (first) setLoading(false)
    }
  }, [statusParam, wsSlug])

  // ── Load more (infinite scroll)
  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMoreRef.current) return
    setLoadingMore(true)
    try {
      const batch = await runnerApi.listAllRuns({
        limit: PAGE_SIZE,
        offset: runsRef.current.length,
        status: statusParam,
        workspace_slug: wsSlug,
      })
      if (batch.length < PAGE_SIZE) setHasMore(false)
      if (batch.length > 0) {
        setRuns((prev) => {
          const ids = new Set(prev.map((r) => r.run_id))
          const fresh = batch.filter((r) => !ids.has(r.run_id))
          return fresh.length > 0 ? [...prev, ...fresh] : prev
        })
      }
    } catch {
      // keep what we have
    } finally {
      setLoadingMore(false)
    }
  }, [statusParam, wsSlug])

  useEffect(() => {
    hasLoadedOnce.current = false
    fetchInitial()
  }, [fetchInitial])

  // Poll while a run is active
  useEffect(() => {
    if (!runs.some((r) => r.status === 'running')) return
    const timer = setInterval(fetchInitial, 5000)
    return () => clearInterval(timer)
  }, [runs, fetchInitial])

  // Sentinel (callback ref so the observer follows the element)
  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!sentinel || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore()
      },
      { rootMargin: '200px' },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [sentinel, loadMore])

  // ── Derived
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return runs
    return runs.filter((r) => runTitle(r).toLowerCase().includes(q) || (r.git_branch ?? '').toLowerCase().includes(q))
  }, [runs, search])
  const groups = useMemo(() => groupByRecency(visible, (r) => r.started_at), [visible])

  const stats = useMemo(
    () => ({
      running: runs.filter((r) => r.status === 'running').length,
      completed: runs.filter((r) => r.status === 'completed').length,
      failed: runs.filter((r) => FAILED_LIKE.has(r.status)).length,
      // Runs without a figure make the total a floor ("≥ $x"), not an exact sum.
      cost: sumCosts(runs.map(runCost)),
    }),
    [runs],
  )

  const activeCount = statusFilter !== 'all' ? 1 : 0
  const pristine = runs.length === 0 && statusFilter === 'all' && !search

  return (
    <PageShell
      title={NOMENCLATURE.automation.plural}
      description="Run history across all plans — status, cost and progress"
      count={loading ? undefined : visible.length}
      width="wide"
      filters={
        <div className="space-y-3">
          <FilterBar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search runs…"
            activeCount={activeCount}
            activeLabels={[statusFilter !== 'all' ? STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label ?? '' : '']}
            onClear={() => setStatusFilter('all')}
            filters={<Select options={STATUS_OPTIONS} value={statusFilter} onChange={(v) => setStatusFilter(v as StatusFilter)} />}
            trailing={
              <button
                type="button"
                onClick={() => fetchInitial()}
                disabled={loading}
                aria-label="Refresh"
                className={`inline-flex items-center justify-center w-9 h-9 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-white/[0.06] disabled:opacity-50 ${focusRing}`}
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
              </button>
            }
          />
          <Explainer>
            A pipeline run executes a plan: its tasks are grouped into waves and each task is handled by an agent. Tap a
            run to open its live dashboard.
          </Explainer>
        </div>
      }
    >
      <div className="space-y-6">
        <div>
          {error ? (
            <ErrorState title="Failed to load pipeline runs" description={error} onRetry={() => fetchInitial()} />
          ) : loading ? (
            <EntityListSkeleton rows={6} />
          ) : visible.length === 0 ? (
            <EmptyState
              title={pristine ? 'No pipeline runs yet' : 'No matching runs'}
              description={
                pristine
                  ? 'Run a plan to see its execution history here.'
                  : 'Try another search or clear the filters.'
              }
              action={
                pristine ? undefined : (
                  <Button size="sm" variant="secondary" onClick={() => { setStatusFilter('all'); setSearch('') }}>
                    Clear
                  </Button>
                )
              }
            />
          ) : (
            <>
              <MetaLine
                className="px-1 mb-2"
                items={[
                  <span key="n" className="tabular-nums">{pluralize(runs.length, 'run')} loaded</span>,
                  stats.running > 0 ? (
                    <span key="r" className="inline-flex items-center gap-1.5 text-indigo-300">
                      <StatusDot tone="progress" pulse />
                      {stats.running} running
                    </span>
                  ) : null,
                  stats.completed > 0 ? <span key="c" className="text-emerald-400">{stats.completed} completed</span> : null,
                  stats.failed > 0 ? <span key="f" className="text-red-400">{stats.failed} failed</span> : null,
                  formatCostSum(stats.cost) ? (
                    <span key="$" className="font-mono tabular-nums" title={stats.cost.unknown > 0 ? COST_SUM_PARTIAL_HELP : undefined}>
                      {formatCostSum(stats.cost)} total
                    </span>
                  ) : null,
                ]}
              />
              <div>
                {groups.map(({ group, items }) => (
                  <ListGroup key={group} title={group} count={items.length}>
                    {items.map((run) => (
                      <PlanRunRow
                        key={run.run_id}
                        run={run}
                        title={runTitle(run)}
                        href={workspacePath(wsSlug, `/plans/${run.plan_id}/runner`)}
                      />
                    ))}
                  </ListGroup>
                ))}
              </div>
              <LoadMoreSentinel sentinelRef={setSentinel} loadingMore={loadingMore} hasMore={hasMore && !search} />
            </>
          )}
        </div>

        {!loading && !error && readyPlans.length > 0 && (
          <Section title="Ready to run" count={readyPlans.length} description="Approved and in-progress plans that can be executed.">
            <EntityList aria-label="Plans ready to run">
              {readyPlans.map((plan) => (
                <EntityRow
                  key={plan.id}
                  title={plan.title}
                  href={workspacePath(wsSlug, `/plans/${plan.id}`)}
                  tone={getStatusMeta('plan', plan.status).tone}
                  description={plan.description}
                  status={[
                    <StatusText key="s" kind="plan" icon status={plan.status} />,
                    <PriorityText key="p" priority={plan.priority} />,
                  ]}
                  trailing={<RelativeTime date={plan.created_at} />}
                  chevron
                />
              ))}
            </EntityList>
          </Section>
        )}
      </div>
    </PageShell>
  )
}
