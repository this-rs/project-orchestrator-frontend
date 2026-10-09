import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { TimelineGantt } from './TimelineGantt'
import type { TimelineItem, TimelineLane } from './model'

const T0 = 1_700_000_000_000
const item = (id: string, over: Partial<TimelineItem> = {}): TimelineItem => ({
  id, kind: 'tool', status: 'done', label: id, startedAt: T0, endedAt: T0 + 2000, durationMs: 2000, laneId: 'l', model: 'claude-sonnet-4-5-20250929', ...over,
})
const lane = (items: TimelineItem[]): TimelineLane => ({ id: 'l', title: 'Conversation', items })

describe('<TimelineGantt>', () => {
  it('says so when nothing happened', () => {
    render(<TimelineGantt lanes={[lane([])]} />)
    expect(screen.getByText('Nothing has happened yet.')).toBeTruthy()
  })

  it('draws one row per call with its status, duration and model', () => {
    render(<TimelineGantt lanes={[lane([item('Read a.ts'), item('Bash ls', { status: 'error', startedAt: T0 + 500, endedAt: T0 + 1500, durationMs: 1000 })])]} />)
    const rows = screen.getAllByRole('button')
    expect(rows).toHaveLength(2)
    expect(rows[1]!.getAttribute('aria-label')).toBe('Bash ls — Failed — 1.0 s — sonnet-4-5')
    expect(rows[1]!.getAttribute('data-status')).toBe('error')
    expect(screen.getAllByTestId('timeline-model')[0]!.textContent).toBe('sonnet-4-5')
  })

  it('reports how many calls ran at the same time', () => {
    render(<TimelineGantt lanes={[lane([item('a'), item('b'), item('c')])]} />)
    expect(screen.getByText('Calls: 3')).toBeTruthy()
    expect(screen.getByText('Peak in parallel: 3')).toBeTruthy()
  })

  it('chooses a row on click and marks the selected one', () => {
    const onSelect = vi.fn()
    render(<TimelineGantt lanes={[lane([item('a'), item('b')])]} selectedId="b" onSelect={onSelect} />)
    fireEvent.click(screen.getAllByRole('button')[0]!)
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }))
    expect(screen.getAllByRole('button')[1]!.getAttribute('aria-current')).toBe('true')
  })

  it('walks the rows with the arrow keys', () => {
    render(<TimelineGantt lanes={[lane([item('a'), item('b')])]} />)
    const [first, second] = screen.getAllByRole('button')
    first!.focus()
    fireEvent.keyDown(screen.getByRole('list'), { key: 'ArrowDown' })
    expect(document.activeElement).toBe(second)
  })

  it('shows only the end of a long lane, and the rest on demand', () => {
    const many = Array.from({ length: 12 }, (_, i) => item(`call ${i}`, { startedAt: T0 + i * 100, endedAt: T0 + i * 100 + 50 }))
    render(<TimelineGantt lanes={[lane(many)]} maxItems={5} />)
    expect(screen.getAllByTestId('timeline-model')).toHaveLength(5)
    fireEvent.click(screen.getByRole('button', { name: 'Show 7 earlier' }))
    expect(screen.getAllByTestId('timeline-model')).toHaveLength(12)
  })

  it('keeps a selected row visible even when it is in the hidden part', () => {
    const many = Array.from({ length: 12 }, (_, i) => item(`call ${i}`, { startedAt: T0 + i * 100, endedAt: T0 + i * 100 + 50 }))
    render(<TimelineGantt lanes={[lane(many)]} maxItems={5} selectedId="call 0" />)
    expect(screen.getAllByTestId('timeline-model')).toHaveLength(12)
  })
})
