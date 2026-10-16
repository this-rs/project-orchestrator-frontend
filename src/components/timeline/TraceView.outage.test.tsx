/**
 * An interruption drawn as a ZONE of the trace: a vertical band over the whole
 * chart, and its own row whose hover card names the provider, the cause and the
 * bounds — the interval, not a hole.
 *
 * Run with: npx vitest run src/components/timeline/TraceView.outage.test.tsx
 */
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { TraceView } from './TraceView'
import type { TimelineItem, TimelineLane } from './model'

const T0 = 1_700_000_000_000
const item = (id: string, over: Partial<TimelineItem> = {}): TimelineItem => ({
  id, kind: 'tool', status: 'done', label: id, startedAt: T0, endedAt: T0 + 2000, durationMs: 2000, laneId: 'l', ...over,
})

const lanes = (): TimelineLane[] => [{
  id: 'l',
  title: 'Conversation',
  items: [
    item('req', { kind: 'request', label: 'list the files', startedAt: T0, endedAt: T0 + 40_000, durationMs: 40_000 }),
    item('grep', { label: 'Grep · x', parentId: 'req', startedAt: T0 + 1000, endedAt: T0 + 1500, durationMs: 500 }),
    item('outage:deepseek-prod@t', {
      kind: 'outage',
      status: 'error',
      label: 'deepseek-prod is out of service — automatic retry.',
      provider: 'deepseek-prod',
      cause: 'connection refused',
      startedAt: T0 + 2000,
      endedAt: T0 + 6200,
      durationMs: 4200,
      input: 'deepseek-prod is out of service — automatic retry.',
    }),
    item('bash', { label: 'Bash · ls', parentId: 'req', startedAt: T0 + 7000, endedAt: T0 + 7500, durationMs: 500 }),
  ],
}]

describe('<TraceView> — a provider interruption', () => {
  it('draws the down → up interval as a band over the whole trace', () => {
    render(<TraceView lanes={lanes()} />)
    const band = screen.getByTestId('trace-outage-band')
    expect(band.getAttribute('data-provider')).toBe('deepseek-prod')
    // Placed where the interval really was: after the first call, before the next one.
    const left = Number.parseFloat((band as HTMLElement).style.left)
    expect(left).toBeGreaterThan(0)
    expect(Number.parseFloat((band as HTMLElement).style.width)).toBeGreaterThan(0)
  })

  it('gives the interruption its own row, and its hover card the provider, the cause and the bounds', () => {
    render(<TraceView lanes={lanes()} />)
    const row = screen.getByRole('treeitem', { name: /deepseek-prod is out of service/ })
    expect(row.getAttribute('data-status')).toBe('error')
    expect(row.getAttribute('aria-label')).toContain('Provider outage')

    fireEvent.pointerMove(row.querySelector('[data-track]')!, { pointerId: 1, pointerType: 'mouse', clientX: 300, clientY: 120 })
    const tip = screen.getByTestId('timeline-tooltip')
    expect(tip.textContent).toContain('deepseek-prod')
    expect(within(tip).getByText('Cause')).toBeTruthy()
    expect(tip.textContent).toContain('connection refused')
    expect(tip.textContent).toContain('4.2 s')
    expect(within(tip).getByText('Start')).toBeTruthy()
    expect(within(tip).getByText('End')).toBeTruthy()
  })

  it('keeps an interruption still open as a running zone that reaches now', () => {
    const open: TimelineLane[] = [{
      id: 'l',
      title: 'Conversation',
      items: [
        item('req', { kind: 'request', label: 'go', startedAt: T0, endedAt: T0 + 40_000, durationMs: 40_000 }),
        item('outage:deepseek-prod@t', { kind: 'outage', status: 'running', label: 'deepseek-prod is out of service', provider: 'deepseek-prod', startedAt: T0 + 2000 }),
      ],
    }]
    render(<TraceView lanes={open} now={T0 + 30_000} />)
    const row = screen.getByRole('treeitem', { name: /deepseek-prod is out of service/ })
    expect(row.getAttribute('data-status')).toBe('running')
    expect(screen.getByTestId('trace-outage-band')).toBeTruthy()
  })
})
