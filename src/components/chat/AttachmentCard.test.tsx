/**
 * Every family gets a representation, and none is a dead end.
 *
 * What is guarded here: a picture shows itself, a PDF opens in the browser's
 * viewer, a document shows its EXTRACTED TEXT (the server already read it), an
 * archive says why it cannot be shown — and all of them can be downloaded.
 * The quiet failure this replaces is a single paperclip icon for everything.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { MessageAttachment } from '@/utils/messageAttachments'

const { blobMock, chunksMock } = vi.hoisted(() => ({
  blobMock: vi.fn(),
  chunksMock: vi.fn(),
}))
vi.mock('@/services/api', () => ({ api: { blob: blobMock } }))
vi.mock('@/services/documents', () => ({ documentsApi: { getChunks: chunksMock } }))

// The Dialog pulls in motion, which reads the reduced-motion media query —
// absent in jsdom (same shim as Dialog.test.tsx and the viz tests).
vi.stubGlobal('matchMedia', (query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
}))

import { AttachmentCard } from './AttachmentCard'
import { documentFiles, documentTexts } from './useDocumentContent'

const attachment = (over: Partial<MessageAttachment> = {}): MessageAttachment => ({
  id: 'd1',
  filename: 'shot.png',
  mime_type: 'image/png',
  size_bytes: 2048,
  ...over,
})

let created: string[] = []
let revoked: string[] = []

beforeEach(() => {
  created = []
  revoked = []
  let n = 0
  URL.createObjectURL = vi.fn(() => {
    const url = `blob:test-${++n}`
    created.push(url)
    return url
  }) as unknown as typeof URL.createObjectURL
  URL.revokeObjectURL = vi.fn((url: string) => {
    revoked.push(url)
  }) as unknown as typeof URL.revokeObjectURL
  blobMock.mockReset().mockResolvedValue(new Blob(['x'], { type: 'image/png' }))
  chunksMock.mockReset().mockResolvedValue({ items: [], total: 0 })
  documentFiles.clear()
  documentTexts.clear()
})

/** The chip is the trigger; the dialog renders into a portal on `document.body`. */
async function open(over: Partial<MessageAttachment>) {
  const att = attachment(over)
  render(<AttachmentCard attachment={att} />)
  fireEvent.click(screen.getByRole('button', { name: `Open ${att.filename}` }))
  return screen.findByRole('dialog')
}

describe('a picture', () => {
  it('shows itself in the transcript', async () => {
    render(<AttachmentCard attachment={attachment()} />)
    const img = await screen.findByRole('img', { name: 'shot.png' })
    expect(img.getAttribute('src')).toBe('blob:test-1')
  })

  it('opens the full picture, and revokes it on unmount', async () => {
    const { unmount } = render(<AttachmentCard attachment={attachment()} />)
    await screen.findByRole('img', { name: 'shot.png' })
    fireEvent.click(screen.getByRole('button', { name: 'Open shot.png' }))

    const dialog = await screen.findByRole('dialog')
    // The dialog has its OWN object URL: each component that draws the bytes
    // owns the one it revokes, and a Blob can back as many as it needs.
    expect(dialog.querySelector('img')?.getAttribute('src')).toMatch(/^blob:/)
    expect(dialog.querySelector('img')?.getAttribute('alt')).toBe('shot.png')

    unmount()
    expect([...revoked].sort()).toEqual([...created].sort())
  })

  it('falls back to the chip when the bytes cannot be read', async () => {
    blobMock.mockRejectedValue(new Error('404'))
    render(<AttachmentCard attachment={attachment()} />)
    expect(screen.getByText('shot.png')).toBeTruthy()
    await waitFor(() => expect(blobMock).toHaveBeenCalled())
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByText('2.0 KB')).toBeTruthy()
  })
})

describe('a PDF', () => {
  it('is a chip in the transcript, fetched only when opened', async () => {
    render(<AttachmentCard attachment={attachment({ filename: 'report.pdf', mime_type: 'application/pdf' })} />)
    expect(screen.getByText('report.pdf')).toBeTruthy()
    // A list of messages must not download every PDF ever attached.
    expect(blobMock).not.toHaveBeenCalled()
  })

  it('opens in the browser viewer, from a blob URL typed as a PDF', async () => {
    const dialog = await open({ filename: 'report.pdf', mime_type: 'application/pdf' })
    await waitFor(() => expect(dialog.querySelector('iframe')).not.toBeNull())
    expect(dialog.querySelector('iframe')?.getAttribute('src')).toBe('blob:test-1')
    expect(blobMock.mock.calls[0][0]).toBe('/documents/d1/raw')
  })
})

describe('a document the server read', () => {
  it('shows its extracted text — not "cannot preview"', async () => {
    chunksMock.mockResolvedValue({
      items: [
        { id: 'c1', text: 'Hello from the docx', start: 0, end: 19 },
        { id: 'c2', text: 'second chunk', start: 19, end: 31 },
      ],
      total: 2,
    })
    const dialog = await open({
      filename: 'notes.md',
      mime_type: 'text/plain; charset=utf-8',
    })

    expect(await screen.findByText(/Hello from the docx/)).toBeTruthy()
    expect(dialog.textContent).toContain('second chunk')
  })

  it('says so when nothing was extracted', async () => {
    await open({ filename: 'notes.md', mime_type: 'text/plain; charset=utf-8' })
    expect(
      await screen.findByText(/No text could be extracted from this file/),
    ).toBeTruthy()
  })
})

describe('an archive', () => {
  it('explains that it cannot be shown, and still offers the download', async () => {
    await open({ filename: 'bundle.zip', mime_type: 'application/zip' })

    expect(await screen.findByText(/This format cannot be shown here/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Download/ })).toBeTruthy()
    // Nothing was fetched for it until the download is asked for.
    expect(blobMock).not.toHaveBeenCalled()
  })
})

describe('media the server could not name', () => {
  it('plays an mp3 from a blob retyped audio/mpeg', async () => {
    await open({ filename: 'podcast.mp3', mime_type: 'application/octet-stream' })

    const audio = await waitFor(() => {
      const el = document.querySelector('audio')
      if (!el) throw new Error('pas encore monté')
      return el
    })
    expect(audio.getAttribute('src')).toBe('blob:test-1')
  })
})

describe('the download', () => {
  it('reads the bytes with the bearer token instead of opening a bare URL', async () => {
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {})
    await open({ filename: 'bundle.zip', mime_type: 'application/zip' })

    fireEvent.click(screen.getByRole('button', { name: /Download/ }))

    await waitFor(() => expect(click).toHaveBeenCalled())
    expect(blobMock.mock.calls[0][0]).toBe('/documents/d1/raw')
    click.mockRestore()
  })
})
