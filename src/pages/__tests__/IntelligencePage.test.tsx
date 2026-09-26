/**
 * IntelligencePage — project dashboard: health score, attention list linking
 * to the pages that fix things, layer sections, maintenance actions.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const { intelligenceApi, codeApi, projectsApi, adminApi } = vi.hoisted(() => ({
  intelligenceApi: { getSummary: vi.fn() },
  codeApi: { getHealth: vi.fn() },
  projectsApi: { get: vi.fn() },
  adminApi: {
    updateStaleness: vi.fn(),
    updateEnergy: vi.fn(),
    decayNeurons: vi.fn(),
    updateFabricScores: vi.fn(),
    detectSkills: vi.fn(),
    startBackfillSynapses: vi.fn(),
  },
}))

vi.mock('@/services/intelligence', () => ({ intelligenceApi }))
vi.mock('@/services/code', () => ({ codeApi }))
vi.mock('@/services/projects', () => ({ projectsApi }))
vi.mock('@/services/admin', () => ({ adminApi }))
vi.mock('@/components/particles/widgets', () => ({ CommunityVizWidget: () => <div data-testid="viz" /> }))
vi.mock('@/hooks/useVizData', () => ({ useEmbeddingsVizData: () => ({ data: null, isLoading: false, error: null }) }))
vi.mock('@/hooks', async () => {
  const { useConfirmDialog } = await import('@/hooks/useConfirmDialog')
  return { useConfirmDialog, useWorkspaceSlug: () => 'ws' }
})

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

import { IntelligencePage } from '../IntelligencePage'

const summary = {
  code: { files: 100, functions: 400, communities: 6, hotspots: [{ path: 'src/api/client.ts', churn_score: 4.2 }], orphans: 12 },
  knowledge: { notes: 40, decisions: 10, stale_count: 3, types_distribution: { gotcha: 5, guideline: 35 } },
  fabric: { co_changed_pairs: 120 },
  neural: { active_synapses: 300, avg_energy: 0.6, weak_synapses_ratio: 0.2, dead_notes_count: 2 },
  skills: { total: 8, active: 6, emerging: 2, avg_cohesion: 0.7, total_activations: 50 },
  behavioral: { protocols: 0, states: 0, transitions: 0, system_protocols: 0, business_protocols: 0, skill_linked: 0 },
}

const health = {
  god_functions: [],
  god_function_count: 2,
  god_function_threshold: 15,
  orphan_files: [],
  orphan_file_count: 12,
  coupling_metrics: { avg_clustering_coefficient: 0.31, max_clustering_coefficient: 0.9, most_coupled_file: 'src/a.ts' },
  circular_dependencies: [],
  circular_dependency_count: 1,
  hotspots: [],
  knowledge_gaps: [],
  risk_assessment: { avg_risk_score: 0.2, critical_count: 1, high_count: 2, medium_count: 10, low_count: 50 },
  neural_metrics: { active_synapses: 300, avg_energy: 0.6, weak_synapses_ratio: 0.2, dead_notes_count: 2 },
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/workspace/ws/projects/p1/intelligence']}>
      <Routes>
        <Route path="/workspace/:slug/projects/:projectSlug/intelligence" element={<IntelligencePage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('IntelligencePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    intelligenceApi.getSummary.mockResolvedValue(structuredClone(summary))
    codeApi.getHealth.mockResolvedValue(structuredClone(health))
    projectsApi.get.mockResolvedValue({ id: 'proj-1', name: 'Payments', slug: 'p1' })
    adminApi.updateStaleness.mockResolvedValue({ notes_updated: 3 })
    adminApi.decayNeurons.mockResolvedValue({ synapses_decayed: 10, synapses_pruned: 1 })
  })

  it('shows the score, the attention list with links and the code hotspots', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { level: 1, name: 'Intelligence' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Payments/ }).getAttribute('href')).toBe('/workspace/ws/projects/p1')
    expect(screen.getByRole('img', { name: /Health score \d+ of 100/ })).toBeTruthy()

    const attention = screen.getByRole('list', { name: 'Attention needed' })
    expect(within(attention).getByRole('link', { name: '3 stale notes need review' }).getAttribute('href')).toBe('/workspace/ws/notes')
    expect(within(attention).getByRole('link', { name: '1 file at critical risk' }).getAttribute('href')).toBe(
      '/workspace/ws/code?project=p1&tab=health',
    )
    expect(within(attention).getByRole('link', { name: /2 god functions/ })).toBeTruthy()

    const hotspots = screen.getByRole('list', { name: 'Hotspots' })
    expect(within(hotspots).getByRole('link', { name: 'History of src/api/client.ts' }).getAttribute('href')).toBe(
      '/workspace/ws/code?project=p1&file=src%2Fapi%2Fclient.ts',
    )
    // layer facts survive the redesign
    expect(screen.getByText('120')).toBeTruthy() // co-changed pairs
    expect(screen.getByText('1 circular dependencies detected')).toBeTruthy()
    expect(screen.getByText('50 total activations')).toBeTruthy()
  })

  it('runs a maintenance action and reports its result inline', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Run Update staleness' }))
    await waitFor(() => expect(adminApi.updateStaleness).toHaveBeenCalled())
    expect(await screen.findByText('3 notes updated')).toBeTruthy()
  })

  it('asks for confirmation before decaying synapses', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Run Decay synapses' }))
    expect(adminApi.decayNeurons).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Decay synapses' }))
    await waitFor(() => expect(adminApi.decayNeurons).toHaveBeenCalled())
  })

  it('shows a retryable error when the summary fails', async () => {
    intelligenceApi.getSummary.mockRejectedValueOnce(new Error('boom'))
    renderPage()
    expect(await screen.findByText('boom')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Intelligence' })).toBeTruthy()
  })
})
