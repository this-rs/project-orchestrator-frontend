/**
 * PlansPage (list view) — every field / action of the old PlanCard survives
 * the EntityRow migration: title, editable status, description, priority,
 * project, author, date, Edit / Delete in the always-visible ⋯ menu,
 * bulk selection, project + status filters, search, empty state.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor, within } from '@testing-library/react'
import type { Plan } from '@/types'
import { installDomStubs, renderAt, eventBusStub } from './testUtils'

const list = vi.fn()
const updateStatus = vi.fn()
const remove = vi.fn()
const listProjects = vi.fn()

vi.mock('@/services', () => ({
  plansApi: {
    list: (...a: unknown[]) => list(...a),
    updateStatus: (...a: unknown[]) => updateStatus(...a),
    delete: (...a: unknown[]) => remove(...a),
    create: vi.fn(),
    update: vi.fn(),
  },
  workspacesApi: { listProjects: (...a: unknown[]) => listProjects(...a) },
  projectsApi: { list: vi.fn().mockResolvedValue({ items: [] }) },
  getEventBus: () => eventBusStub(),
}))

installDomStubs()

import { PlansPage } from '../PlansPage'

const plans: Plan[] = [
  {
    id: 'p1',
    title: 'Auth flow',
    description: 'OIDC login and refresh',
    status: 'in_progress',
    created_at: new Date(Date.now() - 3600_000).toISOString(),
    created_by: 'theo',
    priority: 8,
    project_id: 'proj-a',
  },
  {
    id: 'p2',
    title: 'Billing',
    description: 'Stripe integration',
    status: 'completed',
    created_at: new Date(Date.now() - 40 * 24 * 3600_000).toISOString(),
    created_by: 'agent',
    priority: 3,
  },
]

function renderPage() {
  return renderAt(<PlansPage />, { pattern: '/workspace/:slug/plans', entry: '/workspace/ws/plans?view=list' })
}

describe('PlansPage (list)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    list.mockResolvedValue({ items: plans, total: plans.length, limit: 25, offset: 0 })
    listProjects.mockResolvedValue([
      { id: 'proj-a', slug: 'a', name: 'Alpha' },
      { id: 'proj-b', slug: 'b', name: 'Beta' },
    ])
    updateStatus.mockResolvedValue({})
    remove.mockResolvedValue({})
  })

  it('renders each plan as a row with status, priority, project, author, description and date', async () => {
    renderPage()
    const row = (await screen.findByRole('link', { name: 'Auth flow' })).closest('li')!
    expect(screen.getByRole('link', { name: 'Auth flow' }).getAttribute('href')).toBe('/workspace/ws/plans/p1')
    expect(within(row).getByRole('button', { name: /Status: In progress/ })).toBeTruthy()
    expect(within(row).getByText('P8')).toBeTruthy()
    expect(within(row).getByText('OIDC login and refresh')).toBeTruthy()
    await within(row).findByText('Alpha')
    expect(within(row).getByText('theo')).toBeTruthy()
    expect(within(row).getByText('1h')).toBeTruthy()
    // completed plans are muted, not hidden
    expect(screen.getByRole('link', { name: 'Billing' })).toBeTruthy()
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ workspace_slug: 'ws', limit: 25, offset: 0 }))
  })

  it('changes status from the row (optimistic) and shows Edit / Delete in the ⋯ menu', async () => {
    renderPage()
    const row = (await screen.findByRole('link', { name: 'Billing' })).closest('li')!
    fireEvent.click(within(row).getByRole('button', { name: /Status: Completed/ }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Draft' }))
    await waitFor(() => expect(updateStatus).toHaveBeenCalledWith('p2', 'draft'))

    fireEvent.click(within(row).getByRole('button', { name: 'Actions for Billing' }))
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toBeTruthy()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    expect(remove).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' }).at(-1)!)
    await waitFor(() => expect(remove).toHaveBeenCalledWith('p2'))
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Billing' })).toBeNull())
  })

  it('supports bulk selection from the row checkbox and "Select all"', async () => {
    renderPage()
    await screen.findByRole('link', { name: 'Auth flow' })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Auth flow' }))
    expect(screen.getByText('1 selected')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Select all' }))
    expect(screen.getByText('2 selected')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Deselect' }))
    expect(screen.queryByText(/selected/)).toBeNull()
  })

  it('exposes project + status filters behind the Filters button and the search box', async () => {
    renderPage()
    await screen.findByRole('link', { name: 'Auth flow' })
    expect(screen.getByRole('searchbox', { name: 'Search plans' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    const combos = screen.getAllByRole('combobox')
    expect(combos).toHaveLength(2)
    fireEvent.click(combos[1])
    fireEvent.click(screen.getByRole('option', { name: 'Completed', hidden: true }))
    await waitFor(() => expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'completed' })))
    expect(screen.getByRole('button', { name: 'Filters (1 active)' })).toBeTruthy()
  })

  it('shows the "nothing yet" empty state with a create action', async () => {
    list.mockResolvedValue({ items: [], total: 0, limit: 25, offset: 0 })
    renderPage()
    expect(await screen.findByText('No plans yet')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'New plan' }).length).toBe(2)
  })
})
