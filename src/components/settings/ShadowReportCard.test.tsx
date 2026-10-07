/**
 * Run with: npx vitest run src/components/settings/ShadowReportCard
 */
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, within } from '@testing-library/react'

const report = vi.fn()
vi.mock('@/services/routing', async (orig) => ({
  ...(await orig<typeof import('@/services/routing')>()),
  routingApi: { report: (...a: unknown[]) => report(...a) },
}))
vi.mock('@/services/projects', () => ({ projectsApi: { list: vi.fn().mockResolvedValue({ items: [] }) } }))

import type { RoutingReport } from '@/types/routing'
import { ShadowReportCard } from './ShadowReportCard'

const data: RoutingReport = {
  decisions: 40,
  applied: 10,
  agreement_rate: 0.75,
  estimated_cost_delta_usd: -1.5,
  by_class: [
    { task_class: 'simple', decisions: 30, applied: 5, agreement_rate: null, estimated_cost_delta_usd: null },
    { task_class: 'complex', decisions: 10, applied: 5, agreement_rate: 0.5, estimated_cost_delta_usd: 0.25 },
  ],
  by_arm: [{ task_class: 'simple', provider_id: 'deepseek', model: 'deepseek-chat', n: 12, mean_reward: 0.7, mean_cost_usd: null }],
}

// The project picker links to the workspace selector when there is no project.
const render = (ui: ReactElement) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>)

beforeEach(() => {
  report.mockReset()
})

describe('ShadowReportCard', () => {
  it('shows figures, an estimate disclaimer, and the per-class and per-arm tables', async () => {
    report.mockResolvedValue(data)
    render(<ShadowReportCard />)
    expect((await screen.findByTestId('report-decisions')).textContent).toBe('40')
    expect(screen.getByTestId('report-applied').textContent).toBe('10')
    expect(screen.getByTestId('report-agreement').textContent).toBe('75%')
    expect(screen.getByTestId('report-cost-delta').textContent).toBe('$-1.5')
    expect(screen.getByTestId('report-estimate-note').textContent).toMatch(/ESTIMATE.*quality/)
    const byClass = within(screen.getByTestId('report-by-class'))
    expect(byClass.getByText('complex')).toBeTruthy()
    expect(byClass.getByText('n/a')).toBeTruthy() // null agreement of "simple"
    expect(byClass.getByText('Unknown')).toBeTruthy() // null delta of "simple"
    const byArm = within(screen.getByTestId('report-by-arm'))
    expect(byArm.getByText('deepseek · deepseek-chat')).toBeTruthy()
    expect(byArm.getByText('Unknown')).toBeTruthy() // null mean cost
  })

  it('a null cost delta reads Unknown, never 0; a null agreement reads n/a', async () => {
    report.mockResolvedValue({ ...data, agreement_rate: null, estimated_cost_delta_usd: null })
    render(<ShadowReportCard />)
    expect((await screen.findByTestId('report-cost-delta')).textContent).toBe('Unknown')
    expect(screen.getByTestId('report-agreement').textContent).toBe('n/a')
  })

  it('empty report', async () => {
    report.mockResolvedValue({ ...data, decisions: 0, by_class: [], by_arm: [] })
    render(<ShadowReportCard />)
    expect(await screen.findByText('No decision to report on yet.')).toBeTruthy()
  })

  it('error', async () => {
    report.mockImplementation(() => Promise.reject(new Error('x')))
    render(<ShadowReportCard />)
    await screen.findByText('The report could not be loaded.')
    expect(screen.getByRole('alert').textContent).toContain('could not be loaded')
  })
})
