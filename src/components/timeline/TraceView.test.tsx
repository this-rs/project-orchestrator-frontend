import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { TraceView } from './TraceView'
import { buildTimeline, type TimelineItem, type TimelineLane } from './model'
import type { ChatMessage } from '@/types'

const T0 = 1_700_000_000_000
const item = (id: string, over: Partial<TimelineItem> = {}): TimelineItem => ({
  id, kind: 'tool', status: 'done', label: id, startedAt: T0, endedAt: T0 + 2000, durationMs: 2000, laneId: 'l', model: 'claude-sonnet-4-5-20250929', provider: 'claude-code', ...over,
})
const lane = (items: TimelineItem[], over: Partial<TimelineLane> = {}): TimelineLane => ({ id: 'l', title: 'Conversation', items, ...over })

const turn = () => [lane([
  item('req', { kind: 'request', label: 'list the files', startedAt: T0, endedAt: T0 + 6000, durationMs: 6000 }),
  item('agent', { kind: 'agent', label: 'Task · dig', parentId: 'req', startedAt: T0 + 1000, endedAt: T0 + 5000, durationMs: 4000, anchorId: 'agent' }),
  item('grep', { label: 'Grep · x', parentId: 'agent', startedAt: T0 + 1500, endedAt: T0 + 2500, durationMs: 1000, anchorId: 'grep', input: { pattern: 'x' }, output: 'a.ts' }),
  item('bash', { label: 'Bash · ls', parentId: 'req', status: 'error', startedAt: T0 + 5500, endedAt: T0 + 5800, durationMs: 300 }),
])]

const rowsOf = () => screen.getAllByRole('treeitem')
const row = (name: RegExp) => screen.getByRole('treeitem', { name })

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

