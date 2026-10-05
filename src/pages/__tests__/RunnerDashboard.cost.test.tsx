/**
 * RunnerDashboard — a finished run without a cost figure keeps "no figure"
 * all the way to the budget line: it used to become `0` (`cost_usd ?? 0`),
 * i.e. "$0.00", which claims the run was free.
 *
 * Run with: npx vitest run src/pages/__tests__/RunnerDashboard.cost.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { installDomStubs, renderAt } from './testUtils'

const latestRun = { current: null as unknown }
const IDLE = vi.hoisted(() => ({
  running: false, run_id: null, plan_id: null, status: null, current_wave: null, current_task_id: null, current_task_title: null,
  active_agents: [], progress_pct: 0, tasks_completed: 0, tasks_total: 0, elapsed_secs: 0, cost_usd: 0, max_cost_usd: 0,
}))

vi.mock('@/services/chat', () => ({
  chatApi: { getPlanSessions: vi.fn(), getTaskSessions: vi.fn(), getRunSessions: vi.fn().mockResolvedValue([]), getSessionTree: vi.fn(), associateSession: vi.fn() },
}))
vi.mock('@/services/runner', async () => {
  const actual = await vi.importActual<typeof import('@/services/runner')>('@/services/runner')
  return {
    ...actual,
    // The runner is idle: the page falls back on the plan's latest finished run.
    useRunnerStatus: () => ({ snapshot: IDLE, isRunning: false, error: null, refresh: vi.fn() }),
  }
})
vi.mock('@/services/plans', () => ({
  plansApi: { get: vi.fn().mockResolvedValue({ id: 'p1', title: 'Auth flow', project_id: 'proj-a' }), list: vi.fn() },
}))
vi.mock('@/services/projects', () => ({
  projectsApi: { list: vi.fn().mockResolvedValue({ items: [] }) },
}))
vi.mock('@/hooks/runner', () => ({
  useAgentExecutionsMap: () => new Map(),
  useLatestPlanRun: () => latestRun.current,
  useWavesData: () => ({ waves: null, loading: false }),
}))
vi.mock('@/components/runner/RunnerHeader', () => ({ RunnerHeader: () => <div data-testid="runner-header" /> }))
vi.mock('@/components/runner/WaveSection', () => ({ WaveSection: () => null }))
// The real StatsRow / BudgetEditor are tested in `components/runner`; here only
// what the page hands them matters.
vi.mock('@/components/runner/StatsRow', () => ({
  StatsRow: ({ effectiveSnapshot }: { effectiveSnapshot: { cost_usd: number | null; cost_basis?: string | null } | null }) => (
    <div
      data-testid="stats-row"
      data-cost={JSON.stringify(effectiveSnapshot?.cost_usd)}
      data-basis={String(effectiveSnapshot?.cost_basis ?? '')}
    />
  ),
}))

installDomStubs()

import { RunnerDashboard } from '../RunnerDashboard'

const run = (over: Record<string, unknown>) => ({
  run_id: 'run1', plan_id: 'p1', total_tasks: 2, current_wave: 1, current_task_id: null, current_task_title: null,
  active_agents: [], completed_tasks: ['t1'], failed_tasks: [], git_branch: 'main',
  started_at: '2026-10-05T10:00:00Z', completed_at: '2026-10-05T10:05:00Z', status: 'completed',
  triggered_by: 'manual', project_id: null,
  ...over,
})

const renderPage = () =>
  renderAt(<RunnerDashboard />, { pattern: '/workspace/:slug/plans/:planId/runner', entry: '/workspace/ws/plans/p1/runner' })

beforeEach(() => {
  vi.clearAllMocks()
})

describe('RunnerDashboard — cost of the latest run', () => {
  it('a run without a figure stays without a figure (not 0)', async () => {
    latestRun.current = run({ cost_usd: null, cost_basis: 'unknown' })
    renderPage()
    const stats = await screen.findByTestId('stats-row')
    expect(stats.getAttribute('data-cost')).toBe('null')
    expect(stats.getAttribute('data-basis')).toBe('unknown')
  })

  it('a record with no cost field at all is not turned into 0 either', async () => {
    latestRun.current = run({})
    renderPage()
    expect((await screen.findByTestId('stats-row')).getAttribute('data-cost')).toBe('null')
  })

  it('a Claude run keeps its reported cost', async () => {
    latestRun.current = run({ cost_usd: 1.25 })
    renderPage()
    const stats = await screen.findByTestId('stats-row')
    expect(stats.getAttribute('data-cost')).toBe('1.25')
    expect(stats.getAttribute('data-basis')).toBe('')
  })
})
