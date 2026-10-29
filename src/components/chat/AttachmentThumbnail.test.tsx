/**
 * An image attached to a message must SHOW, and everything else must keep the
 * chip. The two failure modes worth guarding are the quiet ones: a PDF that
 * suddenly starts a download, and a picture whose bytes are unreachable
 * leaving an empty box where the filename used to be.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { MessageAttachment } from '@/utils/messageAttachments'

const { blobMock } = vi.hoisted(() => ({ blobMock: vi.fn() }))
vi.mock('@/services/api', () => ({ api: { blob: blobMock } }))

// The Dialog pulls in motion, which reads the reduced-motion media query —
// absent in jsdom (same shim as Dialog.test.tsx and the other viz tests).
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

import { AttachmentThumbnail } from './AttachmentThumbnail'
import { documentImages } from './useAttachmentImages'
import { isPreviewableImage } from './attachmentPreview'

const attachment = (over: Partial<MessageAttachment> = {}): MessageAttachment => ({
  id: 'd1',
  filename: 'shot.png',
  mime_type: 'image/png',
  size_bytes: 2048,
  ...over,
})

/** jsdom has no object-URL implementation; the numbers make revocation checkable. */
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
  blobMock.mockReset()
  documentImages.clear()
})

describe('isPreviewableImage', () => {
  it('accepts the four raster types the backend also records', () => {
    for (const type of ['image/png', 'image/jpeg', 'image/gif', 'image/webp']) {
      expect(isPreviewableImage(type)).toBe(true)
    }
  })

  it('ignores parameters, case and unknown types', () => {
    expect(isPreviewableImage('IMAGE/PNG; charset=binary')).toBe(true)
    expect(isPreviewableImage('image/svg+xml')).toBe(false)
    expect(isPreviewableImage('application/pdf')).toBe(false)
    expect(isPreviewableImage('')).toBe(false)
    expect(isPreviewableImage(null)).toBe(false)
  })
})

describe('<AttachmentThumbnail> on an image', () => {
  it('draws the picture once its bytes have been read', async () => {
    blobMock.mockResolvedValue(new Blob(['x'], { type: 'image/png' }))
    render(<AttachmentThumbnail attachment={attachment()} />)

    const img = await screen.findByRole('img', { name: 'shot.png' })
    expect(img.getAttribute('src')).toBe('blob:test-1')
    expect(blobMock).toHaveBeenCalledWith('/documents/d1/raw', expect.anything())
  })

  it('keeps the filename and the size in the accessible name and the dialog', async () => {
    blobMock.mockResolvedValue(new Blob(['x'], { type: 'image/png' }))
    render(<AttachmentThumbnail attachment={attachment()} />)

    const button = await screen.findByRole('button', { name: /shot\.png/ })
    fireEvent.click(button)
    // The enlarged view names the file and states its size.
    expect(await screen.findByText('2.0 KB')).toBeTruthy()
  })

  it('revokes the object URL when it goes away', async () => {
    blobMock.mockResolvedValue(new Blob(['x'], { type: 'image/png' }))
    const { unmount } = render(<AttachmentThumbnail attachment={attachment()} />)
    await screen.findByRole('img', { name: 'shot.png' })

    unmount()

    expect(revoked).toEqual(created)
  })

  it('falls back to the chip when the bytes cannot be read', async () => {
    blobMock.mockRejectedValue(new Error('404'))
    render(<AttachmentThumbnail attachment={attachment()} />)

    // The chip is there from the first frame and stays: nothing disappears.
    expect(screen.getByText('shot.png')).toBeTruthy()
    await waitFor(() => expect(blobMock).toHaveBeenCalled())
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByText('2.0 KB')).toBeTruthy()
  })
})

describe('<AttachmentThumbnail> on anything else', () => {
  it('shows the chip without downloading anything', () => {
    render(<AttachmentThumbnail attachment={attachment({ filename: 'report.pdf', mime_type: 'application/pdf' })} />)

    expect(screen.getByText('report.pdf')).toBeTruthy()
    expect(screen.queryByRole('img')).toBeNull()
    expect(blobMock).not.toHaveBeenCalled()
  })

  it('does not fetch an SVG — a picture the backend would not send inline either', () => {
    render(<AttachmentThumbnail attachment={attachment({ filename: 'plan.svg', mime_type: 'image/svg+xml' })} />)
    expect(screen.queryByRole('img')).toBeNull()
    expect(blobMock).not.toHaveBeenCalled()
  })
})
