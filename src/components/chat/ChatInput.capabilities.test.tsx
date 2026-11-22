/**
 * The composer, by capability: images refused when the model takes none, and
 * a disabled composer that always says why.
 *
 * Run with: npx vitest run src/components/chat/ChatInput.capabilities.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { chatSessionCapabilitiesSnapshotAtom, chatSessionEngineAtom, chatSessionIdAtom, chatSessionProviderAtom } from '@/atoms'

const IMAGES_UNSUPPORTED_TEXT = 'This model does not accept images.'
import { ChatInput } from './ChatInput'
import { ChatCapabilitiesProvider } from './ChatSessionContext'
import { CLAUDE_CODE_CAPABILITIES } from '@/types/provider'

vi.mock('@/hooks', () => ({ useIsMobile: () => false }))
vi.mock('@/services/chat', () => ({
  chatApi: { getPermissionConfig: () => Promise.resolve({ mode: 'default' }), cancelTools: vi.fn() },
}))
vi.mock('@/services/documents', () => ({
  documentsApi: { upload: vi.fn(() => new Promise(() => {})) },
}))

const { chatApi } = await import('@/services/chat')
const { documentsApi } = await import('@/services/documents')
const uploadMock = documentsApi.upload as unknown as ReturnType<typeof vi.fn>

const png = new File([new Uint8Array([1])], 'shot.png', { type: 'image/png' })
const pdf = new File([new Uint8Array([1])], 'spec.pdf', { type: 'application/pdf' })
const untypedImage = new File([new Uint8Array([1])], 'photo.HEIC', { type: '' })

function setup(options: { images?: boolean; disabled?: boolean; disabledReason?: string; agentEngine?: boolean } = {}) {
  const store = createStore()
  store.set(chatSessionIdAtom, 's1')
  if (options.agentEngine) store.set(chatSessionEngineAtom, { engine: 'agent', degraded: ['message_queue'] })
  if (options.images !== undefined) {
    store.set(chatSessionProviderAtom, { id: 'local-llama', kind: 'openai_compatible' })
    store.set(chatSessionCapabilitiesSnapshotAtom, { images: options.images })
  }
  const utils = render(
    <Provider store={store}>
      <ChatInput
        onSend={vi.fn()}
        onQueue={() => {}}
        onQueueOp={() => {}}
        onInterrupt={vi.fn()}
        isStreaming={false}
        sessionId="s1"
        disabled={options.disabled}
        disabledReason={options.disabledReason}
      />
    </Provider>,
  )
  const fileInput = utils.container.querySelector('input[type="file"]') as HTMLInputElement
  return { ...utils, fileInput, textarea: screen.getByPlaceholderText('Send a message...') }
}

beforeEach(() => {
  uploadMock.mockClear()
  vi.mocked(chatApi.cancelTools).mockClear()
})

describe('images refused: whose limit it is', () => {
  it('declared false by the model: the model is named, not the engine', () => {
    const { fileInput } = setup({ images: false, agentEngine: true })
    fireEvent.change(fileInput, { target: { files: [png] } })
    const notice = screen.getByRole('alert').textContent ?? ''
    expect(notice).toContain(IMAGES_UNSUPPORTED_TEXT)
    expect(notice).not.toMatch(/agent engine/)
  })

  it('declared by nobody, on the agent engine: the engine is named, not the model', () => {
    const { fileInput } = setup({ agentEngine: true })
    fireEvent.change(fileInput, { target: { files: [png] } })
    expect(uploadMock).not.toHaveBeenCalled()
    const notice = screen.getByRole('alert').textContent ?? ''
    expect(notice).toMatch(/agent engine does not pass images to the model yet/)
    expect(notice).not.toContain(IMAGES_UNSUPPORTED_TEXT)
    expect(notice).toContain('shot.png')
  })
})

describe('images: false', () => {
  it('an image is refused when added, with the reason on screen; nothing is uploaded', () => {
    const { fileInput } = setup({ images: false })
    fireEvent.change(fileInput, { target: { files: [png] } })
    expect(uploadMock).not.toHaveBeenCalled()
    expect(screen.queryByTestId('attachment-chip')).toBeNull()
    const notice = screen.getByRole('alert')
    expect(notice.textContent).toContain(IMAGES_UNSUPPORTED_TEXT)
    expect(notice.textContent).toContain('shot.png')
  })

  it('other documents go through, in the same drop', () => {
    const { fileInput } = setup({ images: false })
    fireEvent.change(fileInput, { target: { files: [png, pdf] } })
    expect(uploadMock).toHaveBeenCalledTimes(1)
    expect(uploadMock.mock.calls[0][0]).toBe(pdf)
    expect(screen.getByRole('alert').textContent).toContain('shot.png')
  })

  it('a pasted screenshot is refused too', () => {
    const { textarea } = setup({ images: false })
    fireEvent.paste(textarea, {
      clipboardData: { items: [{ kind: 'file', type: 'image/png', getAsFile: () => png }] },
    })
    expect(uploadMock).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain(IMAGES_UNSUPPORTED_TEXT)
    // It floats over the transcript: glass, not a see-through tint.
    const notice = screen.getByTestId('images-refused')
    expect(notice.className).toContain('backdrop-blur-md')
    expect(notice.className).toMatch(/(?:^|\s)bg-surface-base\/(?:[6-9]\d|100)(?:\s|$)/)
  })

  it('an image the browser gave no MIME type is recognised by its extension', () => {
    const { fileInput } = setup({ images: false })
    fireEvent.change(fileInput, { target: { files: [untypedImage] } })
    expect(uploadMock).not.toHaveBeenCalled()
  })

  it('the notice goes away once an accepted file is added', () => {
    const { fileInput } = setup({ images: false })
    fireEvent.change(fileInput, { target: { files: [png] } })
    fireEvent.change(fileInput, { target: { files: [pdf] } })
    expect(screen.queryByTestId('images-refused')).toBeNull()
  })
})

describe('images: true / Claude profile', () => {
  it('images: true — an image uploads as before', () => {
    const { fileInput } = setup({ images: true })
    fireEvent.change(fileInput, { target: { files: [png] } })
    expect(uploadMock).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('images-refused')).toBeNull()
  })

  it('no provider at all (legacy session) — an image uploads as before', () => {
    const { fileInput } = setup()
    fireEvent.change(fileInput, { target: { files: [png] } })
    expect(uploadMock).toHaveBeenCalledTimes(1)
  })
})

describe('a disabled composer says why', () => {
  it('shows the reason and ties it to the textarea', () => {
    const { textarea } = setup({ disabled: true, disabledReason: 'This provider cannot resume a conversation.' })
    expect((textarea as HTMLTextAreaElement).disabled).toBe(true)
    const reason = screen.getByTestId('composer-disabled-reason')
    expect(reason.textContent).toBe('This provider cannot resume a conversation.')
    expect(textarea.getAttribute('aria-describedby')).toBe(reason.id)
  })

  it('an enabled composer shows no reason, even if one is passed', () => {
    const { textarea } = setup({ disabled: false, disabledReason: 'stale' })
    expect(screen.queryByTestId('composer-disabled-reason')).toBeNull()
    expect(textarea.getAttribute('aria-describedby')).toBeNull()
  })
})


describe('session-wide cancellation in the real composer', () => {
  it('sends the session-wide request only after an explicit confirmation', async () => {
    vi.mocked(chatApi.cancelTools).mockResolvedValueOnce({ capped: false, killed_pids: [1], cli_pid: null })
    render(<Provider store={createStore()}><ChatCapabilitiesProvider capabilities={CLAUDE_CODE_CAPABILITIES}><ChatInput onSend={vi.fn()} onQueue={() => {}} onQueueOp={() => {}} onInterrupt={vi.fn()} isStreaming={false} sessionId="s1" /></ChatCapabilitiesProvider></Provider>)
    fireEvent.click(screen.getByRole('button', { name: 'Stop session tools, including sub-agent tools' }))
    expect(chatApi.cancelTools).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Send interruption to session and sub-agent tools' }))
    expect(chatApi.cancelTools).toHaveBeenCalledTimes(1)
    expect(chatApi.cancelTools).toHaveBeenCalledWith('s1', expect.any(Function), expect.any(AbortSignal))
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('does not guarantee processes stopped'))
  })
  it.each([true, false])('reflects tool_cancel=%s without sending on opening or when unsupported', (supported) => {
    const store = createStore()
    render(<Provider store={store}><ChatCapabilitiesProvider capabilities={{ ...CLAUDE_CODE_CAPABILITIES, tool_cancel: supported }}><ChatInput onSend={vi.fn()} onQueue={() => {}} onQueueOp={() => {}} onInterrupt={vi.fn()} isStreaming={false} sessionId="s1" /></ChatCapabilitiesProvider></Provider>)
    const button = screen.getByRole('button', { name: 'Stop session tools, including sub-agent tools' }) as HTMLButtonElement
    expect(button.disabled).toBe(!supported)
    if (supported) {
      fireEvent.click(button)
      expect(screen.getByText(/Sub-agents’ tool processes can also be affected when they are descendants/)).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Send interruption to session and sub-agent tools' })).toBeTruthy()
    } else {
      expect(screen.getByText('This provider cannot stop all tools in this session.')).toBeTruthy()
      expect(document.getElementById(button.getAttribute('aria-describedby')!)?.textContent).toBe('This provider cannot stop all tools in this session.')
      fireEvent.click(button)
      expect(screen.queryByRole('button', { name: 'Send interruption to session and sub-agent tools' })).toBeNull()
    }
    expect(chatApi.cancelTools).not.toHaveBeenCalled()
  })
})
