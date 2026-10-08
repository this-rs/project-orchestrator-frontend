/**
 * Dropping a reference on the composer — and the file drop it must not break.
 *
 * Run with: npx vitest run src/refs/source/__tests__/composerDrop.test.tsx
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { MemoryRouter } from 'react-router-dom'
import { chatDraftInputAtom, chatServerFeaturesAtom } from '@/atoms'
import { ChatInput } from '@/components/chat/ChatInput'
import { ReferenceSourceHost, chatComposerBlockedAtom } from '..'
import { PLAN_ID, TASK_ID, makeDataTransfer } from './testDnd'

vi.mock('@/hooks', () => ({ useIsMobile: () => false }))
vi.mock('@/services/chat', () => ({ chatApi: { getPermissionConfig: () => Promise.resolve({ mode: 'default' }) } }))
const { upload } = vi.hoisted(() => ({ upload: vi.fn() }))
vi.mock('@/services/documents', () => ({ documentsApi: { upload } }))

let store: ReturnType<typeof createStore>
let onSend: ReturnType<typeof vi.fn>
let onQueue: ReturnType<typeof vi.fn>

function mount(opts: { features?: string[]; streaming?: boolean; disabled?: boolean } = {}) {
  store.set(chatServerFeaturesAtom, opts.features ?? ['refs_v1'])
  const view = render(
    <Provider store={store}>
      <MemoryRouter>
        <ReferenceSourceHost />
        <div data-testid="source" data-po-ref={`plan:${PLAN_ID}`} data-po-ref-label="Auth flow" draggable>
          source
        </div>
        <ChatInput onSend={onSend} onQueue={onQueue} onQueueOp={() => {}} onInterrupt={() => {}} isStreaming={opts.streaming ?? false} disabled={opts.disabled} sessionId="s1" />
      </MemoryRouter>
    </Provider>,
  )
  return { composer: screen.getByRole(screen.queryByRole('combobox') ? 'combobox' : 'textbox').closest('[class*="pointer-events-none"]') as HTMLElement, view }
}

/** A real drag: dragstart on the source (the host fills the payload), then the events on the target. */
function dragFromSource() {
  const dt = makeDataTransfer()
  fireEvent.dragStart(screen.getByTestId('source'), { dataTransfer: dt })
  return dt
}

beforeEach(() => {
  store = createStore()
  onSend = vi.fn()
  onQueue = vi.fn()
  upload.mockReset()
  localStorage.clear()
})

