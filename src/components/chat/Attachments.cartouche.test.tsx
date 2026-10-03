import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Attachments } from './Attachments'
import type { Attachment } from './attachmentState'

const att = (over: Partial<Attachment>): Attachment => ({
  localId: 'l1',
  filename: 'report.pdf',
  sizeBytes: 2048,
  mimeType: 'application/pdf',
  status: 'ready',
  progress: 100,
  documentId: 'd1',
  ...over,
})

describe('Attachments — opaque chips', () => {
  it('draws nothing without attachments', () => {
    const { container } = render(<Attachments attachments={[]} onRemove={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('draws the chip on an opaque popover surface, not a translucent one', () => {
    const { container } = render(<Attachments attachments={[att({})]} onRemove={vi.fn()} />)
    expect(container.innerHTML).toContain('bg-surface-popover')
    expect(container.innerHTML).not.toContain('bg-white/[0.04]')
  })

  it('keeps an opaque red surface for a failed upload', () => {
    render(
      <Attachments
        attachments={[att({ status: 'error', error: 'File too large', documentId: undefined })]}
        onRemove={vi.fn()}
      />,
    )
    expect(screen.getByText('File too large')).toBeTruthy()
    const chip = document.querySelector('[data-status="error"]') as HTMLElement
    expect(chip.className).toContain('bg-[#2a1517]')
  })
})
