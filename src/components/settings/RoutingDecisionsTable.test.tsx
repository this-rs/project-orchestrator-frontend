/**
 * Run with: npx vitest run src/components/settings/RoutingDecisionsTable
 */
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render as rtlRender, screen, waitFor, within } from '@testing-library/react'

const decisions = vi.fn()
vi.mock('@/services/routing', async (orig) => ({
  ...(await orig<typeof import('@/services/routing')>()),
  routingApi: { decisions: (...a: unknown[]) => decisions(...a) },
}))
vi.mock('@/services/projects', () => ({
  projectsApi: { list: vi.fn().mockResolvedValue({ items: [{ slug: 'acme', name: 'Acme' }] }) },
}))

import type { RoutingDecision } from '@/types/routing'
import { DECISIONS_PAGE_SIZE, RoutingDecisionsTable } from './RoutingDecisionsTable'

const mk = (i: number, over: Partial<RoutingDecision> = {}): RoutingDecision => ({
  id: `d${i}`,
  at: '2026-10-01T10:00:00Z',
  mode: 'full',
  stage: 'shadow',
  applied: false,
  task_class: 'simple',
  provider_id: 'deepseek',
  model: 'deepseek-chat',
  score: 0.5,
  explored: false,
  reason: `reason ${i}`,
  alternatives: [],
  ...over,
})

// The project picker links to the workspace selector when there is no project.
const render = (ui: ReactElement) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>)

beforeEach(() => {
  decisions.mockReset()
})

describe('RoutingDecisionsTable', () => {
  it('lists decisions with provider·model, applied vs shadow, outcome, and never shows 0 for an unknown cost', async () => {
    const long = 'x'.repeat(200)
    decisions.mockResolvedValue([
      mk(1, { applied: true, reason: long, outcome: { success: true, reward: 0.8, cost_usd: 0.0123 } }),
      mk(2, { outcome: { success: false, reward: null, cost_usd: null } }),
      mk(3, { outcome: null }),
    ])
    render(<RoutingDecisionsTable />)
    const rows = await screen.findAllByTestId('routing-decision-row')
    expect(rows).toHaveLength(3)
    const r1 = within(rows[0])
    expect(r1.getByText('deepseek · deepseek-chat')).toBeTruthy()
    expect(r1.getByText('Applied')).toBeTruthy()
    expect(r1.getByText('$0.0123')).toBeTruthy()
    expect(r1.getByText('Success')).toBeTruthy()
    expect(r1.getByText('reward 0.8')).toBeTruthy()
    expect(r1.getByTitle(long)).toBeTruthy()
    const r2 = within(rows[1])
    expect(r2.getByText('Shadow')).toBeTruthy()
    expect(r2.getByText('Unknown')).toBeTruthy()
    expect(r2.getByText('Failed')).toBeTruthy()
    expect(rows[1].textContent).not.toContain('$0')
    expect(within(rows[2]).getByText('Pending')).toBeTruthy()
    expect(within(rows[2]).getByText('Unknown')).toBeTruthy()
  })

  it('pages with limit/offset and filters by project (back to the first page)', async () => {
    const full = Array.from({ length: DECISIONS_PAGE_SIZE }, (_, i) => mk(i))
    decisions.mockResolvedValue(full)
    render(<RoutingDecisionsTable />)
    await screen.findAllByTestId('routing-decision-row')
    expect(decisions).toHaveBeenLastCalledWith({ limit: DECISIONS_PAGE_SIZE, offset: 0 })
    expect((screen.getByRole('button', { name: 'Previous' }) as HTMLButtonElement).disabled).toBe(true)

    decisions.mockResolvedValue([mk(99)])
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(decisions).toHaveBeenLastCalledWith({ limit: DECISIONS_PAGE_SIZE, offset: DECISIONS_PAGE_SIZE }))
    await screen.findByText('Page 2')
    // short page: no further page
    await waitFor(() => expect((screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true))

    fireEvent.change(await screen.findByLabelText('Project'), { target: { value: 'acme' } })
    await waitFor(() => expect(decisions).toHaveBeenLastCalledWith({ project_slug: 'acme', limit: DECISIONS_PAGE_SIZE, offset: 0 }))
    await screen.findByText('Page 1')
  })

  it('empty state', async () => {
    decisions.mockResolvedValue([])
    render(<RoutingDecisionsTable />)
    expect(await screen.findByText('No decision recorded yet.')).toBeTruthy()
  })

  it('error state', async () => {
    decisions.mockImplementation(() => Promise.reject(new Error('boom')))
    render(<RoutingDecisionsTable />)
    expect((await screen.findByRole('alert')).textContent).toContain('could not be loaded')
  })

  it('shows a loading state first', () => {
    decisions.mockReturnValue(new Promise(() => {}))
    render(<RoutingDecisionsTable />)
    expect(screen.getByText('Loading decisions…')).toBeTruthy()
  })
})
