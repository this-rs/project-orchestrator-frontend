/**
 * Wiring tests for attachments in the composer.
 *
 * The rules themselves are tested without rendering in
 * `attachmentState.test.ts`. What is checked here is only what a component
 * test can check and a unit test cannot:
 *
 * - the three ways to add a file all reach the same code — including paste,
 *   which is how a screenshot actually gets attached;
 * - the upload starts when the file is added, not when the message is sent;
 * - a send never carries an id the server has not issued yet.
 *
 * The server is mocked: the backend is being written in parallel.
 *
 * Run with: npx vitest run src/components/chat/ChatInput.attachments.test.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { ChatInput } from './ChatInput'
import { ApiError } from '@/services/api'
import type { DocumentDetail } from '@/types'

// `@/hooks` is mocked wholesale so the test does not drag in `useChat`;
// ChatInput only uses `useIsMobile` from it.
vi.mock('@/hooks', () => ({ useIsMobile: () => false }))
vi.mock('@/services/chat', () => ({
  chatApi: { getPermissionConfig: () => Promise.resolve({ mode: 'default' }) },
}))
vi.mock('@/services/documents', () => ({
  documentsApi: { upload: vi.fn() },
}))

const { documentsApi } = await import('@/services/documents')
const uploadMock = documentsApi.upload as unknown as ReturnType<typeof vi.fn>

/** One upload the test drives by hand. */
function deferredUpload() {
  let resolve!: (doc: DocumentDetail) => void
  let reject!: (err: unknown) => void
  let onProgress: ((p: number) => void) | undefined
  const promise = new Promise<DocumentDetail>((res, rej) => {
    resolve = res
    reject = rej
  })
  uploadMock.mockImplementationOnce((_file: File, opts: { onProgress?: (p: number) => void }) => {
    onProgress = opts?.onProgress
    return promise
  })
  return {
    resolve,
    reject,
    progress: (p: number) => onProgress?.(p),
  }
}

const doc = (id: string, warnings: string[] = []): DocumentDetail => ({
  id,
  filename: 'shot.png',
  format: 'png',
  size_bytes: 3,
  sha256: 'a'.repeat(64),
  page_count: 1,
  chunk_count: 1,
  warnings,
})

const pngFile = (name = 'shot.png') =>
  new File([new Uint8Array([1, 2, 3])], name, { type: 'image/png' })

function setup() {
  const onSend = vi.fn()
  const store = createStore()
  const utils = render(
    <Provider store={store}>
      <ChatInput onSend={onSend} onInterrupt={vi.fn()} isStreaming={false} sessionId="s1" />
    </Provider>,
  )
  const textarea = screen.getByPlaceholderText('Send a message...')
  const fileInput = utils.container.querySelector('input[type="file"]') as HTMLInputElement
  const type = (text: string) => fireEvent.change(textarea, { target: { value: text } })
  const send = () => fireEvent.click(screen.getByTitle(/Send message|upload|failed attachment/i))
  return { ...utils, onSend, store, textarea, fileInput, type, send }
}

beforeEach(() => {
  uploadMock.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Three ways in
// ---------------------------------------------------------------------------

describe('adding a file', () => {
  it('starts the upload from the file picker, before any send', async () => {
    const upload = deferredUpload()
    const { fileInput, onSend } = setup()

    fireEvent.change(fileInput, { target: { files: [pngFile()] } })

    // The point of the whole feature: the request is already in flight while
    // the user is still typing.
    expect(uploadMock).toHaveBeenCalledTimes(1)
    expect(onSend).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByTestId('attachment-chip').getAttribute('data-status')).toBe('uploading'))
    upload.resolve(doc('doc-1'))
  })

  it('starts the upload from a paste — the screenshot path', async () => {
    const upload = deferredUpload()
    const { textarea } = setup()

    fireEvent.paste(textarea, {
      clipboardData: {
        items: [{ kind: 'file', type: 'image/png', getAsFile: () => pngFile('image.png') }],
      },
    })

    expect(uploadMock).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.getByTestId('attachment-chip')).toBeTruthy())
    upload.resolve(doc('doc-1'))
  })

  it('leaves a plain text paste completely alone', () => {
    const { textarea } = setup()
    fireEvent.paste(textarea, {
      clipboardData: { items: [{ kind: 'string', type: 'text/plain', getAsFile: () => null }] },
    })
    expect(uploadMock).not.toHaveBeenCalled()
    expect(screen.queryByTestId('attachment-chip')).toBeNull()
  })

  it('starts the upload from a drop on the composer', async () => {
    const upload = deferredUpload()
    const { container } = setup()
    const composer = container.firstElementChild as HTMLElement

    fireEvent.drop(composer, {
      dataTransfer: { types: ['Files'], files: [pngFile()] },
    })

    expect(uploadMock).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.getByTestId('attachment-chip')).toBeTruthy())
    upload.resolve(doc('doc-1'))
  })

  it('ignores a drag that carries no file, so dragging text does not open a drop zone', () => {
    const { container } = setup()
    const composer = container.firstElementChild as HTMLElement
    fireEvent.dragEnter(composer, { dataTransfer: { types: ['text/plain'], files: [] } })
    expect(screen.queryByText('Drop to attach')).toBeNull()
  })

  it('shows upload progress on the chip', async () => {
    const upload = deferredUpload()
    const { fileInput } = setup()
    fireEvent.change(fileInput, { target: { files: [pngFile()] } })
    upload.progress(42)
    await waitFor(() => expect(screen.getByText(/42%/)).toBeTruthy())
    upload.resolve(doc('doc-1'))
  })
})

// ---------------------------------------------------------------------------
// Never send an id that does not exist yet
// ---------------------------------------------------------------------------

