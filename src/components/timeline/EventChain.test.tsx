import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { EventChain } from './EventChain'
import type { TimelineItem } from './model'

const item = (id: string, label: string, extra: Partial<TimelineItem> = {}): TimelineItem =>
  ({ id, kind: 'tool', status: 'done', label, startedAt: 0, laneId: 's', ...extra })

describe('<EventChain>', () => {
  it('lists upstream, the item and downstream in order and selects a line', () => {
    const onSelect = vi.fn()
    render(<EventChain item={item('b', 'Task · dig', { input: { q: 1 }, output: 'found' })} upstream={[item('r', 'list files')]} downstream={[item('c', 'Read · x')]} onSelect={onSelect} />)
    const lines = screen.getAllByRole('button').map((b) => b.textContent)
    expect(lines[0]).toContain('list files')
    expect(lines[1]).toContain('Task · dig')
    expect(lines[2]).toContain('Read · x')
    expect(screen.getByText('found')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /list files/ }))
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'r' }))
  })
})

describe('<EventChain> routing', () => {
  it('shows where it ran, the score, the reason and the candidates that lost', () => {
    const routing = {
      id: 'd', at: '2026-10-08T12:00:00Z', mode: 'full', stage: 'active', applied: true, task_class: 'complex',
      provider_id: 'claude-code', model: 'claude-opus-4-1', score: 0.82, explored: true, reason: 'best reward per dollar',
      alternatives: [{ provider_id: 'codex', model: null, score: null, rejected: 'no_tools' }],
      outcome: { success: true, reward: 0.9, cost_usd: 0.0123 },
    } as never
    render(<EventChain item={item('r', 'go', { kind: 'request', provider: 'claude-code', model: 'claude-opus-4-1', routing })} upstream={[]} downstream={[]} />)
    expect(screen.getByTestId('event-where').textContent).toContain('opus-4-1')
    const box = screen.getByTestId('event-routing')
    expect(box.textContent).toContain('0.82')
    expect(box.textContent).toContain('best reward per dollar')
    expect(box.textContent).toContain('Cannot call tools')
    expect(box.textContent).toContain('reward 0.90')
    expect(box.textContent).toContain('$0.0123')
  })

  it('names a window_unknown rejection in words (backend #649), with its cause when known', () => {
    const routing = {
      id: 'd', at: '2026-10-10T12:00:00Z', mode: 'full', stage: 'auto', applied: true, task_class: 'complex',
      provider_id: 'openai', model: 'gpt-5', score: 0.7, explored: false, reason: 'best fit',
      alternatives: [
        { provider_id: 'claude-code', model: 'claude-opus-4-1', score: null, rejected: 'window_unknown' },
        { provider_id: 'claude-code', model: 'claude-sonnet-4-5', score: null, rejected: 'window_unknown', why: 'catalog_offline' },
        { provider_id: 'claude-code', model: 'claude-haiku-4-5', score: null, rejected: 'window_unknown', why: 'not_in_catalog' },
      ],
      outcome: null,
    } as never
    render(<EventChain item={item('r', 'go', { kind: 'request', provider: 'openai', model: 'gpt-5', routing })} upstream={[]} downstream={[]} />)
    const cells = screen.getAllByRole('row').slice(1).map((row) => row.lastElementChild?.textContent)
    expect(cells).toEqual([
      'Context window unknown',
      'Context window unknown: catalog offline',
      'Context window unknown: model not in the catalog',
    ])
  })
})
