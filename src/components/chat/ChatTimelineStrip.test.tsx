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
/** An event: a row of the span tree, a bar on the tracks. */
const pick = (view: View, name: RegExp) => (view === 'tree' ? screen.getByRole('treeitem', { name }) : within(screen.getByRole('list', { name: 'Tracks of the conversation' })).getByRole('button', { name }))
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
