/**
 * PipelineDashboardPage — run history as EntityRows. Verifies that every
 * piece of information of the former RunCard (status, tasks, failed, time,
 * cost, agents, branch, trigger, date, details link) and the "ready to run"
 * plans are still present.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { PlanRun } from '@/services/runner'

const listAllRuns = vi.fn()
const plansList = vi.fn()

vi.mock('@/services/runner', () => ({
  runnerApi: { listAllRuns: (...a: unknown[]) => listAllRuns(...a) },
}))
vi.mock('@/services/plans', () => ({
  plansApi: { list: (...a: unknown[]) => plansList(...a) },
}))
vi.mock('@/hooks', () => ({
  useWorkspaceSlug: () => 'ws',
}))

import { PipelineDashboardPage } from '../PipelineDashboardPage'

// Fixed at local noon: the page groups runs by calendar day ("Today" / "Yesterday"),
// so a fixture of "5 minutes ago" built from the real clock lands in "Yesterday"
// whenever the suite runs within 5 minutes after midnight.
const noon = new Date()
noon.setHours(12, 0, 0, 0)
const now = noon.getTime()
const runs: PlanRun[] = [
  {
    run_id: 'run-1',
    plan_id: 'plan-1',
    plan_title: 'Auth flow',
    total_tasks: 8,
    current_wave: 1,
    current_task_id: null,
    current_task_title: null,
    active_agents: [
      { task_id: 't', task_title: 'T', session_id: null, elapsed_secs: 1, cost_usd: 0, status: 'running' },
      { task_id: 'u', task_title: 'U', session_id: null, elapsed_secs: 1, cost_usd: 0, status: 'running' },
    ],
    completed_tasks: ['a', 'b', 'c'],
    failed_tasks: ['d'],
    git_branch: 'feat/auth-flow',
    started_at: new Date(now - 5 * 60 * 1000).toISOString(),
    completed_at: null,
    status: 'running',
    cost_usd: 1.2,
    triggered_by: { chat: { session_id: null } },
    project_id: null,
  },
  {
    run_id: 'run-2',
    plan_id: 'plan-2',
    plan_title: 'Billing',
    total_tasks: 2,
    current_wave: 0,
    current_task_id: null,
    current_task_title: null,
    active_agents: [],
    completed_tasks: ['x', 'y'],
    failed_tasks: [],
    git_branch: '',
    started_at: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(),
    completed_at: new Date(now - 3 * 24 * 60 * 60 * 1000 + 90_000).toISOString(),
    status: 'completed',
    cost_usd: 0.5,
    triggered_by: 'manual',
    project_id: null,
  },
]

afterEach(() => {
  vi.useRealTimers()
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(noon)
  listAllRuns.mockReset().mockResolvedValue(runs)
  plansList.mockReset().mockImplementation((p: { status: string }) =>
    Promise.resolve({
      items:
        p.status === 'approved'
          ? [{ id: 'plan-9', title: 'Search revamp', description: 'Better search', status: 'approved', priority: 8, created_at: new Date().toISOString() }]
          : [],
    }),
  )
})

describe('PipelineDashboardPage', () => {
  it('renders each run as a row with status, tasks, failed, duration, cost, agents, trigger and branch', async () => {
    render(
      <MemoryRouter>
        <PipelineDashboardPage />
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByText('Auth flow')).toBeTruthy())
    expect(screen.getByText('Running')).toBeTruthy()
    expect(screen.getByText('3/8 tasks')).toBeTruthy()
    expect(screen.getByText('1 failed')).toBeTruthy()
    expect(screen.getAllByText('5m').length).toBeGreaterThan(0) // duration (and the relative start time)
    expect(screen.getByText('$1.20')).toBeTruthy()
    expect(screen.getByText('2 agents')).toBeTruthy()
    expect(screen.getByText('Chat')).toBeTruthy()
    expect(screen.getByText('feat/auth-flow')).toBeTruthy()
    expect(screen.getByRole('progressbar', { name: /auth flow progress/i })).toBeTruthy()
    // completed run
    expect(screen.getByText('Billing')).toBeTruthy()
    expect(screen.getByText('Manual')).toBeTruthy()
    expect(screen.getByText('1m')).toBeTruthy()
    // rows link to the runner dashboard
    expect(screen.getByRole('link', { name: 'Auth flow' }).getAttribute('href')).toBe('/workspace/ws/plans/plan-1/runner')
    // recency groups
    expect(screen.getByText('Today')).toBeTruthy()
    expect(screen.getByText('Previous 7 days')).toBeTruthy()
  })

  it('shows the summary line and the plans ready to run', async () => {
    render(
      <MemoryRouter>
        <PipelineDashboardPage />
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByText('2 runs loaded')).toBeTruthy())
    expect(screen.getByText('1 running')).toBeTruthy()
    expect(screen.getByText('1 completed')).toBeTruthy()
    expect(screen.getByText('$1.70 total')).toBeTruthy()
    expect(screen.getByText('Ready to run')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Search revamp' }).getAttribute('href')).toBe('/workspace/ws/plans/plan-9')
    expect(screen.getByText('P8')).toBeTruthy()
  })

  it('shows an empty state when there are no runs', async () => {
    listAllRuns.mockResolvedValue([])
    render(
      <MemoryRouter>
        <PipelineDashboardPage />
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByText('No pipeline runs yet')).toBeTruthy())
  })
})
