import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import type { ReactNode } from 'react'
import type { ChatMessage, ContentBlock } from '@/types'

import { chatSessionIdAtom } from '@/atoms'
import { ChatSessionProvider } from './ChatSessionContext'
import { ChatMessageBubble } from './ChatMessageBubble'
import { historyEventsToMessages } from '@/utils/chatAssembly'

function mount(ui: ReactNode) {
  const store = createStore()
  store.set(chatSessionIdAtom, 's1')
  const view = render(
    <Provider store={store}>
      <ChatSessionProvider sessionId="s1">{ui}</ChatSessionProvider>
    </Provider>,
  )
  return { ...view, store }
}

describe('ChatMessageBubble — a cancel error frame is a notice on the turn', () => {
  const bubble = (block: ContentBlock) => {
    const message: ChatMessage = { id: 'm', role: 'assistant', timestamp: new Date(), blocks: [block] }
    return mount(<ChatMessageBubble message={message} onRespondPermission={() => true} onRespondInput={() => true} />)
  }

  it.each(['live', 'replay'])('%s cancel notice exposes only the cautious message in its title', (source) => {
    const frame = { type: 'error', message: 'nothing runs there', code: 'cancel_failed', reason: 'owner_unreachable' }
    const block: ContentBlock = source === 'replay'
      ? historyEventsToMessages([frame]).flatMap((message) => message.blocks)[0]
      : { id: 'live', type: 'error', content: frame.message, metadata: { cancel_notice: true, code: frame.code, reason: frame.reason } }
    bubble(block)
    const notice = screen.getByRole('status')
    expect(notice.getAttribute('title')).toBe('Owner unreachable; no stop was confirmed. Check the session activity.')
    expect(notice.getAttribute('title')).not.toContain('nothing runs')
  })

  it('cancel_failed / owner_unreachable: unconfirmed, as a status, not the red error line', () => {
    bubble({
      id: 'e',
      type: 'error',
      content: 'Error: no instance holds this session',
      metadata: { cancel_notice: true, code: 'cancel_failed', reason: 'owner_unreachable' },
    })
    const notice = screen.getByRole('status')
    expect(notice.getAttribute('data-cancel-notice')).toBe('owner_unreachable')
    expect(notice.textContent).toBe('Owner unreachable; no stop was confirmed. Check the session activity.')
    expect(notice.getAttribute('title')).toBe(notice.textContent)
  })

  it('cancel_failed / owner_timeout: may still happen', () => {
    bubble({ id: 'e', type: 'error', content: 'Error: timeout', metadata: { cancel_notice: true, code: 'cancel_failed', reason: 'owner_timeout' } })
    expect(screen.getByRole('status').textContent).toBe('The stop got no answer in time — it may still happen.')
  })

  it.each(['session_gone', 'owner_failed', 'owner_protocol', 'relay_failed', 'unknown'])('cancel_failed / %s reports an unknown outcome', (reason) => {
    bubble({ id: 'e', type: 'error', content: 'Error: relay', metadata: { cancel_notice: true, code: 'cancel_failed', reason } })
    const notice = screen.getByRole('status')
    expect(notice.textContent).toBe('The outcome of this stop request is unknown. Check the session activity.')
    expect(notice.getAttribute('title')).toBe(notice.textContent)
  })

  it('cancel_refused / background_tasks remains unconfirmed', () => {
    bubble({ id: 'e', type: 'error', content: 'Error: unsupported', metadata: { cancel_notice: true, code: 'cancel_refused', reason: 'background_tasks' } })
    expect(screen.getByRole('status').textContent).toBe(
      'A refusal was received; the stop outcome is unconfirmed. Check the session activity.',
    )
  })

  it('cancel_refused / tool_cancel does not assume whether the request targeted one task or all tools', () => {
    bubble({ id: 'e', type: 'error', content: 'Error: unsupported', metadata: { cancel_notice: true, code: 'cancel_refused', reason: 'tool_cancel' } })
    const notice = screen.getByRole('status')
    expect(notice.textContent).toBe('A refusal was received; the stop outcome is unconfirmed. Check the session activity.')
    expect(notice.getAttribute('title')).toBe(notice.textContent)
  })
})
