import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { parseAttentionResponse } from '@/services/attention'
import type { AttentionResponse, AttentionThread, WavePointStatus } from '@/types/attention'
import { ThreadRowList } from '../ThreadRow'
import { PlanRunRow, nowWorking, planProgress } from '../PlanRunRow'

const fixture = (name: string): AttentionResponse =>
  parseAttentionResponse(
    JSON.parse(readFileSync(join(__dirname, '../../../services/__fixtures__/attention', `${name}.json`), 'utf8')),
  )

const data = fixture('four_bands')
const thread = data.threads.find((t) => t.band === 'running')!

const withPoints = (statuses: WavePointStatus[][]): AttentionThread => ({
  ...thread,
  waves: statuses.map((pts, i) => ({
    wave_number: i + 1,
    points: pts.map((status, j) => ({ task_id: `t${i}-${j}`, status })),
  })),
})

const renderRow = (ui: React.ReactNode) =>
  render(
    <MemoryRouter>
      <ThreadRowList label="Plans">{ui}</ThreadRowList>
    </MemoryRouter>,
  )

describe('planProgress', () => {
  it('counts done tasks over every wave, nothing estimated', () => {
    expect(planProgress(withPoints([['done', 'done'], ['running', 'pending', 'done']]).waves)).toEqual({ done: 3, total: 5 })
    expect(planProgress([])).toEqual({ done: 0, total: 0 })
  })
})

describe('nowWorking', () => {
  it('a task waiting on the user is "toi"', () => {
    const n = nowWorking(withPoints([['done', 'waiting']]))
    expect(n.who).toBe('you')
    expect(n.text).toBe('Toi : 1 tâche attend ta réponse')
  })
  it('a live session or a running task is an active agent', () => {
    const live = { ...withPoints([['running']]), sessions: [{ ...thread.sessions[0], state: 'live' as const }] }
    expect(nowWorking(live).who).toBe('agent')
    expect(nowWorking({ ...withPoints([['running', 'running']]), sessions: [] }).text).toBe('Agent actif : 2 tâches en cours')
  })
  it('nobody when the run is stopped and nothing runs', () => {
    const stopped = { ...withPoints([['done', 'pending']]), sessions: [], run: { ...thread.run!, status: 'failed' as const } }
    expect(nowWorking(stopped).who).toBe('nobody')
  })
})

describe('PlanRunRow', () => {
  it('shows plan, workspace label, progress done/total, who works, duration, cost and the graph', () => {
    const t = withPoints([['done', 'done'], ['running', 'pending']])
    const { container } = renderRow(<PlanRunRow thread={t} laneName="Acme" />)
    expect(screen.getByRole('link', { name: t.plan!.title }).getAttribute('href')).toBe(
      `/workspace/${t.workspace}/plans/${t.plan!.id}#graph`,
    )
    expect(screen.getByTestId('lane-label').textContent).toBe('Acme')
    expect(screen.getByTestId('progress-text').textContent).toBe('2/4 faites')
    const bar = screen.getByRole('progressbar', { name: 'Avancement' })
    expect(bar.getAttribute('aria-valuenow')).toBe('2')
    expect(bar.getAttribute('aria-valuemax')).toBe('4')
    expect((screen.getByTestId('progress-fill') as HTMLElement).style.width).toBe('50%')
    expect(screen.getByTestId('now-working').textContent).toMatch(/^Agent actif/)
    expect(screen.getByTestId('run-duration').textContent).toBeTruthy()
    expect(screen.getByTestId('run-cost').textContent).toMatch(/^\$\d+\.\d{2}$/)
    expect(container.querySelector('[data-state]')).toBeTruthy()
  })

  it('has no progress bar when the plan has no task', () => {
    renderRow(<PlanRunRow thread={{ ...thread, waves: [] }} />)
    expect(screen.queryByRole('progressbar')).toBeNull()
  })

  it('pulses only while the run runs', () => {
    const { unmount } = renderRow(<PlanRunRow thread={thread} />)
    expect(screen.getByRole('img', { name: 'En cours' }).innerHTML).toContain('animate-ping')
    unmount()
    renderRow(<PlanRunRow thread={{ ...thread, run: { ...thread.run!, status: 'failed' } }} />)
    expect(screen.getByRole('img', { name: 'Arrêté' }).innerHTML).not.toContain('animate-ping')
  })

  it('updates cost and duration IN PLACE: same nodes, new text, no transition', () => {
    const ui = (cost: number, secs: number) => (
      <MemoryRouter>
        <ThreadRowList label="Plans">
          <PlanRunRow thread={{ ...thread, run: { ...thread.run!, cost_usd: cost, duration_secs: secs } }} />
        </ThreadRowList>
      </MemoryRouter>
    )
    const { rerender } = render(ui(1.0, 60))
    const cost = screen.getByTestId('run-cost')
    const dur = screen.getByTestId('run-duration')
    rerender(ui(1.37, 125))
    expect(screen.getByTestId('run-cost')).toBe(cost)
    expect(screen.getByTestId('run-duration')).toBe(dur)
    expect(cost.textContent).toBe('$1.37')
    expect(dur.textContent).toBe('2m')
  })

  it('is a row, not a card', () => {
    renderRow(<PlanRunRow thread={thread} />)
    expect(document.querySelector('li[data-variant]')!.className).not.toMatch(/\b(border|shadow|rounded|bg-)/)
  })

  it('mentions the other threads of the same plan', () => {
    renderRow(<PlanRunRow thread={thread} others={2} />)
    expect(screen.getByText('+ 2 autres fils du même plan')).toBeTruthy()
  })

  it('has NO Discussions button without a slot', () => {
    renderRow(<PlanRunRow thread={thread} />)
    expect(screen.queryByRole('button', { name: 'Discussions' })).toBeNull()
  })

  it('with a slot, the Discussions button unfolds what the slot renders for THIS thread', () => {
    renderRow(<PlanRunRow thread={thread} renderDiscussions={(t) => <p>arbre de {t.id}</p>} />)
    const btn = screen.getByRole('button', { name: 'Discussions' })
    expect(btn.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText(`arbre de ${thread.id}`)).toBeNull()
    fireEvent.click(btn)
    expect(btn.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText(`arbre de ${thread.id}`)).toBeTruthy()
    expect(btn.className).toContain('min-h-9')
  })
})
