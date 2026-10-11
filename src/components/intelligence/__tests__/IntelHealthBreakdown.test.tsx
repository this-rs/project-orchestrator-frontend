/** The risk badge says nothing rather than a fake "Avg risk 0%" when the average risk is unknown. */
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { IntelHealthBreakdown, type IntelligenceData } from '../IntelligenceDashboard'

const summary = {
  code: { files: 10, functions: 40, communities: 2, hotspots: [], orphans: 0 },
  knowledge: { notes: 4, decisions: 1, stale_count: 0, types_distribution: {} },
  fabric: { co_changed_pairs: 3 },
  neural: { active_synapses: 2, avg_energy: 0.5, weak_synapses_ratio: 0.1, dead_notes_count: 0 },
  skills: { total: 0, active: 0, emerging: 0, avg_cohesion: 0, total_activations: 0 },
  behavioral: { protocols: 0, states: 0, transitions: 0, system_protocols: 0, business_protocols: 0, skill_linked: 0 },
}
const withRisk = (avg_risk_score: number | null) =>
  ({ summary, healthScore: 70, health: { risk_assessment: { avg_risk_score, critical_count: 0, high_count: 0, medium_count: 1, low_count: 2 } } }) as unknown as IntelligenceData

describe('<IntelHealthBreakdown> risk badge', () => {
  it('shows a known average risk', () => {
    const { container } = render(<MemoryRouter><IntelHealthBreakdown data={withRisk(0.42)} /></MemoryRouter>)
    expect(container.textContent).toContain('Avg risk 42%')
  })
  it('says nothing about an unknown average risk (null from the backend), never "0%"', () => {
    const { container } = render(<MemoryRouter><IntelHealthBreakdown data={withRisk(null)} /></MemoryRouter>)
    expect(container.textContent).not.toMatch(/Avg risk/)
  })
})
