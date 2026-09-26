/**
 * TasksPage (list view) — the old TaskCard's information survives the
 * EntityRow migration: title (or description), editable status, priority,
 * plan link, assignee, tags, description, date, Edit / Delete, selection.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor, within } from '@testing-library/react'
import type { TaskWithPlan } from '@/types'
import { installDomStubs, renderAt, eventBusStub } from './testUtils'

const list = vi.fn()
const update = vi.fn()
const remove = vi.fn()

vi.mock('@/services', () => ({
  tasksApi: {
    list: (...a: unknown[]) => list(...a),
    update: (...a: unknown[]) => update(...a),
    delete: (...a: unknown[]) => remove(...a),
  },
  plansApi: { list: vi.fn().mockResolvedValue({ items: [] }) },
  workspacesApi: { listProjects: vi.fn().mockResolvedValue([]) },
  projectsApi: { list: vi.fn().mockResolvedValue({ items: [] }) },
  getEventBus: () => eventBusStub(),
}))

installDomStubs()

import { TasksPage } from '../TasksPage'

const tasks: TaskWithPlan[] = [
  {
    id: 't1',
    title: 'Write login form',
    description: 'React form with validation',
    status: 'in_progress',
    assigned_to: 'theo',
    priority: 7,
    tags: ['frontend', 'auth'],
    acceptance_criteria: [],
    affected_files: [],
    created_at: new Date(Date.now() - 2 * 24 * 3600_000).toISOString(),
    updated_at: new Date(Date.now() - 5 * 60_000).toISOString(),
    plan_id: 'p1',
    plan_title: 'Auth flow',
  },
  {
    id: 't2',
    description: 'Untitled task described only by its description',
    status: 'completed',
    tags: [],
    acceptance_criteria: [],
    affected_files: [],
    created_at: new Date().toISOString(),
    plan_id: 'p1',
    plan_title: 'Auth flow',
  },
]

function renderPage() {
  return renderAt(<TasksPage />, { pattern: '/workspace/:slug/tasks', entry: '/workspace/ws/tasks?view=list' })
}

describe('TasksPage (list)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    list.mockResolvedValue({ items: tasks, total: 2, limit: 25, offset: 0 })
    update.mockResolvedValue({})
    remove.mockResolvedValue({})
  })

  it('renders rows with status, priority, plan link, assignee, tags, description and date', async () => {
    renderPage()
    const row = (await screen.findByRole('link', { name: 'Write login form' })).closest('li')!
    expect(within(row).getByRole('button', { name: /Status: In progress/ })).toBeTruthy()
    expect(within(row).getByText('P7')).toBeTruthy()
    expect(within(row).getByRole('link', { name: 'Auth flow' }).getAttribute('href')).toBe('/workspace/ws/plans/p1')
    expect(within(row).getByText('@theo')).toBeTruthy()
    expect(within(row).getByText('#frontend #auth')).toBeTruthy()
    expect(within(row).getByText('React form with validation')).toBeTruthy()
    expect(within(row).getByText('5m')).toBeTruthy()
    // a task without title falls back to its description as the row title
    expect(screen.getByRole('link', { name: 'Untitled task described only by its description' })).toBeTruthy()
  })

  it('changes status from the row and deletes via ⋯ after confirmation', async () => {
    renderPage()
    const row = (await screen.findByRole('link', { name: 'Write login form' })).closest('li')!
    fireEvent.click(within(row).getByRole('button', { name: /Status: In progress/ }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Blocked' }))
    await waitFor(() => expect(update).toHaveBeenCalledWith('t1', { status: 'blocked' }))

    fireEvent.click(within(row).getByRole('button', { name: 'Actions for Write login form' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' }).at(-1)!)
    await waitFor(() => expect(remove).toHaveBeenCalledWith('t1'))
  })

  it('opens the edit dialog from the ⋯ menu', async () => {
    renderPage()
    await screen.findByRole('link', { name: 'Write login form' })
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Write login form' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByDisplayValue('Write login form')).toBeTruthy()
  })

  it('shows the empty state and the row skeleton while loading', async () => {
    let resolve: (v: unknown) => void = () => {}
    list.mockReturnValue(new Promise((r) => (resolve = r)))
    renderPage()
    expect(screen.getByRole('status', { name: 'Loading' })).toBeTruthy()
    resolve({ items: [], total: 0, limit: 25, offset: 0 })
    expect(await screen.findByText('No tasks yet')).toBeTruthy()
  })
})
