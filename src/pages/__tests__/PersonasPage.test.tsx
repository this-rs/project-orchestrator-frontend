/**
 * PersonasPage — list of EntityRows (no cards). Verifies that everything the
 * old cards showed (status, energy, cohesion, success rate, activations,
 * files, skills, project / global, last used, delete) is still there, plus
 * the new search / status change / grouped list.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Persona, PersonaSubgraph } from '@/types'
import { installDomStubs } from '@/components/registry/__tests__/domStubs'

installDomStubs()

const list = vi.fn()
const listGlobal = vi.fn()
const getSubgraph = vi.fn()
const update = vi.fn()
const remove = vi.fn()
const listProjects = vi.fn()
const toast = { success: vi.fn(), error: vi.fn() }

vi.mock('@/services', () => ({
  personasApi: {
    list: (...a: unknown[]) => list(...a),
    listGlobal: (...a: unknown[]) => listGlobal(...a),
    getSubgraph: (...a: unknown[]) => getSubgraph(...a),
    update: (...a: unknown[]) => update(...a),
    delete: (...a: unknown[]) => remove(...a),
    detect: vi.fn(),
    create: vi.fn(),
    autoBuild: vi.fn(),
  },
  workspacesApi: { listProjects: (...a: unknown[]) => listProjects(...a) },
}))

vi.mock('@/hooks', async () => {
  const { useInfiniteList } = await vi.importActual<typeof import('@/hooks/useInfiniteList')>('@/hooks/useInfiniteList')
  return { useInfiniteList, useToast: () => toast, useWorkspaceSlug: () => 'ws' }
})

import { PersonasPage } from '../PersonasPage'

const base: Omit<Persona, 'id' | 'name' | 'status'> = {
  project_id: 'p1',
  description: '',
  energy: 0.8,
  cohesion: 0.6,
  activation_count: 4,
  success_rate: 0.75,
  avg_duration_secs: 30,
  origin: 'manual',
  created_at: '2026-01-01T00:00:00Z',
}

const active: Persona = {
  ...base,
  id: 'pe1',
  name: 'API expert',
  description: 'Knows the API layer',
  status: 'active',
  last_activated: new Date(Date.now() - 3 * 3600_000).toISOString(),
}
const archived: Persona = { ...base, id: 'pe2', name: 'Old helper', status: 'archived', project_id: null, energy: 0.1, cohesion: 0.2 }

const subgraph = (persona: Persona, files: string[]): PersonaSubgraph => ({
  persona,
  skills: [{ entity_id: 'sk1', weight: 1 }],
  protocols: [],
  files: files.map((f) => ({ entity_id: f, weight: 0.5 })),
  functions: [],
  notes: [],
  decisions: [],
  parents: [],
  children: [],
  stats: { total_entities: files.length + 1, coverage_score: 0.3, freshness: 0.9 },
})

function renderPage() {
  return render(
    <MemoryRouter>
      <PersonasPage />
    </MemoryRouter>,
  )
}

describe('PersonasPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listProjects.mockResolvedValue([
      { id: 'p1', name: 'Alpha', slug: 'alpha' },
      { id: 'p2', name: 'Beta', slug: 'beta' },
    ])
    list.mockImplementation(({ project_id }: { project_id: string }) =>
      Promise.resolve({ items: project_id === 'p1' ? [active] : [], total: project_id === 'p1' ? 1 : 0, limit: 100, offset: 0 }),
    )
    listGlobal.mockResolvedValue({ items: [archived], total: 1, limit: 100, offset: 0 })
    getSubgraph.mockImplementation((id: string) =>
      Promise.resolve(id === 'pe1' ? subgraph(active, ['src/api/mod.rs', 'src/api/auth.rs']) : subgraph(archived, [])),
    )
    update.mockImplementation((_id: string, data: Partial<Persona>) => Promise.resolve({ ...active, ...data }))
    remove.mockResolvedValue({})
  })

  it('shows one row per persona with every fact of the old cards, grouped by status', async () => {
    renderPage()
    const row = (await screen.findByRole('link', { name: 'API expert' })).closest('li')!
    expect(screen.getByRole('link', { name: 'API expert' }).getAttribute('href')).toBe('/workspace/ws/personas/pe1')
    expect(within(row).getByText('Knows the API layer')).toBeTruthy()
    expect(within(row).getByRole('button', { name: /Status: Active/ })).toBeTruthy()
    expect(within(row).getByText('High')).toBeTruthy() // energy
    expect(within(row).getByText('Strong')).toBeTruthy() // cohesion
    expect(within(row).getByText('75% success')).toBeTruthy()
    expect(within(row).getByText('4 activations')).toBeTruthy()
    expect(within(row).getByText('3h')).toBeTruthy() // last used
    expect(within(row).getByText('Alpha')).toBeTruthy() // project (workspace view)
    // subgraph facts arrive after the row
    expect(await within(row).findByText('2 files')).toBeTruthy()
    expect(within(row).getByText('1 skill')).toBeTruthy()
    expect(within(row).getByText(/…\/api\/mod\.rs/)).toBeTruthy()

    expect(screen.getByRole('region', { name: /Active/ })).toBeTruthy()
    // Archived group is collapsed by default — expand it
    expect(screen.queryByText('Old helper')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Archived/ }))
    const old = screen.getByRole('link', { name: 'Old helper' }).closest('li')!
    expect(within(old).getByText('global')).toBeTruthy()
    expect(within(old).getByText('never used')).toBeTruthy()
  })

  it('changes the status from the row and deletes through the ⋯ menu after confirmation', async () => {
    renderPage()
    const row = (await screen.findByRole('link', { name: 'API expert' })).closest('li')!
    fireEvent.click(within(row).getByRole('button', { name: /Status: Active/ }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Dormant' }))
    await waitFor(() => expect(update).toHaveBeenCalledWith('pe1', { status: 'dormant' }))
    expect(toast.success).toHaveBeenCalledWith('Status changed to Dormant')

    fireEvent.click(screen.getByRole('button', { name: 'Actions for API expert' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    expect(remove).not.toHaveBeenCalled()
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' }).at(-1)!)
    await waitFor(() => expect(remove).toHaveBeenCalledWith('pe1'))
    await waitFor(() => expect(screen.queryByRole('link', { name: 'API expert' })).toBeNull())
  })

  it('searches client-side and offers to clear filters on no match', async () => {
    renderPage()
    await screen.findByRole('link', { name: 'API expert' })
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search personas' }), { target: { value: 'zzz' } })
    expect(screen.getByText('No matching personas')).toBeTruthy()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search personas' }), { target: { value: 'api' } })
    expect(screen.getByRole('link', { name: 'API expert' })).toBeTruthy()
  })

  it('shows "nothing yet" with a create action that opens the builder', async () => {
    list.mockResolvedValue({ items: [], total: 0, limit: 100, offset: 0 })
    listGlobal.mockResolvedValue({ items: [], total: 0, limit: 100, offset: 0 })
    renderPage()
    expect(await screen.findByText('No personas yet')).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: 'New persona' }).at(-1)!)
    expect(await screen.findByRole('dialog')).toBeTruthy()
    expect(screen.getByRole('list', { name: 'Build mode' })).toBeTruthy()
  })

  it('explains that personas need a project when the workspace has none', async () => {
    listProjects.mockResolvedValue([])
    renderPage()
    expect(await screen.findByText('No projects in this workspace')).toBeTruthy()
    expect(list).not.toHaveBeenCalled()
  })
})
