import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AgentExecutionDetail } from '../AgentExecutionDetail'
import type { AgentExecution } from '@/types'

const exec = (extra: Partial<AgentExecution> = {}): AgentExecution => ({
  id: 'e1',
  run_id: 'r1',
  task_id: 'task-12345678',
  started_at: '2026-10-01T10:00:00Z',
  completed_at: '2026-10-01T10:05:00Z',
  cost_usd: null,
  duration_secs: 300,
  status: 'completed',
  files_modified: [],
  commits: [],
  ...extra,
})

describe('AgentExecutionDetail — where it ran', () => {
  it('says nothing about a provider for a record from before providers', () => {
    render(<AgentExecutionDetail execution={exec({ cost_usd: 0.5 })} />)
    expect(screen.queryByTestId('execution-model')).toBeNull()
  })

  it('shows provider and effective model, and "requested X -> ran Y (reason)" only when they differ', () => {
    render(
      <AgentExecutionDetail
        execution={exec({
          provider_id: 'deepseek',
          model_requested: 'deepseek-reasoner',
          model: 'deepseek-chat',
          fallback_reason: 'rate_limited',
          routed_by: 'project_rule',
          route_rule: 'cheap-tasks',
        })}
      />,
    )
    const line = screen.getByTestId('execution-model').textContent!
    expect(line).toContain('deepseek')
    expect(line).toContain('requested deepseek-reasoner → ran deepseek-chat (rate limited)')
    expect(line).toContain('chosen by rule cheap-tasks')
  })

  it('does not repeat the model when what ran is what was asked', () => {
    render(<AgentExecutionDetail execution={exec({ provider_id: 'deepseek', model_requested: 'deepseek-chat', model: 'deepseek-chat' })} />)
    expect(screen.getByTestId('execution-model').textContent).not.toContain('requested')
  })

  it('shows the shadow model as an observation, and none when it matches what ran', () => {
    const { unmount } = render(<AgentExecutionDetail execution={exec({ provider_id: 'claude-code', model: 'sonnet', shadow_model: 'haiku' })} />)
    expect(screen.getByTestId('execution-model').textContent).toContain('shadow: would have used haiku')
    unmount()
    render(<AgentExecutionDetail execution={exec({ provider_id: 'claude-code', model: 'sonnet', shadow_model: 'sonnet' })} />)
    expect(screen.getByTestId('execution-model').textContent).not.toContain('shadow')
  })

  it('never shows an unknown cost as $0: tokens when there are some, a dash otherwise', () => {
    const { unmount } = render(
      <AgentExecutionDetail execution={exec({ provider_id: 'local', cost_usd: null, cost_basis: 'unknown', input_tokens: 1200, output_tokens: 300 })} />,
    )
    expect(screen.getByTestId('cost-display').textContent).toContain('1.2k in · 300 out')
    expect(document.body.textContent).not.toContain('$0')
    unmount()
    render(<AgentExecutionDetail execution={exec({ provider_id: 'local', cost_usd: null, cost_basis: 'unknown' })} />)
    expect(screen.queryByTestId('cost-display')).toBeNull()
    expect(document.body.textContent).not.toContain('$0')
  })
})
