import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ChatMessage } from '@/types'

const navigate = vi.fn()
vi.mock('react-router-dom', async (orig) => ({ ...(await orig<typeof import('react-router-dom')>()), useNavigate: () => navigate }))
vi.mock('@/hooks/useTimelineContext', () => ({
  useTimelineContext: () => ({ title: 'Chat', session: { provider: 'native', model: 'deepseek-chat' }, decisions: [], work: { plans: [{ id: 'p1', title: 'Ship', status: 'in_progress' }], tasks: [] } }),
}))
const trace = vi.hoisted(() => ({ value: { sessions: [] as unknown[], loading: null as null | { loaded: number; total: number }, failed: false, retry: () => {}, streaming: false } }))
vi.mock('@/hooks/useConversationTrace', () => ({ useConversationTrace: () => trace.value }))

import { ChatTimelineStrip } from './ChatTimelineStrip'

const msgs: ChatMessage[] = [
  { id: 'm1', role: 'user', timestamp: new Date(1000), blocks: [{ id: 'b', type: 'text', content: 'go' }] },
  { id: 'm2', role: 'assistant', timestamp: new Date(1001), duration_ms: 1, blocks: [
    { id: 'u', type: 'tool_use', content: 'Bash', metadata: { tool_call_id: 'c1', tool_name: 'Bash', tool_input: { command: 'ls' } } },
    { id: 'r', type: 'tool_result', content: 'ok', metadata: { tool_call_id: 'c1' } },
  ] },
]
const strip = () => render(
  <MemoryRouter><ChatTimelineStrip sessionId="s" messages={msgs} isStreaming={false} workspaceSlug="ws" /></MemoryRouter>,
)
type View = 'tracks' | 'tree'
/** The chat's zones (one per session) start folded: unfolding is the reader's first click. */
const unfoldZones = () => {
  for (const fold of screen.getAllByTestId('track-zone-fold')) {
    if (fold.getAttribute('aria-expanded') === 'false') fireEvent.click(fold)
  }
}
/** An event: a row of the span tree, a bar on the tracks (its zone unfolded first). */
const pick = (view: View, name: RegExp) => {
  if (view === 'tree') return screen.getByRole('treeitem', { name })
  const list = screen.getByRole('list', { name: 'Tracks of the conversation' })
  if (!within(list).queryByRole('button', { name })) unfoldZones()
  return within(list).getByRole('button', { name })
}
const goTo = (name: RegExp, view: View = 'tree') => {
  fireEvent.click(pick(view, name))
  fireEvent.click(within(screen.getByTestId('trace-detail')).getByRole('button', { name: 'Show in the conversation' }))
}
const useView = (view: View) => beforeEach(() => {
  // `tracks` is the default: nothing stored.
  if (view === 'tracks') localStorage.removeItem('po.timeline.view')
  else localStorage.setItem('po.timeline.view', view)
})

// Whatever the view: choosing a call and "Show in the conversation" reaches its block.
describe.each(['tracks', 'tree'] as const)('<ChatTimelineStrip> in the %s view', (view) => {
  useView(view)

  it('scrolls to a call whose block is on the page', () => {
    const block = document.createElement('div')
    block.dataset.toolCallId = 'c1'
    block.scrollIntoView = vi.fn()
    document.body.appendChild(block)
    navigate.mockClear()
    strip()
    if (view === 'tracks') expect(screen.queryAllByRole('treeitem')).toHaveLength(0)
    goTo(/Bash · ls/, view)
    expect(block.scrollIntoView).toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
    block.remove()
  })

  it('opens the page instead of doing nothing when the block is not loaded', () => {
    navigate.mockClear()
    strip()
    goTo(/Bash · ls/, view)
    expect(navigate).toHaveBeenLastCalledWith('/workspace/ws/chat/s/timeline?item=c1')
  })

  it('shows the conversation with its provider · model', () => {
    strip()
    expect(screen.getByText('native · deepseek-chat')).toBeTruthy()
  })
})

// The work lane (plans, tasks) and the session links live in the span tree.
describe('<ChatTimelineStrip> in the tree view', () => {
  useView('tree')

  it('shows the work lane', () => {
    strip()
    expect(screen.getByRole('treeitem', { name: /Ship/ })).toBeTruthy()
  })

  it('opens the plan page for a plan', () => {
    navigate.mockClear()
    strip()
    goTo(/Ship/)
    expect(navigate).toHaveBeenLastCalledWith('/workspace/ws/plans/p1')
  })

  it('traces the whole conversation once it is loaded: a child session opens its own conversation', () => {
    trace.value = {
      ...trace.value,
      loading: { loaded: 500, total: 900 },
      sessions: [
        { id: 's', title: 'Chat', relation: 'root', isStreaming: false, messages: msgs },
        { id: 'kid', title: 'Delegated work', relation: 'child', parentId: 's', isStreaming: false, createdAt: new Date(1002).toISOString(), messages: [] },
      ],
    }
    navigate.mockClear()
    strip()
    expect(screen.getByTestId('trace-loading').textContent).toContain('500 of 900')
    fireEvent.click(screen.getByRole('treeitem', { name: /Delegated work/ }))
    fireEvent.click(within(screen.getByTestId('trace-detail')).getByRole('button', { name: 'Open this session' }))
    expect(navigate).toHaveBeenLastCalledWith('/workspace/ws/chat/kid')
  })
})

// The panel is a 20rem column: its zones (one per session) open folded, one header each.
describe('<ChatTimelineStrip> zones', () => {
  useView('tracks')
  // The history a test above loaded (a child session) is not this one's.
  beforeEach(() => {
    trace.value = { ...trace.value, sessions: [], loading: null, failed: false }
  })

  it('opens with its zones folded, and unfolds the one whose header is clicked', () => {
    strip()
    const list = within(screen.getByRole('list', { name: 'Tracks of the conversation' }))
    expect(list.queryByRole('button', { name: /Bash · ls/ })).toBeNull()
    const fold = screen.getByTestId('track-zone-fold')
    expect(fold.getAttribute('aria-expanded')).toBe('false')
    expect(fold.getAttribute('aria-label')).toBe('Expand · Chat')
    fireEvent.click(fold)
    expect(fold.getAttribute('aria-expanded')).toBe('true')
    expect(fold.getAttribute('aria-label')).toBe('Collapse · Chat')
    expect(list.getByRole('button', { name: /Bash · ls/ })).toBeTruthy()
    fireEvent.click(fold)
    expect(list.queryByRole('button', { name: /Bash · ls/ })).toBeNull()
  })

  it('leaves the span tree alone: its rows are there without unfolding anything', () => {
    localStorage.setItem('po.timeline.view', 'tree')
    try {
      strip()
      expect(screen.getByRole('treeitem', { name: /Bash · ls/ })).toBeTruthy()
      expect(screen.queryAllByTestId('track-zone-fold')).toHaveLength(0)
    } finally {
      localStorage.removeItem('po.timeline.view')
    }
  })
})
