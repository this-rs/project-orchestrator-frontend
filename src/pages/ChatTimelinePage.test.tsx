import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import type { ChatMessage } from '@/types'

const messages: ChatMessage[] = [
  { id: 'm1', role: 'user', timestamp: new Date(1000), blocks: [{ id: 'b', type: 'text', content: 'list files' }] },
  { id: 'm2', role: 'assistant', timestamp: new Date(1001), duration_ms: 1, blocks: [
    { id: 'u', type: 'tool_use', content: 'Bash', metadata: { tool_call_id: 'c1', tool_name: 'Bash', tool_input: { command: 'ls' } } },
    { id: 'r', type: 'tool_result', content: 'a.txt', metadata: { tool_call_id: 'c1' } },
  ] },
]
const kid = { id: 'kid', title: 'Delegated work', relation: 'child', parentId: 's', isStreaming: false, createdAt: new Date(2).toISOString(), messages: [] }
vi.mock('@/hooks/useConversationTrace', () => ({
  useConversationTrace: () => ({ sessions: [{ id: 's', title: 's', relation: 'root', isStreaming: false, messages }, kid], loading: null, failed: false, retry: () => {}, streaming: false }),
}))
vi.mock('@/hooks', () => ({ useWorkspaceSlug: () => 'ws' }))
vi.mock('@/hooks/useTimelineContext', () => ({
  useTimelineContext: () => ({ title: 'My chat', session: { provider: 'native', model: 'deepseek-chat' }, decisions: [], work: { plans: [], tasks: [] } }),
}))

import ChatTimelinePage from './ChatTimelinePage'

function Where() {
  const l = useLocation()
  return <output data-testid="where">{l.pathname}{l.search}</output>
}
const open = (search = '') => render(
  <MemoryRouter initialEntries={[`/workspace/ws/chat/s/timeline${search}`]}>
    <Routes><Route path="/workspace/ws/chat/:sessionId/timeline" element={<><ChatTimelinePage /><Where /></>} /></Routes>
  </MemoryRouter>,
)

describe('<ChatTimelinePage>', () => {
  it('asks to pick an event when none is selected', () => {
    open()
    expect(screen.getByText(/Pick an event/)).toBeTruthy()
    // The turn, its call, and the child session (its span).
    expect(screen.getByText(/Events: 3/)).toBeTruthy()
  })

  it('shows the chain, input and output of the item in the URL', () => {
    open('?item=c1')
    const chain = screen.getByTestId('event-chain')
    expect(chain.textContent).toContain('list files')
    expect(chain.textContent).toContain('a.txt')
  })

  it('puts the chosen item in the URL, so a link lands on the same item', () => {
    open()
    fireEvent.click(screen.getByRole('treeitem', { name: /Bash · ls/ }))
    expect(screen.getByTestId('where').textContent).toContain('?item=c1')
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.getByTestId('where').textContent).not.toContain('?item=')
  })

  it('shows a child session as its own subtree, and opens it', () => {
    open()
    const child = screen.getByRole('treeitem', { name: /Delegated work/ })
    expect(child.getAttribute('aria-level')).toBe('2')
    fireEvent.click(child)
    fireEvent.click(screen.getByRole('button', { name: 'Open this session' }))
    expect(screen.queryByTestId('where')).toBeNull()
  })

  it('opens the conversation from a call', () => {
    open('?item=c1')
    fireEvent.click(screen.getByRole('button', { name: 'Show in the conversation' }))
    expect(screen.queryByTestId('where')).toBeNull()
  })

  it('links back to the conversation', () => {
    open()
    expect(screen.getByRole('link', { name: /Back to the conversation/ }).getAttribute('href')).toBe('/workspace/ws/chat/s')
  })
})
