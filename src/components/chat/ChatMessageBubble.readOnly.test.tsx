/**
 * In a read-only transcript (the mirror of a Claude Code sub-agent, P18c) the
 * cards that would answer the agent are shown INERT, with the read-only reason:
 * the sub-agent runs in its parent's CLI, an answer here would go nowhere.
 * Elsewhere they stay answerable, exactly as before.
 *
 * Run with: npx vitest run src/components/chat/ChatMessageBubble.readOnly.test.tsx
 */
import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { MemoryRouter } from 'react-router-dom'
import type { ChatMessage } from '@/types'
import { ChatSessionProvider } from './ChatSessionContext'
import { ChatMessageBubble } from './ChatMessageBubble'
import { mirrorReadOnlyComposerText } from '@/constants/providerErrors'

const MESSAGE: ChatMessage = {
  id: 'm1',
  role: 'assistant',
  timestamp: new Date(0),
  blocks: [
    { id: 'b1', type: 'permission_request', content: '', metadata: { tool_call_id: 'p1', tool_name: 'Bash', tool_input: { command: 'ls' } } },
    {
      id: 'b2',
      type: 'ask_user_question',
      content: '',
      metadata: { tool_call_id: 'q1', questions: [{ question: 'Pick one', header: 'Choice', multiSelect: false, options: [{ label: 'Alpha' }, { label: 'Beta' }] }] },
    },
    { id: 'b3', type: 'result_max_turns', content: '', metadata: { num_turns: 30 } },
  ],
} as unknown as ChatMessage

function mount(readOnlyReason: string | null) {
  const handlers = { onRespondPermission: vi.fn(), onRespondInput: vi.fn(), onContinue: vi.fn() }
  render(
    <Provider store={createStore()}>
      <MemoryRouter>
        <ChatSessionProvider sessionId="s1" readOnlyReason={readOnlyReason}>
          <ChatMessageBubble message={MESSAGE} {...handlers} />
        </ChatSessionProvider>
      </MemoryRouter>
    </Provider>,
  )
  return handlers
}

describe('ChatMessageBubble — read-only transcript', () => {
  it('shows permission, question and Continue inert, each with the reason', () => {
    const h = mount(mirrorReadOnlyComposerText())
    expect(screen.getAllByTestId('readonly-action-reason')).toHaveLength(3)
    expect(screen.getAllByTestId('readonly-action-reason')[0]).toHaveTextContent(mirrorReadOnlyComposerText())

    const continueButton = screen.getByRole('button', { name: 'Continue' })
    expect(continueButton).toBeDisabled()
    fireEvent.click(continueButton)
    expect(h.onContinue).not.toHaveBeenCalled()

    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled()
    for (const button of screen.getAllByRole('button', { name: /allow|deny/i })) expect(button).toBeDisabled()
    expect(h.onRespondPermission).not.toHaveBeenCalled()
    expect(h.onRespondInput).not.toHaveBeenCalled()
  })

  it('a writable transcript keeps them answerable, with no reason shown', () => {
    const h = mount(null)
    expect(screen.queryByTestId('readonly-action-reason')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(h.onContinue).toHaveBeenCalled()
    expect(screen.getAllByRole('button', { name: /allow|deny/i }).some((b) => !(b as HTMLButtonElement).disabled)).toBe(true)
  })
})
