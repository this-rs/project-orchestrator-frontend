/**
 * The work dashboard: what it shows for the day and what its buttons do.
 * Only the service layer is mocked; the hook, model and component are the real ones.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Provider, createStore } from 'jotai'
import { projectsAtom } from '@/atoms'
import type { Plan, Task, TaskWithPlan } from '@/types'
import { DAY_PLAN_KEY } from '../dayPlan'
import { WORK_TEXT } from '../text'

const plansList = vi.fn()
const getNextTask = vi.fn()
const tasksList = vi.fn()
const tasksGet = vi.fn()
const tasksUpdate = vi.fn()
const batch = vi.fn()
const listAllRuns = vi.fn()
const startRun = vi.fn()
vi.mock('@/services/plans', () => ({ plansApi: { list: (...a: unknown[]) => plansList(...a), getNextTask: (...a: unknown[]) => getNextTask(...a) } }))
vi.mock('@/services/tasks', () => ({
  tasksApi: { list: (...a: unknown[]) => tasksList(...a), get: (...a: unknown[]) => tasksGet(...a), update: (...a: unknown[]) => tasksUpdate(...a) },
}))
vi.mock('@/services/progress', () => ({ progressApi: { batch: (...a: unknown[]) => batch(...a) } }))
vi.mock('@/services/runner', async () => {
  const actual = await vi.importActual<typeof import('@/services/runner')>('@/services/runner')
  return { ...actual, runnerApi: { listAllRuns: (...a: unknown[]) => listAllRuns(...a), startRun: (...a: unknown[]) => startRun(...a) } }
})
const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
vi.mock('@/hooks/useToast', () => ({ useToast: () => toast }))

import { WorkDashboard } from '../WorkDashboard'

const plan = (id: string, priority: number, extra: Partial<Plan> = {}): Plan => ({
  id, title: `Plan ${id}`, description: '', status: 'in_progress', created_at: '2026-09-01T00:00:00Z', created_by: 't', priority, ...extra,
})
const task = (id: string, status: Task['status'], extra: Partial<Task> = {}): Task => ({
  id, title: `Tâche ${id}`, description: '', status, tags: [], acceptance_criteria: [], affected_files: [], created_at: '2026-09-01T00:00:00Z', ...extra,
})
const listed = (t: Task, planId: string): TaskWithPlan => ({ ...t, plan_id: planId, plan_title: `Plan ${planId}` })
const page = <T,>(items: T[]) => ({ items, total: items.length, limit: 100, offset: 0 })

interface World {
  plans?: Plan[]
  inProgress?: TaskWithPlan[]
  blocked?: TaskWithPlan[]
  pending?: TaskWithPlan[]
  next?: Record<string, Task | null>
  runs?: unknown[]
  counts?: Record<string, unknown>
}
function seed(w: World = {}) {
  plansList.mockResolvedValue(page(w.plans ?? []))
  tasksList.mockImplementation(async (p: { status: string }) =>
    page(({ in_progress: w.inProgress, blocked: w.blocked, pending: w.pending } as Record<string, TaskWithPlan[] | undefined>)[p.status] ?? []),
  )
  getNextTask.mockImplementation(async (id: string) => w.next?.[id] ?? null)
  listAllRuns.mockResolvedValue(w.runs ?? [])
  batch.mockResolvedValue(w.counts ?? {})
  tasksGet.mockResolvedValue(null)
  tasksUpdate.mockResolvedValue({})
  startRun.mockResolvedValue({})
}

function renderDash(workspaces = ['acme'], shownPlanIds?: ReadonlySet<string>) {
  const store = createStore()
  store.set(projectsAtom, [{ id: 'pr', name: 'Backend', slug: 'backend', root_path: '/work/backend', created_at: '2026-01-01T00:00:00Z' }])
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <WorkDashboard workspaces={workspaces} lane={null} shownPlanIds={shownPlanIds} />
      </MemoryRouter>
    </Provider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

describe('WorkDashboard', () => {
  it('shows the day, what is in progress, what to take next and each plan to launch with its progress', async () => {
    seed({
      plans: [plan('a', 80, { project_id: 'pr' })],
      inProgress: [listed(task('run', 'in_progress', { priority: 7 }), 'a')],
      pending: [listed(task('nxt', 'pending'), 'a')],
      next: { a: task('nxt', 'pending', { priority: 9 }) },
      counts: { a: { total: 4, completed: 1, in_progress: 1, blocked: 0, pending: 2, failed: 0, percentage: 25 } },
    })
    renderDash()
    expect(await screen.findByText('Tâche run')).toBeTruthy()
    expect(screen.getByText('Tâche nxt')).toBeTruthy()
    // The plan is named on its task rows and on its chain row.
    expect(screen.getAllByText('Plan a').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('1/4')).toBeTruthy()
    expect(screen.getByRole('progressbar', { name: 'Avancement de Plan a' }).getAttribute('aria-valuenow')).toBe('25')
    // No summary line of its own: the page has ONE, above the queue.
    expect(screen.queryByTestId('work-summary')).toBeNull()
  })

  it('is one column: the day, in progress, blocked, to take next, plans to launch, in that order', async () => {
    seed({
      plans: [plan('a', 80)],
      inProgress: [listed(task('run', 'in_progress'), 'a')],
      blocked: [listed(task('bl', 'blocked'), 'a')],
      next: { a: task('nxt', 'pending') },
    })
    renderDash()
    const dash = await screen.findByTestId('work-dashboard')
    expect(dash.className).not.toMatch(/grid-cols/)
    expect(dash.querySelector('[class*="grid-cols"]')).toBeNull()
    const titles = within(dash).getAllByRole('heading').map((h) => h.textContent?.replace(/\d+$/, '').trim())
    expect(titles).toEqual([WORK_TEXT.day, WORK_TEXT.inProgress, WORK_TEXT.blocked, WORK_TEXT.next, WORK_TEXT.chains])
  })

  it('leaves out a plan the page already shows (running, waiting or to resume): a plan appears once', async () => {
    seed({
      plans: [plan('shown', 2), plan('idle', 1)],
      runs: [{ run_id: '1', plan_id: 'shown', status: 'failed', started_at: '2026-10-02T08:00:00Z' }],
    })
    renderDash(['acme'], new Set(['shown']))
    expect(await screen.findByText('Plan idle')).toBeTruthy()
    expect(screen.queryByText('Plan shown')).toBeNull()
    expect(screen.queryByRole('button', { name: new RegExp(WORK_TEXT.relaunch) })).toBeNull()
  })

  it('has no "plans to launch" group when every active plan is shown elsewhere', async () => {
    seed({ plans: [plan('a', 1)] })
    renderDash(['acme'], new Set(['a']))
    await screen.findByTestId('work-dashboard')
    expect(screen.queryByRole('heading', { name: new RegExp(`^${WORK_TEXT.chains}`) })).toBeNull()
  })

  it('says so when there is nothing planned and nothing running', async () => {
    seed()
    renderDash()
    expect(await screen.findByTestId('work-dashboard')).toBeTruthy()
    // Said once, as the empty state of the day.
    expect(screen.getAllByText(WORK_TEXT.dayEmpty)).toHaveLength(1)
    expect(screen.getByText(WORK_TEXT.nextEmpty)).toBeTruthy()
    expect(screen.queryByRole('heading', { name: new RegExp(`^${WORK_TEXT.chains}`) })).toBeNull()
  })

  it('adds a task to the day, remembers it across a reload, and shows it once', async () => {
    seed({ plans: [plan('a', 1)], next: { a: task('nxt', 'pending') }, pending: [listed(task('nxt', 'pending'), 'a')] })
    const first = renderDash()
    await screen.findByText('Tâche nxt')
    fireEvent.click(screen.getByRole('button', { name: WORK_TEXT.addToDay }))
    await waitFor(() => expect(JSON.parse(localStorage.getItem(DAY_PLAN_KEY) ?? '{}').ids).toEqual(['nxt']))
    // It now lives under "Ma journée" only: no longer offered in "À prendre".
    expect(screen.getAllByText('Tâche nxt')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: WORK_TEXT.addToDay })).toBeNull()
    first.unmount()
    renderDash()
    expect(await screen.findByText('Tâche nxt')).toBeTruthy()
    expect(screen.getByRole('button', { name: WORK_TEXT.completeAria('Tâche nxt') })).toBeTruthy()
  })

  it('reorders and removes tasks of the day', async () => {
    localStorage.setItem(DAY_PLAN_KEY, JSON.stringify({ date: 'x', ids: ['one', 'two'] }))
    seed({ plans: [plan('a', 1)], pending: [listed(task('one', 'pending'), 'a'), listed(task('two', 'pending'), 'a')] })
    renderDash()
    await screen.findByText('Tâche one')
    const order = () => screen.getAllByText(/^Tâche (one|two)$/).map((e) => e.textContent)
    expect(order()).toEqual(['Tâche one', 'Tâche two'])
    fireEvent.click(screen.getByRole('button', { name: `${WORK_TEXT.moveUp} : Tâche two` }))
    await waitFor(() => expect(order()).toEqual(['Tâche two', 'Tâche one']))
    fireEvent.click(screen.getByRole('button', { name: `${WORK_TEXT.removeFromDay} : Tâche two` }))
    await waitFor(() => expect(screen.queryByText('Tâche two')).toBeNull())
    expect(JSON.parse(localStorage.getItem(DAY_PLAN_KEY) ?? '{}').ids).toEqual(['one'])
  })

  it('starts a task (and plans it) and completes one, each through the task API', async () => {
    seed({
      plans: [plan('a', 1)],
      inProgress: [listed(task('run', 'in_progress'), 'a')],
      next: { a: task('nxt', 'pending') },
      pending: [listed(task('nxt', 'pending'), 'a')],
    })
    renderDash()
    await screen.findByText('Tâche nxt')
    fireEvent.click(screen.getByRole('button', { name: new RegExp(WORK_TEXT.start) }))
    await waitFor(() => expect(tasksUpdate).toHaveBeenCalledWith('nxt', { status: 'in_progress' }))
    expect(toast.success).toHaveBeenCalledWith(WORK_TEXT.started)
    fireEvent.click(screen.getByRole('button', { name: new RegExp(WORK_TEXT.complete) }))
    await waitFor(() => expect(tasksUpdate).toHaveBeenCalledWith('run', { status: 'completed' }))
    expect(toast.success).toHaveBeenCalledWith(WORK_TEXT.completed)
  })

  it('marks a planned task done from its check, and reports a failed action', async () => {
    localStorage.setItem(DAY_PLAN_KEY, JSON.stringify({ date: 'x', ids: ['one'] }))
    seed({ plans: [plan('a', 1)], pending: [listed(task('one', 'pending'), 'a')] })
    tasksUpdate.mockRejectedValueOnce(new Error('Le serveur refuse'))
    renderDash()
    fireEvent.click(await screen.findByRole('button', { name: WORK_TEXT.completeAria('Tâche one') }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Le serveur refuse'))
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('launches a chain that never ran, in the project folder', async () => {
    seed({ plans: [plan('a', 1, { project_id: 'pr' })], counts: { a: { total: 2, completed: 0, in_progress: 0, blocked: 0, pending: 2, failed: 0, percentage: 0 } } })
    renderDash()
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(WORK_TEXT.launch) }))
    await waitFor(() => expect(startRun).toHaveBeenCalledWith('a', '/work/backend', 'backend'))
    expect(toast.success).toHaveBeenCalledWith(WORK_TEXT.launched)
  })

  it('offers to relaunch a failed plan and does not list one that is running (the queue shows it)', async () => {
    seed({
      plans: [plan('f', 2), plan('r', 1)],
      runs: [
        { run_id: '1', plan_id: 'f', status: 'failed', started_at: '2026-10-02T08:00:00Z' },
        { run_id: '2', plan_id: 'r', status: 'running', started_at: '2026-10-02T09:00:00Z' },
      ],
    })
    renderDash()
    expect(await screen.findByRole('button', { name: new RegExp(WORK_TEXT.relaunch) })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: new RegExp(`${WORK_TEXT.launch}|${WORK_TEXT.relaunch}`) })).toHaveLength(1)
    expect(screen.queryByText('Plan r')).toBeNull()
    expect(screen.queryByText(WORK_TEXT.runLabel.running)).toBeNull()
    expect(screen.getByText(WORK_TEXT.runLabel.failed)).toBeTruthy()
  })

  it('tells why a chain could not be launched', async () => {
    seed({ plans: [plan('a', 1)] })
    startRun.mockRejectedValueOnce(new Error('Le plan a déjà un run actif'))
    renderDash()
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(WORK_TEXT.launch) }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Le plan a déjà un run actif'))
  })

  it('never asks the API for more than it accepts (it answers "limit cannot exceed 100")', async () => {
    seed({ plans: [plan('a', 1)] })
    renderDash()
    await screen.findByTestId('work-dashboard')
    const limits = [...plansList.mock.calls, ...tasksList.mock.calls, ...listAllRuns.mock.calls].map(
      ([params]) => (params as { limit?: number }).limit,
    )
    expect(limits.length).toBeGreaterThanOrEqual(5)
    for (const l of limits) expect(l).toBeLessThanOrEqual(100)
  })

  it('lists blocked tasks', async () => {
    seed({ plans: [plan('a', 1)], blocked: [listed(task('bl', 'blocked'), 'a')] })
    renderDash()
    expect(await screen.findByText('Tâche bl')).toBeTruthy()
    expect(within(screen.getByTestId('work-dashboard')).getByRole('heading', { name: /^Bloqué/ })).toBeTruthy()
  })

  it('shows an error with a retry when the first load fails, then recovers', async () => {
    seed()
    plansList.mockRejectedValueOnce(new Error('Réseau coupé'))
    renderDash()
    expect(await screen.findByText(WORK_TEXT.loadError)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(await screen.findByText(WORK_TEXT.nextEmpty)).toBeTruthy()
  })

  it('keeps showing the data and says it may be stale when a later refresh fails', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      seed({ plans: [plan('a', 1)], next: { a: task('nxt', 'pending') } })
      renderDash()
      expect(await screen.findByText('Tâche nxt')).toBeTruthy()
      plansList.mockRejectedValue(new Error('Réseau coupé'))
      await vi.advanceTimersByTimeAsync(31_000)
      expect(await screen.findByText(WORK_TEXT.stale)).toBeTruthy()
      expect(screen.getByText('Tâche nxt')).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('fetches a planned task that no list contains', async () => {
    localStorage.setItem(DAY_PLAN_KEY, JSON.stringify({ date: 'x', ids: ['deep'] }))
    seed({ plans: [plan('a', 1)] })
    tasksGet.mockResolvedValue(task('deep', 'pending'))
    renderDash()
    expect(await screen.findByText('Tâche deep')).toBeTruthy()
    expect(tasksGet).toHaveBeenCalledWith('deep')
  })
})
