import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { parseAttentionResponse } from '@/services/attention'
import type { AttentionResponse } from '@/types/attention'
import { BAND_TEXT } from '../bands'
import { DISCUSSIONS_TEXT } from '../PlanRunRow'
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

describe('TodayView: the discussions slot of "In progress"', () => {
  const data = fixture('four_bands')

  it('shows no "Discussions" button when the slot is not provided', () => {
    view(data)
    expect(screen.queryByRole('button', { name: DISCUSSIONS_TEXT.show })).toBeNull()
  })

  it('shows one per plan row when the slot is provided, and passes the row\'s thread', () => {
    const render_ = vi.fn(() => <p>arbre</p>)
    view(data, { renderDiscussions: render_ })
    const running = screen.getByRole('region', { name: BAND_TEXT.running.title })
    const rows = running.querySelectorAll('li[data-variant="running"]')
    expect(rows.length).toBeGreaterThan(0)
    expect(within(running).getAllByRole('button', { name: DISCUSSIONS_TEXT.show })).toHaveLength(rows.length)
    // nothing is rendered before the user opens it
    expect(render_).not.toHaveBeenCalled()
  })

  it('the other sections never get one', () => {
    view(data, { renderDiscussions: () => <p>arbre</p> })
    expect(within(screen.getByRole('region', { name: BAND_TEXT.stuck.title })).queryByRole('button', { name: DISCUSSIONS_TEXT.show })).toBeNull()
    expect(within(screen.getByRole('region', { name: BAND_TEXT.waiting.title })).queryByRole('button', { name: DISCUSSIONS_TEXT.show })).toBeNull()
  })
})

describe('TodayView: an empty section is one soft line', () => {
  it.each([
    ['waiting', BAND_TEXT.waiting.empty],
    ['stuck', BAND_TEXT.stuck.empty],
    ['thinking', BAND_TEXT.thinking.empty],
    ['running', BAND_TEXT.running.empty],
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
    const title = BAND_TEXT[b].title
    const section = screen.getByRole('region', { name: title })
    expect(within(section).getByText(text)).toBeTruthy()
    expect(section.querySelectorAll('li, a').length).toBe(0)
  })
})

describe('TodayView: the live agents slot', () => {
  const data = fixture('four_bands')

  it('sits in the right column, under the plans that run, and never above the queue', () => {
    view(data, { liveSlot: <section aria-label="Assistants" data-testid="live" /> })
    const side = screen.getByTestId('sections-side')
    const live = screen.getByTestId('live')
    expect(side.contains(live)).toBe(true)
    // after the queue in DOM order (= phone order): "Waiting for you" comes first
    const queue = screen.getByRole('region', { name: BAND_TEXT.waiting.title })
    expect(queue.compareDocumentPosition(live) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // the plans that run (what advances) come first in the column, then who works on them
    const running = screen.getByRole('region', { name: BAND_TEXT.running.title })
    expect(side.firstElementChild).toBe(running)
    expect(running.compareDocumentPosition(live) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('draws nothing extra when no slot is given', () => {
    view(data)
    expect(screen.getByTestId('sections-side').querySelector('[data-testid="live"]')).toBeNull()
  })
})
