import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { TracksView } from './TracksView'
import type { TimelineItem, TimelineLane } from './model'

const T0 = 1_700_000_000_000
const item = (id: string, over: Partial<TimelineItem> = {}): TimelineItem => ({
  id, kind: 'tool', status: 'done', label: id, startedAt: T0, endedAt: T0 + 2000, durationMs: 2000, laneId: 'l', model: 'claude-sonnet-4-5-20250929', provider: 'claude-code', ...over,
})
const span = (id: string, from: number, to: number, over: Partial<TimelineItem> = {}) =>
  item(id, { startedAt: T0 + from, endedAt: T0 + to, durationMs: to - from, ...over })
const lane = (items: TimelineItem[], over: Partial<TimelineLane> = {}): TimelineLane => ({ id: 'l', title: 'Conversation', items, ...over })

/** A turn with two calls at once, a sub-agent with its own call, a wait and an error. */
const piece = () => [lane([
  span('req', 0, 10_000, { kind: 'request', label: 'list the files' }),
  span('grep', 500, 1500, { label: 'Grep · x', parentId: 'req', anchorId: 'grep', input: { pattern: 'x' }, output: 'a.ts' }),
  span('read', 500, 2500, { label: 'Read · a.ts', parentId: 'req' }),
  span('agent', 3000, 9000, { kind: 'agent', label: 'Task · dig', parentId: 'req', anchorId: 'agent' }),
  span('bash', 3500, 4500, { label: 'Bash · ls', parentId: 'agent', status: 'error' }),
  span('perm', 6000, 7000, { kind: 'permission', label: 'Allow rm?', parentId: 'req' }),
  span('oops', 9500, 9500, { kind: 'error', status: 'error', label: 'Boom', parentId: 'req' }),
])]

const bar = (name: RegExp) => screen.getByRole('button', { name })
const rowsOf = () => screen.getAllByRole('listitem')

