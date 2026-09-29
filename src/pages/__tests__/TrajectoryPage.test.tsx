/**
 * TrajectoryPage — projects → plans with progress; finished plans stay
 * reachable under « Path travelled »; objectives on top.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const counts = { total: 4, completed: 1, in_progress: 1, blocked: 1, pending: 1, failed: 0, percentage: 25 }

vi.mock('@/services', () => ({
  plansApi: {
    list: async () => ({
      items: [
        { id: 'pl1', title: 'Launch site', status: 'in_progress', priority: 8, project_id: 'pr1', description: '', created_at: '', created_by: '' },
        { id: 'pl2', title: 'Old migration', status: 'completed', priority: 3, project_id: 'pr1', description: '', created_at: '', created_by: '' },
      ],
      total: 2,
    }),
  },
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
})
