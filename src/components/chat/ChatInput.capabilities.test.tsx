/**
 * The composer, by capability: images refused when the model takes none, and
 * a disabled composer that always says why.
 *
 * Run with: npx vitest run src/components/chat/ChatInput.capabilities.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { chatSessionCapabilitiesSnapshotAtom, chatSessionIdAtom, chatSessionProviderAtom } from '@/atoms'
import { IMAGES_UNSUPPORTED_TEXT } from '@/constants/capabilities'
import { ChatInput } from './ChatInput'

vi.mock('@/hooks', () => ({ useIsMobile: () => false }))
vi.mock('@/services/chat', () => ({
  chatApi: { getPermissionConfig: () => Promise.resolve({ mode: 'default' }) },
}))
vi.mock('@/services/documents', () => ({
  documentsApi: { upload: vi.fn(() => new Promise(() => {})) },
}))

const { documentsApi } = await import('@/services/documents')
const uploadMock = documentsApi.upload as unknown as ReturnType<typeof vi.fn>

const png = new File([new Uint8Array([1])], 'shot.png', { type: 'image/png' })
const pdf = new File([new Uint8Array([1])], 'spec.pdf', { type: 'application/pdf' })
const untypedImage = new File([new Uint8Array([1])], 'photo.HEIC', { type: '' })

function setup(options: { images?: boolean; disabled?: boolean; disabledReason?: string } = {}) {
  const store = createStore()
  store.set(chatSessionIdAtom, 's1')
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