/** Gives the component a measured width (jsdom measures nothing). */
function withWidth(width: number) {
  class RO {
    constructor(private cb: ResizeObserverCallback) {}
    observe() {
      this.cb([{ contentRect: { width } } as ResizeObserverEntry], this as unknown as ResizeObserver)
    }
    disconnect() {}
    unobserve() {}
  }
  vi.stubGlobal('ResizeObserver', RO)
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('<TracksView>', () => {
  it('says so when nothing happened, and says that the history is loading', () => {
    const { rerender } = render(<TracksView lanes={[lane([])]} />)
    expect(screen.getByText('Nothing has happened yet.')).toBeTruthy()
    rerender(<TracksView lanes={[lane([])]} loading={{ loaded: 0, total: 0 }} />)
    expect(screen.getByRole('status').textContent).toContain('Loading the history')
  })

  it('draws one row per parallel action: the turn, two rows of calls, the sub-agent, its calls, the wait, the events', () => {
    render(<TracksView lanes={piece()} />)
    const names = rowsOf().map((r) => r.getAttribute('data-track') ?? `group:${r.getAttribute('data-track-group')}`)
    expect(names).toEqual(['group:l', 'l/turns/0', 'l/tools/0', 'l/tools/1', 'l/agents/0', 'l/tools/agent/0', 'l/waits/0', 'l/signals/0'])
    expect(screen.getByText('Tool calls · 1')).toBeTruthy()
    expect(screen.getByText('Tool calls · 2')).toBeTruthy()
    expect(screen.getByText('Calls of Task · dig')).toBeTruthy()
    expect(screen.getByText('Tracks: 7')).toBeTruthy()
    expect(screen.getByText('Spans: 7')).toBeTruthy()
  })

  it('a bar says what it is, how it went and how long it took; a moment has no duration', () => {
    render(<TracksView lanes={piece()} />)
    expect(bar(/Grep · x/).getAttribute('aria-label')).toBe('Tool call — Grep · x — Done — 1.0 s — claude-sonnet-4-5-20250929')
    expect(bar(/Bash · ls/).getAttribute('data-status')).toBe('error')
    expect(bar(/Boom/).getAttribute('aria-label')).toBe('Error — Boom — Failed — claude-sonnet-4-5-20250929')
    // The failed call sits on the sub-agent's own row, not among the main calls.
    expect(within(rowsOf()[5] as HTMLElement).getByRole('button', { name: /Bash · ls/ })).toBeTruthy()
  })

  it('opens the detail of a chosen bar, tells the caller, and closes it with Escape on a phone', () => {
    withWidth(400)
    const onSelect = vi.fn()
    render(<TracksView lanes={piece()} onSelect={onSelect} />)
    fireEvent.click(bar(/Grep · x/))
    expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'grep' }))
    const sheet = screen.getByTestId('trace-sheet')
    expect(within(sheet).getByTestId('trace-detail').textContent).toContain('a.ts')
    expect(bar(/Grep · x/).getAttribute('aria-pressed')).toBe('true')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByTestId('trace-sheet')).toBeNull()
    expect(onSelect).toHaveBeenLastCalledWith(null)
  })

  it('follows `selectedId` from outside and shows the detail beside the tracks when wide', () => {
    withWidth(1300)
    render(<TracksView lanes={piece()} selectedId="read" />)
    expect(screen.getByRole('complementary', { name: 'Span details' }).textContent).toContain('Read · a.ts')
    expect(bar(/Read · a.ts/).getAttribute('aria-pressed')).toBe('true')
  })

  it('walks the bars with the arrows: along a row, then to the closest bar of the row below', () => {
    render(<TracksView lanes={piece()} />)
    const list = screen.getByRole('list', { name: 'Tracks of the conversation' })
    // The first bar is the one that takes the Tab.
    expect(bar(/list the files/).getAttribute('tabindex')).toBe('0')
    expect(bar(/Grep · x/).getAttribute('tabindex')).toBe('-1')
    fireEvent.keyDown(list, { key: 'ArrowDown' })
    expect(bar(/Grep · x/).getAttribute('tabindex')).toBe('0')
    fireEvent.keyDown(list, { key: 'ArrowDown' })
    expect(bar(/Read · a.ts/).getAttribute('tabindex')).toBe('0')
    fireEvent.keyDown(list, { key: 'ArrowDown' })
    expect(bar(/Task · dig/).getAttribute('tabindex')).toBe('0')
    fireEvent.keyDown(list, { key: 'ArrowUp' })
    fireEvent.keyDown(list, { key: 'ArrowUp' })
    fireEvent.keyDown(list, { key: 'ArrowRight' })
    expect(bar(/Grep · x/).getAttribute('tabindex')).toBe('0')
    fireEvent.keyDown(list, { key: 'Enter' })
    expect(screen.getByTestId('trace-detail').textContent).toContain('Grep · x')
  })

  it('zooms with W and shows everything again with 0', () => {
    render(<TracksView lanes={piece()} />)
    const region = screen.getByRole('region', { name: 'Tracks of the conversation' })
    const fit = screen.getByRole('button', { name: 'Show everything' })
    expect(fit.getAttribute('aria-pressed')).toBe('true')
    fireEvent.keyDown(region, { key: 'w' })
    expect(fit.getAttribute('aria-pressed')).toBe('false')
    fireEvent.keyDown(region, { key: '0' })
    expect(fit.getAttribute('aria-pressed')).toBe('true')
  })

  it('marks a row whose call is still running, and grows it live', () => {
    vi.useFakeTimers()
    try {
      render(<TracksView lanes={[lane([span('req', 0, 1000, { kind: 'request', status: 'running', endedAt: undefined }), item('go', { startedAt: Date.now() - 500, endedAt: undefined, status: 'running' })])]} />)
      const row = rowsOf().find((r) => r.getAttribute('data-track') === 'l/tools/0') as HTMLElement
      expect(within(row).getByRole('img', { name: 'Running' })).toBeTruthy()
      const before = bar(/go/).getAttribute('aria-label')
      act(() => {
        vi.advanceTimersByTime(2000)
      })
      expect(bar(/go/).getAttribute('aria-label')).not.toBe(before)
    } finally {
      vi.useRealTimers()
    }
  })

  it('offers to try again when the history failed, around the tracks it could read', () => {
    const onRetry = vi.fn()
    render(<TracksView lanes={piece()} failed onRetry={onRetry} />)
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain('Part of the history')
  })
})
