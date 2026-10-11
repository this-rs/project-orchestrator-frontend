/**
 * The health tab with a PARTIAL payload: metrics not computed yet (null), fields
 * an older backend leaves out, a NaN written as null. Nothing throws, and what is
 * unknown reads "—" — never a plausible "0" ("risk 0.000", "0% covered").
 */
import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'

const api = vi.hoisted(() => ({
  getHealth: vi.fn(),
  getHotspots: vi.fn(),
  getKnowledgeGaps: vi.fn(),
  getRiskAssessment: vi.fn(),
}))
vi.mock('@/services', () => ({ codeApi: api }))

import { CodeHealthTab } from './CodeHealthTab'

const partial = () => {
  api.getHealth.mockResolvedValue({
    god_functions: [], god_function_count: 0, god_function_threshold: 10,
    orphan_files: [], orphan_file_count: 0,
    coupling_metrics: { avg_clustering_coefficient: null, max_clustering_coefficient: null, most_coupled_file: '' },
    circular_dependencies: [], circular_dependency_count: 0,
    hotspots: [], knowledge_gaps: [], risk_assessment: null,
    // An older backend: the object is there, its numbers are not.
    neural_metrics: {},
  })
  api.getHotspots.mockResolvedValue({ hotspots: [{ path: 'src/a.ts', commit_count: 3, total_churn: 10, co_change_count: 0, churn_score: null }], total_files: 1, limit: 20 })
  api.getKnowledgeGaps.mockResolvedValue({ knowledge_gaps: [{ path: 'src/b.ts', note_count: 0, decision_count: 0, knowledge_density: null }], total_files: 1, limit: 20 })
  api.getRiskAssessment.mockResolvedValue({
    // No `factors` at all, and a risk score that was NaN on the server.
    risk_files: [{ path: 'src/c.ts', risk_score: null, risk_level: 'low' }],
    total_files: 1, limit: 20,
    summary: { avg_risk_score: null, critical_count: 0, high_count: 0, medium_count: 0, low_count: 1 },
  })
}

describe('<CodeHealthTab> with a partial payload', () => {
  it('renders without throwing and shows "—" where a number is unknown', async () => {
    partial()
    render(<CodeHealthTab projectSlug="p" onOpenFile={() => {}} />)
    const risk = await screen.findByRole('list', { name: 'Risk assessment' })

    // Tiles: unknown coupling and neural numbers.
    for (const label of ['Avg coupling', 'Avg energy', 'Weak synapses']) {
      const tile = screen.getByText(label).parentElement as HTMLElement
      expect(tile.textContent).toContain('—')
      expect(tile.textContent).not.toMatch(/\d/)
    }

    // A risk row without factors and without score.
    const row = within(risk).getAllByRole('listitem')[0] as HTMLElement
    expect(row.textContent).toContain('PageRank —')
    expect(row.textContent).toContain('churn —')
    expect(row.textContent).toContain('knowledge gap —')
    expect(row.textContent).toContain('betweenness —')
    expect(row.textContent).not.toContain('0.000')

    // A hotspot and a knowledge gap with unknown values.
    expect(within(screen.getByRole('list', { name: 'Hotspots' })).getByText('churn —')).toBeTruthy()
    const gaps = screen.getByRole('list', { name: 'Knowledge gaps' })
    expect(gaps.textContent).not.toContain('0% covered')
    expect(gaps.textContent).toContain('—')
  })
})
