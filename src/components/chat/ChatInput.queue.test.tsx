/**
 * Wiring tests for the pending-message queue in the composer.
 *
 * The queue's rules are tested without rendering in `messageQueue.test.ts`.
 * What is checked here is only what a component test can check:
 *
 * - a message composed mid-stream is queued AND visibly so — "I queue a message
 *   and see nothing" was the bug report that reshaped this component;
 * - the queue drains when the response ends, INCLUDING after a remount, which
 *   the previous edge-triggered flush lost the message on;
 * - the row's send button is two-stage: mark "next", then send now.
 *
 * Run with: npx vitest run src/components/chat/ChatInput.queue.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Provider, createStore, type createStore as CreateStore } from 'jotai'
import { ChatInput } from './ChatInput'

vi.mock('@/hooks', () => ({ useIsMobile: () => false }))
vi.mock('@/services/chat', () => ({
  chatApi: { getPermissionConfig: () => Promise.resolve({ mode: 'default' }) },
}))
vi.mock('@/services/documents', () => ({ documentsApi: { upload: vi.fn() } }))

type Store = ReturnType<typeof CreateStore>

/** One composer, rendered against a store the test can keep across remounts. */
function mount(store: Store, onSend: (t: string, a?: string[]) => void, isStreaming: boolean) {
  const ui = (streaming: boolean) => (
    <Provider store={store}>
      <ChatInput
        onSend={onSend}
        onInterrupt={() => {}}
        isStreaming={streaming}
        sessionId="session-1"
      />
    </Provider>
  )
  const view = render(ui(isStreaming))
  return {
    setStreaming: (streaming: boolean) => view.rerender(ui(streaming)),
    unmount: () => view.unmount(),
  }
}

const compose = (text: string) => {
  const ta = screen.getByRole('textbox')
  fireEvent.change(ta, { target: { value: text } })
  fireEvent.keyDown(ta, { key: 'Enter' })
}

describe('ChatInput — message queue', () => {
  let store: Store
  let onSend: ReturnType<typeof vi.fn>

  beforeEach(() => {
    store = createStore()
    onSend = vi.fn()
  })

  it('queues a message composed mid-stream and shows it', async () => {
    mount(store, onSend, true)
    compose('while you were talking')

    // Visible, not just held in state: the queue is the whole point.
    const panel = await screen.findByTestId('message-queue')
    expect(panel).toBeTruthy()
    expect(screen.getByText('while you were talking')).toBeTruthy()
    expect(screen.getByText('1 message en attente')).toBeTruthy()
    expect(onSend).not.toHaveBeenCalled()
    // Nothing invisible in the way — it takes layout space rather than floating.
    expect(panel.className).not.toMatch(/absolute|pointer-events-none/)
  })

  it('sends it when the response ends', async () => {
    const { setStreaming } = mount(store, onSend, true)
    compose('after you finish')
    await screen.findByTestId('message-queue')

    setStreaming(false)
    await waitFor(() => expect(onSend).toHaveBeenCalledWith('after you finish', undefined))
    expect(screen.queryByTestId('message-queue')).toBeNull()
  })

  it('still sends it when the end-of-stream edge is missed by a remount', async () => {
    // The regression this replaces: the flush watched for a streaming
    // true -> false transition. A remount (layout switch, Fast Refresh)
    // re-initialises that comparison, the edge never comes back, and the
    // message stays queued forever with nothing to signal it.
    const first = mount(store, onSend, true)
    compose('do not lose me')
    await screen.findByTestId('message-queue')

    first.unmount()
    mount(store, onSend, false) // remounts already idle — no edge to observe

    await waitFor(() => expect(onSend).toHaveBeenCalledWith('do not lose me', undefined))
  })

  it('holds one message per turn instead of draining the queue at once', async () => {
    const { setStreaming } = mount(store, onSend, true)
    compose('first')
    compose('second')
    await screen.findByTestId('message-queue')

    setStreaming(false)
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1))
    expect(onSend).toHaveBeenCalledWith('first', undefined)
    // The second one is still visible, waiting for the next turn.
    expect(screen.getByText('second')).toBeTruthy()
  })

  it('marks "next" on the first click and sends on the second', async () => {
    mount(store, onSend, true)
    compose('urgent')
    compose('later')
    await screen.findByTestId('message-queue')

    const nextButton = () =>
      screen.getAllByRole('button').find((b) => b.dataset.stage === 'send-next' && b.closest('li')?.textContent?.includes('urgent'))!
    fireEvent.click(nextButton())

    // First click never truncates the running response.
    expect(onSend).not.toHaveBeenCalled()
    expect(screen.getByText('next')).toBeTruthy()

    const nowButton = screen.getAllByRole('button').find((b) => b.dataset.stage === 'send-now')!
    fireEvent.click(nowButton)

    // Second click sends immediately, mid-stream — the backend interrupts.
    await waitFor(() => expect(onSend).toHaveBeenCalledWith('urgent', undefined))
    expect(screen.queryByText('urgent')).toBeNull()
    expect(screen.getByText('later')).toBeTruthy()
  })

  it('does not also auto-flush the queue after a manual send', async () => {
    // A manual send consumes the turn: the response it interrupts is the one
    // whose end would otherwise trigger an auto-flush a moment later.
    const { setStreaming } = mount(store, onSend, true)
    compose('urgent')
    compose('later')
    await screen.findByTestId('message-queue')

    fireEvent.click(screen.getAllByRole('button').find((b) => b.dataset.stage === 'send-next')!)
    fireEvent.click(screen.getAllByRole('button').find((b) => b.dataset.stage === 'send-now')!)
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1))

    setStreaming(false)
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1))
    expect(screen.getByText('later')).toBeTruthy()
  })
})
