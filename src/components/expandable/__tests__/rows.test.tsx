/**
 * Expandable hierarchy rows — every level is an EntityRow with a real
 * disclosure button (no hover-only UI), status as dot + text, nested
 * flush lists.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const listSteps = vi.fn()
const getMilestone = vi.fn()

vi.mock('@/services', () => ({
  tasksApi: { listSteps: (...a: unknown[]) => listSteps(...a), list: vi.fn().mockResolvedValue({ items: [] }) },
  projectsApi: { getMilestone: (...a: unknown[]) => getMilestone(...a) },
}))
vi.mock('@/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks')>()),
  useWorkspaceSlug: () => 'ws',
}))

import { ExpandableMilestoneRow, ExpandableTaskRow, MilestonePlanRow } from '../index'
import type { MilestonePlanSummary, Task, Milestone } from '@/types'

const plan: MilestonePlanSummary = {
  id: 'pl1',
  title: 'Auth plan',
  status: 'in_progress',
  tasks: [
    { id: 't1', title: 'Login', description: '', status: 'completed', priority: 8, tags: [], created_at: '', steps: [{ id: 's1', description: 'Write form', status: 'completed' }, { id: 's2', description: 'Wire API', status: 'pending' }] },
    { id: 't2', description: 'Logout', status: 'pending', tags: [], created_at: '', steps: [] },
  ],
}

function renderRows(ui: React.ReactNode) {
  return render(
    <MemoryRouter>
      <ul>{ui}</ul>
    </MemoryRouter>,
  )
}

describe('MilestonePlanRow', () => {
  it('shows status, task count and expands to tasks then steps', () => {
    renderRows(<MilestonePlanRow plan={plan} wsSlug="ws" />)
    const link = screen.getByRole('link', { name: 'Auth plan' })
    expect(link.getAttribute('href')).toBe('/workspace/ws/plans/pl1')
    const row = link.closest('li')!
    expect(within(row).getByText('In progress')).toBeTruthy()
    expect(within(row).getByText('1/2 tasks')).toBeTruthy()

    const toggle = screen.getByRole('button', { name: 'Show tasks of Auth plan' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(toggle)
    expect(screen.getByRole('button', { name: 'Hide tasks of Auth plan' })).toBeTruthy()
    expect(screen.getByRole('list', { name: 'Tasks of Auth plan' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Login' }).getAttribute('href')).toBe('/workspace/ws/tasks/t1')
    expect(screen.getByText('P8')).toBeTruthy()
    expect(screen.getByText('1/2 steps')).toBeTruthy()
    // a task without steps has no disclosure
    expect(screen.queryByRole('button', { name: 'Show steps of Logout' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Show steps of Login' }))
    expect(screen.getByText('Write form')).toBeTruthy()
    expect(screen.getByText('Wire API')).toBeTruthy()
    expect(screen.getByText('#2')).toBeTruthy()
  })

  it('has no disclosure when the plan has no tasks', () => {
    renderRows(<MilestonePlanRow plan={{ id: 'pl2', title: 'Empty', tasks: [] }} wsSlug="ws" />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText('No tasks')).toBeTruthy()
  })
})

describe('ExpandableMilestoneRow', () => {
  const milestone: Milestone = { id: 'm1', title: 'v1 launch', status: 'in_progress', target_date: '2026-12-01', created_at: '', project_id: 'p1' }
  beforeEach(() => {
    vi.clearAllMocks()
    getMilestone.mockResolvedValue({ plans: [plan] })
  })

  it('shows progress, due date and loads plans on first expand', async () => {
    renderRows(
      <ExpandableMilestoneRow milestone={milestone} progress={{ total: 4, completed: 1, in_progress: 1, pending: 2, percentage: 25 }} />,
    )
    const link = screen.getByRole('link', { name: 'v1 launch' })
    expect(link.getAttribute('href')).toBe('/workspace/ws/project-milestones/m1')
    const row = link.closest('li')!
    expect(within(row).getByText('25%')).toBeTruthy()
    expect(within(row).getByText('1/4 tasks')).toBeTruthy()
    expect(within(row).getByText(/^due /)).toBeTruthy()
    expect(within(row).getByRole('progressbar', { name: 'v1 launch progress' })).toBeTruthy()
    expect(getMilestone).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Show plans of v1 launch' }))
    await waitFor(() => expect(getMilestone).toHaveBeenCalledWith('m1'))
    expect(await screen.findByRole('link', { name: 'Auth plan' })).toBeTruthy()
  })
})

describe('ExpandableTaskRow', () => {
  const task = { id: 't9', title: 'Ship', description: '', status: 'in_progress', priority: 5, created_at: '', tags: [] } as unknown as Task
  beforeEach(() => {
    vi.clearAllMocks()
    listSteps.mockResolvedValue([
      { id: 's1', order: 1, description: 'Build', status: 'completed', created_at: '' },
      { id: 's2', order: 2, description: 'Release', status: 'pending', created_at: '' },
    ])
  })

  it('fetches steps on mount and toggles them', async () => {
    renderRows(<ExpandableTaskRow task={task} />)
    expect(screen.getByRole('link', { name: 'Ship' }).getAttribute('href')).toBe('/workspace/ws/tasks/t9')
    expect(await screen.findByText('1/2 steps')).toBeTruthy()
    expect(listSteps).toHaveBeenCalledWith('t9')
    fireEvent.click(screen.getByRole('button', { name: 'Show steps of Ship' }))
    expect(screen.getByText('Build')).toBeTruthy()
    expect(screen.getByText('Release')).toBeTruthy()
  })
})
