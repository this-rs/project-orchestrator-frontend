/**
 * The trace's first moments: a skeleton only for a load that takes a while, a real
 * empty state, a real error state, and no jump when the history finishes loading.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { SKELETON_DELAY_MS, TraceView } from './TraceView'
import type { TimelineItem, TimelineLane } from './model'

const T0 = 1_700_000_000_000
const item = (id: string, over: Partial<TimelineItem> = {}): TimelineItem => ({
  id, kind: 'tool', status: 'done', label: id, startedAt: T0, endedAt: T0 + 2000, durationMs: 2000, laneId: 'l', ...over,
})
const lane = (items: TimelineItem[]): TimelineLane => ({ id: 'l', title: 'Conversation', items })
const turn = () => [lane([
  item('req', { kind: 'request', label: 'list the files', endedAt: T0 + 6000, durationMs: 6000 }),
  item('bash', { label: 'Bash · ls', parentId: 'req', startedAt: T0 + 1000, endedAt: T0 + 3000 }),
])]
const nothing = () => [lane([])]
const starting = { loaded: 0, total: 0 }

afterEach(() => {
  vi.useRealTimers()
})

describe('<TraceView> while the history loads', () => {
  it('shows no skeleton for a fast load, then the skeleton once the load takes a while', () => {
    vi.useFakeTimers()
    render(<TraceView lanes={nothing()} loading={starting} />)
    // Right away: the status for assistive technologies, nothing that blinks.
    expect(screen.getByRole('status').textContent).toBe('Loading the history…')
    expect(screen.queryByTestId('trace-skeleton')).toBeNull()
    act(() => { vi.advanceTimersByTime(SKELETON_DELAY_MS - 20) })
    expect(screen.queryByTestId('trace-skeleton')).toBeNull()
    act(() => { vi.advanceTimersByTime(40) })
    expect(screen.getByTestId('trace-skeleton')).toBeTruthy()
  })

  it('a load that ends before the delay goes straight to the trace', () => {
    vi.useFakeTimers()
    const { rerender } = render(<TraceView lanes={nothing()} loading={starting} />)
    act(() => { vi.advanceTimersByTime(100) })
    rerender(<TraceView lanes={turn()} loading={null} />)
    act(() => { vi.advanceTimersByTime(SKELETON_DELAY_MS * 2) })
    expect(screen.queryByTestId('trace-skeleton')).toBeNull()
    expect(screen.getAllByRole('treeitem')).toHaveLength(3)
  })

  it('the skeleton has the trace\'s shape (toolbar, ruler, rows) and is hidden from assistive technologies; the frame is busy', () => {
    vi.useFakeTimers()
    const { container } = render(<TraceView lanes={nothing()} loading={starting} maxRowsHeight={224} />)
    act(() => { vi.advanceTimersByTime(SKELETON_DELAY_MS) })
    const skeleton = screen.getByTestId('trace-skeleton')
    expect(skeleton.getAttribute('aria-hidden')).toBe('true')
    expect((container.firstElementChild as HTMLElement).getAttribute('aria-busy')).toBe('true')
    // jsdom measures no width: the wide layout, 28 px rows, a 224 px rows area → 8 rows.
    const rowsArea = skeleton.lastElementChild as HTMLElement
    expect(rowsArea.style.height).toBe('224px')
    expect(rowsArea.children).toHaveLength(8)
    // The pulse stops under prefers-reduced-motion.
    expect(skeleton.querySelector('.animate-pulse')).toBeNull()
    expect(skeleton.querySelector('[class*="motion-safe:animate-pulse"]')).toBeTruthy()
    // The sentence of the status is also where the counts will be.
    expect(skeleton.textContent).toContain('Loading the history…')
  })

  it('the skeleton leaves when the first page lands', () => {
    vi.useFakeTimers()
    const { rerender, container } = render(<TraceView lanes={nothing()} loading={starting} />)
    act(() => { vi.advanceTimersByTime(SKELETON_DELAY_MS) })
    rerender(<TraceView lanes={turn()} loading={{ loaded: 500, total: 900 }} />)
    expect(screen.queryByTestId('trace-skeleton')).toBeNull()
    expect(screen.getAllByRole('treeitem')).toHaveLength(3)
    expect((container.firstElementChild as HTMLElement).getAttribute('aria-busy')).toBeNull()
  })
})

describe('<TraceView> with a trace on screen', () => {
  it('the rest of the history loading moves nothing: the progress line is always reserved and the rows stay the same nodes', () => {
    const { rerender } = render(<TraceView lanes={turn()} loading={{ loaded: 500, total: 1000 }} />)
    const bar = screen.getByTestId('trace-progress')
    const row = screen.getByRole('treeitem', { name: /Bash · ls/ })
    expect((bar.firstElementChild as HTMLElement).style.transform).toBe('scaleX(0.5)')
    expect(screen.getByTestId('trace-loading').textContent).toContain('500 of 1000')
    rerender(<TraceView lanes={turn()} loading={null} />)
    expect(screen.getByTestId('trace-progress')).toBe(bar)
    expect(bar.childElementCount).toBe(0)
    expect(screen.getByRole('treeitem', { name: /Bash · ls/ })).toBe(row)
    // The live region stays: the next load can be announced.
    expect(screen.getByRole('status').textContent).toBe('')
  })
})

describe('<TraceView> empty and error states', () => {
  it('nothing happened: an empty state that says what will appear', () => {
    render(<TraceView lanes={nothing()} />)
    const empty = screen.getByTestId('trace-empty')
    expect(empty.textContent).toContain('Nothing has happened yet.')
    expect(empty.textContent).toContain('Each request, tool call and delegated session will appear here')
    expect(screen.queryByTestId('trace-skeleton')).toBeNull()
  })

  it('nothing could be read: an error state with a retry, not an empty state', () => {
    const retry = vi.fn()
    render(<TraceView lanes={nothing()} failed onRetry={retry} />)
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('The history could not be loaded.')
    expect(screen.queryByTestId('trace-empty')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(retry).toHaveBeenCalledTimes(1)
  })
})
