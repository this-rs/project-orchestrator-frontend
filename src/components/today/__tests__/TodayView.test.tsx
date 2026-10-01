import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { parseAttentionResponse } from '@/services/attention'
import type { AttentionResponse } from '@/types/attention'
import { TodayView, type TodaySource } from '../TodayView'

vi.mock('@/hooks/useToast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }) }))

const fixture = (name: string): AttentionResponse =>
  parseAttentionResponse(
    JSON.parse(readFileSync(join(__dirname, '../../../services/__fixtures__/attention', `${name}.json`), 'utf8')),
  )

const source = (data: AttentionResponse): TodaySource => ({
  status: 'ready',
  data,
  error: null,
  refresh: vi.fn(),
  notices: {},
  drafts: {},
  setDraft: vi.fn(),
  answerPermission: vi.fn(async () => true),
  sendReply: vi.fn(async () => true),
  resumeRun: vi.fn(async () => true),
  sendMessage: vi.fn(async () => {}),
})

const view = (data: AttentionResponse, extra: Partial<React.ComponentProps<typeof TodayView>> = {}) =>
  render(
    <MemoryRouter>
      <TodayView source={source(data)} lane={null} plansSlug="acme" onClearLane={() => {}} {...extra} />
    </MemoryRouter>,
  )

beforeEach(() => {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() }))
  try {
    window.localStorage.clear()
  } catch {
    /* ignore */
  }
})

describe('TodayView: the discussions slot of "En cours"', () => {
  const data = fixture('four_bands')

  it('shows no "Discussions" button when the slot is not provided', () => {
    view(data)
    expect(screen.queryByRole('button', { name: 'Discussions' })).toBeNull()
  })

  it('shows one per plan row when the slot is provided, and passes the row\'s thread', () => {
    const render_ = vi.fn(() => <p>arbre</p>)
    view(data, { renderDiscussions: render_ })
    const running = screen.getByRole('region', { name: 'En cours' })
    const rows = running.querySelectorAll('li[data-variant="running"]')
    expect(rows.length).toBeGreaterThan(0)
    expect(within(running).getAllByRole('button', { name: 'Discussions' })).toHaveLength(rows.length)
    // nothing is rendered before the user opens it
    expect(render_).not.toHaveBeenCalled()
  })

  it('the other sections never get one', () => {
    view(data, { renderDiscussions: () => <p>arbre</p> })
    expect(within(screen.getByRole('region', { name: 'À reprendre' })).queryByRole('button', { name: 'Discussions' })).toBeNull()
    expect(within(screen.getByRole('region', { name: 'À traiter' })).queryByRole('button', { name: 'Discussions' })).toBeNull()
  })
})

describe('TodayView: an empty section is one soft line', () => {
  it.each([
    ['waiting', 'Rien à traiter'],
    ['stuck', 'Rien à reprendre'],
    ['thinking', 'Rien à suivre'],
    ['running', 'Rien en cours'],
  ] as const)('%s says "%s" and stays on the page', (b, text) => {
    const data = fixture('four_bands')
    const emptied: AttentionResponse = {
      ...data,
      waiting: b === 'waiting' ? [] : data.waiting,
      orphans: b === 'stuck' ? [] : data.orphans,
      unattached: [],
      thinking: b === 'thinking' ? [] : data.thinking,
      threads: data.threads.filter((t) => (b === 'running' ? t.band !== 'running' : b === 'stuck' ? t.band !== 'stuck' : true)),
    }
    view(emptied)
    const title = { waiting: 'À traiter', stuck: 'À reprendre', thinking: 'À suivre', running: 'En cours' }[b]
    const section = screen.getByRole('region', { name: title })
    expect(within(section).getByText(text)).toBeTruthy()
    expect(section.querySelectorAll('li, a').length).toBe(0)
  })
})
