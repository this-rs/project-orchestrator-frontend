/**
 * An agent execution / plan run left `running` by a server that is gone is
 * `interrupted`: terminal (no pulse, no ticking counter), with its own label.
 * A status the UI does not know is shown as it is, never as `running`.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AgentExecutionDetail } from '../AgentExecutionDetail'
import { PlanRunRow } from '../PlanRunRow'
import { agentStateMeta, finalDurationSecs, getWaveStatus, runStateMeta } from '../shared'
import type { AgentExecution } from '@/types'
import type { ActiveAgentSnapshot, PlanRun } from '@/services/runner'

const START = '2026-03-20T10:00:00Z'
const END = '2026-03-20T11:30:00Z' // 1h 30m after START

function execution(overrides: Partial<AgentExecution> & { status: string }): AgentExecution {
  return {
    id: 'ae-1',
    run_id: 'run-1',
    task_id: 'task-1234567890',
    started_at: START,
    completed_at: null,
    cost_usd: 0,
    duration_secs: 0,
    files_modified: [],
    commits: [],
    ...overrides,
  } as AgentExecution
}

function run(overrides: Partial<PlanRun>): PlanRun {
  return {
    run_id: 'run-1',
    plan_id: 'plan-1',
    total_tasks: 4,
    current_wave: 1,
    current_task_id: null,
    current_task_title: null,
    active_agents: [],
    completed_tasks: ['a'],
    failed_tasks: [],
    git_branch: '',
    started_at: START,
    completed_at: null,
    status: 'running',
    cost_usd: 0,
    triggered_by: 'manual',
    project_id: null,
    ...overrides,
  } as PlanRun
}

describe('AgentExecutionDetail status', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-03T08:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows an interrupted execution as Interrupted, not Running', () => {
    render(<AgentExecutionDetail execution={execution({ status: 'interrupted', completed_at: END })} />)
    expect(screen.getByText('Interrupted')).toBeTruthy()
    expect(screen.queryByText('Running')).toBeNull()
  })

  it('stops the duration counter at completed_at for an interrupted execution', () => {
    render(<AgentExecutionDetail execution={execution({ status: 'interrupted', completed_at: END })} />)
    expect(screen.getByText('1h 30m')).toBeTruthy()
    act(() => {
      vi.advanceTimersByTime(10 * 60 * 1000)
    })
    expect(screen.getByText('1h 30m')).toBeTruthy()
  })

  it('does not pulse for an interrupted execution', () => {
    const { container } = render(<AgentExecutionDetail execution={execution({ status: 'interrupted', completed_at: END })} />)
    expect(container.querySelector('[class*="animate-ping"]')).toBeNull()
  })

  it('shows an unknown status as it is, neutral, with no pulse and no ticking counter', () => {
    const { container } = render(<AgentExecutionDetail execution={execution({ status: 'quantum_superposition' })} />)
    expect(screen.getByText('quantum_superposition')).toBeTruthy()
    expect(screen.queryByText('Running')).toBeNull()
    expect(container.querySelector('[class*="animate-ping"]')).toBeNull()
    const before = container.textContent
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(container.textContent).toBe(before)
  })

  it('still pulses and ticks for a really running execution', () => {
    const startedNow = new Date(Date.now() - 5000).toISOString()
    const { container } = render(<AgentExecutionDetail execution={execution({ status: 'running', started_at: startedNow })} />)
    expect(screen.getByText('Running')).toBeTruthy()
    expect(container.querySelector('[class*="animate-ping"]')).not.toBeNull()
    expect(screen.getByText('5s')).toBeTruthy()
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(screen.getByText('8s')).toBeTruthy()
  })
})

describe('interrupted is terminal everywhere', () => {
  it('finalDurationSecs falls back on completed_at - started_at when no duration was recorded', () => {
    expect(finalDurationSecs({ started_at: START, completed_at: END, duration_secs: 0 })).toBe(5400)
    expect(finalDurationSecs({ started_at: START, completed_at: END, duration_secs: 12 })).toBe(12)
    expect(finalDurationSecs({ started_at: START, completed_at: null, duration_secs: 0 })).toBeUndefined()
  })

  it('runStateMeta / agentStateMeta: own label, not live', () => {
    expect(runStateMeta('interrupted')).toMatchObject({ label: 'Interrupted' })
    expect(runStateMeta('interrupted').live).toBeFalsy()
    expect(agentStateMeta('interrupted')).toMatchObject({ label: 'Interrupted' })
    expect(agentStateMeta('interrupted').live).toBeFalsy()
  })

  it('a wave whose agents were interrupted is not active', () => {
    const agent: ActiveAgentSnapshot = {
      task_id: 't',
      task_title: 'T',
      session_id: null,
      elapsed_secs: 0,
      cost_usd: 0,
      status: 'interrupted',
    }
    expect(getWaveStatus([agent])).not.toBe('active')
  })

  it('PlanRunRow shows an interrupted run as Interrupted with no live progress bar', () => {
    render(
      <MemoryRouter>
        <PlanRunRow run={run({ status: 'interrupted', completed_at: END })} title="Plan X" href="/x" />
      </MemoryRouter>,
    )
    expect(screen.getAllByText('Interrupted').length).toBeGreaterThan(0)
    expect(screen.queryByText('Running')).toBeNull()
    expect(screen.queryByRole('progressbar')).toBeNull()
  })
})
