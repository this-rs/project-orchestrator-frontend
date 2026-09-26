/**
 * MilestoneDetailPage — both scopes.
 *
 * Workspace scope: status menu, facts, tags, progress line, expandable
 * plans → tasks → steps, runs, projects, ⋯ with confirmed delete.
 * Project scope (ProjectMilestoneDetailPage): parent link, no runs /
 * projects sections, honest « Close milestone » instead of a fake delete.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { installMatchMedia } from './testUtils'

const wsGetMilestone = vi.fn()
const wsUpdate = vi.fn()
const wsDelete = vi.fn()
const projGetMilestone = vi.fn()
const projUpdate = vi.fn()
const toast = { success: vi.fn(), error: vi.fn() }

vi.mock('@/services', () => ({
  workspacesApi: {
    getMilestone: (...a: unknown[]) => wsGetMilestone(...a),
    list: vi.fn().mockResolvedValue({ items: [{ id: 'w1', slug: 'ws', name: 'WS' }] }),
    listProjects: vi.fn().mockResolvedValue([{ id: 'p1', name: 'Backend', slug: 'backend', root_path: '/x', created_at: '' }]),
    updateMilestone: (...a: unknown[]) => wsUpdate(...a),
    deleteMilestone: (...a: unknown[]) => wsDelete(...a),
    linkPlanToMilestone: vi.fn(),
  },
  projectsApi: {
    getMilestone: (...a: unknown[]) => projGetMilestone(...a),
    list: vi.fn().mockResolvedValue({ items: [{ id: 'p1', name: 'Backend', slug: 'backend' }] }),
    updateMilestone: (...a: unknown[]) => projUpdate(...a),
    linkPlanToMilestone: vi.fn(),
  },
  plansApi: { list: vi.fn().mockResolvedValue({ items: [] }) },
}))
vi.mock('@/hooks/useMilestoneGraphData', () => ({ useMilestoneGraphData: () => ({ data: null, loading: false }) }))
vi.mock('@/components/runner/PlanRunHistory', () => ({ PlanRunHistory: () => <div>run history</div> }))
vi.mock('@/components/graph/UnifiedGraphSection', () => ({ UnifiedGraphSection: () => <div>hierarchy graph</div> }))
vi.mock('@/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks')>()),
  useToast: () => toast,
  useWorkspaceSlug: () => 'ws',
}))

installMatchMedia()

import { MilestoneDetailPage } from '../MilestoneDetailPage'
import { ProjectMilestoneDetailPage } from '../ProjectMilestoneDetailPage'

const plans = [
  {
    id: 'pl1',
    title: 'Auth plan',
    status: 'in_progress',
    tasks: [
      { id: 't1', title: 'Login', description: '', status: 'completed', priority: 8, tags: [], created_at: '', steps: [{ id: 's1', description: 'Write form', status: 'completed' }] },
      { id: 't2', description: 'Logout', status: 'pending', tags: [], created_at: '', steps: [] },
    ],
  },
]

const wsMilestone = {
  id: 'm1',
  workspace_id: 'w1',
  title: 'v1 launch',
  description: 'Ship it',
  status: 'in_progress',
  target_date: '2026-12-01',
  created_at: '2026-01-01T00:00:00Z',
  tags: ['launch'],
  progress: { total: 4, completed: 1, in_progress: 1, pending: 2, percentage: 25 },
  plans,
}

const projMilestone = {
  milestone: { id: 'm2', title: 'Beta', description: '', status: 'open', created_at: '2026-01-01T00:00:00Z', project_id: 'p1' },
  plans: [],
  tasks: [],
  progress: { total: 0, completed: 0, in_progress: 0, pending: 0, percentage: 0 },
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/workspace/:slug/milestones/:milestoneId" element={<MilestoneDetailPage />} />
        <Route path="/workspace/:slug/project-milestones/:milestoneId" element={<ProjectMilestoneDetailPage />} />
        <Route path="/workspace/:slug/milestones" element={<div>milestones list</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('MilestoneDetailPage (workspace scope)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    wsGetMilestone.mockResolvedValue(wsMilestone)
    wsUpdate.mockResolvedValue({})
    wsDelete.mockResolvedValue({})
  })

  it('renders header, facts, tags, progress and the plan → task → step hierarchy', async () => {
    renderAt('/workspace/ws/milestones/m1')
    expect(await screen.findByRole('heading', { level: 1, name: 'v1 launch' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Status: In progress. Change status' })).toBeTruthy()
    expect(screen.getByText(/^due /)).toBeTruthy()
    expect(screen.getByText('1 plan')).toBeTruthy()
    expect(screen.getByText('#launch')).toBeTruthy()
    expect(screen.getByRole('progressbar', { name: 'Milestone progress' })).toBeTruthy()
    expect(screen.getByText(/1 completed · 3 remaining · 1 in progress · 2 pending/)).toBeTruthy()

    const plan = screen.getByRole('link', { name: 'Auth plan' })
    expect(plan.getAttribute('href')).toBe('/workspace/ws/plans/pl1')
    const row = plan.closest('li')!
    expect(within(row).getByText('In progress')).toBeTruthy()
    expect(within(row).getByText('1/2 tasks')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Show tasks of Auth plan' }))
    const task = screen.getByRole('link', { name: 'Login' })
    expect(task.getAttribute('href')).toBe('/workspace/ws/tasks/t1')
    expect(within(task.closest('li')!).getByText('P8')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Logout' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Show steps of Login' }))
    expect(screen.getByText('Write form')).toBeTruthy()
    expect(screen.getByText('#1')).toBeTruthy()

    // workspace-only sections
    expect(screen.getByText('run history')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Backend' }).getAttribute('href')).toBe('/workspace/ws/projects/backend')
    expect(screen.getByText('Workspace milestone')).toBeTruthy()
  })

  it('changes the status from the status menu', async () => {
    renderAt('/workspace/ws/milestones/m1')
    await screen.findByRole('heading', { level: 1, name: 'v1 launch' })
    fireEvent.click(screen.getByRole('button', { name: 'Status: In progress. Change status' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Completed' }))
    await waitFor(() => expect(wsUpdate).toHaveBeenCalledWith('m1', { status: 'completed' }))
    expect(await screen.findByRole('button', { name: 'Status: Completed. Change status' })).toBeTruthy()
  })

  it('deletes from the ⋯ menu after confirmation and leaves the page', async () => {
    renderAt('/workspace/ws/milestones/m1')
    await screen.findByRole('heading', { level: 1, name: 'v1 launch' })
    fireEvent.click(screen.getByRole('button', { name: 'Actions for v1 launch' }))
    expect(screen.getByRole('menuitem', { name: 'Edit milestone' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Show hierarchy graph' })).toBeTruthy()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete milestone' }))
    expect(wsDelete).not.toHaveBeenCalled()
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' }).at(-1)!)
    await waitFor(() => expect(wsDelete).toHaveBeenCalledWith('m1'))
    expect(await screen.findByText('milestones list')).toBeTruthy()
  })
})

describe('ProjectMilestoneDetailPage (project scope)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    projGetMilestone.mockResolvedValue(projMilestone)
    projUpdate.mockResolvedValue({})
  })

  it('shows the parent project, skips workspace-only sections and offers Close instead of Delete', async () => {
    renderAt('/workspace/ws/project-milestones/m2')
    expect(await screen.findByRole('heading', { level: 1, name: 'Beta' })).toBeTruthy()
    expect((await screen.findByTitle('Project: Backend')).getAttribute('href')).toBe('/workspace/ws/projects/backend')
    expect(screen.getByText('Project milestone')).toBeTruthy()
    expect(screen.getByText('No plans linked to this milestone')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Pipeline runs' })).toBeNull()
    expect(screen.queryByRole('heading', { name: /^Projects/ })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Actions for Beta' }))
    expect(screen.queryByRole('menuitem', { name: 'Delete milestone' })).toBeNull()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Close milestone' }))
    expect(projUpdate).not.toHaveBeenCalled()
    fireEvent.click(screen.getAllByRole('button', { name: 'Close' }).at(-1)!)
    await waitFor(() => expect(projUpdate).toHaveBeenCalledWith('m2', { status: 'closed' }))
    expect(await screen.findByRole('button', { name: 'Status: Closed. Change status' })).toBeTruthy()
  })
})
