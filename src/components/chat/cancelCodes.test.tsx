/**
 * The typed outcomes of a cancel, in the transcript (review of backend #673, constat 2):
 * - the Stop chip of a tool comes back only when the REST body says `retryable: true`;
 * - a 409 `owner_unreachable` reads "already stopped";
 * - a `cancel_failed` / `cancel_refused` error frame is a notice on the turn.
 *
 * Run with: npx vitest run src/components/chat/cancelCodes.test.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import type { ReactNode } from 'react'
import type { ChatMessage, ContentBlock } from '@/types'

const cancelTools = vi.fn()
vi.mock('@/services', () => ({ chatApi: { cancelTools: (...a: unknown[]) => cancelTools(...a) } }))

import { chatLastCancelFailureAtom, chatSessionIdAtom } from '@/atoms'
import { ApiError } from '@/services/api'
import { toolCancelUnsupportedText } from '@/constants/capabilities'
import { ChatSessionProvider } from './ChatSessionContext'
import { ChatMessageBubble } from './ChatMessageBubble'
import { ToolCallBlock } from './ToolCallBlock'

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

const running: ContentBlock = {
  id: 'tu',
  type: 'tool_use',
  content: 'Bash',
  metadata: { tool_call_id: 'c9', tool_name: 'Bash', tool_input: { command: 'sleep 100' }, created_at: new Date().toISOString() },
}

const stopChip = () => screen.queryAllByRole('button', { name: /stop/i }).find((el) => el.tagName === 'SPAN') ?? null
const refusal = (status: number, code: string, retryable: boolean) =>
  new ApiError(status, JSON.stringify({ error: `refused: ${code}`, code, retryable }))

/** Click Stop and let the rejected call settle, then let `ms` pass. */
async function clickStopAndWait(ms: number) {
  fireEvent.click(stopChip()!)
  await act(() => vi.advanceTimersByTimeAsync(0))
  await act(() => vi.advanceTimersByTimeAsync(ms))
}

beforeEach(() => {
  cancelTools.mockReset()
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('ToolCallBlock — Stop after a refused cancel', () => {
  const TIMEOUT_NOTICE = 'The stop got no answer in time — it may still happen.'

  it('504 owner_timeout, retryable:false: Stop does NOT come back, the chip is pending ("may still happen"), not "not stopped"', async () => {
    cancelTools.mockRejectedValueOnce(refusal(504, 'owner_timeout', false))
    mount(<ToolCallBlock block={running} />)
    await clickStopAndWait(10_000)
    expect(stopChip()).toBeNull()
    expect(screen.getByText(TIMEOUT_NOTICE).getAttribute('data-stop-outcome')).toBe('pending')
    expect(screen.queryByText('not stopped — use the global Stop')).toBeNull()
    expect(cancelTools).toHaveBeenCalledTimes(1)
  })

  it('504 owner_timeout, retryable:true: still pending, Stop does NOT come back (the stop may still happen)', async () => {
    cancelTools.mockRejectedValueOnce(refusal(504, 'owner_timeout', true))
    mount(<ToolCallBlock block={running} />)
    await clickStopAndWait(10_000)
    expect(stopChip()).toBeNull()
    expect(screen.getByText(TIMEOUT_NOTICE).getAttribute('data-stop-outcome')).toBe('pending')
    expect(cancelTools).toHaveBeenCalledTimes(1)
  })

  it('410 session_gone, retryable:true: Stop comes back', async () => {
    cancelTools.mockRejectedValueOnce(refusal(410, 'session_gone', true))
    mount(<ToolCallBlock block={running} />)
    await clickStopAndWait(2_000)
    expect(stopChip()).not.toBeNull()
    expect(screen.queryByText('not stopped — use the global Stop')).toBeNull()
  })

  it('an error without a typed body (network) is not retryable either', async () => {
    cancelTools.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    mount(<ToolCallBlock block={running} />)
    await clickStopAndWait(10_000)
    expect(stopChip()).toBeNull()
  })

  it('409 owner_unreachable reads "already stopped", and Stop does not come back', async () => {
    cancelTools.mockRejectedValueOnce(refusal(409, 'owner_unreachable', false))
    mount(<ToolCallBlock block={running} />)
    await clickStopAndWait(10_000)
    expect(stopChip()).toBeNull()
    const label = screen.getByText('already stopped')
    expect(label.getAttribute('data-stop-outcome')).toBe('already_stopped')
    expect(label.getAttribute('title')).toBe('Already stopped — nothing was running any more.')
    expect(screen.queryByText('stopping…')).toBeNull()
  })
})

describe('ToolCallBlock — Stop sent over the socket', () => {
  const overSocket = () => true
  const announce = (store: ReturnType<typeof createStore>, reason: string, sessionId = 's1') =>
    act(() => store.set(chatLastCancelFailureAtom, { sessionId, reason, at: Date.now() }))

  it('owner_unreachable announced after the click: "already stopped", never re-enabled', async () => {
    const { store } = mount(<ToolCallBlock block={running} />, overSocket)
    fireEvent.click(stopChip()!)
    expect(screen.getByText('stopping…')).toBeTruthy()
    await act(() => vi.advanceTimersByTimeAsync(5))
    announce(store, 'owner_unreachable')
    expect(screen.getByText('already stopped').getAttribute('data-stop-outcome')).toBe('already_stopped')
    await act(() => vi.advanceTimersByTimeAsync(10_000))
    expect(stopChip()).toBeNull()
    expect(cancelTools).not.toHaveBeenCalled()
  })

  it('owner_timeout: pending ("may still happen"), never re-enabled', async () => {
    const { store } = mount(<ToolCallBlock block={running} />, overSocket)
    fireEvent.click(stopChip()!)
    announce(store, 'owner_timeout')
    expect(screen.getByText('The stop got no answer in time — it may still happen.').getAttribute('data-stop-outcome')).toBe('pending')
    expect(screen.queryByText('not stopped — use the global Stop')).toBeNull()
    await act(() => vi.advanceTimersByTimeAsync(10_000))
    expect(stopChip()).toBeNull()
  })

  it('any other reason: "not stopped", never re-enabled', async () => {
    const { store } = mount(<ToolCallBlock block={running} />, overSocket)
    fireEvent.click(stopChip()!)
    announce(store, 'session_gone')
    expect(screen.getByText('not stopped — use the global Stop').getAttribute('data-stop-outcome')).toBe('failed')
    await act(() => vi.advanceTimersByTimeAsync(10_000))
    expect(stopChip()).toBeNull()
  })

  it('a failure announced before the click, or for another session, is not this chip\'s', async () => {
    const { store } = mount(<ToolCallBlock block={running} />, overSocket)
    announce(store, 'owner_unreachable')
    await act(() => vi.advanceTimersByTimeAsync(5))
    fireEvent.click(stopChip()!)
    announce(store, 'owner_timeout', 'other-session')
    expect(screen.getByText('stopping…')).toBeTruthy()
    expect(screen.queryByText('already stopped')).toBeNull()
  })

  it('a chip that was not clicked ignores it', () => {
    const { store } = mount(<ToolCallBlock block={running} />, overSocket)
    announce(store, 'owner_unreachable')
    expect(stopChip()).not.toBeNull()
    expect(screen.queryByText('already stopped')).toBeNull()
  })
})

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
