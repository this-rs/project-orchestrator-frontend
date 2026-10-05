/**
 * Runner: a cost is shown by its basis, a missing one is never "$0.00", and a
 * sum that mixes known and unknown costs is a floor ("≥ $x").
 *
 * Run with: npx vitest run src/components/runner/__tests__/costByBasis.test.tsx
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ActiveAgentSnapshot, PlanRun } from '@/services/runner'

vi.mock('@/hooks', () => ({
  useWorkspaceSlug: () => 'ws',
}))

import { WaveAgentCard } from '../WaveAgentCard'
import { WaveSection } from '../WaveSection'
import { BudgetEditor } from '../BudgetEditor'
import { PlanRunRow } from '../PlanRunRow'
import { runCost } from '../shared'

const agent = (over: Partial<ActiveAgentSnapshot>): ActiveAgentSnapshot => ({
  session_id: 'sess-1',
  task_id: 'task-1',
  task_title: 'A task',
  status: 'completed',
  elapsed_secs: 60,
  cost_usd: 0.5,
  ...over,
})

const card = (a: ActiveAgentSnapshot) =>
  render(
    <MemoryRouter>
      <ul>
        <WaveAgentCard agent={a} isSelected={false} onToggleConversation={() => {}} />
      </ul>
    </MemoryRouter>,
  )

describe('WaveAgentCard — cost by basis', () => {
  it('a Claude agent shows the same cost as before', () => {
    card(agent({ cost_usd: 0.05 }))
    expect(screen.getByText('$0.05')).toBeTruthy()
  })

  it('an agent without a figure shows no cost — not $0.00', () => {
    const { container } = card(agent({ cost_usd: null }))
    expect(screen.queryByTestId('cost-display')).toBeNull()
    expect(container.textContent).not.toContain('$')
  })

  it('a local agent reads "local"', () => {
    card(agent({ cost_usd: 0, cost_basis: 'free' }))
    expect(screen.getByTestId('cost-display').textContent).toContain('local')
  })

  it('an estimated cost carries its badge', () => {
    card(agent({ cost_usd: 0.4, cost_basis: 'priced' }))
    expect(screen.getByTestId('cost-display').textContent).toContain('$0.40')
    expect(screen.getByTestId('cost-display').textContent).toContain('est.')
  })
})

describe('WaveSection — the cost of a wave is a sum', () => {
  const wave = (agents: ActiveAgentSnapshot[]) =>
    render(
      <MemoryRouter>
        <WaveSection
          waveNumber={1}
          taskIds={agents.map((a) => a.task_id)}
          agents={agents}
          executionsMap={new Map()}
          selectedConversation={null}
          onToggleConversation={() => {}}
          onCloseConversation={() => {}}
          defaultOpen={false}
        />
      </MemoryRouter>,
    )

  it('all known: the exact total, as before', () => {
    wave([agent({ task_id: 'a', cost_usd: 1 }), agent({ task_id: 'b', cost_usd: 0.25 })])
    expect(screen.getByText('$1.25')).toBeTruthy()
  })

  it('known and unknown mixed: "≥ $x", with the reason', () => {
    wave([agent({ task_id: 'a', cost_usd: 1 }), agent({ task_id: 'b', cost_usd: null })])
    const total = screen.getByText('≥ $1.00')
    expect(total.getAttribute('title')).toMatch(/at least/)
    expect(screen.queryByText('$1.00')).toBeNull()
  })

  it('nothing known: no total at all', () => {
    const { container } = wave([agent({ task_id: 'a', cost_usd: null })])
    expect(container.textContent).not.toContain('$')
  })
})

describe('BudgetEditor — what was spent', () => {
  it('a known cost is shown as before', () => {
    render(<BudgetEditor costUsd={1.5} maxCostUsd={10} onSave={async () => {}} />)
    expect(screen.getByText(/\$1\.50/)).toBeTruthy()
    expect(screen.getByText(/\$10\.00/)).toBeTruthy()
  })

  it('no figure is "—", never $0.00', () => {
    const { container } = render(<BudgetEditor costUsd={null} maxCostUsd={0} onSave={async () => {}} />)
    expect(container.textContent).toContain('—')
    expect(container.textContent).not.toContain('$0.00')
  })

  it('a local run reads "local"', () => {
    const { container } = render(<BudgetEditor costUsd={0} costBasis="free" maxCostUsd={0} onSave={async () => {}} />)
    expect(container.textContent).toContain('local')
    expect(container.textContent).not.toContain('$')
  })
})

describe('PlanRunRow — run cost', () => {
  const run = (over: Partial<PlanRun>): PlanRun => ({
    run_id: 'r1',
    plan_id: 'p1',
    total_tasks: 2,
    current_wave: 1,
    current_task_id: null,
    current_task_title: null,
    active_agents: [],
    completed_tasks: ['t1'],
    failed_tasks: [],
    git_branch: 'main',
    started_at: '2026-10-05T10:00:00Z',
    completed_at: '2026-10-05T10:05:00Z',
    status: 'completed',
    cost_usd: 2,
    triggered_by: 'manual',
    project_id: null,
    ...over,
  })
  const row = (r: PlanRun) =>
    render(
      <MemoryRouter>
        <ul>
          <PlanRunRow run={r} title="Plan" href="/x" />
        </ul>
      </MemoryRouter>,
    )

  it('a Claude run shows the same cost as before', () => {
    row(run({ cost_usd: 2 }))
    expect(screen.getByText('$2.00')).toBeTruthy()
  })

  it('a run without a figure shows no cost', () => {
    const { container } = row(run({ cost_usd: null }))
    expect(container.textContent).not.toContain('$')
  })
})

describe('runCost', () => {
  it('a bare figure is a reported cost; no figure and no basis is nothing', () => {
    expect(runCost({ cost_usd: 1 })).toEqual({ usd: 1, basis: 'reported' })
    expect(runCost({ cost_usd: null })).toBeNull()
    expect(runCost({ cost_usd: null, cost_basis: 'unknown' })).toEqual({ usd: null, basis: 'unknown' })
  })
})