describe('<TraceView>', () => {
  it('says so when nothing happened, and says that the history is loading', () => {
    const { rerender } = render(<TraceView lanes={[lane([])]} />)
    expect(screen.getByText('Nothing has happened yet.')).toBeTruthy()
    rerender(<TraceView lanes={[lane([])]} loading={{ loaded: 0, total: 0 }} />)
    expect(screen.getByRole('status').textContent).toContain('Loading the history')
  })

  it('draws the span tree: lane → turn → sub-agent → its call, each with kind, status and duration', () => {
    render(<TraceView lanes={turn()} />)
    expect(rowsOf().map((r) => r.getAttribute('aria-level'))).toEqual(['1', '2', '3', '4', '3'])
    expect(row(/Grep · x/).getAttribute('aria-label')).toBe('Tool call — Grep · x — Done — 1.0 s — claude-sonnet-4-5-20250929')
    expect(row(/Bash · ls/).getAttribute('data-status')).toBe('error')
    // The sub-agent says how much of its time is its own.
    expect(row(/Task · dig/).getAttribute('aria-label')).toContain('Self time: 3.0 s')
    expect(screen.getByText('Spans: 4')).toBeTruthy()
  })

  it('says when the engine timing of a call is incomplete or the call never ran', () => {
    render(<TraceView lanes={[lane([
      item('req', { kind: 'request', label: 'clean', startedAt: T0, endedAt: T0 + 6000, durationMs: 6000 }),
      item('part', { label: 'Bash · make', parentId: 'req', timingIncomplete: true, run: 'ran' }),
      item('no', { label: 'Bash · rm', parentId: 'req', status: 'error', run: 'denied', startedAt: T0 + 3000, endedAt: T0 + 4000, durationMs: 1000 }),
    ])]} />)
    expect(row(/Bash · make/).getAttribute('title')).toContain('Timing incomplete: a wait may be missing')
    expect(within(row(/Bash · make/)).getByTestId('timing-incomplete')).toBeTruthy()
    expect(row(/Bash · rm/).getAttribute('aria-label')).toContain('Did not run: the permission was denied')
    expect(within(row(/Bash · rm/)).queryByTestId('timing-incomplete')).toBeNull()
  })

  it('adds no "did not see it start" note to a call of an engine without hook, nor to a question, in its label or title', () => {
    const t = T0 / 1000
    const call = (id: string, name: string, timing: Record<string, unknown>) => ({
      id: `u-${id}`, type: 'tool_use' as const, content: name,
      metadata: { tool_call_id: id, tool_name: name, tool_input: { command: id }, created_at: new Date(T0 + 1000).toISOString(), tool_timing: timing },
    })
    const result = (id: string) => ({ id: `r-${id}`, type: 'tool_result' as const, content: 'ok', metadata: { tool_call_id: id } })
    const messages: ChatMessage[] = [
      { id: 'm1', role: 'user', timestamp: new Date(T0), blocks: [{ id: 'b', type: 'text', content: 'go' }] },
      { id: 'm2', role: 'assistant', timestamp: new Date(T0 + 1000), blocks: [
        call('nohook', 'Bash', { called_at: t + 1, ended_at: t + 3 }), result('nohook'),
        call('ask', 'AskUserQuestion', { called_at: t + 1, started_at: t + 1.1, permission_requested_at: t + 1.2, ended_at: t + 3 }), result('ask'),
      ] },
    ]
    render(<TraceView lanes={buildTimeline({ messages, sessionId: 'l' }).lanes} />)
    for (const name of [/Bash · nohook/, /AskUserQuestion/]) {
      expect(row(name).getAttribute('aria-label')).not.toContain('did not see it start')
      expect(row(name).getAttribute('title')).not.toContain('did not see it start')
    }
  })

  it('says how far the history has loaded, and offers to retry a failure', () => {
    const retry = vi.fn()
    const { rerender } = render(<TraceView lanes={turn()} loading={{ loaded: 500, total: 1234 }} />)
    expect(screen.getByTestId('trace-loading').textContent).toContain('Loading earlier turns… 500 of 1234 events')
    rerender(<TraceView lanes={turn()} failed onRetry={retry} />)
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(retry).toHaveBeenCalled()
  })

  it('opens the detail of a span: times, self time, model, input, output, and a way back to the conversation', () => {
    const onSelect = vi.fn()
    const onOpen = vi.fn()
    render(<TraceView lanes={turn()} onSelect={onSelect} onOpen={onOpen} />)
    fireEvent.click(row(/Task · dig/))
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent' }))
    const detail = screen.getByTestId('trace-detail')
    expect(within(detail).getByText('Total time').nextSibling?.textContent).toBe('4.0 s')
    expect(within(detail).getByText('Self time').nextSibling?.textContent).toBe('3.0 s')
    expect(within(detail).getByText('Model').nextSibling?.textContent).toBe('sonnet-4-5')
    expect(within(detail).getByText('Start').nextSibling?.textContent).toContain('(+1.0 s)')
    fireEvent.click(within(detail).getByRole('button', { name: 'Show in the conversation' }))
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent' }))

    fireEvent.click(row(/Grep · x/))
    const grep = screen.getByTestId('trace-detail')
    expect(within(grep).getByText(/"pattern": "x"/)).toBeTruthy()
    expect(within(grep).getByText('a.ts')).toBeTruthy()

    fireEvent.click(within(grep).getByRole('button', { name: 'Close' }))
    expect(screen.queryByTestId('trace-detail')).toBeNull()
    expect(onSelect).toHaveBeenLastCalledWith(null)
  })

  it('selects from outside (a link) and unfolds the way to it', () => {
    const { rerender } = render(<TraceView lanes={turn()} selectedId={null} />)
    fireEvent.keyDown(screen.getByRole('tree'), { key: 'ArrowLeft' }) // fold the lane
    expect(rowsOf()).toHaveLength(1)
    rerender(<TraceView lanes={turn()} selectedId="grep" />)
    expect(row(/Grep · x/).getAttribute('aria-selected')).toBe('true')
  })

  it('walks and folds the tree with the keyboard', () => {
    render(<TraceView lanes={turn()} />)
    const tree = screen.getByRole('tree')
    fireEvent.focus(tree)
    fireEvent.keyDown(tree, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(row(/list the files/))
    fireEvent.keyDown(tree, { key: 'ArrowRight' }) // already open: into its first child
    expect(document.activeElement).toBe(row(/Task · dig/))
    fireEvent.keyDown(tree, { key: 'ArrowLeft' }) // fold the sub-agent
    expect(screen.queryByRole('treeitem', { name: /Grep/ })).toBeNull()
    expect(row(/Task · dig/).getAttribute('aria-expanded')).toBe('false')
    fireEvent.keyDown(tree, { key: 'ArrowRight' })
    expect(row(/Grep · x/)).toBeTruthy()
    fireEvent.keyDown(tree, { key: 'End' })
    expect(document.activeElement).toBe(row(/Bash · ls/))
    fireEvent.keyDown(tree, { key: 'Enter' })
    expect(screen.getByTestId('trace-detail')).toBeTruthy()
  })

  it('zooms with W/S and the buttons, pans with A/D, and 0 shows everything again', () => {
    render(<TraceView lanes={turn()} />)
    const fit = screen.getByRole('button', { name: 'Show everything' })
    const minimap = screen.getByTestId('trace-minimap')
    expect(fit.getAttribute('aria-pressed')).toBe('true')
    fireEvent.keyDown(screen.getByRole('tree'), { key: 'w' })
    expect(fit.getAttribute('aria-pressed')).toBe('false')
    const centre = minimap.getAttribute('aria-valuenow')
    fireEvent.keyDown(screen.getByRole('tree'), { key: 'd' })
    expect(Number(minimap.getAttribute('aria-valuenow'))).toBeGreaterThan(Number(centre))
    fireEvent.keyDown(screen.getByRole('tree'), { key: 'a' })
    fireEvent.keyDown(screen.getByRole('tree'), { key: 'a' })
    expect(Number(minimap.getAttribute('aria-valuenow'))).toBeLessThan(Number(centre))
    fireEvent.keyDown(screen.getByRole('tree'), { key: '0' })
    expect(fit.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(fit.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }))
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }))
    expect(fit.getAttribute('aria-pressed')).toBe('true')
  })

  it('zooms on a span with a double-click, and with Ctrl + wheel', () => {
    render(<TraceView lanes={turn()} />)
    const fit = screen.getByRole('button', { name: 'Show everything' })
    fireEvent.doubleClick(row(/Grep · x/).querySelector('[data-track]')!)
    expect(fit.getAttribute('aria-pressed')).toBe('false')
    // The window is now around Grep (1.5 s → 2.5 s of a 6 s trace): its centre sits at about a third.
    expect(Number(screen.getByTestId('trace-minimap').getAttribute('aria-valuenow'))).toBe(33)
    fireEvent.click(fit)
    fireEvent.wheel(screen.getByRole('tree'), { deltaY: -400, ctrlKey: true })
    expect(fit.getAttribute('aria-pressed')).toBe('false')
  })

  it('moves the window from the minimap with the keyboard', () => {
    render(<TraceView lanes={turn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    const minimap = screen.getByTestId('trace-minimap')
    fireEvent.keyDown(minimap, { key: 'Home' })
    const left = Number(minimap.getAttribute('aria-valuenow'))
    fireEvent.keyDown(minimap, { key: 'ArrowRight' })
    expect(Number(minimap.getAttribute('aria-valuenow'))).toBeGreaterThan(left)
    fireEvent.keyDown(minimap, { key: 'End' })
    expect(Number(minimap.getAttribute('aria-valuenow'))).toBeGreaterThan(50)
  })

  it('draws a long silence as a cut that says how long it lasted', () => {
    const hour = 3_600_000
    render(<TraceView lanes={[lane([item('a'), item('b', { startedAt: T0 + hour, endedAt: T0 + hour + 2000 })])]} />)
    expect(screen.getAllByText('59 m 58 s idle').length).toBeGreaterThan(0)
  })

  it('renders only the rows in view out of 2 000 spans', () => {
    const many = Array.from({ length: 2000 }, (_, i) => item(`call ${i}`, { startedAt: T0 + i * 100, endedAt: T0 + i * 100 + 50 }))
    render(<TraceView lanes={[lane(many)]} maxRowsHeight={280} />)
    expect(screen.getByText('Spans: 2000')).toBeTruthy()
    expect(rowsOf().length).toBeLessThan(40)
    const tree = screen.getByRole('tree')
    act(() => {
      tree.scrollTop = 1500 * 28
      fireEvent.scroll(tree)
    })
    expect(screen.getByRole('treeitem', { name: /call 1500 —/ })).toBeTruthy()
  })

  it('follows a running span live and stops following when the reader pans', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(T0 + 3000)
      render(<TraceView lanes={[lane([item('a'), item('live', { status: 'running', endedAt: undefined, durationMs: undefined })])]} />)
      const follow = screen.getByRole('button', { name: 'Follow live' })
      expect(follow.getAttribute('aria-pressed')).toBe('true')
      expect(row(/live/).getAttribute('aria-label')).toContain('3.0 s')
      act(() => {
        vi.advanceTimersByTime(2000)
      })
      expect(row(/live/).getAttribute('aria-label')).toContain('5.0 s')
      fireEvent.keyDown(screen.getByRole('tree'), { key: 'w' })
      expect(follow.getAttribute('aria-pressed')).toBe('true')
      fireEvent.keyDown(screen.getByRole('tree'), { key: 'a' })
      expect(follow.getAttribute('aria-pressed')).toBe('false')
    } finally {
      vi.useRealTimers()
    }
  })

  it('pans with a drag on the bars, and a drag is not a click', () => {
    const onSelect = vi.fn()
    render(<TraceView lanes={turn()} onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    const minimap = screen.getByTestId('trace-minimap')
    const before = Number(minimap.getAttribute('aria-valuenow'))
    const track = row(/Grep · x/).querySelector('[data-track]')!
    fireEvent.pointerDown(track, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 300 })
    fireEvent.pointerMove(track, { pointerId: 1, pointerType: 'mouse', clientX: 200 })
    fireEvent.pointerUp(track, { pointerId: 1, pointerType: 'mouse', clientX: 200 })
    fireEvent.click(track)
    expect(Number(minimap.getAttribute('aria-valuenow'))).toBeGreaterThan(before)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('pinches with two fingers', () => {
    render(<TraceView lanes={turn()} />)
    const fit = screen.getByRole('button', { name: 'Show everything' })
    const track = row(/Grep · x/).querySelector('[data-track]')!
    fireEvent.pointerDown(track, { pointerId: 1, pointerType: 'touch', clientX: 100 })
    fireEvent.pointerDown(track, { pointerId: 2, pointerType: 'touch', clientX: 200 })
    fireEvent.pointerMove(track, { pointerId: 2, pointerType: 'touch', clientX: 400 })
    fireEvent.pointerUp(track, { pointerId: 2, pointerType: 'touch' })
    fireEvent.pointerUp(track, { pointerId: 1, pointerType: 'touch' })
    expect(fit.getAttribute('aria-pressed')).toBe('false')
  })

  it('on a phone: one column, big targets, and the detail in a bottom sheet that Escape closes', () => {
    withWidth(375)
    render(<TraceView lanes={turn()} />)
    expect(screen.getByText(/Pinch to zoom/)).toBeTruthy()
    expect(row(/Grep · x/).style.height).toBe('52px')
    expect(screen.getByRole('button', { name: 'Zoom in' }).className).toContain('size-11')
    fireEvent.click(row(/Grep · x/))
    const sheet = screen.getByTestId('trace-sheet')
    expect(sheet.getAttribute('role')).toBe('dialog')
    expect(within(sheet).getByTestId('trace-detail')).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByTestId('trace-sheet')).toBeNull()
  })

  it('on a wide page: the detail sits beside the trace', () => {
    withWidth(1400)
    render(<TraceView lanes={turn()} detail="side" />)
    fireEvent.click(row(/Grep · x/))
    expect(screen.getByRole('complementary', { name: 'Span details' })).toBeTruthy()
  })

  it('shows the absolute time under the mouse', () => {
    render(<TraceView lanes={turn()} />)
    const track = row(/Grep · x/).querySelector('[data-track]')!
    fireEvent.pointerMove(track, { pointerId: 1, pointerType: 'mouse', clientX: 0 })
    expect(screen.getByTestId('trace-hover-time').textContent).toMatch(/\d{2}:\d{2}:\d{2}/)
  })
})
