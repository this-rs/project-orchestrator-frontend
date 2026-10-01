/**
 * PlanDetailPage — header (status, key facts, breakdown, parents, ⋯ menu,
 * launch action), tasks grouped by status with inline steps, tabs and
 * artefacts (constraints with confirmed delete, decisions with task link).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor, within } from '@testing-library/react'
import { installDomStubs, renderAt, eventBusStub } from './testUtils'

const planGet = vi.fn()
const taskList = vi.fn()
const listSteps = vi.fn()
const listConstraints = vi.fn()
const getCommits = vi.fn()
const getPlanSessions = vi.fn()
const getSessionTree = vi.fn()
const deleteConstraint = vi.fn()
const taskUpdate = vi.fn()
const unlinkFromProject = vi.fn()
const runnerStatus = { isRunning: false, snapshot: null as unknown }

vi.mock('@/services', () => ({
  plansApi: {
    get: (...a: unknown[]) => planGet(...a),
    listConstraints: (...a: unknown[]) => listConstraints(...a),
    getDependencyGraph: vi.fn().mockResolvedValue(null),
    getCommits: (...a: unknown[]) => getCommits(...a),
    deleteConstraint: (...a: unknown[]) => deleteConstraint(...a),
    unlinkFromProject: (...a: unknown[]) => unlinkFromProject(...a),
    updateStatus: vi.fn().mockResolvedValue({}),
    update: vi.fn(),
    delete: vi.fn(),
    createTask: vi.fn(),
    addConstraint: vi.fn(),
    linkCommit: vi.fn(),
    linkToProject: vi.fn(),
  },
  tasksApi: {
    list: (...a: unknown[]) => taskList(...a),
    listSteps: (...a: unknown[]) => listSteps(...a),
    update: (...a: unknown[]) => taskUpdate(...a),
  },
  projectsApi: {
    list: vi.fn().mockResolvedValue({ items: [{ id: 'proj-a', slug: 'alpha', name: 'Alpha', root_path: '/repo' }] }),
    listMilestones: vi.fn().mockResolvedValue({ items: [] }),
    getMilestone: vi.fn(),
  },
  workspacesApi: { listMilestones: vi.fn().mockResolvedValue({ items: [] }), getMilestone: vi.fn(), listProjects: vi.fn().mockResolvedValue([]) },
  decisionsApi: { update: vi.fn(), delete: vi.fn() },
  commitsApi: { getCommitFiles: vi.fn().mockResolvedValue({ items: [] }) },
  getEventBus: () => eventBusStub(),
}))
vi.mock('@/services/chat', () => ({
  chatApi: {
    getPlanSessions: (...a: unknown[]) => getPlanSessions(...a),
    getTaskSessions: vi.fn(),
    getRunSessions: vi.fn(),
    getSessionTree: (...a: unknown[]) => getSessionTree(...a),
    associateSession: vi.fn(),
  },
}))
vi.mock('@/services/api', () => ({ ApiError: class ApiError extends Error { status = 0 } }))
vi.mock('@/services/runner', () => ({
  runnerApi: { startRun: vi.fn(), forceCancelRun: vi.fn(), updateBudget: vi.fn() },
  useRunnerStatus: () => runnerStatus,
}))
vi.mock('@/hooks/usePlanGraphData', () => ({
  usePlanGraphData: () => ({ data: null, graph: null, waves: null, fetchWaves: vi.fn(), wavesLoading: false }),
}))
vi.mock('@/components/graph/UnifiedGraphSection', () => ({ UnifiedGraphSection: () => <div data-testid="graph" /> }))
vi.mock('@/components/runner/PlanRunHistory', () => ({ PlanRunHistory: () => <div data-testid="run-history" /> }))
vi.mock('@/components/runner/StatsRow', () => ({ StatsRow: () => <div data-testid="stats-row" /> }))
vi.mock('@/components/pipeline/ImplementDialog', () => ({
  ImplementDialog: ({ open }: { open: boolean }) => (open ? <div role="dialog" aria-label="Implement" /> : null),
}))

installDomStubs()

import { PlanDetailPage } from '../PlanDetailPage'

const now = new Date().toISOString()
const baseTask = { tags: [], acceptance_criteria: [], affected_files: [], created_at: now }
const tasks = [
  { ...baseTask, id: 't1', title: 'Write login form', description: 'form', status: 'in_progress', priority: 7, assigned_to: 'theo', tags: ['auth'] },
  { ...baseTask, id: 't2', title: 'Deploy', description: 'ship it', status: 'completed', priority: 2 },
  { ...baseTask, id: 't3', title: 'Design tokens', description: 'colors', status: 'pending' },
]

function renderPage() {
  return renderAt(<PlanDetailPage />, { pattern: '/workspace/:slug/plans/:planId', entry: '/workspace/ws/plans/p1?view=list' })
}

describe('PlanDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    runnerStatus.isRunning = false
    runnerStatus.snapshot = null
    planGet.mockResolvedValue({
      plan: { id: 'p1', title: 'Auth flow', description: 'OIDC login', status: 'approved', created_at: now, created_by: 'theo', priority: 8, project_id: 'proj-a' },
      tasks: [
        {
          task: tasks[0],
          decisions: [{ id: 'd1', description: 'Use PKCE', rationale: 'security', alternatives: [], decided_by: 'a', decided_at: now, status: 'accepted' }],
        },
      ],
    })
    taskList.mockResolvedValue({ items: tasks, total: 3 })
    listSteps.mockResolvedValue([
      { id: 's1', order: 1, description: 'Scaffold', status: 'completed', created_at: now },
      { id: 's2', order: 2, description: 'Validate', status: 'pending', created_at: now },
    ])
    listConstraints.mockResolvedValue([{ id: 'c1', constraint_type: 'security', description: 'No plaintext tokens', severity: 'high' }])
    getCommits.mockResolvedValue({ items: [] })
    getPlanSessions.mockResolvedValue([])
    getSessionTree.mockResolvedValue([])
    deleteConstraint.mockResolvedValue({})
    taskUpdate.mockResolvedValue({})
    unlinkFromProject.mockResolvedValue({})
  })

  it('shows the header: parents, status, key facts, breakdown and the launch action when approved', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { level: 1, name: 'Auth flow' })).toBeTruthy()
    expect((await screen.findByRole('link', { name: 'Project: Alpha' })).getAttribute('href')).toBe('/workspace/ws/projects/alpha')
    expect(screen.getByRole('button', { name: /Status: Approved/ })).toBeTruthy()
    expect(screen.getByText('P8')).toBeTruthy()
    expect(screen.getByText('theo')).toBeTruthy()
    expect(screen.getByText('3 tasks')).toBeTruthy()
    expect(screen.getByText('1/3 done')).toBeTruthy()
    expect(screen.getByRole('img', { name: '1 in progress, 1 pending, 1 completed' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Run' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Actions for Auth flow' }))
    for (const label of ['Edit', 'Add task', 'Add constraint', 'Link commit', 'Unlink project', 'Open runner', 'Delete']) {
      expect(screen.getByRole('menuitem', { name: label })).toBeTruthy()
    }
    expect(screen.queryByRole('menuitem', { name: 'Link project' })).toBeNull()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Unlink project' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Unlink' }).at(-1)!)
    await waitFor(() => expect(unlinkFromProject).toHaveBeenCalledWith('p1'))
  })

  it('groups tasks by status, changes status from the row and expands steps inline', async () => {
    renderPage()
    const row = (await screen.findByRole('link', { name: 'Write login form' })).closest('li')!
    expect(screen.getByRole('region', { name: /^In progress/ })).toBeTruthy()
    expect(screen.getByRole('region', { name: /^Pending/ })).toBeTruthy()
    expect(screen.getByRole('region', { name: /^Completed/ })).toBeTruthy()
    expect(within(row).getByText('P7')).toBeTruthy()
    expect(within(row).getByText('@theo')).toBeTruthy()
    expect(within(row).getByText('#auth')).toBeTruthy()
    expect(within(row).getByText('form')).toBeTruthy()

    fireEvent.click(within(row).getByRole('button', { name: 'Show steps of Write login form' }))
    await within(row).findByText('Validate')
    expect(listSteps).toHaveBeenCalledWith('t1')
    expect(within(row).getByText('1/2 steps')).toBeTruthy()
    fireEvent.click(within(row).getByRole('button', { name: 'Hide steps of Write login form' }))
    expect(within(row).queryByText('Validate')).toBeNull()

    // Expand all
    fireEvent.click(screen.getByRole('button', { name: 'Expand all steps' }))
    await waitFor(() => expect(listSteps).toHaveBeenCalledWith('t3'))

    // Status change moves the row to the "Blocked" group
    fireEvent.click(within(row).getByRole('button', { name: /Status: In progress/ }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Blocked' }))
    await waitFor(() => expect(taskUpdate).toHaveBeenCalledWith('t1', { status: 'blocked' }))
    expect(screen.getByRole('region', { name: /^Blocked/ })).toBeTruthy()
  })

  it('shows artefacts: constraints delete with confirmation, decisions link back to their task', async () => {
    renderPage()
    await screen.findByRole('heading', { level: 1, name: 'Auth flow' })
    fireEvent.click(screen.getByRole('tab', { name: /Artefacts/ }))
    const constraint = (await screen.findByText('No plaintext tokens')).closest('li')!
    expect(within(constraint).getByText('Security')).toBeTruthy()
    expect(within(constraint).getByText('high severity')).toBeTruthy()
    fireEvent.click(within(constraint).getByRole('button', { name: 'Actions for No plaintext tokens' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    expect(deleteConstraint).not.toHaveBeenCalled()
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' }).at(-1)!)
    await waitFor(() => expect(deleteConstraint).toHaveBeenCalledWith('c1'))

    const decision = screen.getByRole('link', { name: 'Use PKCE' }).closest('li')!
    expect(within(decision).getByRole('link', { name: 'Write login form' }).getAttribute('href')).toBe('/workspace/ws/tasks/t1')
    expect(screen.getByText('No commits linked to this plan yet')).toBeTruthy()
  })

  it('shows the active run in the header and the runner tab while a pipeline runs', async () => {
    runnerStatus.isRunning = true
    runnerStatus.snapshot = { tasks_total: 3, tasks_completed: 1, active_agents: [{ status: 'running' }], current_wave: 0 }
    renderPage()
    await screen.findByRole('heading', { level: 1, name: 'Auth flow' })
    expect(screen.getByRole('button', { name: /Run in progress/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Run' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Open runner' })).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'Runner' }))
    expect(await screen.findByRole('region', { name: /Active run/ })).toBeTruthy()
    expect(screen.getByTestId('stats-row')).toBeTruthy()
    expect(screen.getByTestId('run-history')).toBeTruthy()
  })

  it('lazy-loads the discussion TREE of the plan on the Conversations tab (a session attached without parent is a root)', async () => {
    getPlanSessions.mockResolvedValue([
      { session: { id: 'sess-1234567890', title: 'Plan chat', message_count: 3, created_at: now }, links: { linked_tasks: [{ id: 't1', title: 'Write login form' }], linked_rfcs: [], linked_plans: [] }, source: 'manual' },
    ])
    getSessionTree.mockResolvedValue([
      { session_id: 'sess-1234567890', parent_session_id: 'elsewhere', depth: 1, is_streaming: false },
      { session_id: 'child-1', parent_session_id: 'sess-1234567890', depth: 1, is_streaming: false, title: 'Sub agent' },
    ])
    renderPage()
    await screen.findByRole('heading', { level: 1, name: 'Auth flow' })
    expect(getPlanSessions).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('tab', { name: /Conversations/ }))
    const root = (await screen.findByText('Plan chat')).closest('[style]') as HTMLElement
    expect(getPlanSessions).toHaveBeenCalledWith('p1')
    expect(root.style.paddingLeft).toBe('12px')
    expect(screen.getByText('Sub agent')).toBeTruthy()
    expect(screen.getByText(/Write login form/)).toBeTruthy() // the flat list's linked tasks line survives
    expect(screen.getByTestId('linked-limits')).toBeTruthy()
  })
})
