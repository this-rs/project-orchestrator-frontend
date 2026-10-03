/**
 * The tray above the composer: what is running, then what is queued — one
 * card, each half optional. Checked here: the four combinations, the order,
 * and that the queue does not draw a second outline inside the tray.
 *
 * Run with: npx vitest run src/components/chat/ChatInput.activity.test.tsx
 */
import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { ChatInput } from './ChatInput'
import type { RunningItem } from './runningActivity'

vi.mock('@/hooks', () => ({ useIsMobile: () => false }))
vi.mock('@/services/chat', () => ({
  chatApi: { getPermissionConfig: () => Promise.resolve({ mode: 'default' }), cancelTask: vi.fn() },
}))
vi.mock('@/services/documents', () => ({ documentsApi: { upload: vi.fn() } }))

const running: RunningItem[] = [
  { id: 'w1', kind: 'workflow', title: 'review-changes', progress: { settled: 3, total: 8 }, anchorId: 'w1' },
  { id: 'a1', kind: 'agent', title: 'Map the backend', anchorId: 'a1' },
]

function mount({ activity, isStreaming = false }: { activity?: RunningItem[]; isStreaming?: boolean }) {
  return render(
    <Provider store={createStore()}>
      <ChatInput onSend={() => {}} onInterrupt={() => {}} isStreaming={isStreaming} sessionId="session-1" activity={activity} />
    </Provider>,
  )
}

/** Composing while a response streams puts the message in the queue. */
const queueOne = (text: string) => {
  const textarea = screen.getByRole('textbox')
  fireEvent.change(textarea, { target: { value: text } })
  fireEvent.keyDown(textarea, { key: 'Enter' })
}

describe('ChatInput — activity and queue tray', () => {
  it('draws no tray when nothing runs and nothing is queued', () => {
    mount({})
    expect(screen.queryByTestId('composer-tray')).toBeNull()
    expect(screen.queryByTestId('activity-bar')).toBeNull()
  })

  it('without a queue: the tray holds the activity bar alone', () => {
    mount({ activity: running })
    const tray = screen.getByTestId('composer-tray')
    expect(within(tray).getByRole('button', { name: 'Running: 1 workflow, 1 agent' })).toBeInTheDocument()
    expect(within(tray).queryByTestId('message-queue')).toBeNull()
  })

  it('without activity: the tray holds the queue alone', () => {
    mount({ isStreaming: true })
    queueOne('also fix the test')
    const tray = screen.getByTestId('composer-tray')
    expect(within(tray).getByTestId('message-queue')).toHaveTextContent('1 message queued')
    expect(within(tray).queryByTestId('activity-bar')).toBeNull()
  })

  it('with both: ONE card, activity above the queue, a single outline', () => {
    mount({ activity: running, isStreaming: true })
    queueOne('also fix the test')
    expect(screen.getAllByTestId('composer-tray')).toHaveLength(1)
    const tray = screen.getByTestId('composer-tray')
    const bar = within(tray).getByTestId('activity-bar')
    const queue = within(tray).getByTestId('message-queue')
    expect(bar.compareDocumentPosition(queue) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(tray.className).toContain('border')
    expect(queue.className).not.toContain('border')
    expect(queue).toHaveTextContent('also fix the test')
  })

  it('sits above the textarea, in the flow of the composer column', () => {
    mount({ activity: running })
    const tray = screen.getByTestId('composer-tray')
    expect(tray.compareDocumentPosition(screen.getByRole('textbox')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(tray.className).not.toMatch(/\babsolute\b|\bfixed\b/)
  })

  it('no longer shows the Monitor/Bash pill in the composer toolbar', () => {
    mount({ activity: [{ id: 'm1', kind: 'monitor', title: 'tail', anchorId: 'm1', taskId: 'm1' }] })
    expect(screen.queryByTitle('Background tasks running on this session')).toBeNull()
    expect(screen.getByRole('button', { name: 'Running: 1 monitor' })).toBeInTheDocument()
  })
})
