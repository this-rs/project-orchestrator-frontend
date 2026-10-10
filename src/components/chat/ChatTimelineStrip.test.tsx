import { describe, expect, it, vi } from 'vitest'
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
const goTo = (name: RegExp) => {
  fireEvent.click(screen.getByRole('treeitem', { name }))
  fireEvent.click(within(screen.getByTestId('trace-detail')).getByRole('button', { name: 'Show in the conversation' }))
}

describe('<ChatTimelineStrip>', () => {
  it('shows the work lane and the conversation with its provider · model', () => {
    strip()
    expect(screen.getByRole('treeitem', { name: /Ship/ })).toBeTruthy()
    expect(screen.getByText('native · deepseek-chat')).toBeTruthy()
  })

  it('scrolls to a call whose block is on the page', () => {
    const block = document.createElement('div')
    block.dataset.toolCallId = 'c1'
    block.scrollIntoView = vi.fn()
    document.body.appendChild(block)
    navigate.mockClear()
    strip()
    goTo(/Bash · ls/)
    expect(block.scrollIntoView).toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
    block.remove()
  })

  it('opens the page instead of doing nothing when the block is not loaded, and the plan page for a plan', () => {
    navigate.mockClear()
    strip()
    goTo(/Bash · ls/)
    expect(navigate).toHaveBeenLastCalledWith('/workspace/ws/chat/s/timeline?item=c1')
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
