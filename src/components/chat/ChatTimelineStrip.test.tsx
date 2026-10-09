import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ChatMessage } from '@/types'

const navigate = vi.fn()
vi.mock('react-router-dom', async (orig) => ({ ...(await orig<typeof import('react-router-dom')>()), useNavigate: () => navigate }))
vi.mock('@/hooks/useTimelineContext', () => ({
  useTimelineContext: () => ({ title: 'Chat', session: { provider: 'native', model: 'deepseek-chat' }, decisions: [], work: { plans: [{ id: 'p1', title: 'Ship', status: 'in_progress' }], tasks: [] } }),
}))

import { ChatTimelineStrip } from './ChatTimelineStrip'

const msgs: ChatMessage[] = [
  { id: 'm1', role: 'user', timestamp: new Date(0), blocks: [{ id: 'b', type: 'text', content: 'go' }] },
  { id: 'm2', role: 'assistant', timestamp: new Date(1), duration_ms: 1, blocks: [
    { id: 'u', type: 'tool_use', content: 'Bash', metadata: { tool_call_id: 'c1', tool_name: 'Bash', tool_input: { command: 'ls' } } },
    { id: 'r', type: 'tool_result', content: 'ok', metadata: { tool_call_id: 'c1' } },
  ] },
]
const strip = () => render(
  <MemoryRouter><ChatTimelineStrip sessionId="s" messages={msgs} isStreaming={false} workspaceSlug="ws" /></MemoryRouter>,
)

describe('<ChatTimelineStrip>', () => {
  it('shows the work lane, the conversation with its provider · model, and links to the page', () => {
    strip()
    expect(screen.getByText('Ship')).toBeTruthy()
    expect(screen.getByTestId('timeline-lane-context').textContent).toContain('native · deepseek-chat')
    expect(screen.getByRole('link', { name: 'Open the full timeline' }).getAttribute('href')).toBe('/workspace/ws/chat/s/timeline')
  })

  it('scrolls to a call whose block is on the page', () => {
    const block = document.createElement('div')
    block.dataset.toolCallId = 'c1'
    block.scrollIntoView = vi.fn()
    document.body.appendChild(block)
    strip()
    fireEvent.click(screen.getByRole('button', { name: /Bash · ls/ }))
    expect(block.scrollIntoView).toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
    block.remove()
  })

  it('opens the page instead of doing nothing when the block is not loaded, and the plan page for a plan', () => {
    navigate.mockClear()
    strip()
    fireEvent.click(screen.getByRole('button', { name: /Bash · ls/ }))
    expect(navigate).toHaveBeenLastCalledWith('/workspace/ws/chat/s/timeline?item=c1')
    fireEvent.click(screen.getByRole('button', { name: /Ship/ }))
    expect(navigate).toHaveBeenLastCalledWith('/workspace/ws/plans/p1')
  })
})