describe('sending with attachments', () => {
  it('holds the send while the upload runs, then dispatches with the server id', async () => {
    const upload = deferredUpload()
    const { fileInput, type, send, onSend } = setup()

    fireEvent.change(fileInput, { target: { files: [pngFile()] } })
    type('look at this')
    send()

    // Held, not dropped, and said so on screen.
    expect(onSend).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByTestId('attachment-pending-send')).toBeTruthy())

    upload.resolve(doc('doc-7'))

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1))
    expect(onSend).toHaveBeenCalledWith('look at this', ['doc-7'])
    // The composer is emptied only once the message has actually left.
    await waitFor(() => expect(screen.queryByTestId('attachment-chip')).toBeNull())
  })

  it('sends immediately when the upload already finished', async () => {
    const upload = deferredUpload()
    const { fileInput, type, send, onSend } = setup()

    fireEvent.change(fileInput, { target: { files: [pngFile()] } })
    upload.resolve(doc('doc-7'))
    await waitFor(() => expect(screen.getByTestId('attachment-chip').getAttribute('data-status')).toBe('ready'))

    type('here')
    send()
    expect(onSend).toHaveBeenCalledWith('here', ['doc-7'])
  })

  it('waits for the slowest of several uploads and sends every id at once', async () => {
    const first = deferredUpload()
    const second = deferredUpload()
    const { fileInput, type, send, onSend } = setup()

    fireEvent.change(fileInput, { target: { files: [pngFile('a.png'), pngFile('b.png')] } })
    type('two files')
    send()

    first.resolve(doc('doc-1'))
    await waitFor(() => expect(screen.getAllByTestId('attachment-chip')[0].getAttribute('data-status')).toBe('ready'))
    // One still in flight — nothing may leave yet.
    expect(onSend).not.toHaveBeenCalled()

    second.resolve(doc('doc-2'))
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1))
    expect(onSend).toHaveBeenCalledWith('two files', ['doc-1', 'doc-2'])
  })

  it('never sends twice when a held send resolves', async () => {
    const upload = deferredUpload()
    const { fileInput, type, send, onSend } = setup()
    fireEvent.change(fileInput, { target: { files: [pngFile()] } })
    type('once')
    send()
    send() // impatient second click while it is held
    upload.resolve(doc('doc-7'))
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1))
  })
})

// ---------------------------------------------------------------------------
// Failures
// ---------------------------------------------------------------------------

describe('upload failures', () => {
  it('shows the server message on the failing chip and blocks the send', async () => {
    const upload = deferredUpload()
    const { fileInput, type, onSend } = setup()

    fireEvent.change(fileInput, { target: { files: [pngFile()] } })
    upload.reject(new ApiError(413, 'Maximum size is 25 MB'))

    await waitFor(() => expect(screen.getByTestId('attachment-chip').getAttribute('data-status')).toBe('error'))
    expect(screen.getByText('Maximum size is 25 MB')).toBeTruthy()

    type('please')
    expect((screen.getByTitle('Remove the failed attachment first') as HTMLButtonElement).disabled).toBe(true)
    expect(onSend).not.toHaveBeenCalled()
  })

  it('releases a held send instead of leaving the message stuck for ever', async () => {
    const upload = deferredUpload()
    const { fileInput, type, send, onSend } = setup()

    fireEvent.change(fileInput, { target: { files: [pngFile()] } })
    type('please')
    send()
    await waitFor(() => expect(screen.getByTestId('attachment-pending-send')).toBeTruthy())

    upload.reject(new ApiError(415, 'Format not supported'))

    await waitFor(() => expect(screen.queryByTestId('attachment-pending-send')).toBeNull())
    expect(onSend).not.toHaveBeenCalled()
    // The text is still there, so nothing the user wrote was lost.
    expect((screen.getByPlaceholderText('Send a message...') as HTMLTextAreaElement).value).toBe('please')
  })

  it('removing the failed chip unblocks the send', async () => {
    const upload = deferredUpload()
    const { fileInput, type, onSend } = setup()

    fireEvent.change(fileInput, { target: { files: [pngFile()] } })
    upload.reject(new ApiError(422, 'File is damaged'))
    await waitFor(() => expect(screen.getByTestId('attachment-chip').getAttribute('data-status')).toBe('error'))

    type('please')
    fireEvent.click(screen.getByLabelText('Remove shot.png'))

    fireEvent.click(screen.getByTitle('Send message'))
    expect(onSend).toHaveBeenCalledWith('please', [])
  })
})

// ---------------------------------------------------------------------------
// Session purge
// ---------------------------------------------------------------------------

describe('session switch', () => {
  it('drops the attachments so they cannot follow the user into another session', async () => {
    const upload = deferredUpload()
    const onSend = vi.fn()
    const store = createStore()
    const { rerender, container } = render(
      <Provider store={store}>
        <ChatInput onSend={onSend} onInterrupt={vi.fn()} isStreaming={false} sessionId="s1" />
      </Provider>,
    )
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(fileInput, { target: { files: [pngFile()] } })
    await waitFor(() => expect(screen.getByTestId('attachment-chip')).toBeTruthy())

    rerender(
      <Provider store={store}>
        <ChatInput onSend={onSend} onInterrupt={vi.fn()} isStreaming={false} sessionId="s2" />
      </Provider>,
    )

    await waitFor(() => expect(screen.queryByTestId('attachment-chip')).toBeNull())
    // The aborted upload must not resurrect the chip when it finally settles.
    upload.reject(new DOMException('The operation was aborted.', 'AbortError'))
    await waitFor(() => expect(screen.queryByTestId('attachment-chip')).toBeNull())
  })
})
