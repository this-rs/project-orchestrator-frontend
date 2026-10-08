/**
 * CodePage — URL-driven tabs / project / file history, explorer search rows,
 * and the Health tab numbers and lists (each row opening the file history).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const { codeApi, commitsApi, workspacesApi, toast } = vi.hoisted(() => ({
  codeApi: {
    search: vi.fn(),
    getHealth: vi.fn(),
    getHotspots: vi.fn(),
    getKnowledgeGaps: vi.fn(),
    getRiskAssessment: vi.fn(),
  },
  commitsApi: { getFileHistory: vi.fn(), getFileCoChangers: vi.fn() },
  workspacesApi: { listProjects: vi.fn() },
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}))

vi.mock('@/services', () => ({ codeApi, commitsApi, workspacesApi }))
vi.mock('@/hooks', () => ({ useToast: () => toast, useWorkspaceSlug: () => 'ws' }))
vi.mock('@/components/code/CoChangeGraph', () => ({ CoChangeGraph: () => <div data-testid="co-change-graph" /> }))

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

import { CodePage } from '../CodePage'

const health = {
  god_functions: [{ name: 'handle_all', file: 'src/api/handlers.rs', in_degree: 30, out_degree: 40 }],
  god_function_count: 1,
  god_function_threshold: 15,
  orphan_files: ['src/old.rs'],
  orphan_file_count: 1,
  coupling_metrics: { avg_clustering_coefficient: 0.312, max_clustering_coefficient: 0.9, most_coupled_file: 'src/api/mod.rs' },
  circular_dependencies: [],
  circular_dependency_count: 0,
  hotspots: [],
  knowledge_gaps: [],
  risk_assessment: null,
  neural_metrics: null,
}

function renderPage(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/workspace/:slug/code" element={<CodePage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('CodePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    workspacesApi.listProjects.mockResolvedValue([
      { slug: 'p1', name: 'Payments' },
      { slug: 'p2', name: 'Billing' },
    ])
    codeApi.search.mockResolvedValue([
      {
        score: 0.87,
        document: { id: 'f1', path: 'src/api/client.ts', language: 'typescript', symbols: ['retry', 'post'], signatures: ['function retry()'] },
      },
    ])
    codeApi.getHealth.mockResolvedValue(structuredClone(health))
    codeApi.getHotspots.mockResolvedValue({
      hotspots: [{ path: 'src/api/client.ts', commit_count: 12, total_churn: 300, co_change_count: 4, churn_score: 0.9 }],
      total_files: 1,
      limit: 20,
    })
    codeApi.getKnowledgeGaps.mockResolvedValue({
      knowledge_gaps: [{ path: 'src/api/payments.ts', note_count: 0, decision_count: 1, knowledge_density: 0.2 }],
      total_files: 1,
      limit: 20,
    })
    codeApi.getRiskAssessment.mockResolvedValue({
      risk_files: [
        { path: 'src/api/client.ts', risk_score: 0.812, risk_level: 'critical', factors: { pagerank: 0.1, churn: 0.9, knowledge_gap: 0.8, betweenness: 0.2 } },
      ],
      total_files: 1,
      limit: 20,
      summary: { avg_risk_score: 0.4, critical_count: 1, high_count: 0, medium_count: 0, low_count: 0 },
    })
    commitsApi.getFileHistory.mockResolvedValue({ items: [{ commit_sha: 'abcdef1234', message: 'fix retries', author: 'ana', date: new Date().toISOString(), additions: 3, deletions: 1 }] })
    commitsApi.getFileCoChangers.mockResolvedValue({ items: [] })
  })

  it('searches the code and opens a result file history through the URL', async () => {
    renderPage('/workspace/ws/code')
    expect(await screen.findByRole('heading', { level: 1, name: 'Code' })).toBeTruthy()
    // The concept introduces itself from the registry (ConceptIntro, folded by default).
    expect(screen.getByText('What is this?')).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Explorer', selected: true })).toBeTruthy()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search the code' }), { target: { value: 'retry' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() => expect(codeApi.search).toHaveBeenCalledWith('retry', { project_slug: undefined, workspace_slug: 'ws' }))
    const results = await screen.findByRole('list', { name: 'Search results' })
    const row = within(results).getByRole('button', { name: 'History of src/api/client.ts' })
    expect(within(results).getByText('87%')).toBeTruthy()
    expect(within(results).getByText('2 symbols')).toBeTruthy()
    fireEvent.click(row)
    const sheet = await screen.findByRole('dialog', { name: 'client.ts' })
    await waitFor(() => expect(commitsApi.getFileHistory).toHaveBeenCalledWith('src/api/client.ts', { limit: 50 }))
    expect(await within(sheet).findByText('fix retries')).toBeTruthy()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Close file history' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'client.ts' })).toBeNull())
  })

  it('opens the file history sheet from ?file= on load', async () => {
    renderPage('/workspace/ws/code?file=src%2Fapi%2Fclient.ts')
    expect(await screen.findByRole('dialog', { name: 'client.ts' })).toBeTruthy()
  })

  it('shows the health numbers and lists for a project (legacy ?tab=sante still works)', async () => {
    renderPage('/workspace/ws/code?tab=sante&project=p1')
    expect(await screen.findByRole('tab', { name: 'Health', selected: true })).toBeTruthy()
    // the project scope comes from the URL
    await waitFor(() => expect(codeApi.getHealth).toHaveBeenCalledWith({ project_slug: 'p1' }))
    // the number tile and the (collapsed) list section both carry the label
    expect((await screen.findAllByText('God functions')).length).toBeGreaterThan(0)
    expect(screen.getByText('threshold 15')).toBeTruthy()
    expect(screen.getByText('0.312')).toBeTruthy()
    const hotspots = await screen.findByRole('list', { name: 'Hotspots' })
    expect(within(hotspots).getByText('12 commits')).toBeTruthy()
    const risks = screen.getByRole('list', { name: 'Risk assessment' })
    expect(within(risks).getByRole('img', { name: 'critical risk' })).toBeTruthy()
    expect(within(risks).getByText('0.812')).toBeTruthy()
    const gaps = screen.getByRole('list', { name: 'Knowledge gaps' })
    expect(within(gaps).getByText('1 decision')).toBeTruthy()
    // rows open the file history
    fireEvent.click(within(hotspots).getByRole('button', { name: 'History of src/api/client.ts' }))
    expect(await screen.findByRole('dialog', { name: 'client.ts' })).toBeTruthy()
  })

  it('asks for a project on the Health tab when the whole workspace is selected', async () => {
    renderPage('/workspace/ws/code?tab=health')
    expect(await screen.findByText('Select a project')).toBeTruthy()
    expect(codeApi.getHealth).not.toHaveBeenCalled()
  })
})
