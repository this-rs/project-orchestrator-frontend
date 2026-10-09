/** The toggle next to Auto-continue shows or hides the timeline strip, and remembers it. */
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { chatTimelineOpenAtom } from '@/atoms'
import { ChatInput } from './ChatInput'

vi.mock('@/hooks', () => ({ useIsMobile: () => false }))
vi.mock('@/services/chat', () => ({
  chatApi: { getPermissionConfig: () => Promise.resolve({ mode: 'default' }) },
}))
vi.mock('@/services/documents', () => ({ documentsApi: { upload: vi.fn() } }))

describe('ChatInput — timeline toggle', () => {
  it('flips the timeline atom and says whether it is on', () => {
    const store = createStore()
    render(
      <Provider store={store}>
        <ChatInput onSend={() => {}} onQueue={() => {}} onQueueOp={() => {}} onInterrupt={() => {}} isStreaming={false} sessionId="s1" />
      </Provider>,
    )
    const toggle = screen.getByRole('button', { name: 'Timeline' })
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    expect(store.get(chatTimelineOpenAtom)).toBe(false)
    fireEvent.click(toggle)
    expect(store.get(chatTimelineOpenAtom)).toBe(true)
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    expect(toggle.getAttribute('title')).toBe('Hide the timeline')
    fireEvent.click(toggle)
    expect(store.get(chatTimelineOpenAtom)).toBe(false)
  })
})
