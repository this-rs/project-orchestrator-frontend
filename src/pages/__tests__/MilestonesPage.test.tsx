/**
 * MilestonesPage (list view) — workspace + project milestones merged, grouped
 * by status (finished groups collapsed), progress, due date, source, tags,
 * status change and delete through the right endpoint.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor, within } from '@testing-library/react'
import { installDomStubs, renderAt, eventBusStub } from './testUtils'

const listMilestones = vi.fn()
const getMilestoneProgress = vi.fn()
const listProjects = vi.fn()
const listProjectMilestones = vi.fn()
const getProjectMilestoneProgress = vi.fn()
const updateMilestone = vi.fn()
const updateProjectMilestone = vi.fn()
const deleteMilestone = vi.fn()
const apiDelete = vi.fn()

vi.mock('@/services', () => ({
  api: { delete: (...a: unknown[]) => apiDelete(...a) },
  workspacesApi: {
    listMilestones: (...a: unknown[]) => listMilestones(...a),
    getMilestoneProgress: (...a: unknown[]) => getMilestoneProgress(...a),
    listProjects: (...a: unknown[]) => listProjects(...a),
    updateMilestone: (...a: unknown[]) => updateMilestone(...a),
    deleteMilestone: (...a: unknown[]) => deleteMilestone(...a),
  },
  projectsApi: {
    listMilestones: (...a: unknown[]) => listProjectMilestones(...a),
    getMilestoneProgress: (...a: unknown[]) => getProjectMilestoneProgress(...a),
    updateMilestone: (...a: unknown[]) => updateProjectMilestone(...a),
  },
  getEventBus: () => eventBusStub(),
}))

installDomStubs()

import { MilestonesPage } from '../MilestonesPage'

const past = new Date(Date.now() - 3 * 24 * 3600_000).toISOString()

function renderPage() {
  return renderAt(<MilestonesPage />, { pattern: '/workspace/:slug/milestones', entry: '/workspace/ws/milestones?view=list' })
}

describe('MilestonesPage (list)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listMilestones.mockResolvedValue({
      items: [
        { id: 'm1', workspace_id: 'w', title: 'v1 launch', description: 'Public beta', status: 'in_progress', target_date: past, created_at: past, tags: ['release'] },
        { id: 'm2', workspace_id: 'w', title: 'Old goal', status: 'Completed', created_at: past, tags: [] },
      ],
    })
    getMilestoneProgress.mockResolvedValue({ total: 8, completed: 3, in_progress: 2, pending: 3, percentage: 37.5 })
    listProjects.mockResolvedValue([{ id: 'proj-a', slug: 'a', name: 'Alpha' }])
    listProjectMilestones.mockResolvedValue({
      items: [{ id: 'pm1', title: 'Alpha GA', status: 'open', created_at: past }],
    })
    getProjectMilestoneProgress.mockResolvedValue(undefined)
    updateMilestone.mockResolvedValue({})
    updateProjectMilestone.mockResolvedValue({})
    deleteMilestone.mockResolvedValue({})
    apiDelete.mockResolvedValue({})
  })

  it('groups milestones by status with finished groups collapsed, and shows progress / due / source / tags', async () => {
    renderPage()
    const row = (await screen.findByRole('link', { name: 'v1 launch' })).closest('li')!
    expect(screen.getByRole('region', { name: /In progress/ })).toBeTruthy()
    expect(screen.getByRole('region', { name: /Open/ })).toBeTruthy()
    // Completed group is collapsed by default (header visible, row hidden)
    const completedToggle = screen.getByRole('button', { name: /Completed/ })
    expect(completedToggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('link', { name: 'Old goal' })).toBeNull()
    fireEvent.click(completedToggle)
    expect(screen.getByRole('link', { name: 'Old goal' })).toBeTruthy()

    expect(within(row).getByText('3/8')).toBeTruthy()
    expect(within(row).getByRole('progressbar', { name: '38% of tasks completed' })).toBeTruthy()
    expect(within(row).getByText(/overdue/)).toBeTruthy()
    expect(within(row).getByText('Public beta')).toBeTruthy()
    expect(within(row).getByText('#release')).toBeTruthy()
    expect(within(row).getByText(/Workspace/)).toBeTruthy()
    // project milestones link to their own detail route and are labelled by project
    const pmLink = screen.getByRole('link', { name: 'Alpha GA' })
    expect(pmLink.getAttribute('href')).toBe('/workspace/ws/project-milestones/pm1')
    expect(within(pmLink.closest('li')!).getByText(/Project · Alpha/)).toBeTruthy()
  })

  it('changes status and deletes through the endpoint matching the milestone source', async () => {
    renderPage()
    const wsRow = (await screen.findByRole('link', { name: 'v1 launch' })).closest('li')!
    fireEvent.click(within(wsRow).getByRole('button', { name: /Status: In progress/ }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Completed' }))
    await waitFor(() => expect(updateMilestone).toHaveBeenCalledWith('m1', { status: 'completed' }))

    fireEvent.click(within(screen.getByRole('link', { name: 'Alpha GA' }).closest('li')!).getByRole('button', { name: /Status: Open/ }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'In progress' }))
    await waitFor(() => expect(updateProjectMilestone).toHaveBeenCalledWith('pm1', { status: 'in_progress' }))

    // the row moved to the "In progress" group — re-query it
    const pmRow = screen.getByRole('link', { name: 'Alpha GA' }).closest('li')!
    fireEvent.click(within(pmRow).getByRole('button', { name: 'Actions for Alpha GA' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' }).at(-1)!)
    await waitFor(() => expect(apiDelete).toHaveBeenCalledWith('/milestones/pm1'))
    expect(deleteMilestone).not.toHaveBeenCalled()
  })

  it('filters by source and by status, with search', async () => {
    renderPage()
    await screen.findByRole('link', { name: 'v1 launch' })
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search milestones' }), { target: { value: 'alpha' } })
    expect(screen.queryByRole('link', { name: 'v1 launch' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Alpha GA' })).toBeTruthy()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search milestones' }), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    const [source, status] = screen.getAllByRole('combobox')
    fireEvent.click(source)
    fireEvent.click(screen.getByRole('option', { name: 'Workspace', hidden: true }))
    expect(screen.queryByRole('link', { name: 'Alpha GA' })).toBeNull()
    fireEvent.click(status)
    fireEvent.click(screen.getByRole('option', { name: 'Completed', hidden: true }))
    expect(screen.queryByRole('link', { name: 'v1 launch' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Old goal' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(screen.getByRole('link', { name: 'v1 launch' })).toBeTruthy()
  })

  it('shows the empty state', async () => {
    listMilestones.mockResolvedValue({ items: [] })
    listProjects.mockResolvedValue([])
    renderPage()
    expect(await screen.findByText('No milestones yet')).toBeTruthy()
  })
})
