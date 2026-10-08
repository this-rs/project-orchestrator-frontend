import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ContinueSheet } from '../ContinueSheet'

const base = { title: 'Reprendre la session', submitLabel: 'Reprendre la session' }

describe('ContinueSheet', () => {
  it('renders nothing while closed', () => {
    render(<ContinueSheet open={false} onClose={() => {}} onSend={async () => {}} {...base} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens a labelled dialog with the field focused, text-base, and the initial text', () => {
    render(<ContinueSheet open onClose={() => {}} onSend={async () => {}} initialText="Continue." help="aide" {...base} />)
    const dialog = screen.getByRole('dialog', { name: 'Reprendre la session' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    const field = screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement
    expect(field.value).toBe('Continue.')
    expect(document.activeElement).toBe(field)
    // 16px on a phone (iOS zoom), 14px from md.
    expect(field.className).toContain('text-base')
    expect(field.className).toContain('md:text-sm')
  })

  it('has no entrance animation (only the running dot moves, per the PO motion constraint)', () => {
    render(<ContinueSheet open onClose={() => {}} onSend={async () => {}} {...base} />)
    expect(screen.getByTestId('continue-sheet').className).not.toContain('ui-pop-in')
  })

  it('is a bottom sheet padded by the bottom safe area, glass (floating layer), dimmed not blurred backdrop', () => {
    render(<ContinueSheet open onClose={() => {}} onSend={async () => {}} {...base} />)
    const panel = screen.getByTestId('continue-sheet')
    expect(panel.className).toContain('env(safe-area-inset-bottom)')
    expect(panel.className).toContain('ui-glass')
    expect(panel.parentElement!.className).toContain('items-end')
    expect(screen.getByTestId('sheet-backdrop').className).not.toContain('blur')
  })

  it('sends the trimmed message once, then closes', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined)
    const onClose = vi.fn()
    render(<ContinueSheet open onClose={onClose} onSend={onSend} initialText="Continue." {...base} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '  vas-y  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reprendre la session' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(onSend).toHaveBeenCalledTimes(1)
    expect(onSend).toHaveBeenCalledWith('vas-y')
  })

  it('cannot send an empty message', () => {
    const onSend = vi.fn()
    render(<ContinueSheet open onClose={() => {}} onSend={onSend} initialText="" {...base} />)
    const send = screen.getByRole('button', { name: 'Reprendre la session' }) as HTMLButtonElement
    expect(send.disabled).toBe(true)
    fireEvent.click(send)
    expect(onSend).not.toHaveBeenCalled()
  })

  it('keeps the text and says why when the send fails', async () => {
    const onClose = vi.fn()
    render(
      <ContinueSheet open onClose={onClose} onSend={() => Promise.reject(new Error('Session not active'))} initialText="Continue." {...base} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Reprendre la session' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Session not active')
    expect(onClose).not.toHaveBeenCalled()
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Continue.')
  })

  it('closes on Escape, on the backdrop and on Cancel', () => {
    const onClose = vi.fn()
    render(<ContinueSheet open onClose={onClose} onSend={async () => {}} {...base} />)
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' })
    fireEvent.click(screen.getByTestId('sheet-backdrop'))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it('keeps Tab inside the sheet', () => {
    render(<ContinueSheet open onClose={() => {}} onSend={async () => {}} initialText="x" {...base} />)
    const send = screen.getByRole('button', { name: 'Reprendre la session' })
    send.focus()
    fireEvent.keyDown(send, { key: 'Tab' })
    expect(document.activeElement).toBe(screen.getByRole('textbox'))
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(send)
  })

  it('never offers an Allow action', () => {
    render(<ContinueSheet open onClose={() => {}} onSend={async () => {}} {...base} />)
    expect(screen.queryByRole('button', { name: /autoriser|allow|approuver/i })).toBeNull()
  })

  it('stays above the iOS keyboard (visual viewport shrunk) and does not chain scroll to the page', () => {
    const listeners = new Map<string, () => void>()
    const vv = {
      height: 300,
      offsetTop: 0,
      addEventListener: (t: string, f: () => void) => listeners.set(t, f),
      removeEventListener: vi.fn(),
    }
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true })
    try {
      render(<ContinueSheet open onClose={() => {}} onSend={async () => {}} {...base} />)
      const panel = screen.getByTestId('continue-sheet')
      expect(panel.parentElement!.style.height).toBe('300px')
      expect(panel.className).toContain('overscroll-contain')
    } finally {
      Object.defineProperty(window, 'visualViewport', { value: undefined, configurable: true })
    }
  })
})
