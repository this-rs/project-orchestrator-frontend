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

const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
vi.mock('@/hooks/useToast', () => ({ useToast: () => toast }))

import { ROWS_SHOWN, WorkDashboard } from '../WorkDashboard'

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
  providersList.mockResolvedValue(ONE)
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

/** Opens the ⋯ menu of a row and activates one of its items. */
function menu(rowTitle: string, item: string) {
  fireEvent.click(screen.getByRole('button', { name: `Actions for ${rowTitle}` }))
  fireEvent.click(screen.getByRole('menuitem', { name: item }))
}

const tab = (label: string) => screen.getByRole('tab', { name: new RegExp(`^${label}`) })
const queryTab = (label: string) => screen.queryByRole('tab', { name: new RegExp(`^${label}`) })
/** Shows one list of the dashboard: clicks the tab whose name starts with `label` (its count follows). */
function openTab(label: string) {
  fireEvent.click(tab(label))
  expect(tab(label).getAttribute('aria-selected')).toBe('true')
}
/** The one list on screen. */
const panel = () => screen.getByRole('tabpanel')

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
    // One block: a title and one tab per list, each with its count.
    expect(await screen.findByRole('heading', { level: 2, name: WORK_TEXT.title })).toBeTruthy()
    expect(screen.getByRole('tablist', { name: WORK_TEXT.title })).toBeTruthy()
    expect(tab(WORK_TEXT.day).textContent).toBe(`${WORK_TEXT.day} 0`)
    expect(tab(WORK_TEXT.inProgress).textContent).toBe(`${WORK_TEXT.inProgress} 1`)
    expect(tab(WORK_TEXT.next).textContent).toBe(`${WORK_TEXT.next} 1`)
    expect(tab(WORK_TEXT.chains).textContent).toBe(`${WORK_TEXT.chains} 1`)
    // Nothing planned for the day: what is in progress is the list on screen, and the only one.
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1)
    expect(panel().getAttribute('data-tab')).toBe('inProgress')
    expect(screen.getByText('Tâche run')).toBeTruthy()
    expect(screen.queryByText('Tâche nxt')).toBeNull()
    // The plan is named on its task rows and on its chain row.
    expect(within(panel()).getByText('Plan a')).toBeTruthy()
    openTab(WORK_TEXT.next)
    expect(panel().getAttribute('data-tab')).toBe('next')
    expect(screen.getByText('Tâche nxt')).toBeTruthy()
    expect(within(panel()).getByText('Plan a')).toBeTruthy()
    openTab(WORK_TEXT.chains)
    expect(panel().getAttribute('data-tab')).toBe('chains')
    expect(within(panel()).getByText('Plan a')).toBeTruthy()
    // Priorities are no longer written on the rows.
    expect(screen.queryByText(/^P\d+$/)).toBeNull()
    expect(screen.getByText('1/4')).toBeTruthy()
    expect(screen.getByRole('progressbar', { name: 'Avancement de Plan a' }).getAttribute('aria-valuenow')).toBe('25')
    // No summary line of its own: the page has ONE, above the queue.
    expect(screen.queryByTestId('work-summary')).toBeNull()
  })

  it('is one block of tabs: the day, in progress, to take next, blocked, plans to launch, in that order', async () => {
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
    // One heading for the whole block; the lists are tabs, in this order.
    expect(within(dash).getAllByRole('heading').map((h) => h.textContent)).toEqual([WORK_TEXT.title])
    const titles = within(within(dash).getByRole('tablist')).getAllByRole('tab').map((t) => t.textContent?.replace(/\d+$/, '').trim())
    expect(titles).toEqual([WORK_TEXT.day, WORK_TEXT.inProgress, WORK_TEXT.next, WORK_TEXT.blocked, WORK_TEXT.chains])
    // One list at a time, and exactly one tab selected.
    expect(within(dash).getAllByRole('tabpanel')).toHaveLength(1)
    expect(within(dash).getAllByRole('tab').filter((t) => t.getAttribute('aria-selected') === 'true')).toHaveLength(1)
  })

  it('leaves out a plan the page already shows (running, waiting or to resume): a plan appears once', async () => {
    seed({
      plans: [plan('shown', 2), plan('idle', 1)],
      runs: [{ run_id: '1', plan_id: 'shown', status: 'failed', started_at: '2026-10-02T08:00:00Z' }],
    })
    renderDash(['acme'], new Set(['shown']))
    await screen.findByTestId('work-dashboard')
    expect(tab(WORK_TEXT.chains).textContent).toBe(`${WORK_TEXT.chains} 1`)
    openTab(WORK_TEXT.chains)
    expect(screen.getByText('Plan idle')).toBeTruthy()
    expect(screen.queryByText('Plan shown')).toBeNull()
    expect(screen.queryByRole('button', { name: new RegExp(WORK_TEXT.relaunch) })).toBeNull()
  })

  it('has no "plans to launch" tab when every active plan is shown elsewhere', async () => {
    seed({ plans: [plan('a', 1)] })
    renderDash(['acme'], new Set(['a']))
    await screen.findByTestId('work-dashboard')
    expect(queryTab(WORK_TEXT.chains)).toBeNull()
    expect(screen.queryByText('Plan a')).toBeNull()
  })

  it('says so when there is nothing planned and nothing running', async () => {
    seed()
    renderDash()
    expect(await screen.findByTestId('work-dashboard')).toBeTruthy()
    // Nothing planned, nothing in progress: the page opens on what to take next, and says there is nothing.
    expect(panel().getAttribute('data-tab')).toBe('next')
    expect(screen.getByText(WORK_TEXT.nextEmpty)).toBeTruthy()
    openTab(WORK_TEXT.inProgress)
    expect(screen.getByText(WORK_TEXT.inProgressEmpty)).toBeTruthy()
    // Said once, as the empty state of the day.
    openTab(WORK_TEXT.day)
    expect(screen.getAllByText(WORK_TEXT.dayEmpty)).toHaveLength(1)
    // Tabs with nothing to show and nothing to say are left out.
    expect(queryTab(WORK_TEXT.chains)).toBeNull()
    expect(queryTab(WORK_TEXT.blocked)).toBeNull()
  })

  it('adds a task to the day, remembers it across a reload, and shows it once', async () => {
    seed({ plans: [plan('a', 1)], next: { a: task('nxt', 'pending') }, pending: [listed(task('nxt', 'pending'), 'a')] })
    const first = renderDash()
    await screen.findByText('Tâche nxt')
    fireEvent.click(screen.getByRole('button', { name: `${WORK_TEXT.addToDay} : Tâche nxt` }))
    await waitFor(() => expect(JSON.parse(localStorage.getItem(DAY_PLAN_KEY) ?? '{}').ids).toEqual(['nxt']))
    // It now lives under "Ma journée" only (the day has a task: it is the list on screen)…
    expect(panel().getAttribute('data-tab')).toBe('day')
    expect(screen.getAllByText('Tâche nxt')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: new RegExp(WORK_TEXT.addToDay) })).toBeNull()
    expect(tab(WORK_TEXT.day).textContent).toBe(`${WORK_TEXT.day} 1`)
    // …and is no longer offered in "À prendre".
    openTab(WORK_TEXT.next)
    expect(screen.queryByText('Tâche nxt')).toBeNull()
    expect(screen.queryByRole('button', { name: new RegExp(WORK_TEXT.addToDay) })).toBeNull()
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
    // Reordering and removing are secondary: they live in the row's ⋯ menu.
    expect(screen.queryByRole('button', { name: new RegExp(WORK_TEXT.moveUp) })).toBeNull()
    menu('Tâche two', WORK_TEXT.moveUp)
    await waitFor(() => expect(order()).toEqual(['Tâche two', 'Tâche one']))
    menu('Tâche two', WORK_TEXT.removeFromDay)
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
    await screen.findByText('Tâche run')
    // A task to take next offers "Ajouter"; starting it right away is in its menu.
    openTab(WORK_TEXT.next)
    expect(screen.getByRole('button', { name: `${WORK_TEXT.addToDay} : Tâche nxt` })).toBeTruthy()
    menu('Tâche nxt', WORK_TEXT.start)
    await waitFor(() => expect(tasksUpdate).toHaveBeenCalledWith('nxt', { status: 'in_progress' }))
    expect(toast.success).toHaveBeenCalledWith(WORK_TEXT.started)
    // Starting it planned it for the day.
    await waitFor(() => expect(JSON.parse(localStorage.getItem(DAY_PLAN_KEY) ?? '{}').ids).toEqual(['nxt']))
    // A task in progress has no visible button: "Terminer" is in its menu.
    openTab(WORK_TEXT.inProgress)
    expect(screen.queryByRole('button', { name: new RegExp(`^${WORK_TEXT.complete}`) })).toBeNull()
    menu('Tâche run', WORK_TEXT.complete)
    await waitFor(() => expect(tasksUpdate).toHaveBeenCalledWith('run', { status: 'completed' }))
    expect(toast.success).toHaveBeenCalledWith(WORK_TEXT.completed)
  })

  it('shows ONE visible action per row, and ONE filled button in all: "Démarrer" on the next task of the day', async () => {
    localStorage.setItem(DAY_PLAN_KEY, JSON.stringify({ date: 'x', ids: ['one', 'two'] }))
    seed({
      plans: [plan('a', 2), plan('b', 1)],
      pending: [listed(task('one', 'pending'), 'a'), listed(task('two', 'pending'), 'a'), listed(task('nxt', 'pending'), 'b')],
      inProgress: [listed(task('run', 'in_progress'), 'a')],
      next: { b: task('nxt', 'pending') },
    })
    renderDash()
    const dash = await screen.findByTestId('work-dashboard')
    await screen.findByText('Tâche one')
    // Every list of the dashboard, one tab after the other.
    const filled: { tab: string; label: string; row: string }[] = []
    const seen: string[] = []
    for (const label of [WORK_TEXT.day, WORK_TEXT.inProgress, WORK_TEXT.next]) {
      openTab(label)
      const rows = [...panel().querySelectorAll('li')]
      expect(rows.length).toBeGreaterThan(0)
      // at most one visible action per row
      for (const row of rows) {
        expect(row.querySelectorAll('[data-row-primary] button').length).toBeLessThanOrEqual(1)
        seen.push(row.textContent ?? '')
      }
      for (const b of dash.querySelectorAll('button')) {
        if (b.className.includes('bg-indigo-600')) filled.push({ tab: label, label: b.textContent ?? '', row: b.closest('li')?.textContent ?? '' })
      }
    }
    expect(seen.some((t) => t.includes('Tâche run'))).toBe(true)
    expect(seen.some((t) => t.includes('Tâche nxt'))).toBe(true)
    // one filled button in the whole dashboard, on the first task of the day still to start
    expect(filled).toHaveLength(1)
    expect(filled[0].tab).toBe(WORK_TEXT.day)
    expect(filled[0].label).toContain(WORK_TEXT.start)
    expect(filled[0].row).toContain('Tâche one')
    // the second task of the day can still be started, from its menu
    openTab(WORK_TEXT.day)
    menu('Tâche two', WORK_TEXT.start)
    await waitFor(() => expect(tasksUpdate).toHaveBeenCalledWith('two', { status: 'in_progress' }))
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
    await screen.findByTestId('work-dashboard')
    openTab(WORK_TEXT.chains)
    fireEvent.click(screen.getByRole('button', { name: new RegExp(WORK_TEXT.launch) }))
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
    await screen.findByTestId('work-dashboard')
    // Only the failed plan is to launch: the running one is not counted either.
    expect(tab(WORK_TEXT.chains).textContent).toBe(`${WORK_TEXT.chains} 1`)
    openTab(WORK_TEXT.chains)
    expect(screen.getByText('Plan f')).toBeTruthy()
    expect(screen.getByRole('button', { name: new RegExp(WORK_TEXT.relaunch) })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: new RegExp(`${WORK_TEXT.launch}|${WORK_TEXT.relaunch}`) })).toHaveLength(1)
    expect(screen.queryByText('Plan r')).toBeNull()
    expect(screen.queryByText(WORK_TEXT.runLabel.running)).toBeNull()
    expect(screen.getByText(WORK_TEXT.runLabel.failed)).toBeTruthy()
  })

  it('tells why a chain could not be launched', async () => {
    seed({ plans: [plan('a', 1)] })
    startRun.mockRejectedValueOnce(new Error('Le plan a déjà un run actif'))
    renderDash()
    await screen.findByTestId('work-dashboard')
    openTab(WORK_TEXT.chains)
    fireEvent.click(screen.getByRole('button', { name: new RegExp(WORK_TEXT.launch) }))
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
    await screen.findByTestId('work-dashboard')
    expect(tab(WORK_TEXT.blocked).textContent).toBe(`${WORK_TEXT.blocked} 1`)
    openTab(WORK_TEXT.blocked)
    expect(panel().getAttribute('data-tab')).toBe('blocked')
    expect(screen.getByText('Tâche bl')).toBeTruthy()
  })

  it('cuts a long list: the first rows, then "Afficher les N", which toggles to "Réduire"', async () => {
    const n = ROWS_SHOWN + 2
    seed({
      plans: [plan('a', 1)],
      inProgress: Array.from({ length: n }, (_, i) => listed(task(`t${i}`, 'in_progress'), 'a')),
    })
    renderDash()
    await screen.findByText('Tâche t0')
    const rows = () => within(panel()).queryAllByText(/^Tâche t\d+$/).map((e) => e.textContent)
    const all = Array.from({ length: n }, (_, i) => `Tâche t${i}`)
    // The count of the tab is the whole list, not what is on screen.
    expect(tab(WORK_TEXT.inProgress).textContent).toBe(`${WORK_TEXT.inProgress} ${n}`)
    expect(rows()).toEqual(all.slice(0, ROWS_SHOWN))
    const more = screen.getByRole('button', { name: WORK_TEXT.showAll(n) })
    expect(more.getAttribute('aria-expanded')).toBe('false')
    // A ghost button: the dashboard keeps its single filled one.
    expect(more.className).not.toContain('bg-indigo-600')
    fireEvent.click(more)
    expect(rows()).toEqual(all)
    expect(screen.queryByRole('button', { name: WORK_TEXT.showAll(n) })).toBeNull()
    const less = screen.getByRole('button', { name: WORK_TEXT.showLess })
    expect(less.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(less)
    expect(rows()).toEqual(all.slice(0, ROWS_SHOWN))
    expect(screen.getByRole('button', { name: WORK_TEXT.showAll(n) })).toBeTruthy()
  })

  it('does not offer "Afficher les N" for a list that fits', async () => {
    seed({
      plans: [plan('a', 1)],
      inProgress: Array.from({ length: ROWS_SHOWN }, (_, i) => listed(task(`t${i}`, 'in_progress'), 'a')),
    })
    renderDash()
    await screen.findByText('Tâche t0')
    expect(within(panel()).getAllByText(/^Tâche t\d+$/)).toHaveLength(ROWS_SHOWN)
    expect(screen.queryByRole('button', { name: WORK_TEXT.showAll(ROWS_SHOWN) })).toBeNull()
    expect(screen.queryByRole('button', { name: WORK_TEXT.showLess })).toBeNull()
  })

  it('opens on the day when it has tasks, and keeps the tab the user picked', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      localStorage.setItem(DAY_PLAN_KEY, JSON.stringify({ date: 'x', ids: ['one', 'doing'] }))
      seed({
        plans: [plan('a', 1)],
        pending: [listed(task('one', 'pending'), 'a')],
        inProgress: [listed(task('doing', 'in_progress'), 'a'), listed(task('run', 'in_progress'), 'a')],
      })
      renderDash()
      await screen.findByText('Tâche one')
      expect(panel().getAttribute('data-tab')).toBe('day')
      // In the day, a row says its state when it is not just "to do".
      const row = (title: string) => screen.getByText(title).closest('li')!
      expect(within(row('Tâche doing')).getByText(WORK_TEXT.taskStatus.in_progress)).toBeTruthy()
      expect(within(row('Tâche one')).queryByText(WORK_TEXT.taskStatus.pending)).toBeNull()
      // A task of the day is shown there, once: not again under "En cours".
      openTab(WORK_TEXT.inProgress)
      expect(screen.getByText('Tâche run')).toBeTruthy()
      expect(screen.queryByText('Tâche doing')).toBeNull()
      // The picked tab survives a refresh of the data.
      const calls = plansList.mock.calls.length
      await vi.advanceTimersByTimeAsync(31_000)
      await waitFor(() => expect(plansList.mock.calls.length).toBeGreaterThan(calls))
      expect(panel().getAttribute('data-tab')).toBe('inProgress')
      expect(tab(WORK_TEXT.inProgress).getAttribute('aria-selected')).toBe('true')
    } finally {
      vi.useRealTimers()
    }
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

describe('WorkDashboard — the provider choice of a launch', () => {
  const launchWithTwoProviders = async () => {
    seed({ plans: [plan('a', 1, { project_id: 'pr' })], counts: { a: { total: 2, completed: 0, in_progress: 0, blocked: 0, pending: 2, failed: 0, percentage: 0 } } })
    providersList.mockImplementation(async (params?: { project_slug?: string }) => TWO(params?.project_slug === 'backend' ? false : true))
    renderDash()
    await screen.findByTestId('work-dashboard')
    openTab(WORK_TEXT.chains)
    // wait until the list of providers is known: the launch is then gated
    await waitFor(() => expect(providersList).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 50))
    fireEvent.click(screen.getByRole('button', { name: new RegExp(WORK_TEXT.launch) }))
  }

  it('asks which provider first: no run starts until one is chosen, then it starts with that choice', async () => {
    seed({ plans: [plan('a', 1, { project_id: 'pr' })], counts: { a: { total: 2, completed: 0, in_progress: 0, blocked: 0, pending: 2, failed: 0, percentage: 0 } } })
    providersList.mockResolvedValue(TWO(true))
    renderDash()
    await screen.findByTestId('work-dashboard')
    openTab(WORK_TEXT.chains)
    await waitFor(() => expect(providersList).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 50))
    fireEvent.click(screen.getByRole('button', { name: new RegExp(WORK_TEXT.launch) }))
    expect(startRun).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole('radio', { name: /DeepSeek/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Launch$/ }))
    await waitFor(() => expect(startRun).toHaveBeenCalledWith('a', '/work/backend', 'backend', undefined, { provider: 'deepseek' }))
  })

  it('Escape closes the dialog and starts nothing', async () => {
    await launchWithTwoProviders()
    fireEvent.keyDown(await screen.findByRole('dialog'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(startRun).not.toHaveBeenCalled()
  })

  it("reads the consent of the PLAN's project, not the chat's", async () => {
    await launchWithTwoProviders()
    await waitFor(() => expect(providersList).toHaveBeenCalledWith({ project_slug: 'backend' }))
    await waitFor(() => expect(screen.getByRole('radio', { name: /DeepSeek/ }).getAttribute('aria-disabled')).toBe('true'))
  })
})
