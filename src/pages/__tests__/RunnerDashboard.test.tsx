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

const providersList = vi.hoisted(() => vi.fn())
vi.mock('@/services/providers', async (orig) => ({
  ...(await orig<typeof import('@/services/providers')>()),
  providersApi: { list: (...a: unknown[]) => providersList(...a) },
}))
const ONE = { providers: [{ id: 'claude-code', kind: 'claude_code', label: 'Claude Code', builtin: true, health: { status: 'healthy' }, models: [] }] }
const TWO = (allowedForProject: boolean | undefined) => ({
  providers: [
    ...ONE.providers,
    { id: 'deepseek', kind: 'openai_compatible', label: 'DeepSeek', cost_source: 'priced', health: { status: 'healthy' }, models: [], allowed_for_project: allowedForProject },
  ],
  default: { provider: 'claude-code', model: null, routed_by: 'default' },
})


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
vi.mock('@/components/runner/RunnerHeader', () => ({
  RunnerHeader: ({ onRetryRun }: { onRetryRun: () => void }) => (
    <div data-testid="runner-header">
      <button onClick={onRetryRun}>retry run</button>
    </div>
  ),
}))
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
    providersList.mockResolvedValue(ONE)
  })

  it('renders every session of the run as one forest (nothing lost) and resumes a failed run in the project folder', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('tab', { name: /Discussion tree/ }))
    await screen.findByText('Run root')
    expect(getRunSessions).toHaveBeenCalledWith('run1')
    for (const t of ['Run root', 'Kid agent', 'Stray agent']) expect(screen.getByText(t)).toBeTruthy()
    expect((screen.getByText('Stray agent').closest('[style]') as HTMLElement).style.paddingLeft).toBe('4px')

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

describe('RunnerDashboard — the provider choice of a retry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    snapshot.current = { ...base, status: 'failed' }
    getRunSessions.mockResolvedValue([])
    getSessionTree.mockResolvedValue([])
    startRun.mockResolvedValue({})
  })

  const clickRetry = async () => {
    renderPage()
    await waitFor(() => expect(providersList).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 50))
    fireEvent.click(await screen.findByRole('button', { name: 'retry run' }))
  }

  it('asks which provider first: nothing starts until one is chosen, then it starts with that choice', async () => {
    providersList.mockResolvedValue(TWO(true))
    await clickRetry()
    expect(startRun).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole('radio', { name: /DeepSeek/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Launch$/ }))
    await waitFor(() => expect(startRun).toHaveBeenCalled())
    expect(startRun.mock.calls[0][4]).toEqual({ provider: 'deepseek' })
  })

  it('Escape closes the dialog and starts nothing', async () => {
    providersList.mockResolvedValue(TWO(true))
    await clickRetry()
    fireEvent.keyDown(await screen.findByRole('dialog'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(startRun).not.toHaveBeenCalled()
  })

  it("reads the consent of the PLAN's project, not the chat's", async () => {
    providersList.mockImplementation(async (params?: { project_slug?: string }) => TWO(params?.project_slug === 'alpha' ? false : true))
    await clickRetry()
    await waitFor(() => expect(providersList).toHaveBeenCalledWith({ project_slug: 'alpha' }))
    await waitFor(() => expect(screen.getByRole('radio', { name: /DeepSeek/ }).getAttribute('aria-disabled')).toBe('true'))
  })

  it('launches at once when there is one provider, as before', async () => {
    providersList.mockResolvedValue(ONE)
    await clickRetry()
    await waitFor(() => expect(startRun).toHaveBeenCalled())
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
