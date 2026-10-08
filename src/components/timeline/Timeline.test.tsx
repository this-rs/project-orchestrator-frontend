import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Timeline } from './Timeline'
import type { TimelineLane } from './model'

const lane = (id: string, title: string, statuses: Array<[string, 'running' | 'done' | 'error']>): TimelineLane => ({
  id, title,
  items: statuses.map(([label, status], i) => ({ id: `${id}-${i}`, kind: 'tool', status, label, startedAt: i, laneId: id, durationMs: 1500 })),
})

describe('<Timeline>', () => {
  it('says the status in words, not by colour alone', () => {
    render(<Timeline lanes={[lane('s', 'Main', [['Bash · ls', 'done'], ['Read · x', 'error']])]} />)
    expect(screen.getByRole('button', { name: /Bash · ls — Done/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Read · x — Failed/ })).toBeTruthy()
  })

  it('reports the chosen item and marks the selected one', () => {
    const onSelect = vi.fn()
    render(<Timeline lanes={[lane('s', 'Main', [['a', 'done'], ['b', 'running']])]} selectedId="s-1" onSelect={onSelect} />)
    expect(screen.getByRole('button', { name: /^b/ }).getAttribute('aria-current')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: /^a/ }))
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 's-0' }))
  })

  it('titles the lanes only when there are several conversations', () => {
    const { rerender } = render(<Timeline lanes={[lane('s', 'Main', [['a', 'done']])]} />)
    expect(screen.queryByText('Main')).toBeNull()
    rerender(<Timeline lanes={[lane('s', 'Main', [['a', 'done']]), lane('c', 'Wave 1', [['b', 'running']])]} />)
    expect(screen.getByText('Main')).toBeTruthy()
    expect(screen.getByText('Wave 1')).toBeTruthy()
  })

  it('walks the chips with the arrow keys', () => {
    render(<Timeline lanes={[lane('s', 'Main', [['a', 'done'], ['b', 'done']])]} />)
    const a = screen.getByRole('button', { name: /^a/ })
    a.focus()
    fireEvent.keyDown(a, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /^b/ }))
  })

  it('shows the empty line when no lane has an item', () => {
    render(<Timeline lanes={[lane('s', 'Main', [])]} />)
    expect(screen.getByText(/Nothing has happened/)).toBeTruthy()
  })
})

describe('<Timeline> model and routing', () => {
  it('spells the model on a request and the provider · model · rule on the lane', () => {
    const lanes: TimelineLane[] = [
      { id: 'w', title: 'Plan · Task · Step', items: [{ id: 'p', kind: 'plan', status: 'running', label: 'Ship it', startedAt: 0, laneId: 'w' }] },
      {
        id: 's', title: 'Main', context: { provider: 'native', model: 'claude-sonnet-4-5-20250929', routedBy: 'auto' },
        items: [{ id: 'r', kind: 'request', status: 'done', label: 'go', startedAt: 1, laneId: 's', model: 'claude-sonnet-4-5-20250929' }],
      },
    ]
    render(<Timeline lanes={lanes} />)
    expect(screen.getByTestId('timeline-model').textContent).toBe('sonnet-4-5')
    expect(screen.getByTestId('timeline-lane-context').textContent).toContain('native · sonnet-4-5')
    expect(screen.getByRole('button', { name: /Ship it — Running/ }).textContent).toContain('Plan')
  })
})

describe('<Timeline> window', () => {
  const many = (n: number): TimelineLane => ({
    id: 's', title: 'Main',
    items: Array.from({ length: n }, (_, i) => ({ id: `i${i}`, kind: 'tool' as const, status: 'done' as const, label: `call ${i}`, startedAt: i, laneId: 's' })),
  })

  it('draws only the last N and reveals the rest on request', () => {
    render(<Timeline lanes={[many(50)]} maxItems={10} />)
    expect(screen.getAllByRole('button').filter((b) => b.dataset.timelineItem)).toHaveLength(10)
    fireEvent.click(screen.getByRole('button', { name: 'Show 40 earlier' }))
    expect(screen.getAllByRole('button').filter((b) => b.dataset.timelineItem)).toHaveLength(50)
    expect(screen.queryByRole('button', { name: /earlier/ })).toBeNull()
  })

  it('never hides the selected item', () => {
    render(<Timeline lanes={[many(50)]} maxItems={10} selectedId="i0" />)
    expect(screen.getAllByRole('button').filter((b) => b.dataset.timelineItem)).toHaveLength(50)
  })

  it('says "No result" for a call that never got one, not "Done"', () => {
    const lane: TimelineLane = { id: 's', title: 'Main', items: [{ id: 'u', kind: 'tool', status: 'unknown', label: 'Monitor', startedAt: 0, laneId: 's' }] }
    render(<Timeline lanes={[lane]} />)
    expect(screen.getByRole('button', { name: /Monitor — No result/ })).toBeTruthy()
  })
})
