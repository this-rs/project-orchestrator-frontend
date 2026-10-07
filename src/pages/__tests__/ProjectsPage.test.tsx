/**
 * ProjectsPage — EntityRow list with search, bulk selection (accessible
 * checkbox), always-visible ⋯ menu (edit / delete with confirmation).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { installMatchMedia } from './testUtils'

const listProjects = vi.fn()
const remove = vi.fn()
const create = vi.fn()
const addProject = vi.fn()
const toast = { success: vi.fn(), error: vi.fn() }

vi.mock('@/services', () => ({
  projectsApi: { delete: (...a: unknown[]) => remove(...a), create: (...a: unknown[]) => create(...a), update: vi.fn() },
}))
vi.mock('@/services/workspaces', () => ({
  workspacesApi: { listProjects: (...a: unknown[]) => listProjects(...a), addProject: (...a: unknown[]) => addProject(...a) },
}))
vi.mock('@/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks')>()),
  useToast: () => toast,
  useWorkspaceSlug: () => 'ws',
  useWorkspace: () => ({ name: 'Main' }),
}))

installMatchMedia()

import { ProjectsPage } from '../ProjectsPage'

const projects = [
  { id: 'p1', name: 'Backend', slug: 'backend', root_path: '/src/backend', description: 'Rust API', created_at: '2026-01-01', last_synced: new Date(Date.now() - 3600_000).toISOString() },
  { id: 'p2', name: 'Frontend', slug: 'frontend', root_path: '/src/frontend', created_at: '2026-01-01' },
  { id: 'p3', name: 'Q3 Marketing', slug: 'q3-marketing', profile: 'work', description: 'Launch plan', created_at: '2026-01-01' },
]

function renderPage() {
  return render(
    <MemoryRouter>
      <ProjectsPage />
    </MemoryRouter>,
  )
}

describe('ProjectsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listProjects.mockResolvedValue(projects)
    remove.mockResolvedValue({})
    create.mockResolvedValue({ id: 'p4', name: 'Budget', slug: 'budget', profile: 'work', created_at: '2026-01-01' })
    addProject.mockResolvedValue({})
  })

  it('names the kind of each project as a fact; a project without code is never "behind"', async () => {
    renderPage()
    const backend = (await screen.findByRole('link', { name: 'Backend' })).closest('li')!
    const marketing = screen.getByRole('link', { name: 'Q3 Marketing' }).closest('li')!
    expect(within(backend).getByText('With code').closest('[title="Type"]')).toBeTruthy()
    expect(within(marketing).getByText('Without code').closest('[title="Type"]')).toBeTruthy()
    expect(within(marketing).queryByText('Never synced')).toBeNull()
    // a legacy payload without `profile` is a codebase
    expect(within(screen.getByRole('link', { name: 'Frontend' }).closest('li')!).getByText('With code')).toBeTruthy()
  })

  it('creates a project without code: profile=work, no root_path', async () => {
    renderPage()
    await screen.findByText('Backend')
    fireEvent.click(screen.getByRole('button', { name: 'New project' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByLabelText('Folder')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('radio', { name: /Without code/ }))
    expect(within(dialog).queryByLabelText('Folder')).toBeNull()
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Budget' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    expect(create.mock.calls[0][0]).toEqual({ name: 'Budget', slug: 'budget', profile: 'work', root_path: undefined, description: '' })
    await waitFor(() => expect(addProject).toHaveBeenCalledWith('ws', 'p4'))
  })

  it('shows every project with description, slug, path and sync state', async () => {
    renderPage()
    const row = (await screen.findByRole('link', { name: 'Backend' })).closest('li')!
    expect(screen.getByRole('link', { name: 'Backend' }).getAttribute('href')).toBe('/workspace/ws/projects/backend')
    expect(within(row).getByText('Rust API')).toBeTruthy()
    expect(within(row).getByText('backend')).toBeTruthy()
    expect(within(row).getByText('/src/backend')).toBeTruthy()
    expect(within(row).getByText('synced 1h')).toBeTruthy()
    expect(within(screen.getByRole('link', { name: 'Frontend' }).closest('li')!).getByText('Never synced')).toBeTruthy()
  })

  it('filters with the search field', async () => {
    renderPage()
    await screen.findByText('Frontend')
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'rust' } })
    expect(screen.queryByText('Frontend')).toBeNull()
    expect(screen.getByText('Backend')).toBeTruthy()
  })

  it('selects rows with accessible checkboxes and select-all (bulk bar)', async () => {
    renderPage()
    await screen.findByText('Backend')
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Backend' }))
    expect(screen.getByRole('checkbox', { name: 'Select Backend' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText('1 selected')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Select all projects' }))
    expect(screen.getByText('3 selected')).toBeTruthy()
  })

  it('deletes one project from the ⋯ menu after confirmation', async () => {
    renderPage()
    await screen.findByText('Frontend')
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Frontend' }))
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toBeTruthy()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    expect(remove).not.toHaveBeenCalled()
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' }).at(-1)!)
    await waitFor(() => expect(remove).toHaveBeenCalledWith('frontend'))
    await waitFor(() => expect(screen.queryByText('Frontend')).toBeNull())
  })

  it('shows the empty state with a create action', async () => {
    listProjects.mockResolvedValue([])
    renderPage()
    expect(await screen.findByText('No projects yet')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'New project' }).length).toBe(2)
  })
})
