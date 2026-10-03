/**
 * `bottomInset` is the height of the composer floating over the bottom of the transcript.
 * The scroller must keep that much room under its last line (or the last message would sit
 * behind the glass), and the "jump to latest" button must stay above the composer.
 */
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Provider } from 'jotai'
import type { ChatMessage } from '@/types'
import { ChatMessages } from './ChatMessages'

const messages: ChatMessage[] = [
  { id: 'm1', role: 'user', blocks: [{ id: 'b1', type: 'text', content: 'bonjour' }], timestamp: new Date('2026-10-03T10:00:00Z') },
  { id: 'm2', role: 'assistant', blocks: [{ id: 'b2', type: 'text', content: 'salut' }], timestamp: new Date('2026-10-03T10:00:01Z') },
]

const mount = (bottomInset?: number, extra: Record<string, unknown> = {}) =>
  render(
    <Provider>
      <ChatMessages
        messages={messages}
        isStreaming={false}
        onRespondPermission={() => {}}
        onRespondInput={() => {}}
        bottomInset={bottomInset}
        {...extra}
      />
    </Provider>,
  )

const scroller = (c: HTMLElement) => c.querySelector('.overflow-y-auto') as HTMLElement

describe('ChatMessages — bottomInset', () => {
  it('keeps the composer height (plus the usual 16 px) under the last message', () => {
    const { container } = mount(140)
    expect(scroller(container).style.paddingBottom).toBe('156px')
  })

  it('without a composer overlay, the scroller keeps its usual padding', () => {
    const { container } = mount(undefined)
    expect(scroller(container).style.paddingBottom).toBe('')
  })

  it('lifts the "jump to latest" button above the composer', () => {
    const { container } = mount(140, { hasLiveActivity: true, onJumpToTail: async () => {} })
    const fab = container.querySelector('button[class*="absolute"][class*="left-1/2"]') as HTMLElement
    expect(fab).not.toBeNull()
    expect(fab.style.bottom).toBe('152px') // 12 + 140
  })
})
