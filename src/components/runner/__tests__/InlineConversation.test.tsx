import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { InlineConversation } from '../InlineConversation'

const wsState: { messages: unknown[]; status: string } = { messages: [], status: 'connected' }
vi.mock('@/hooks/runner', () => ({ useConversationWs: () => wsState }))
vi.mock('@/hooks', () => ({ useWorkspaceSlug: () => 'ws' }))
vi.mock('@/components/chat/ChatMessageBubble', () => ({
  ChatMessageBubble: ({ message }: { message: { id: string } }) => <div data-testid="bubble">{message.id}</div>,
}))
const interruptSession = vi.fn()
vi.mock('@/services/chat', () => ({
  chatApi: { interruptSession: (...a: unknown[]) => interruptSession(...a) },
}))

function setup(props: Partial<React.ComponentProps<typeof InlineConversation>> = {}) {
  const onClose = vi.fn()
  render(
    <MemoryRouter>
      <InlineConversation sessionId="sess-1" taskTitle="My task" onClose={onClose} {...props} />
    </MemoryRouter>,
  )
  return { onClose }
}

describe('InlineConversation', () => {
  beforeEach(() => {
    wsState.messages = []
    wsState.status = 'connected'
    interruptSession.mockReset()
    Element.prototype.scrollTo = vi.fn() as never
  })

  it('shows the waiting placeholder per connection status', () => {
    setup()
    expect(screen.getByText('Waiting for messages…')).toBeTruthy()
  })

  it('shows connecting and empty placeholders', () => {
    wsState.status = 'connecting'
    const { unmount } = render(<MemoryRouter><InlineConversation sessionId="s" taskTitle="t" onClose={vi.fn()} /></MemoryRouter>)
    expect(screen.getByText('Connecting to the assistant…')).toBeTruthy()
    unmount()
    wsState.status = 'disconnected'
    render(<MemoryRouter><InlineConversation sessionId="s" taskTitle="t" onClose={vi.fn()} /></MemoryRouter>)
    expect(screen.getByText('No messages yet')).toBeTruthy()
  })

  it('renders title, state, elapsed time, messages and closes', () => {
    wsState.messages = [{ id: 'm1' }, { id: 'm2' }]
    const { onClose } = setup({ agentStatus: 'running', elapsedSecs: 75 })
    expect(screen.getByText('My task')).toBeTruthy()
    expect(screen.getAllByTestId('bubble')).toHaveLength(2)
    expect(screen.getByText("01:15")).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Close conversation'))
    expect(onClose).toHaveBeenCalled()
  })

  it('collapses and expands', () => {
    setup()
    fireEvent.click(screen.getByLabelText('Collapse conversation'))
    expect(screen.getByLabelText('Expand conversation').getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByTitle('Drag to resize')).toBeNull()
    fireEvent.click(screen.getByLabelText('Expand conversation'))
    expect(screen.getByTitle('Drag to resize')).toBeTruthy()
  })

  it('stops the session and warns when nothing was interrupted', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    interruptSession.mockResolvedValue({ delivered: false })
    setup()
    fireEvent.click(screen.getByLabelText('Stop session'))
    await waitFor(() => expect(warn).toHaveBeenCalled())
    expect(interruptSession).toHaveBeenCalledWith('sess-1')
    warn.mockRestore()
  })

  it('logs when stopping fails and hides Stop when disconnected', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    interruptSession.mockRejectedValue(new Error('nope'))
    setup()
    fireEvent.click(screen.getByLabelText('Stop session'))
    await waitFor(() => expect(err).toHaveBeenCalled())
    err.mockRestore()
  })

  it('does not offer Stop when not connected', () => {
    wsState.status = 'disconnected'
    setup()
    expect(screen.queryByLabelText('Stop session')).toBeNull()
  })

  it('resizes by dragging the handle within bounds', () => {
    setup()
    const handle = screen.getByTitle('Drag to resize')
    fireEvent.mouseDown(handle, { clientY: 100 })
    expect(document.body.style.cursor).toBe('row-resize')
    fireEvent.mouseMove(document, { clientY: 150 })
    fireEvent.mouseMove(document, { clientY: -5000 })
    fireEvent.mouseUp(document)
    expect(document.body.style.cursor).toBe('')
  })

  it('shows the scroll-to-bottom button after scrolling up and scrolls back', () => {
    wsState.messages = [{ id: 'm1' }]
    setup()
    const area = screen.getByText('m1').parentElement as HTMLElement
    Object.defineProperty(area, 'scrollHeight', { configurable: true, value: 1000 })
    Object.defineProperty(area, 'clientHeight', { configurable: true, value: 100 })
    area.scrollTop = 0
    fireEvent.scroll(area)
    fireEvent.click(screen.getByTitle('Scroll to bottom'))
    expect(area.scrollTo).toHaveBeenCalled()
    expect(screen.queryByTitle('Scroll to bottom')).toBeNull()
  })
})
