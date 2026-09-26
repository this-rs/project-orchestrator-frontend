/**
 * TaskDetailPage — one scroll of sections (no tabs). Checks the header facts,
 * parent links from router state, every section (steps, criteria, files,
 * blockers, blocking, decisions, commits, conversations, details) and the
 * actions that used to be scattered over cards.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor, within } from '@testing-library/react'
import { installDomStubs, renderAt, eventBusStub } from './testUtils'

const get = vi.fn()
const listSteps = vi.fn()
const getBlockers = vi.fn()
const getBlocking = vi.fn()
const getCommits = vi.fn()
const getSessions = vi.fn()
const update = vi.fn()
const updateStep = vi.fn()
const deleteStep = vi.fn()
const removeDependency = vi.fn()
const planGet = vi.fn()

vi.mock('@/services', () => ({
  tasksApi: {
    get: (...a: unknown[]) => get(...a),
    listSteps: (...a: unknown[]) => listSteps(...a),
    getBlockers: (...a: unknown[]) => getBlockers(...a),
    getBlocking: (...a: unknown[]) => getBlocking(...a),
    getCommits: (...a: unknown[]) => getCommits(...a),
    getSessions: (...a: unknown[]) => getSessions(...a),
    update: (...a: unknown[]) => update(...a),
    updateStep: (...a: unknown[]) => updateStep(...a),
    deleteStep: (...a: unknown[]) => deleteStep(...a),
    removeDependency: (...a: unknown[]) => removeDependency(...a),
    list: vi.fn().mockResolvedValue({ items: [] }),
    delete: vi.fn(),
    addStep: vi.fn(),
    addDecision: vi.fn(),
    addDependencies: vi.fn(),
    linkCommit: vi.fn(),
  },
  plansApi: { get: (...a: unknown[]) => planGet(...a) },
  projectsApi: { list: vi.fn().mockResolvedValue({ items: [] }), listMilestones: vi.fn().mockResolvedValue({ items: [] }) },
  workspacesApi: { listMilestones: vi.fn().mockResolvedValue({ items: [] }) },
  decisionsApi: { update: vi.fn(), delete: vi.fn() },
  commitsApi: { getCommitFiles: vi.fn().mockResolvedValue({ items: [] }) },
  getEventBus: () => eventBusStub(),
}))

installDomStubs()

import { TaskDetailPage } from '../TaskDetailPage'

const now = new Date().toISOString()
const task = {
  id: 't1',
  title: 'Write login form',
  description: 'React form with validation',
  status: 'in_progress',
  assigned_to: 'theo',
  priority: 7,
  tags: ['frontend'],
  acceptance_criteria: ['Submits with Enter'],
  affected_files: ['src/Login.tsx'],
  estimated_complexity: 3,
  actual_complexity: 5,
  created_at: now,
  updated_at: now,
}

function renderPage() {
  return renderAt(<TaskDetailPage />, {
    pattern: '/workspace/:slug/tasks/:taskId',
    entry: { pathname: '/workspace/ws/tasks/t1', search: '?view=list', state: { planId: 'p1', planTitle: 'Auth flow' } },
  })
}

describe('TaskDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    get.mockResolvedValue({
      task,
      steps: [],
      decisions: [
        { id: 'd1', description: 'Use react-hook-form', rationale: 'less code', alternatives: ['formik'], chosen_option: 'react-hook-form', decided_by: 'a', decided_at: now, status: 'accepted' },
      ],
      depends_on: [],
      modifies_files: [],
    })
    listSteps.mockResolvedValue([
      { id: 's1', order: 1, description: 'Scaffold component', status: 'completed', created_at: now, completed_at: now },
      { id: 's2', order: 2, description: 'Add validation', status: 'pending', verification: 'unit tests pass', created_at: now },
    ])
    getBlockers.mockResolvedValue({ items: [{ id: 'tb', description: 'Design tokens', status: 'pending', priority: 2, tags: [], acceptance_criteria: [], affected_files: [], created_at: now }] })
    getBlocking.mockResolvedValue({ items: [{ id: 'tk', title: 'Deploy', status: 'blocked', tags: [], acceptance_criteria: [], affected_files: [], created_at: now }] })
    getCommits.mockResolvedValue({ items: [{ sha: 'abcdef1234567', message: 'feat: login', author: 'theo', timestamp: now, files_changed: ['a', 'b'] }] })
    getSessions.mockResolvedValue([
      { session: { id: 'sess-1234567890', title: 'Implement login', message_count: 12, model: 'opus', total_cost_usd: 0.5, created_at: now, cwd: '/Users/me/repo' }, links: { linked_tasks: [], linked_rfcs: [], linked_plans: [] }, source: 'runner' },
    ])
    planGet.mockResolvedValue({ plan: { id: 'p1', title: 'Auth flow' } })
    update.mockResolvedValue({})
    updateStep.mockResolvedValue({})
    deleteStep.mockResolvedValue({})
    removeDependency.mockResolvedValue({})
  })

  it('shows the header with parent plan, status, key facts, tags and every section', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { level: 1, name: 'Write login form' })).toBeTruthy()
    // PageHeader's sr-only label has no separating space in the computed name ("Plan:Auth flow") — ui/ is frozen
    expect(screen.getByRole('link', { name: /Plan:\s?Auth flow/ }).getAttribute('href')).toBe('/workspace/ws/plans/p1')
    expect(screen.getByRole('button', { name: /Status: In progress/ })).toBeTruthy()
    expect(screen.getByText('P7')).toBeTruthy()
    expect(screen.getByText('@theo')).toBeTruthy()
    expect(screen.getByText('complexity 3 → 5')).toBeTruthy()
    expect(screen.getByText('#frontend')).toBeTruthy()
    await screen.findByText('1/2 steps')

    for (const name of ['Steps', 'Acceptance criteria', 'Affected files', 'Blocked by', 'Blocking', 'Decisions', 'Commits', 'Conversations', 'Details']) {
      expect(screen.getByRole('region', { name: new RegExp(`^${name}`) })).toBeTruthy()
    }
    expect(screen.getByText('Submits with Enter')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open src/Login.tsx in code explorer' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Design tokens' }).getAttribute('href')).toBe('/workspace/ws/tasks/tb')
    expect(screen.getByRole('link', { name: 'Deploy' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Use react-hook-form' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'feat: login' })).toBeTruthy()
    const session = screen.getByRole('button', { name: 'Implement login' }).closest('li')!
    expect(within(session).getByText('12 msgs')).toBeTruthy()
    expect(within(session).getByText('$0.50')).toBeTruthy()
    expect(within(session).getByText('~/repo')).toBeTruthy()
    // Details facts
    expect(screen.getByText('Actual complexity')).toBeTruthy()
    expect(screen.getByText('t1')).toBeTruthy()
  })

  it('renders steps as rows with a status menu and edit / delete actions', async () => {
    renderPage()
    const row = (await screen.findByText('Add validation')).closest('li')!
    expect(within(row).getByText('Verify: unit tests pass')).toBeTruthy()
    fireEvent.click(within(row).getByRole('button', { name: /Status: Pending/ }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'In progress' }))
    await waitFor(() => expect(updateStep).toHaveBeenCalledWith('s2', { status: 'in_progress' }))
    fireEvent.click(within(row).getByRole('button', { name: 'Actions for Step 2: Add validation' }))
    expect(screen.getByRole('menuitem', { name: 'Edit step' })).toBeTruthy()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete step' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' }).at(-1)!)
    await waitFor(() => expect(deleteStep).toHaveBeenCalledWith('s2'))
  })

  it('removes a blocker from the ⋯ menu after confirmation', async () => {
    renderPage()
    const row = (await screen.findByRole('link', { name: 'Design tokens' })).closest('li')!
    fireEvent.click(within(row).getByRole('button', { name: 'Actions for Design tokens' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove dependency' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' }).at(-1)!)
    await waitFor(() => expect(removeDependency).toHaveBeenCalledWith('t1', 'tb'))
  })

  it('keeps every page action in the header ⋯ menu and changes the task status', async () => {
    renderPage()
    await screen.findByRole('heading', { level: 1, name: 'Write login form' })
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Write login form' }))
    for (const label of ['Edit', 'Add step', 'Add decision', 'Add dependency', 'Link commit', 'Delete']) {
      expect(screen.getByRole('menuitem', { name: label })).toBeTruthy()
    }
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: /Status: In progress/ }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Completed' }))
    await waitFor(() => expect(update).toHaveBeenCalledWith('t1', { status: 'completed' }))
  })

  it('shows the error state with retry when the task cannot load', async () => {
    get.mockRejectedValue(new Error('boom'))
    renderPage()
    expect(await screen.findByText('Failed to load task')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
  })
})
