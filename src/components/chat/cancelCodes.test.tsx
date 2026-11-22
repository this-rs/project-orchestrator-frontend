import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import type { ReactNode } from 'react'
import type { ChatMessage, ContentBlock } from '@/types'

import { chatSessionIdAtom } from '@/atoms'
import { toolCancelUnsupportedText } from '@/constants/capabilities'
import { ChatSessionProvider } from './ChatSessionContext'
import { ChatMessageBubble } from './ChatMessageBubble'

function mount(ui: ReactNode, cancelToolsLive?: () => boolean) {
  const store = createStore()
  store.set(chatSessionIdAtom, 's1')
  const view = render(
    <Provider store={store}>
      <ChatSessionProvider sessionId="s1" cancelToolsLive={cancelToolsLive}>{ui}</ChatSessionProvider>
    </Provider>,
  )
  return { ...view, store }
}

describe('ChatMessageBubble — a cancel error frame is a notice on the turn', () => {
  const bubble = (block: ContentBlock) => {
    const message: ChatMessage = { id: 'm', role: 'assistant', timestamp: new Date(), blocks: [block] }
    return mount(<ChatMessageBubble message={message} onRespondPermission={() => true} onRespondInput={() => true} />)
  }

  it('cancel_failed / owner_unreachable: "already stopped", as a status, not the red error line', () => {
    bubble({
      id: 'e',
      type: 'error',
      content: 'Error: no instance holds this session',
      metadata: { cancel_notice: true, code: 'cancel_failed', reason: 'owner_unreachable' },
    })
    const notice = screen.getByRole('status')
    expect(notice.getAttribute('data-cancel-notice')).toBe('owner_unreachable')
    expect(notice.textContent).toBe('Already stopped — nothing was running any more.')
  })

  it('cancel_failed / owner_timeout: may still happen', () => {
    bubble({ id: 'e', type: 'error', content: 'Error: timeout', metadata: { cancel_notice: true, code: 'cancel_failed', reason: 'owner_timeout' } })
    expect(screen.getByRole('status').textContent).toBe('The stop got no answer in time — it may still happen.')
  })

  it('cancel_refused / background_tasks: its own sentence, not the one about a tool', () => {
    bubble({ id: 'e', type: 'error', content: 'Error: unsupported', metadata: { cancel_notice: true, code: 'cancel_refused', reason: 'background_tasks' } })
    expect(screen.getByRole('status').textContent).toBe(
      'This provider cannot stop a single background task. Use Stop in the composer to interrupt the whole turn.',
    )
  })

  it('cancel_refused: the provider cannot stop one tool', () => {
    bubble({ id: 'e', type: 'error', content: 'Error: unsupported', metadata: { cancel_notice: true, code: 'cancel_refused', reason: 'tool_cancel' } })
    expect(screen.getByRole('status').textContent).toBe(toolCancelUnsupportedText())
  })
})
