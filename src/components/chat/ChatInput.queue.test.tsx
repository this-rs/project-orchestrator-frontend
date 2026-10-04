/**
 * Wiring tests for the queued messages in the composer.
 *
 * The session holds the queue and delivers it (backend `chat/pending_queue.rs`;
 * hand-over and server list in `useChat.queue.test.tsx`). What a component test
 * can check here:
 *
 * - a message composed mid-stream is handed to `onQueue`, never sent, and the
 *   composer starts clean;
 * - the composer shows the list of ITS conversation, and visibly so — "I queue
 *   a message and see nothing" was the bug report that shaped this component;
 * - the composer never sends a queued message by itself: that used to be an
 *   effect here, and it sent conversation A's message in conversation B;
 * - each row action is forwarded as the matching operation, and the send
 *   button is two-stage: "next" first, "send now" on the second click.
 *
 * Run with: npx vitest run src/components/chat/ChatInput.queue.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { Provider, createStore, type createStore as CreateStore } from 'jotai'
import { chatMessageQueuesAtom } from '@/atoms/chat'
import { ChatInput } from './ChatInput'
import type { QueuedMessage } from './messageQueue'

vi.mock('@/hooks', () => ({ useIsMobile: () => false }))
vi.mock('@/services/chat', () => ({
  chatApi: { getPermissionConfig: () => Promise.resolve({ mode: 'default' }) },
}))
vi.mock('@/services/documents', () => ({ documentsApi: { upload: vi.fn() } }))

type Store = ReturnType<typeof CreateStore>

const row = (id: string, text: string, extra: Partial<QueuedMessage> = {}): QueuedMessage => ({
  id,
  text,
  queuedAt: 0,
  ...extra,
})

describe('ChatInput — queued messages', () => {
  let store: Store
  let onSend: ReturnType<typeof vi.fn>
  let onQueue: ReturnType<typeof vi.fn>
  let onQueueOp: ReturnType<typeof vi.fn>

  beforeEach(() => {
    store = createStore()
    onSend = vi.fn()
    onQueue = vi.fn()
    onQueueOp = vi.fn()
  })

  /** One composer whose conversation and streaming state the test drives, like ChatPanel does. */
  function mount(sessionId: string | null, isStreaming: boolean) {
    const ui = (sid: string | null, streaming: boolean) => (
      <Provider store={store}>
        <ChatInput
          onSend={onSend}
          onQueue={onQueue}
          onQueueOp={onQueueOp}
          onInterrupt={() => {}}
          isStreaming={streaming}
          sessionId={sid}
        />
      </Provider>
    )
    const view = render(ui(sessionId, isStreaming))
    return { show: (sid: string | null, streaming: boolean) => view.rerender(ui(sid, streaming)) }
  }

  const compose = (text: string) => {
    const ta = screen.getByRole('textbox')
    fireEvent.change(ta, { target: { value: text } })
    fireEvent.keyDown(ta, { key: 'Enter' })
  }

  it('hands a message composed mid-stream to the queue instead of sending it', () => {
    mount('conversation-a', true)
    compose('while you were talking')

    expect(onQueue).toHaveBeenCalledWith('while you were talking', [])
    expect(onSend).not.toHaveBeenCalled()
    // The message took the text with it: the composer is clean for the next one.
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('')
  })

  it('sends straight away when nothing is running: the queue is never an extra step', () => {
    mount('conversation-a', false)
    compose('right now')

    expect(onSend).toHaveBeenCalledWith('right now', [])
    expect(onQueue).not.toHaveBeenCalled()
  })

  it('shows the queued messages of its conversation, taking real space', () => {
    store.set(chatMessageQueuesAtom, { 'conversation-a': [row('1', 'held for A')] })
    mount('conversation-a', true)

    const panel = screen.getByTestId('message-queue')
    expect(screen.getByText('held for A')).toBeTruthy()
    expect(screen.getByText('1 message queued')).toBeTruthy()
    // Nothing invisible in the way — it takes layout space rather than floating.
    expect(panel.className).not.toMatch(/absolute|pointer-events-none/)
  })

  it('shows nothing of another conversation and sends nothing when the user switches to it', async () => {
    // The reported bug: queue in A, switch to idle B before the message leaves — it was sent in B.
    store.set(chatMessageQueuesAtom, { 'conversation-a': [row('1', 'for A only')] })
    const { show } = mount('conversation-a', true)
    expect(screen.getByText('for A only')).toBeTruthy()

    show('conversation-b', false)
    expect(screen.queryByTestId('message-queue')).toBeNull()
    await new Promise((r) => setTimeout(r, 50))
    expect(onSend).not.toHaveBeenCalled()
    expect(onQueue).not.toHaveBeenCalled()
  })

  it('never sends a queued message by itself when the response ends: the session does', async () => {
    store.set(chatMessageQueuesAtom, { 'conversation-a': [row('1', 'the server delivers me')] })
    const { show } = mount('conversation-a', true)

    show('conversation-a', false)
    await new Promise((r) => setTimeout(r, 50))
    expect(onSend).not.toHaveBeenCalled()
  })

  it('shows the queue of a conversation that has no id yet', () => {
    store.set(chatMessageQueuesAtom, { __new__: [row('1', 'second thought', { local: true })] })
    mount(null, true)
    expect(screen.getByText('second thought')).toBeTruthy()
  })

  it('marks "next" on the first click and sends now on the second', () => {
    store.set(chatMessageQueuesAtom, { 'conversation-a': [row('1', 'urgent'), row('2', 'later')] })
    mount('conversation-a', true)

    const sendNext = screen
      .getAllByRole('button')
      .find((b) => b.dataset.stage === 'send-next' && b.closest('li')?.textContent?.includes('urgent'))!
    fireEvent.click(sendNext)
    // First click never cuts the running response short.
    expect(onQueueOp).toHaveBeenLastCalledWith({ op: 'prioritize', id: '1' })

    // The server answers with the row marked "next": the same button now sends.
    act(() => {
      store.set(chatMessageQueuesAtom, {
        'conversation-a': [row('1', 'urgent', { prioritized: true }), row('2', 'later')],
      })
    })
    const sendNow = screen.getAllByRole('button').find((b) => b.dataset.stage === 'send-now')!
    fireEvent.click(sendNow)
    expect(onQueueOp).toHaveBeenLastCalledWith({ op: 'send_now', id: '1' })
    expect(onSend).not.toHaveBeenCalled()
  })
})
