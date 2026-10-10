/**
 * The chat's timeline: a side panel next to the conversation on desktop, a
 * full-screen view on a phone (the `md` breakpoint, read through matchMedia).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useState } from 'react'

vi.mock('@/hooks/useTimelineContext', () => ({
  useTimelineContext: () => ({ title: 'Chat', session: null, decisions: [], work: { plans: [], tasks: [] } }),
}))
vi.mock('@/hooks/useConversationTrace', () => ({
  useConversationTrace: () => ({ sessions: [], loading: null, failed: false, retry: () => {}, streaming: false }),
}))

import { ChatTimelinePanel } from './ChatTimelinePanel'

/** `(min-width: 768px)` matches on desktop only. */
function setViewport(desktop: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('min-width') ? desktop : !desktop,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }))
}

/** The composer's toggle and the panel it opens, as in the chat. */
function Harness({ placement = 'docked' as 'docked' | 'column' }) {
  const [open, setOpen] = useState(false)
  return (
    <MemoryRouter>
      <button type="button" onClick={() => setOpen((v) => !v)}>Timeline</button>
      <textarea aria-label="Message" />
      {open && (
        <ChatTimelinePanel placement={placement} dockOffset={400} onClose={() => setOpen(false)} sessionId="s" messages={[]} isStreaming={false} workspaceSlug="ws" />
      )}
    </MemoryRouter>
  )
}

const openWithToggle = () => {
  const toggle = screen.getByRole('button', { name: 'Timeline' })
  toggle.focus()
  fireEvent.click(toggle)
  return toggle
}

describe('<ChatTimelinePanel>', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.style.overflow = ''
  })

  describe('on desktop', () => {
    beforeEach(() => setViewport(true))

    it('opens a side panel against the docked chat, non-modal, with a link to the page', () => {
      render(<Harness />)
      const toggle = openWithToggle()
      const panel = screen.getByTestId('chat-timeline-panel')
      expect(panel.dataset.variant).toBe('side')
      expect(panel.tagName).toBe('ASIDE')
      expect(panel.getAttribute('aria-modal')).toBeNull()
      expect(panel.style.right).toBe('400px')
      expect(panel.className).toContain('w-80')
      // The chat stays usable: focus is left where it was, the page still scrolls.
      expect(document.activeElement).toBe(toggle)
      expect(document.body.style.overflow).toBe('')
      expect(screen.getByRole('link', { name: 'Open the full timeline' }).getAttribute('href')).toBe('/workspace/ws/chat/s/timeline')
    })

    it('is a column of the full-screen chat', () => {
      render(<Harness placement="column" />)
      openWithToggle()
      const panel = screen.getByTestId('chat-timeline-panel')
      expect(panel.style.right).toBe('')
      expect(panel.className).toContain('w-80')
      expect(panel.className).not.toContain('fixed')
    })

    it('closes from its own button and gives focus back to the toggle', () => {
      render(<Harness />)
      const toggle = openWithToggle()
      const close = screen.getByRole('button', { name: 'Hide the timeline' })
      close.focus()
      fireEvent.click(close)
      expect(screen.queryByTestId('chat-timeline-panel')).toBeNull()
      expect(document.activeElement).toBe(toggle)
    })
  })

  describe('on a phone', () => {
    beforeEach(() => setViewport(false))

    it('opens full screen as a modal dialog, focus on its 44 px close control, page scroll locked', () => {
      render(<Harness />)
      openWithToggle()
      const view = screen.getByRole('dialog', { name: 'Timeline' })
      expect(view.dataset.variant).toBe('fullscreen')
      expect(view.getAttribute('aria-modal')).toBe('true')
      expect(view.className).toContain('inset-0')
      expect(view.className).toContain('h-dvh')
      expect(view.className).toContain('env(safe-area-inset-top)')
      const close = screen.getByRole('button', { name: 'Hide the timeline' })
      expect(close.className).toContain('size-11')
      expect(document.activeElement).toBe(close)
      expect(document.body.style.overflow).toBe('hidden')
    })

    it('closes on Escape, unlocks the page and gives focus back to the toggle', () => {
      render(<Harness />)
      const toggle = openWithToggle()
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(document.body.style.overflow).toBe('')
      expect(document.activeElement).toBe(toggle)
    })

    it('closes from its close control and gives focus back to the toggle', () => {
      render(<Harness />)
      const toggle = openWithToggle()
      fireEvent.click(screen.getByRole('button', { name: 'Hide the timeline' }))
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(document.activeElement).toBe(toggle)
    })
  })
})