describe('drop of a reference on the composer', () => {
  it('shows a hover frame WITH words, accepts the drop, and turns it into a token + chip', () => {
    const { composer } = mount()
    const dt = dragFromSource()
    fireEvent.dragEnter(composer, { dataTransfer: dt })
    expect(screen.getByTestId('ref-drop-overlay').textContent).toContain('Drop to add “Auth flow” to the message')
    // Dropping is only possible if dragover was cancelled.
    expect(fireEvent.dragOver(composer, { dataTransfer: dt })).toBe(false)
    expect(dt.dropEffect).toBe('copy')
    fireEvent.drop(composer, { dataTransfer: dt })
    expect(screen.queryByTestId('ref-drop-overlay')).toBeNull()
    expect(store.get(chatDraftInputAtom)).toBe(`#plan:${PLAN_ID} `)
    expect(screen.getByTestId('reference-chip').textContent).toContain('Auth flow')
    expect(screen.getByTestId('refs-add-announcer').textContent).toContain('Auth flow added to the message.')
  })

  it('a send then carries refs[] exactly as if the user had picked it with #', () => {
    const { composer } = mount()
    const dt = dragFromSource()
    fireEvent.drop(composer, { dataTransfer: dt })
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' })
    expect(onSend).toHaveBeenCalledTimes(1)
    expect(onSend.mock.calls[0][2]).toEqual([{ kind: 'plan', id: PLAN_ID, label: 'Auth flow' }])
  })

  it('dropping the same entity twice leaves ONE reference', () => {
    const { composer } = mount()
    fireEvent.drop(composer, { dataTransfer: dragFromSource() })
    fireEvent.drop(composer, { dataTransfer: dragFromSource() })
    expect(screen.getAllByTestId('reference-chip')).toHaveLength(1)
    expect(store.get(chatDraftInputAtom).match(/#plan:/g)).toHaveLength(1)
    expect(screen.getByTestId('refs-add-announcer').textContent).toContain('already in the message')
  })

  it('works when the webview dropped the custom type and left only text/plain (WKWebView)', () => {
    const { composer } = mount()
    fireEvent.dragStart(screen.getByTestId('source'), { dataTransfer: makeDataTransfer() })
    const onlyText = makeDataTransfer({ 'text/plain': `#plan:${PLAN_ID}` })
    expect(fireEvent.dragOver(composer, { dataTransfer: onlyText })).toBe(false)
    fireEvent.drop(composer, { dataTransfer: onlyText })
    expect(store.get(chatDraftInputAtom)).toBe(`#plan:${PLAN_ID} `)
  })

  it('accepts a drop while the conversation is streaming (the message is composed, then queued)', () => {
    const { composer } = mount({ streaming: true })
    fireEvent.drop(composer, { dataTransfer: dragFromSource() })
    expect(store.get(chatDraftInputAtom)).toBe(`#plan:${PLAN_ID} `)
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' })
    expect(onQueue.mock.calls[0][2]).toEqual([{ kind: 'plan', id: PLAN_ID, label: 'Auth flow' }])
  })

  it('on a disabled composer: refused with the reason, no token, no chip', () => {
    const { composer } = mount({ disabled: true })
    store.set(chatComposerBlockedAtom, 'read-only conversation')
    fireEvent.drop(composer, { dataTransfer: dragFromSource() })
    expect(store.get(chatDraftInputAtom)).toBe('')
    expect(screen.queryByTestId('reference-chip')).toBeNull()
    expect(screen.getByTestId('refs-add-announcer').textContent).toContain('read-only conversation')
  })

  it('does not touch a drag of selected text, nor anything when refs_v1 is off', () => {
    const { composer } = mount()
    const text = makeDataTransfer({ 'text/plain': `#plan:${PLAN_ID}` }) // typed text, no dragstart seen by the host
    expect(fireEvent.dragOver(composer, { dataTransfer: text })).toBe(true)
    fireEvent.drop(composer, { dataTransfer: text })
    expect(store.get(chatDraftInputAtom)).toBe('')
  })

  it('refs_v1 off: a ref payload is ignored by the composer', () => {
    const { composer } = mount({ features: [] })
    const dt = makeDataTransfer({ 'application/x-po-ref': JSON.stringify({ kind: 'task', id: TASK_ID }) })
    expect(fireEvent.dragOver(composer, { dataTransfer: dt })).toBe(true)
    fireEvent.drop(composer, { dataTransfer: dt })
    expect(store.get(chatDraftInputAtom)).toBe('')
  })
})

describe('the file drop is untouched', () => {
  it('still attaches a dropped file with refs_v1 on, and a file drop adds no reference', () => {
    upload.mockReturnValue(new Promise(() => {}))
    const { composer } = mount()
    const file = new File(['x'], 'shot.png', { type: 'image/png' })
    const dt = makeDataTransfer({}, [file])
    expect(fireEvent.dragOver(composer, { dataTransfer: dt })).toBe(false)
    fireEvent.dragEnter(composer, { dataTransfer: dt })
    expect(screen.getByText('Drop to attach')).toBeTruthy()
    expect(screen.queryByTestId('ref-drop-overlay')).toBeNull()
    fireEvent.drop(composer, { dataTransfer: dt })
    expect(upload).toHaveBeenCalledTimes(1)
    expect(store.get(chatDraftInputAtom)).toBe('')
  })

  it('an image file dropped with refs_v1 on and a reference in flight never gets mistaken for it', () => {
    upload.mockReturnValue(new Promise(() => {}))
    const { composer } = mount()
    const dt = makeDataTransfer({ 'application/x-po-ref': JSON.stringify({ kind: 'plan', id: PLAN_ID }) }, [new File(['x'], 'a.png', { type: 'image/png' })])
    fireEvent.drop(composer, { dataTransfer: dt })
    // Both facets are accepted: the file goes to the attachments, the reference to the draft; neither throws.
    expect(upload).toHaveBeenCalledTimes(1)
  })
})
