/**
 * PersonaDetailPage — PageHeader → key facts → sections. Verifies the old
 * tabs (metrics, subgraph stats, relations with remove, edit panel,
 * activate) all survive as sections and dialogs.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { Persona, PersonaSubgraph } from '@/types'
import { installDomStubs } from '@/components/registry/__tests__/domStubs'

installDomStubs()

const get = vi.fn()
const getSubgraph = vi.fn()
const update = vi.fn()
const activate = vi.fn()
const remove = vi.fn()
const removeFile = vi.fn()
const removeSkill = vi.fn()
const skillGet = vi.fn()
const noteGet = vi.fn()
const decisionGet = vi.fn()
const listProjects = vi.fn()
const toast = { success: vi.fn(), error: vi.fn() }

vi.mock('@/services', () => ({
  personasApi: {
    get: (...a: unknown[]) => get(...a),
    getSubgraph: (...a: unknown[]) => getSubgraph(...a),
    update: (...a: unknown[]) => update(...a),
    activate: (...a: unknown[]) => activate(...a),
    delete: (...a: unknown[]) => remove(...a),
    removeFile: (...a: unknown[]) => removeFile(...a),
    removeSkill: (...a: unknown[]) => removeSkill(...a),
    removeFunction: vi.fn(),
    removeNote: vi.fn(),
    removeDecision: vi.fn(),
    removeProtocol: vi.fn(),
    removeExtends: vi.fn(),
  },
  skillsApi: { get: (...a: unknown[]) => skillGet(...a) },
  notesApi: { get: (...a: unknown[]) => noteGet(...a) },
  decisionsApi: { get: (...a: unknown[]) => decisionGet(...a) },
  protocolApi: { getProtocol: vi.fn() },
  workspacesApi: { listProjects: (...a: unknown[]) => listProjects(...a) },
}))

vi.mock('@/hooks', () => ({ useToast: () => toast, useWorkspaceSlug: () => 'ws' }))

import { PersonaDetailPage } from '../PersonaDetailPage'

const persona: Persona = {
  id: 'pe1',
  project_id: 'p1',
  name: 'API expert',
  description: 'Knows the API layer',
  status: 'active',
  model_preference: 'opus',
  complexity_default: 'complex',
  timeout_secs: 90,
  max_cost_usd: 2,
  system_prompt_override: 'Be terse.',
  energy: 0.8,
  cohesion: 0.6,
  activation_count: 4,
  success_rate: 0.75,
  avg_duration_secs: 125,
  last_activated: new Date(Date.now() - 3 * 3600_000).toISOString(),
  origin: 'auto_build',
  created_at: '2026-01-01T10:00:00Z',
  updated_at: '2026-01-02T10:00:00Z',
}

const subgraph: PersonaSubgraph = {
  persona,
  skills: [{ entity_id: 'sk1', weight: 0.9 }],
  protocols: [],
  files: [{ entity_id: 'src/api/mod.rs', weight: 0.5 }],
  functions: [],
  notes: [{ entity_id: 'n1', weight: 0.7 }],
  decisions: [],
  parents: [],
  children: [],
  stats: { total_entities: 3, coverage_score: 0.3, freshness: 0.9 },
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/workspace/ws/personas/pe1']}>
      <Routes>
        <Route path="/workspace/ws/personas/:id" element={<PersonaDetailPage />} />
        <Route path="/workspace/ws/personas" element={<div>personas list</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('PersonaDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    get.mockResolvedValue(persona)
    getSubgraph.mockResolvedValue(subgraph)
    listProjects.mockResolvedValue([{ id: 'p1', name: 'Alpha', slug: 'alpha' }])
    skillGet.mockResolvedValue({ id: 'sk1', name: 'Auth tokens', status: 'active' })
    noteGet.mockResolvedValue({ id: 'n1', content: 'Rotate keys often', note_type: 'gotcha' })
    update.mockImplementation((_id: string, data: Partial<Persona>) => Promise.resolve({ ...persona, ...data }))
    activate.mockResolvedValue(persona)
    remove.mockResolvedValue({})
    removeFile.mockResolvedValue({})
  })

  it('renders header, vital signs, execution settings, knowledge and details', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { level: 1, name: 'API expert' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Status: Active/ })).toBeTruthy()
    // Origin is a key fact in the header AND a row of the Details facts
    expect(screen.getAllByText('Auto-built')).toHaveLength(2)
    expect(screen.getByText('4 activations')).toBeTruthy()
    expect(screen.getByText('used 3h')).toBeTruthy()
    expect(await screen.findByRole('link', { name: 'Project: Alpha' })).toBeTruthy()

    const vitals = screen.getByRole('region', { name: 'Vital signs' })
    expect(within(vitals).getByText('80%')).toBeTruthy() // energy
    expect(within(vitals).getByText('60%')).toBeTruthy() // cohesion
    expect(within(vitals).getByText('75%')).toBeTruthy() // success rate
    expect(within(vitals).getByText('2m')).toBeTruthy() // avg duration
    expect(within(vitals).getByText('30%')).toBeTruthy() // coverage
    expect(within(vitals).getByText('90%')).toBeTruthy() // freshness
    expect(within(vitals).getByText('3')).toBeTruthy() // linked entities

    const exec = screen.getByRole('region', { name: 'Execution settings' })
    expect(within(exec).getByText('opus')).toBeTruthy()
    expect(within(exec).getByText('complex')).toBeTruthy()
    expect(within(exec).getByText('1m 30s')).toBeTruthy()
    expect(within(exec).getByText('$2.00')).toBeTruthy()
    expect(within(exec).getByText('Be terse.')).toBeTruthy()

    const knows = screen.getByRole('region', { name: /^What it knows/ })
    expect(within(knows).getByText('src/api/mod.rs')).toBeTruthy()
    expect(within(knows).getByText('50%')).toBeTruthy()
    expect(await within(knows).findByRole('link', { name: 'Auth tokens' })).toBeTruthy()
    expect(within(knows).getByRole('link', { name: 'Auth tokens' }).getAttribute('href')).toBe('/workspace/ws/skills/sk1')
    expect(within(knows).getByRole('button', { name: /^Rotate keys often/, expanded: false })).toBeTruthy()

    const details = screen.getByRole('region', { name: 'Details' })
    expect(within(details).getByText('pe1')).toBeTruthy()
    expect(within(details).getByText('Alpha')).toBeTruthy()
  })

  it('activates from the header and removes a link after confirmation', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /Activate/ }))
    await waitFor(() => expect(activate).toHaveBeenCalledWith('pe1'))
    expect(toast.success).toHaveBeenCalledWith('Persona activated')

    const knows = screen.getByRole('region', { name: /^What it knows/ })
    fireEvent.click(within(knows).getByRole('button', { name: 'Actions for src/api/mod.rs' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Unlink' }))
    expect(removeFile).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Unlink' }))
    await waitFor(() => expect(removeFile).toHaveBeenCalledWith('pe1', 'src/api/mod.rs'))
    await waitFor(() => expect(within(knows).queryByText('src/api/mod.rs')).toBeNull())
  })

  it('edits the persona through the dialog and deletes from the ⋯ menu', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Actions for API expert' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit persona' })
    fireEvent.change(within(dialog).getByDisplayValue('API expert'), { target: { value: 'API guru' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(update).toHaveBeenCalledWith('pe1', expect.objectContaining({ name: 'API guru', model_preference: 'opus' })))
    expect(await screen.findByRole('heading', { level: 1, name: 'API guru' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Actions for API guru' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' }).at(-1)!)
    await waitFor(() => expect(remove).toHaveBeenCalledWith('pe1'))
    expect(await screen.findByText('personas list')).toBeTruthy()
  })

  it('still shows the persona when the subgraph fails, and an error state when the persona fails', async () => {
    getSubgraph.mockRejectedValueOnce(new Error('nope'))
    renderPage()
    expect(await screen.findByRole('heading', { level: 1, name: 'API expert' })).toBeTruthy()
    expect(screen.getByText('Relations unavailable')).toBeTruthy()
  })

  it('offers a retry when the persona cannot be loaded', async () => {
    get.mockRejectedValueOnce(new Error('nope'))
    renderPage()
    expect(await screen.findByText('Persona not found')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'API expert' })).toBeTruthy()
  })
})
