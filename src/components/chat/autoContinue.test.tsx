/**
 * Auto-continue is always on in the backend, capped (PO decision 7b95342a): the composer
 * has no toggle any more, nothing sends `set_auto_continue`, and what shows a continuation
 * is the `auto_continue` event the backend sends when it continues a turn.
 */
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { ChatInput } from './ChatInput'
import { ResultMaxTurnsBlock } from './ResultMaxTurnsBlock'
import { ChatWebSocket } from '@/services/chatWebSocket'
import { historyEventsToMessages } from '@/utils/chatAssembly'
import type { ContentBlock } from '@/types'

vi.mock('@/hooks', () => ({ useIsMobile: () => false }))
vi.mock('@/services/chat', () => ({
  chatApi: { getPermissionConfig: () => Promise.resolve({ mode: 'default' }) },
}))
vi.mock('@/services/documents', () => ({ documentsApi: { upload: vi.fn() } }))

const MAX_TURNS: ContentBlock = { id: 'b1', type: 'result_max_turns', content: '', metadata: { num_turns: 30 } }

describe('auto-continue — always on, no toggle', () => {
  it('the composer offers no auto-continue toggle', () => {
    render(
      <Provider store={createStore()}>
        <ChatInput onSend={() => {}} onQueue={() => {}} onQueueOp={() => {}} onInterrupt={() => {}} isStreaming={false} sessionId="s1" />
      </Provider>,
    )
    expect(screen.queryByTitle(/auto-continue/i)).toBeNull()
    expect(screen.queryByText('Auto')).toBeNull()
    // The timeline toggle that sat next to it stays.
    expect(screen.getByRole('button', { name: 'Timeline' })).toBeTruthy()
  })

  it('the WebSocket client no longer sends set_auto_continue', () => {
    expect('sendSetAutoContinue' in ChatWebSocket.prototype).toBe(false)
  })

  it('a turn the backend did not continue (cap, kill switch) offers Continue once it ends', () => {
    const onContinue = vi.fn()
    const { rerender } = render(<ResultMaxTurnsBlock block={MAX_TURNS} onContinue={onContinue} isStreaming />)
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull()
    expect(screen.queryByText(/auto-continuing/i)).toBeNull()
    rerender(<ResultMaxTurnsBlock block={MAX_TURNS} onContinue={onContinue} isStreaming={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(onContinue).toHaveBeenCalledOnce()
  })

  it('the backend continuation still shows; auto_continue_state_changed shows nothing', () => {
    const messages = historyEventsToMessages([
      { type: 'user_message', content: 'go', created_at: 1_700_000_000 },
      { type: 'assistant_text', content: 'partial', created_at: 1_700_000_001 },
      { type: 'result', subtype: 'error_max_turns', num_turns: 30, created_at: 1_700_000_002 },
      { type: 'auto_continue', session_id: 's1', delay_ms: 500, created_at: 1_700_000_003 },
      { type: 'auto_continue_state_changed', session_id: 's1', enabled: true, created_at: 1_700_000_004 },
    ])
    const blocks = messages.filter((m) => m.role === 'assistant').flatMap((m) => m.blocks)
    const indicators = blocks.filter((b) => b.type === 'continue_indicator')
    expect(indicators).toHaveLength(1)
    expect(indicators[0].metadata?.auto).toBe(true)
    expect(blocks.some((b) => b.type === 'result_max_turns')).toBe(true)
    expect(blocks.map((b) => b.type)).toEqual(['text', 'result_max_turns', 'continue_indicator'])
  })
})
