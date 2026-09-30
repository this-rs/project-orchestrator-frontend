/**
 * TrajectoryPage — projects → plans with progress; finished plans stay
 * reachable under « Path travelled »; objectives on top.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const { listPlans } = vi.hoisted(() => ({ listPlans: vi.fn() }))

const twoPlans = async () => ({
  items: [
    { id: 'pl1', title: 'Launch site', status: 'in_progress', priority: 8, project_id: 'pr1', description: '', created_at: '', created_by: '' },
    { id: 'pl2', title: 'Old migration', status: 'completed', priority: 3, project_id: 'pr1', description: '', created_at: '', created_by: '' },
  ],
  total: 2,
})

const counts = { total: 4, completed: 1, in_progress: 1, blocked: 1, pending: 1, failed: 0, percentage: 25 }

vi.mock('@/services', () => ({
  plansApi: { list: listPlans },
  tasksApi: { list: async () => ({ items: [], total: 0 }) },
}))
vi.mock('@/services/workspaces', () => ({
  workspacesApi: {
    listProjects: async () => [{ id: 'pr1', name: 'Website', slug: 'website', root_path: '', created_at: '' }],
    listMilestones: async () => ({
      items: [{ id: 'm1', workspace_id: 'w', title: 'Public beta', status: 'open', tags: [], created_at: '' }],
    }),
    getMilestoneProgress: async () => ({ total: 10, completed: 5, in_progress: 2, pending: 3, percentage: 50 }),
  },
}))
vi.mock('@/hooks', () => ({
  useWorkspaceSlug: () => 'ws',
  useTaskProgress: () => ({ pr1: counts, pl1: counts, pl2: { ...counts, completed: 4, percentage: 100 } }),
}))

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
}

import { TrajectoryPage } from '../TrajectoryPage'

describe('TrajectoryPage', () => {
  beforeEach(() => {
    listPlans.mockReset()
    listPlans.mockImplementation(twoPlans)
  })

  it('shows objectives, the active plan open, and finished plans under Path travelled', async () => {
    render(
      <MemoryRouter>
        <TrajectoryPage />
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByText('Public beta')).toBeTruthy())
    expect(screen.getByText('Website')).toBeTruthy()
    expect(screen.getByText('Launch site')).toBeTruthy()
    expect(screen.getByText(/Path travelled · 1/)).toBeTruthy()
    // 5/10 objective progress is readable as text, not only as a bar
    expect(screen.getByText('5/10 done')).toBeTruthy()
  })
  it('reads plans page by page — the API answers 400 to any limit above 100', async () => {
    const plan = (i: number) => ({
      id: `p${i}`,
      title: `Plan ${i}`,
      status: i === 0 ? 'in_progress' : 'completed',
      priority: 5,
      project_id: 'pr1',
      description: '',
      created_at: '',
      created_by: '',
    })
    const all = Array.from({ length: 150 }, (_, i) => plan(i))
    // Same contract as the backend's PaginationParams::validate.
    listPlans.mockImplementation(async ({ limit = 50, offset = 0 }: { limit?: number; offset?: number }) => {
      if (limit > 100) throw new Error('400 limit cannot exceed 100')
      return { items: all.slice(offset, offset + limit), total: all.length }
    })
    render(
      <MemoryRouter>
        <TrajectoryPage />
      </MemoryRouter>,
    )
    // 1 live plan + 149 finished: nothing is truncated at the first page.
    await waitFor(() => expect(screen.getByText(/Path travelled · 149/)).toBeTruthy())
    expect(listPlans.mock.calls.map(([params]) => params.limit)).toEqual([100, 100])
    expect(listPlans.mock.calls.map(([params]) => params.offset)).toEqual([0, 100])
  })

  it('shows the error state when plans cannot be loaded', async () => {
    listPlans.mockRejectedValue(new Error('boom'))
    render(
      <MemoryRouter>
        <TrajectoryPage />
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByText('Failed to load the trajectory')).toBeTruthy())
  })
})
