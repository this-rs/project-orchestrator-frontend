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

/** Two sessions, so the zones (one per session) can be folded one by one. */
const twoZones = (): TimelineLane[] => [
  lane([span('req', 0, 4000, { kind: 'request', label: 'list the files' }), span('grep', 500, 1500, { label: 'Grep · x', parentId: 'req' })]),
  lane([span('kid', 1000, 3000, { label: 'Read · k' })], { id: 'kid', title: 'Delegated work', relation: 'child', parentLaneId: 'l' }),
]

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
    act(() => bar(/list the files/).focus())
    fireEvent.keyDown(list, { key: 'ArrowDown' })
    expect(bar(/Grep · x/).getAttribute('tabindex')).toBe('0')
    expect(document.activeElement).toBe(bar(/Grep · x/))
    fireEvent.keyDown(list, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(bar(/Read · a.ts/))
    fireEvent.keyDown(list, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(bar(/Task · dig/))
    expect(bar(/Task · dig/).getAttribute('tabindex')).toBe('0')
    fireEvent.keyDown(list, { key: 'ArrowUp' })
    fireEvent.keyDown(list, { key: 'ArrowUp' })
    fireEvent.keyDown(list, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(bar(/Grep · x/))
    fireEvent.keyDown(list, { key: 'Enter' })
    expect(screen.getByTestId('trace-detail').textContent).toContain('Grep · x')
  })

  it('zoomed in, → past the edge of the window pans the time to the next bar and focuses it', () => {
    render(<TracksView lanes={[lane([span('req', 0, 10_000, { kind: 'request' }), span('a', 0, 500, { label: 'First' }), span('b', 9000, 9500, { label: 'Last' })])]} />)
    const list = screen.getByRole('list', { name: 'Tracks of the conversation' })
    act(() => bar(/list the files|req/).focus())
    fireEvent.keyDown(list, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(bar(/First/))
    // Zoom on the middle: neither call is in the window any more.
    for (let i = 0; i < 6; i += 1) fireEvent.keyDown(list, { key: 'w' })
    expect(screen.queryByRole('button', { name: /Last/ })).toBeNull()
    // The focused bar stays rendered (it takes the Tab), wherever it is.
    expect(bar(/First/).getAttribute('tabindex')).toBe('0')
    fireEvent.keyDown(list, { key: 'ArrowRight' })
    const last = bar(/Last/)
    expect(document.activeElement).toBe(last)
    expect(last.getAttribute('tabindex')).toBe('0')
    // The window moved onto it: its bar starts inside the track.
    const left = parseFloat(last.style.left)
    expect(left).toBeGreaterThanOrEqual(0)
    expect(left).toBeLessThan(100)
  })

  it('zoomed away from every bar, Tab can still enter the tracks, and the bar it lands on comes into view', () => {
    render(<TracksView lanes={[lane([span('a', 0, 500, { label: 'First' }), span('m', 4000, 4100, { label: 'Middle' }), span('b', 9000, 9500, { label: 'Last' })])]} />)
    const region = screen.getByRole('region', { name: 'Tracks of the conversation' })
    for (let i = 0; i < 6; i += 1) fireEvent.keyDown(region, { key: 'w' })
    for (let i = 0; i < 12; i += 1) fireEvent.keyDown(region, { key: 'd' })
    expect(screen.queryByRole('button', { name: /Middle/ })).toBeNull()
    // One bar of the tracks always takes the Tab: the first one, even out of the window.
    const list = screen.getByRole('list', { name: 'Tracks of the conversation' })
    const tabStop = list.querySelector('[data-timeline-item][tabindex="0"]') as HTMLElement
    expect(tabStop).toBe(bar(/First/))
    act(() => tabStop.focus())
    expect(document.activeElement).toBe(bar(/First/))
    const left = parseFloat(bar(/First/).style.left)
    expect(left).toBeGreaterThanOrEqual(0)
    expect(left).toBeLessThan(100)
  })

  it('on a phone, the number of a row is drawn apart from its name, never cut off with it', () => {
    withWidth(390)
    render(<TracksView lanes={piece()} />)
    const row = rowsOf().find((r) => r.getAttribute('data-track') === 'l/tools/1') as HTMLElement
    const number = row.querySelector('[data-row-number]') as HTMLElement
    expect(number.textContent).toBe('· 2')
    expect(number.className).toContain('shrink-0')
    expect(number.className).toContain('tabular-nums')
    // The name truncates on its own; the number is not inside it.
    const name = within(row).getByText('Tool calls', { selector: '.truncate' })
    expect(name.contains(number)).toBe(false)
    // Read aloud whole.
    expect(within(row).getByText('Tool calls · 2').className).toContain('sr-only')
  })

  it('a row with a wait not answered yet pulses like a running one', () => {
    render(<TracksView lanes={[lane([span('req', 0, 1000, { kind: 'request' }), item('ask', { kind: 'permission', label: 'Allow rm?', startedAt: T0 + 200, endedAt: undefined, status: 'blocked' })])]} />)
    const row = rowsOf().find((r) => r.getAttribute('data-track') === 'l/waits/0') as HTMLElement
    expect(within(row).getByRole('img', { name: 'Waiting for you' })).toBeTruthy()
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

  it('zooms by a continuous factor with the wheel, and leaves a plain wheel to the rows', () => {
    render(<TracksView lanes={piece()} />)
    const rows = screen.getByRole('list', { name: 'Tracks of the conversation' })
    const windowPct = () => parseFloat(screen.getByTestId('trace-minimap-window').style.width)
    expect(windowPct()).toBeCloseTo(100, 1)
    // A plain wheel is not consumed: nothing to preventDefault for a touch or trackpad scroll.
    expect(fireEvent.wheel(rows, { deltaY: 120 })).toBe(true)
    expect(windowPct()).toBeCloseTo(100, 1)
    // Ctrl/⌘ + wheel zooms by a FACTOR: three notches, three different windows (never two states).
    expect(fireEvent.wheel(rows, { deltaY: -200, ctrlKey: true })).toBe(false)
    const a = windowPct()
    fireEvent.wheel(rows, { deltaY: -100, ctrlKey: true })
    const b = windowPct()
    fireEvent.wheel(rows, { deltaY: -300, ctrlKey: true })
    const c = windowPct()
    expect(a).toBeLessThan(100)
    expect(b).toBeLessThan(a)
    expect(c).toBeLessThan(b)
    // The step follows the wheel's own delta, not a fixed one.
    expect(a / b).toBeCloseTo(Math.exp(100 * 0.002), 2)
    // Pan, same zoom: a sideways wheel, then a drag on the bars.
    const centre = () => Number(screen.getByTestId('trace-minimap').getAttribute('aria-valuenow'))
    const before = centre()
    fireEvent.wheel(rows, { deltaX: 200 })
    expect(centre()).toBeGreaterThan(before)
    const panned = centre()
    // Zoomed in, the bars of this row are out of the window: the row's track is still there to grab.
    const track = screen.getByRole('list', { name: 'Tracks of the conversation' }).querySelector('[data-track]') as HTMLElement
    fireEvent.pointerDown(track, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 300 })
    fireEvent.pointerMove(track, { pointerId: 1, pointerType: 'mouse', clientX: 100 })
    fireEvent.pointerUp(track, { pointerId: 1, pointerType: 'mouse', clientX: 100 })
    expect(centre()).toBeGreaterThan(panned)
  })

  it('tells what a bar is on hover, without a click', () => {
    const onSelect = vi.fn()
    render(<TracksView lanes={piece()} onSelect={onSelect} />)
    expect(screen.queryByTestId('timeline-tooltip')).toBeNull()
    fireEvent.pointerMove(bar(/Grep · x/), { pointerId: 1, pointerType: 'mouse', clientX: 200, clientY: 40 })
    const tip = screen.getByTestId('timeline-tooltip')
    expect(tip.getAttribute('role')).toBe('tooltip')
    expect(within(tip).getByText('Grep · x')).toBeTruthy()
    expect(tip.textContent).toContain('claude-code')
    expect(tip.textContent).toContain('sonnet-4-5')
    expect(tip.textContent).toContain('1.0 s')
    expect(within(tip).getByText('Start')).toBeTruthy()
    expect(within(tip).getByText('End')).toBeTruthy()
    expect(tip.textContent).toMatch(/\d{2}:\d{2}:\d{2}/)
    expect(onSelect).not.toHaveBeenCalled()
    // The bar keeps its own name and its native title: the card is never the only way.
    expect(bar(/Grep · x/).getAttribute('aria-label')).toContain('Grep · x')
    expect(bar(/Grep · x/).getAttribute('title')).toContain('claude-sonnet-4-5')
    // Off the bars (the ruler), the card goes away.
    fireEvent.pointerMove(screen.getByRole('img', { name: /Time since the first event/ }), { pointerId: 1, pointerType: 'mouse', clientX: 10, clientY: 2 })
    expect(screen.queryByTestId('timeline-tooltip')).toBeNull()
  })

  it('keeps the zones folded when asked, and unfolds them one by one', () => {
    render(<TracksView lanes={twoZones()} zones="collapsed" />)
    const names = () => rowsOf().map((r) => r.getAttribute('data-track') ?? `group:${r.getAttribute('data-track-group')}`)
    // Two headers, and nothing of what they hold.
    expect(names()).toEqual(['group:l', 'group:kid'])
    const folds = () => screen.getAllByTestId('track-zone-fold')
    expect(folds().map((f) => f.getAttribute('aria-expanded'))).toEqual(['false', 'false'])
    expect(folds()[0]!.getAttribute('aria-label')).toBe('Expand · Conversation')
    fireEvent.click(folds()[0]!)
    // Only this zone unfolds; the other keeps its rows to itself.
    expect(names()).toEqual(['group:l', 'l/turns/0', 'l/tools/0', 'group:kid'])
    expect(folds()[0]!.getAttribute('aria-label')).toBe('Collapse · Conversation')
    expect(screen.queryByRole('button', { name: /Read · k/ })).toBeNull()
    // A second click folds it back.
    fireEvent.click(folds()[0]!)
    expect(names()).toEqual(['group:l', 'group:kid'])
  })

  it('never leaves a row the reader picked hidden in a folded zone', () => {
    const { rerender } = render(<TracksView lanes={twoZones()} zones="collapsed" />)
    expect(screen.queryByRole('button', { name: /Read · k/ })).toBeNull()
    rerender(<TracksView lanes={twoZones()} zones="collapsed" selectedId="kid" />)
    expect(bar(/Read · k/).getAttribute('aria-pressed')).toBe('true')
  })

  it('leaves the zones open by default, the way the full-page timeline draws them', () => {
    render(<TracksView lanes={twoZones()} />)
    expect(screen.getAllByTestId('track-zone-fold').map((f) => f.getAttribute('aria-expanded'))).toEqual(['true', 'true'])
    expect(bar(/Read · k/)).toBeTruthy()
  })
})
