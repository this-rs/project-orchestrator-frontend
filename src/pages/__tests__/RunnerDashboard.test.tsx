/**
 * RunnerDashboard — the "Discussion tree" tab shows the LinkedDiscussions of the
 * run (all the sessions linked to it as ONE forest) with the resume buttons the
 * run's state justifies.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor, within } from '@testing-library/react'
import { installDomStubs, renderAt } from './testUtils'

const getRunSessions = vi.fn()
const getSessionTree = vi.fn()
const startRun = vi.fn()
const snapshot = { current: null as unknown }

vi.mock('@/services/chat', () => ({
  chatApi: {
    getPlanSessions: vi.fn(),
    getTaskSessions: vi.fn(),
    getRunSessions: (...a: unknown[]) => getRunSessions(...a),
    getSessionTree: (...a: unknown[]) => getSessionTree(...a),
    associateSession: vi.fn(),
  },
}))
vi.mock('@/services/runner', async () => {
  const actual = await vi.importActual<typeof import('@/services/runner')>('@/services/runner')
  return {
    ...actual,
    runnerApi: { ...actual.runnerApi, startRun: (...a: unknown[]) => startRun(...a), retryTask: vi.fn(), updateBudget: vi.fn() },
    useRunnerStatus: () => ({ snapshot: snapshot.current, isRunning: false, error: null, refresh: vi.fn() }),
  }
})
vi.mock('@/services/plans', () => ({
  plansApi: { get: vi.fn().mockResolvedValue({ id: 'p1', title: 'Auth flow', project_id: 'proj-a' }), list: vi.fn() },
}))
vi.mock('@/services/projects', () => ({
  projectsApi: { list: vi.fn().mockResolvedValue({ items: [{ id: 'proj-a', slug: 'alpha', name: 'Alpha', root_path: '/repo/alpha' }] }) },
}))
vi.mock('@/hooks/runner', () => ({
  useAgentExecutionsMap: () => new Map(),
  useLatestPlanRun: () => null,
  useWavesData: () => ({ waves: null, loading: false }),
}))
vi.mock('@/components/runner/RunnerHeader', () => ({ RunnerHeader: () => <div data-testid="runner-header" /> }))
vi.mock('@/components/runner/StatsRow', () => ({ StatsRow: () => <div data-testid="stats-row" /> }))
vi.mock('@/components/runner/WaveSection', () => ({ WaveSection: () => null }))

installDomStubs()

import { RunnerDashboard } from '../RunnerDashboard'

const base = {
  running: false, run_id: 'run1', plan_id: 'p1', current_wave: 1, current_task_id: null, current_task_title: null,
  active_agents: [], progress_pct: 50, tasks_completed: 1, tasks_total: 2, elapsed_secs: 10, cost_usd: 1, max_cost_usd: 5,
}

function renderPage() {
  return renderAt(<RunnerDashboard />, { pattern: '/workspace/:slug/plans/:planId/runner', entry: '/workspace/ws/plans/p1/runner' })
}

describe('RunnerDashboard discussions tab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    snapshot.current = { ...base, status: 'failed' }
    getRunSessions.mockResolvedValue([
      { id: 'root', title: 'Run root', created_at: '2026-10-01T10:00:00Z', is_streaming: false },
      { id: 'stray', title: 'Stray agent', created_at: '2026-10-01T10:01:00Z', is_streaming: false },
    ])
    getSessionTree.mockImplementation(async (id: string) =>
      id === 'root'
        ? [
            { session_id: 'root', parent_session_id: null, depth: 0, is_streaming: false, run_id: 'run1' },
            { session_id: 'kid', parent_session_id: 'root', depth: 1, is_streaming: false, run_id: 'run1', title: 'Kid agent' },
          ]
        : [{ session_id: 'stray', parent_session_id: 'gone', depth: 1, is_streaming: false, run_id: 'run1' }],
    )
    startRun.mockResolvedValue({})
  })

  it('renders every session of the run as one forest (nothing lost) and resumes a failed run in the project folder', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('tab', { name: /Discussion tree/ }))
    await screen.findByText('Run root')
    expect(getRunSessions).toHaveBeenCalledWith('run1')
    for (const t of ['Run root', 'Kid agent', 'Stray agent']) expect(screen.getByText(t)).toBeTruthy()
    expect((screen.getByText('Stray agent').closest('[style]') as HTMLElement).style.paddingLeft).toBe('12px')

    const resume = screen.getAllByRole('button', { name: 'Reprendre le run' })
    expect(resume).toHaveLength(1)
    // the run's project is read to start it where the backend validates cwd
    await waitFor(() => fireEvent.click(resume[0]))
    await waitFor(() => expect(startRun).toHaveBeenCalled())
    expect(within(screen.getByTestId('linked-discussions')).getByTestId('linked-limits')).toBeTruthy()
  })

  it('offers no run resume when the run completed', async () => {
    snapshot.current = { ...base, status: 'completed' }
    renderPage()
    fireEvent.click(await screen.findByRole('tab', { name: /Discussion tree/ }))
    await screen.findByText('Run root')
    expect(screen.queryByRole('button', { name: 'Reprendre le run' })).toBeNull()
  })
})
