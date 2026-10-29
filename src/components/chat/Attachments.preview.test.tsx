/**
 * The composer's own preview: the bytes are already in the browser, so the
 * picture must appear at once — and disappear (with its object URL) as soon as
 * the attachment does.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Attachments } from './Attachments'
import type { Attachment } from './attachmentState'

const att = (over: Partial<Attachment> = {}): Attachment => ({
  localId: 'l1',
  filename: 'shot.png',
  sizeBytes: 2048,
  mimeType: 'image/png',
  status: 'uploading',
  progress: 40,
  ...over,
})

const png = () => new File([new Uint8Array([137, 80, 78, 71])], 'shot.png', { type: 'image/png' })

let created: string[] = []
let revoked: string[] = []

beforeEach(() => {
  created = []
  revoked = []
  let n = 0
  URL.createObjectURL = vi.fn(() => {
    const url = `blob:local-${++n}`
    created.push(url)
    return url
  }) as unknown as typeof URL.createObjectURL
  URL.revokeObjectURL = vi.fn((url: string) => {
    revoked.push(url)
  }) as unknown as typeof URL.revokeObjectURL
})

describe('Attachments — local preview', () => {
  it('shows the picture of a file being uploaded, not a generic icon', () => {
    const { container } = render(
      <Attachments
        attachments={[att()]}
        onRemove={vi.fn()}
        files={new Map([['l1', png()]])}
      />,
    )
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    expect(img?.getAttribute('src')).toBe('blob:local-1')
    // The progress is still legible next to it.
    expect(screen.getByText(/40%/)).toBeTruthy()
  })

  it('revokes the preview URL when the attachment goes away', () => {
    const { unmount } = render(
      <Attachments
        attachments={[att()]}
        onRemove={vi.fn()}
        files={new Map([['l1', png()]])}
      />,
    )
    unmount()
    expect(revoked).toEqual(created)
  })

  it('keeps the type icon for a file with nothing to preview', () => {
    const pdf = new File([new Uint8Array([37, 80, 68, 70])], 'report.pdf', { type: 'application/pdf' })
    const { container } = render(
      <Attachments
        attachments={[att({ filename: 'report.pdf', mimeType: 'application/pdf' })]}
        onRemove={vi.fn()}
        files={new Map([['l1', pdf]])}
      />,
    )
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('report.pdf')).toBeTruthy()
  })

  it('draws the icon when the composer holds no file for the chip', () => {
    const { container } = render(<Attachments attachments={[att()]} onRemove={vi.fn()} />)
    expect(container.querySelector('img')).toBeNull()
  })
})
