/**
 * Opening the timeline: what the transcript already holds is the first display, and it
 * stays — the history takes over in place, without a blank in between, and the rows the
 * reader sees remain the same DOM nodes. Real `useConversationTrace`, a REST layer that
 * answers when the test says so.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useLayoutEffect } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

type Ev = Record<string, unknown>
const api = vi.hoisted(() => ({ pending: [] as Array<() => void>, histories: new Map<string, Ev[]>() }))
vi.mock('@/hooks/useTimelineContext', () => ({ useTimelineContext: () => ({ title: 'Chat', session: undefined, decisions: [], work: undefined }) }))
vi.mock('@/services/chat', () => ({
  chatApi: {
    getSession: vi.fn(async (id: string) => ({ id, title: 'Chat', provider_id: 'native', model: 'm', created_at: '2026-10-10T12:00:00Z' })),
    getSessionTree: vi.fn(async () => []),
    getMessages: vi.fn((id: string, { offset = 0, limit = 50 }: { offset?: number; limit?: number }) => new Promise((resolve) => {
      const all = api.histories.get(id) ?? []
      api.pending.push(() => resolve({ messages: all.slice(offset, offset + limit), total_count: all.length }))
    })),
  },
}))

import { historyEventsToMessages } from '@/utils/chatAssembly'
import { ChatTimelineStrip } from './ChatTimelineStrip'

const T = 1_791_000_000
function history(prefix: string, n: number): Ev[] {
  const out: Ev[] = []
  for (let i = 0; i < n; i += 1) {
    out.push({ type: 'user_message', id: `${prefix}u${i}`, content: `${prefix} turn ${i}`, created_at: T + i * 10 })
    out.push({ type: 'tool_use', id: `${prefix}t${i}`, tool: 'Bash', input: { command: 'ls' }, created_at: T + i * 10 + 1 })
    out.push({ type: 'tool_result', id: `${prefix}t${i}`, result: 'ok', created_at: T + i * 10 + 2 })
    out.push({ type: 'result', duration_ms: 2000, created_at: T + i * 10 + 3 })
  }
  return out.map((e, seq) => ({ ...e, seq }))
}
/** The transcript holds a window: the last turns only. */
const transcriptOf = (events: Ev[], lastTurns: number) => historyEventsToMessages(events.slice(events.length - lastTurns * 4) as never)

const settle = () => act(async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve()
})
const answer = () => act(async () => {
  api.pending.shift()?.()
  await new Promise((r) => setTimeout(r, 0))
})
const turnRow = (text: string) => screen.queryAllByRole('treeitem').find((r) => (r.getAttribute('aria-label') ?? '').includes(text)) ?? null

afterEach(() => {
  api.pending.length = 0
  api.histories.clear()
})

describe('<ChatTimelineStrip> first display', () => {
  it('keeps what the transcript shows until the history lands, then merges it in place (same nodes, no blank)', async () => {
    const events = history('a', 5)
    api.histories.set('s', events)
    render(<MemoryRouter><ChatTimelineStrip sessionId="s" messages={transcriptOf(events, 2)} isStreaming={false} workspaceSlug="ws" /></MemoryRouter>)

    const shown = turnRow('a turn 4')
    expect(shown).not.toBeNull()
    expect(screen.queryByTestId('trace-skeleton')).toBeNull()

    // The session and its tree are known, the first page is not here yet: the transcript stays.
    await settle()
    expect(screen.getAllByRole('treeitem').length).toBeGreaterThan(0)
    expect(turnRow('a turn 4')).toBe(shown)

    // The page lands: the earlier turns join, the row on screen is the same node.
    await answer()
    expect(turnRow('a turn 0')).not.toBeNull()
    expect(turnRow('a turn 4')).toBe(shown)
  })

  it('a turn sent from this tab (client id) keeps its row and its selection when the history (server id) lands', async () => {
    const events = history('a', 3)
    api.histories.set('s', events)
    // The transcript: the last turn was sent live from this tab, its echo carries no server id.
    const transcript = transcriptOf(events, 2).map((m) => (m.role === 'user' && m.blocks[0]?.content === 'a turn 2' ? { ...m, id: 'm-7-client' } : m))
    render(<MemoryRouter><ChatTimelineStrip sessionId="s" messages={transcript} isStreaming={false} workspaceSlug="ws" /></MemoryRouter>)
    const sent = turnRow('a turn 2') as HTMLElement
    fireEvent.click(sent)
    expect(sent.getAttribute('aria-selected')).toBe('true')

    await settle()
    await answer()
    expect(turnRow('a turn 0')).not.toBeNull()
    expect(turnRow('a turn 2')).toBe(sent)
    expect(sent.getAttribute('aria-selected')).toBe('true')
  })

  it('another conversation never shows the previous one\'s trace, not even for one render', async () => {
    const first = history('a', 3)
    const second = history('b', 2)
    api.histories.set('s1', first)
    api.histories.set('s2', second)
    // Every commit, before any effect could correct it: what is on screen.
    const commits: boolean[] = []
    function Probe() {
      useLayoutEffect(() => { commits.push(turnRow('a turn') != null) })
      return null
    }
    const view = (sid: string, events: Ev[]) => (
      <MemoryRouter>
        <ChatTimelineStrip sessionId={sid} messages={transcriptOf(events, 1)} isStreaming={false} workspaceSlug="ws" />
        <Probe />
      </MemoryRouter>
    )
    const { rerender } = render(view('s1', first))
    await settle()
    await answer()
    expect(turnRow('a turn 0')).not.toBeNull()

    commits.length = 0
    rerender(view('s2', second))
    expect(commits.length).toBeGreaterThan(0)
    expect(commits.every((stale) => !stale)).toBe(true)
    expect(turnRow('a turn')).toBeNull()
    expect(turnRow('b turn 1')).not.toBeNull()
  })
})
