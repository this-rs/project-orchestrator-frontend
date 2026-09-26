/**
 * StatsRow — key numbers of a run: progress (tasks, %, failed, elapsed),
 * budget (always-visible edit control, inline save) , agents and wave.
 * Same props as before the redesign (also embedded in PlanDetailPage).
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { StatsRow } from '../StatsRow'
import type { RunSnapshot, ActiveAgentSnapshot } from '@/services/runner'

const snapshot: RunSnapshot = {
  running: true,
  run_id: 'run-1',
  plan_id: 'plan-1',
  status: 'running',
  current_wave: 1,
  current_task_id: null,
  current_task_title: null,
  active_agents: [],
  progress_pct: 37.5,
  tasks_completed: 3,
  tasks_total: 8,
  elapsed_secs: 252,
  cost_usd: 1.234,
  max_cost_usd: 10,
}

const agents: ActiveAgentSnapshot[] = [
  { task_id: 't1', task_title: 'A', session_id: null, elapsed_secs: 1, cost_usd: 0, status: 'running' },
  { task_id: 't2', task_title: 'B', session_id: null, elapsed_secs: 1, cost_usd: 0, status: 'failed' },
  { task_id: 't3', task_title: 'C', session_id: null, elapsed_secs: 1, cost_usd: 0, status: 'completed' },
]

describe('StatsRow', () => {
  it('shows tasks, percentage, failed count, elapsed time, agents and wave', () => {
    render(<StatsRow effectiveSnapshot={snapshot} isRunning resolvedAgents={agents} wavesTotal={3} planId="plan-1" onBudgetSave={async () => {}} />)
    expect(screen.getByText('3/8 tasks')).toBeTruthy()
    expect(screen.getByText('38%')).toBeTruthy()
    expect(screen.getByText('1 failed')).toBeTruthy()
    expect(screen.getByText('04:12')).toBeTruthy()
    expect(screen.getByRole('progressbar', { name: 'Run progress' }).getAttribute('aria-valuenow')).toBe('4')
    expect(screen.getByText('2 / 3')).toBeTruthy()
    expect(screen.getByText('· 1 running')).toBeTruthy()
  })

  it('budget: cost / limit with an always-visible edit control that saves inline', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<StatsRow effectiveSnapshot={snapshot} isRunning resolvedAgents={agents} wavesTotal={3} planId="plan-1" onBudgetSave={onSave} />)
    expect(screen.getByText('$1.23')).toBeTruthy()
    expect(screen.getByText('/ $10.00')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /edit budget/i }))
    const input = screen.getByLabelText(/budget limit/i) as HTMLInputElement
    fireEvent.change(input, { target: { value: '25' } })
    fireEvent.click(screen.getByRole('button', { name: /save budget/i }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('plan-1', 25))
  })
})
