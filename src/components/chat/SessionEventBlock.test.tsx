/**
 * The session-level events of the transcript (a move to another provider, a closed
 * session, a context re-injected after compaction) as the user sees them, and the
 * per-tool Stop through the chat socket with REST as the fallback.
 *
 * Run with: npx vitest run src/components/chat/SessionEventBlock.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import type { ReactNode } from 'react'
import { chatFollowNoticeAtom, chatFollowRequestAtom, providersAtom } from '@/atoms'
import type { ContentBlock } from '@/types'
import type { ProvidersResponse } from '@/types/provider'
import { historyEventsToMessages } from '@/utils/chatAssembly'

const cancelTools = vi.fn()
vi.mock('@/services', () => ({ chatApi: { cancelTools: (...a: unknown[]) => cancelTools(...a) } }))

import { ChatSessionProvider } from './ChatSessionContext'
import { SessionEventBlock } from './SessionEventBlock'
import { FollowNotice } from './FollowNotice'
import { ToolCallBlock } from './ToolCallBlock'

const PROVIDERS = {
  providers: [
    { id: 'claude-code', kind: 'claude_code', label: 'Claude Code', health: { status: 'healthy' }, models: [] },
    { id: 'local', kind: 'openai_compatible', label: 'Local llama', health: { status: 'healthy' }, models: [] },
  ],
  default: { provider: 'claude-code', routed_by: 'default' },
} as unknown as ProvidersResponse

const RELAYED = {
  type: 'conversation_relayed',
  from_session_id: 's1',
  to_session_id: 's2',
  from_provider: 'claude-code',
  to_provider: 'local',
  relayed_entries: 12,
  omitted_entries: 3,
  moved_by: 'user',
}

/** The block the history reducer builds for one frame. */
const blockOf = (frame: Record<string, unknown>): ContentBlock => historyEventsToMessages([frame] as never[])[0].blocks[0]

function mount(ui: ReactNode, sessionId: string, cancelToolsLive?: () => boolean) {
  const store = createStore()
  store.set(providersAtom, PROVIDERS)
  render(
    <Provider store={store}>
      <ChatSessionProvider sessionId={sessionId} cancelToolsLive={cancelToolsLive}>
        {ui}
      </ChatSessionProvider>
    </Provider>,
  )
  return store
}

beforeEach(() => cancelTools.mockReset())

describe('conversation_relayed', () => {
  it('on the new thread: "moved from X to Y", what was replayed and left out, by name', () => {
    mount(<SessionEventBlock block={blockOf(RELAYED)} />, 's2')
    const note = screen.getByTestId('conversation-relayed')
    expect(note.getAttribute('data-direction')).toBe('in')
    expect(note.textContent).toContain('Conversation moved from Claude Code to Local llama. Replayed as text: 12 · left out: 3.')
    expect(screen.queryByTestId('relay-open-continuation')).toBeNull()
  })

  it('on the old thread: where it went, and a way to the continuation', () => {
    const store = mount(<SessionEventBlock block={blockOf(RELAYED)} />, 's1')
    const note = screen.getByTestId('conversation-relayed')
    expect(note.getAttribute('data-direction')).toBe('out')
    expect(note.textContent).toContain('This conversation continues on Local llama')
    fireEvent.click(screen.getByTestId('relay-open-continuation'))
    expect(store.get(chatFollowRequestAtom)).toEqual({ sessionId: 's2', fromSessionId: 's1', notice: null })
  })
})

describe('session_closed', () => {
  it('is a visible status, in words, with its reason', () => {
    mount(<SessionEventBlock block={blockOf({ type: 'session_closed', session_id: 's1', reason: 'error' })} />, 's1')
    const closed = screen.getByTestId('session-closed')
    expect(closed.getAttribute('role')).toBe('status')
    expect(closed.textContent).toBe('Session closed after an error. Start a new conversation to continue.')
  })
})

describe('compaction_recovery', () => {
  it('says the context was re-injected, with its size', () => {
    mount(<SessionEventBlock block={blockOf({ type: 'compaction_recovery', hint_tokens: 1800, build_latency_ms: 42, recovery_success: true })} />, 's1')
    expect(screen.getByTestId('compaction-recovery').textContent).toContain('Context restored after compaction (~1,800 tokens re-injected, 42 ms).')
  })
})

describe('the follow notice', () => {
  it('says the tab followed a conversation moved elsewhere, only on that session, and can be dismissed', () => {
    const store = mount(<FollowNotice sessionId="s2" />, 's2')
    expect(screen.queryByTestId('follow-notice')).toBeNull()
    act(() => store.set(chatFollowNoticeAtom, { sessionId: 's1', fromProvider: 'claude-code', toProvider: 'local', movedBy: 'user' }))
    expect(screen.queryByTestId('follow-notice')).toBeNull()
    act(() => store.set(chatFollowNoticeAtom, { sessionId: 's2', fromProvider: 'claude-code', toProvider: 'local', movedBy: 'user' }))
    const notice = screen.getByTestId('follow-notice')
    expect(notice.getAttribute('role')).toBe('status')
    expect(notice.textContent).toContain('moved from Claude Code to Local llama elsewhere: this tab now follows the new session')
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByTestId('follow-notice')).toBeNull()
  })
})

describe('per-tool Stop', () => {
  const running: ContentBlock = {
    id: 'tu',
    type: 'tool_use',
    content: 'Bash',
    metadata: { tool_call_id: 'c9', tool_name: 'Bash', tool_input: { command: 'sleep 100' }, created_at: new Date().toISOString() },
  }
  const stopChip = () => screen.getAllByRole('button', { name: /stop/i }).find((el) => el.tagName === 'SPAN')!

  it('goes through the cancel_tools frame when the socket is open (no REST call)', () => {
    const live = vi.fn(() => true)
    mount(<ToolCallBlock block={running} />, 's1', live)
    fireEvent.click(stopChip())
    expect(live).toHaveBeenCalledTimes(1)
    expect(cancelTools).not.toHaveBeenCalled()
  })

  it('falls back to REST when the frame could not be sent', () => {
    cancelTools.mockResolvedValue({ capped: false })
    const live = vi.fn(() => false)
    mount(<ToolCallBlock block={running} />, 's1', live)
    fireEvent.click(stopChip())
    expect(live).toHaveBeenCalledTimes(1)
    expect(cancelTools).toHaveBeenCalledWith('s1')
  })
})
