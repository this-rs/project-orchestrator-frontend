import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { COMPRESS_THRESHOLD, MiniThreadGraph, miniThreadGraphLabel, STATE_META } from '../MiniThreadGraph'
import { parseAttentionResponse } from '@/services/attention'
import { WAVE_POINT_STATUSES, type WavePointStatus, type WaveSummaryDto } from '@/types/attention'

const wave = (n: number, statuses: WavePointStatus[]): WaveSummaryDto => ({
  wave_number: n,
  points: statuses.map((status, i) => ({ task_id: `t${n}-${i}`, status })),
})

function Where() {
  const l = useLocation()
  return <div data-testid="where">{l.pathname + l.hash}</div>
}
const renderIn = (ui: React.ReactNode) =>
  render(
    <MemoryRouter initialEntries={['/today']}>
      <Routes>
        <Route path="/today" element={ui} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  )

describe('MiniThreadGraph', () => {
  it.each(WAVE_POINT_STATUSES)('renders the %s state with its own shape and tone', (status) => {
    const { container } = renderIn(<MiniThreadGraph waves={[wave(1, [status])]} />)
    const glyph = container.querySelector(`[data-state="${status}"]`)!
    expect(glyph).toBeTruthy()
    expect(glyph.className).toContain(
      { done: 'emerald', running: 'indigo', waiting: 'sky', pending: 'gray', blocked: 'amber', failed: 'red' }[status],
    )
  })

  it('every state has a distinct shape (not colour alone)', () => {
    const shapes = WAVE_POINT_STATUSES.map((s) => {
      const { container, unmount } = renderIn(<MiniThreadGraph waves={[wave(1, [s])]} />)
      const html = container.querySelector('svg')!.innerHTML
      unmount()
      return html
    })
    expect(new Set(shapes).size).toBe(WAVE_POINT_STATUSES.length)
    expect(Object.keys(STATE_META).sort()).toEqual([...WAVE_POINT_STATUSES].sort())
  })

  it('writes the full text label', () => {
    const waves = [wave(1, ['done', 'done']), wave(2, ['done', 'running', 'pending', 'pending', 'blocked']), wave(3, [])]
    expect(miniThreadGraphLabel(waves)).toBe(
      'Plan graph, 3 waves: wave 1 of 3: 2 done; wave 2 of 3: 1 done, 1 running, 2 up next, 1 blocked; wave 3 of 3: empty',
    )
    renderIn(<MiniThreadGraph waves={waves} />)
    expect(screen.getByRole('img', { name: miniThreadGraphLabel(waves) })).toBeTruthy()
  })

  it('only the running mark pulses, and the pulse is gone once it is no longer running', () => {
    const all = WAVE_POINT_STATUSES.map((s) => s)
    const { container, rerender } = renderIn(<MiniThreadGraph waves={[wave(1, all)]} />)
    expect(screen.getAllByTestId('pulse')).toHaveLength(1)
    expect(container.querySelector('[data-state="running"] [data-testid="pulse"]')).toBeTruthy()
    expect(container.querySelectorAll('[class*="animate-"]')).toHaveLength(0)
    rerender(
      <MemoryRouter>
        <MiniThreadGraph waves={[wave(1, all.map((s) => (s === 'running' ? 'done' : s)))]} />
      </MemoryRouter>,
    )
    expect(screen.queryAllByTestId('pulse')).toHaveLength(0)
  })

  it('the pulse class is the one disabled under prefers-reduced-motion', () => {
    const css = readFileSync(join(__dirname, '../../../index.css'), 'utf8')
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.pulse-ring \{ animation: none/)
  })

  it('keeps every task as a mark up to the threshold', () => {
    const n = COMPRESS_THRESHOLD
    const { container } = renderIn(<MiniThreadGraph waves={[wave(1, Array(n).fill('done'))]} />)
    expect(container.querySelectorAll('[data-state]')).toHaveLength(n)
    expect(container.querySelector('[data-compressed]')).toBeNull()
  })

  it('compresses to one mark and a count per state beyond the threshold', () => {
    const w1 = wave(1, Array(20).fill('done'))
    const w2 = wave(2, [...Array(4).fill('pending'), 'running', 'blocked'] as WavePointStatus[])
    const { container } = renderIn(<MiniThreadGraph waves={[w1, w2]} />)
    expect(container.querySelector('[data-compressed]')).toBeTruthy()
    expect(container.querySelectorAll('[data-state]')).toHaveLength(4) // done | pending, running, blocked
    expect(screen.getByText('20')).toBeTruthy()
    expect(screen.getByText('4')).toBeTruthy()
    // the label still describes everything
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe(miniThreadGraphLabel([w1, w2]))
  })

  it('wraps instead of overflowing: no fixed width, wrapping flex, on all 40 fixture threads', () => {
    const raw = JSON.parse(readFileSync(join(__dirname, '../../../services/__fixtures__/attention/forty_threads.json'), 'utf8'))
    const { threads } = parseAttentionResponse(raw)
    expect(threads).toHaveLength(40)
    const { container } = renderIn(
      <div style={{ width: 360 }}>
        {threads.map((t) => (
          <MiniThreadGraph key={t.id} waves={t.waves} planId={t.plan?.id} workspace={t.workspace} />
        ))}
      </div>,
    )
    for (const ul of container.querySelectorAll('ul')) {
      expect(ul.className).toContain('flex-wrap')
      expect(ul.className).toContain('min-w-0')
    }
    for (const box of container.querySelectorAll('a, [role="img"]')) {
      expect(box.className).toContain('max-w-full')
      expect(box.className).toContain('overflow-hidden')
    }
    for (const el of container.querySelectorAll('a *')) expect(el.getAttribute('style') ?? '').not.toMatch(/width/)
    expect(container.querySelector('a')!.innerHTML).not.toMatch(/(?:min-)?w-\[\d+px\]/)
  })

  it('has an empty state without waves', () => {
    renderIn(<MiniThreadGraph waves={[]} planId="p" workspace="ws" />)
    expect(screen.getByText('No plan graph')).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('links to the existing plan graph; Enter / tap follow it', () => {
    renderIn(<MiniThreadGraph waves={[wave(1, ['done'])]} planId="p1" workspace="ws" />)
    const link = screen.getByRole('link', { name: /Plan graph, 1 wave/ })
    expect(link.getAttribute('href')).toBe('/workspace/ws/plans/p1#graph')
    fireEvent.click(link)
    expect(screen.getByTestId('where').textContent).toBe('/workspace/ws/plans/p1#graph')
  })
})
