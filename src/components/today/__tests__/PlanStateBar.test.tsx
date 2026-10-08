import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { WavePointStatus, WaveSummaryDto } from '@/types/attention'
import { PlanStateBar, countPlanStates, planStateLabel } from '../PlanStateBar'

const waves = (statuses: WavePointStatus[][]): WaveSummaryDto[] =>
  statuses.map((pts, i) => ({
    wave_number: i + 1,
    points: pts.map((status, j) => ({ task_id: `t${i}-${j}`, status })),
  }))

const renderBar = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>)

const MIXED = waves([
  ['done', 'done', 'done'],
  ['done', 'running', 'waiting', 'blocked'],
  ['blocked', 'failed', 'pending', 'pending'],
])

describe('countPlanStates', () => {
  it('counts each state across every wave, and the total — nothing estimated', () => {
    expect(countPlanStates(MIXED)).toEqual({ done: 4, running: 1, waiting: 1, blocked: 2, failed: 1, pending: 2, total: 11 })
  })

  it('is all zeros without waves or without points', () => {
    const zero = { done: 0, running: 0, waiting: 0, blocked: 0, failed: 0, pending: 0, total: 0 }
    expect(countPlanStates([])).toEqual(zero)
    expect(countPlanStates(waves([[], []]))).toEqual(zero)
  })
})

describe('planStateLabel', () => {
  it('says done over total, then what needs the reader first: waiting, failed, blocked, running', () => {
    expect(planStateLabel(countPlanStates(MIXED))).toBe('4 of 11 done, 1 is waiting for your answer, 1 failed, 2 blocked, 1 in progress')
  })

  it('agrees in the singular and the plural', () => {
    expect(planStateLabel(countPlanStates(waves([['done', 'waiting', 'waiting', 'failed', 'failed']])))).toBe(
      '1 of 5 done, 2 are waiting for your answer, 2 failed',
    )
  })

  it('names only non-zero states, and never the tasks still to come', () => {
    expect(planStateLabel(countPlanStates(waves([['done', 'done', 'pending']])))).toBe('2 of 3 done')
    expect(planStateLabel(countPlanStates(waves([['pending', 'running']])))).toBe('0 of 2 done, 1 in progress')
  })

  it('says when there is no task', () => {
    expect(planStateLabel(countPlanStates([]))).toBe('No tasks')
  })
})

describe('PlanStateBar', () => {
  it('is ONE progressbar: now = done, max = total, the label as its text', () => {
    renderBar(<PlanStateBar waves={MIXED} />)
    const bars = screen.getAllByRole('progressbar')
    expect(bars).toHaveLength(1)
    const bar = screen.getByRole('progressbar', { name: 'Progress' })
    expect(bar.getAttribute('aria-valuemin')).toBe('0')
    expect(bar.getAttribute('aria-valuenow')).toBe('4')
    expect(bar.getAttribute('aria-valuemax')).toBe('11')
    expect(bar.getAttribute('aria-valuetext')).toBe(planStateLabel(countPlanStates(MIXED)))
    expect(screen.getByTestId('progress-text').textContent).toBe('4/11')
  })

  it('cuts the bar by state, each segment as wide as its share, tasks to come left as the empty track', () => {
    renderBar(<PlanStateBar waves={waves([['done', 'done', 'running', 'blocked'], ['pending', 'pending', 'pending', 'pending']])} />)
    const bar = screen.getByRole('progressbar')
    const segments = [...bar.querySelectorAll<HTMLElement>('[data-segment]')]
    expect(segments.map((s) => [s.dataset.segment, s.style.width])).toEqual([
      ['done', '25%'],
      ['running', '12.5%'],
      ['blocked', '12.5%'],
    ])
    expect(screen.getByTestId('progress-fill')).toBe(segments[0])
    // live data: the widths are set, never animated
    for (const s of segments) expect(s.className).not.toMatch(/transition|animate/)
  })

  it('has no done segment when nothing is done', () => {
    renderBar(<PlanStateBar waves={waves([['running', 'pending']])} />)
    expect(screen.queryByTestId('progress-fill')).toBeNull()
    expect(screen.getByTestId('progress-text').textContent).toBe('0/2')
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('0')
  })

  it('spells out the non-zero states in words, what needs the reader first — colour is never the only cue', () => {
    renderBar(<PlanStateBar waves={MIXED} />)
    const words = [...screen.getByTestId('state-words').querySelectorAll<HTMLElement>('[data-state]')]
    expect(words.map((w) => [w.dataset.state, w.textContent])).toEqual([
      ['waiting', '1 is waiting for your answer'],
      ['failed', '1 failed'],
      ['blocked', '2 blocked'],
      ['running', '1 in progress'],
    ])
  })

  it('never words a zero state, nor "pending" / "done" (done is already the done/total)', () => {
    renderBar(<PlanStateBar waves={waves([['done', 'done', 'pending', 'blocked', 'blocked']])} />)
    const box = screen.getByTestId('state-words')
    expect([...box.querySelectorAll<HTMLElement>('[data-state]')].map((w) => w.dataset.state)).toEqual(['blocked'])
    expect(box.textContent).toBe('2 blocked')
    expect(box.textContent).not.toMatch(/done|to come|in progress|failed|waiting/)
  })

  it('has no words at all when every task is done or still to come', () => {
    renderBar(<PlanStateBar waves={waves([['done', 'pending', 'pending']])} />)
    expect(screen.getByRole('progressbar')).toBeTruthy()
    expect(screen.queryByTestId('state-words')).toBeNull()
  })

  it('renders nothing when the plan has no task', () => {
    const { container, rerender } = renderBar(<PlanStateBar waves={[]} planId="p1" workspace="acme" />)
    expect(container.innerHTML).toBe('')
    rerender(
      <MemoryRouter>
        <PlanStateBar waves={waves([[]])} planId="p1" workspace="acme" />
      </MemoryRouter>,
    )
    expect(container.innerHTML).toBe('')
  })

  it('with a plan and a workspace, the whole bar is a link to the plan graph', () => {
    renderBar(<PlanStateBar waves={MIXED} planId="p1" workspace="acme" />)
    const link = screen.getByRole('link')
    expect(link.getAttribute('href')).toBe('/workspace/acme/plans/p1#graph')
    expect(link.contains(screen.getByRole('progressbar'))).toBe(true)
    expect(link.contains(screen.getByTestId('state-words'))).toBe(true)
  })

  it('without a plan or without a workspace it is a plain block, not a link', () => {
    for (const props of [{}, { planId: 'p1' }, { workspace: 'acme' }, { planId: null, workspace: 'acme' }]) {
      const { unmount } = renderBar(<PlanStateBar waves={MIXED} {...props} />)
      expect(screen.queryByRole('link')).toBeNull()
      expect(screen.getByRole('progressbar').closest('div')).toBeTruthy()
      unmount()
    }
  })
})
