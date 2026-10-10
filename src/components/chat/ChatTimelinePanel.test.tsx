/**
 * The chat's timeline: a side panel next to the conversation on desktop, a
 * full-screen view on a phone (the `md` breakpoint, read through matchMedia).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, renderHook, screen } from '@testing-library/react'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import type { ChatMessage } from '@/types'

vi.mock('@/hooks/useTimelineContext', () => ({
  useTimelineContext: () => ({ title: 'Chat', session: null, decisions: [], work: { plans: [], tasks: [] } }),
}))
vi.mock('@/hooks/useConversationTrace', () => ({
  useConversationTrace: () => ({ sessions: [], loading: null, failed: false, retry: () => {}, streaming: false }),
}))

import { ChatTimelinePanel } from './ChatTimelinePanel'
import { useResetTimelineOnPhone } from './useResetTimelineOnPhone'

/** A window `width` px wide: media queries and `innerWidth` answer from it. */
function setViewport(desktop: boolean | number) {
  const width = typeof desktop === 'number' ? desktop : desktop ? 1440 : 390
  vi.stubGlobal('innerWidth', width)
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: (() => {
      const min = /min-width:\s*(\d+)px/.exec(query)
      const max = /max-width:\s*(\d+)px/.exec(query)
      return (!min || width >= Number(min[1])) && (!max || width <= Number(max[1]))
    })(),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }))
}

const msgs: ChatMessage[] = [
  { id: 'm1', role: 'user', timestamp: new Date(1000), blocks: [{ id: 'b', type: 'text', content: 'go' }] },
  { id: 'm2', role: 'assistant', timestamp: new Date(1001), duration_ms: 1, blocks: [
    { id: 'u', type: 'tool_use', content: 'Bash', metadata: { tool_call_id: 'c1', tool_name: 'Bash', tool_input: { command: 'ls' } } },
    { id: 'r', type: 'tool_result', content: 'ok', metadata: { tool_call_id: 'c1' } },
  ] },
]

/** Elsewhere in the app: a page change, and the chat rewriting its own query with replace. */
function Elsewhere() {
  const navigate = useNavigate()
  return (
    <>
      <button type="button" onClick={() => navigate('/workspace/ws/plans/p1')}>Go to a plan</button>
      <button type="button" onClick={() => navigate('?session=child&chat=open', { replace: true })}>Rewrite the query</button>
    </>
  )
}

/** The composer's toggle and the panel it opens, as in the chat. */
function Harness({ placement = 'docked' as 'docked' | 'column', dockOffset = 400 }) {
  const [open, setOpen] = useState(false)
  return (
    <MemoryRouter initialEntries={['/workspace/ws/overview?session=s&chat=open']}>
      <button type="button" onClick={() => setOpen((v) => !v)}>Timeline</button>
      <textarea aria-label="Message" />
      <Elsewhere />
      {open && (
        <ChatTimelinePanel placement={placement} dockOffset={dockOffset} onClose={() => setOpen(false)} sessionId="s" messages={msgs} isStreaming={false} workspaceSlug="ws" />
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
      expect(panel.dataset.layout).toBe('dock')
      // The chat stays usable: focus is left where it was, the page still scrolls.
      expect(document.activeElement).toBe(toggle)
      expect(document.body.style.overflow).toBe('')
      expect(screen.getByRole('link', { name: 'Open the full timeline' }).getAttribute('href')).toBe('/workspace/ws/chat/s/timeline')
    })

    it('is a column of the full-screen chat', () => {
      render(<Harness placement="column" />)
      openWithToggle()
      const panel = screen.getByTestId('chat-timeline-panel')
      expect(panel.dataset.layout).toBe('column')
      expect(panel.style.right).toBe('')
      expect(panel.className).toContain('w-80')
      expect(panel.className).not.toContain('fixed')
    })

    it.each([800, 900, 1024, 1280])('is a column of the full-screen chat at %i px (the chat makes the room)', (width) => {
      setViewport(width)
      render(<Harness placement="column" />)
      openWithToggle()
      const panel = screen.getByTestId('chat-timeline-panel')
      expect(panel.dataset.layout).toBe('column')
      expect(panel.className).not.toMatch(/\b(absolute|fixed)\b/)
    })

    it.each([
      // window, docked chat → layout, panel style
      [1000, 680, 'dock', { right: '680px', left: '' }], // exactly 320 px free
      [1000, 690, 'overlay-chat', { right: '', left: '314px' }], // 310 px free: would be cut on the left
      [1000, 720, 'overlay-chat', { right: '', left: '284px' }], // 280 px free
      [1000, 800, 'overlay-chat', { right: '', left: '204px' }],
    ])('at %i px with a %i px docked chat it is %s, fully on screen, right of the resize handle', (width, dock, layout, style) => {
      setViewport(width)
      render(<Harness dockOffset={dock} />)
      openWithToggle()
      const panel = screen.getByTestId('chat-timeline-panel')
      expect(panel.dataset.layout).toBe(layout)
      expect(panel.style.right).toBe(style.right)
      expect(panel.style.left).toBe(style.left)
      if (layout === 'overlay-chat') {
        // The chat's resize handle sits at its left edge, x = width - dock (4 px wide): left of the panel.
        expect(parseInt(panel.style.left)).toBeGreaterThanOrEqual(width - dock + 4)
        expect(parseInt(panel.style.left) + 320).toBeLessThanOrEqual(width)
      }
    })

    it('Escape closes the detail sheet first, then the panel', () => {
      // The 320 px panel: the trace's detail is a bottom sheet, inside the panel.
      vi.stubGlobal('ResizeObserver', class {
        constructor(private cb: ResizeObserverCallback) {}
        observe() { this.cb([{ contentRect: { width: 300 } } as ResizeObserverEntry], this as unknown as ResizeObserver) }
        disconnect() {}
        unobserve() {}
      })
      render(<Harness />)
      const toggle = openWithToggle()
      const panel = screen.getByTestId('chat-timeline-panel')
      fireEvent.click(screen.getByRole('treeitem', { name: /Bash · ls/ }))
      const sheet = screen.getByTestId('trace-sheet')
      expect(panel.contains(sheet)).toBe(true)
      expect(document.activeElement).toBe(sheet)
      fireEvent.keyDown(sheet, { key: 'Escape' })
      expect(screen.queryByTestId('trace-sheet')).toBeNull()
      expect(screen.getByTestId('chat-timeline-panel')).toBeTruthy()
      const close = screen.getByRole('button', { name: 'Hide the timeline' })
      close.focus()
      fireEvent.keyDown(close, { key: 'Escape' })
      expect(screen.queryByTestId('chat-timeline-panel')).toBeNull()
      expect(document.activeElement).toBe(toggle)
    })

    it('ignores an Escape pressed elsewhere (the chat keeps its keys)', () => {
      render(<Harness />)
      openWithToggle()
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(screen.getByTestId('chat-timeline-panel')).toBeTruthy()
    })

    it.each([[1000, 400], [1000, 800]])('closes on Escape with the focus inside (window %i, chat %i) and gives focus back', (width, dock) => {
      setViewport(width)
      render(<Harness dockOffset={dock} />)
      const toggle = openWithToggle()
      const close = screen.getByRole('button', { name: 'Hide the timeline' })
      close.focus()
      fireEvent.keyDown(close, { key: 'Escape' })
      expect(screen.queryByTestId('chat-timeline-panel')).toBeNull()
      expect(document.activeElement).toBe(toggle)
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

    it('releases the scroll lock when it goes away without closing (the chat unmounts)', () => {
      const { unmount } = render(<Harness />)
      openWithToggle()
      expect(document.body.style.overflow).toBe('hidden')
      unmount()
      expect(document.body.style.overflow).toBe('')
    })

    it('stays open when the chat rewrites its query, closes when the page changes', () => {
      render(<Harness />)
      openWithToggle()
      fireEvent.click(screen.getByRole('button', { name: 'Rewrite the query', hidden: true }))
      expect(screen.getByRole('dialog', { name: 'Timeline' })).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: 'Go to a plan', hidden: true }))
      expect(screen.queryByRole('dialog', { name: 'Timeline' })).toBeNull()
    })

    it('closes after "Show in the conversation" so the block can be seen', () => {
      const block = document.createElement('div')
      block.dataset.toolCallId = 'c1'
      block.scrollIntoView = vi.fn()
      document.body.appendChild(block)
      try {
        render(<Harness />)
        openWithToggle()
        fireEvent.click(screen.getByRole('treeitem', { name: /Bash · ls/ }))
        fireEvent.click(screen.getByRole('button', { name: 'Show in the conversation' }))
        expect(block.scrollIntoView).toHaveBeenCalled()
        expect(screen.queryByRole('dialog', { name: 'Timeline' })).toBeNull()
      } finally {
        block.remove()
      }
    })

    it('Escape closes the detail sheet first, then the view', () => {
      // The trace measures 390 px: its detail is a bottom sheet.
      vi.stubGlobal('ResizeObserver', class {
        constructor(private cb: ResizeObserverCallback) {}
        observe() { this.cb([{ contentRect: { width: 390 } } as ResizeObserverEntry], this as unknown as ResizeObserver) }
        disconnect() {}
        unobserve() {}
      })
      render(<Harness />)
      openWithToggle()
      fireEvent.click(screen.getByRole('treeitem', { name: /Bash · ls/ }))
      expect(screen.getByTestId('trace-sheet')).toBeTruthy()
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(screen.queryByTestId('trace-sheet')).toBeNull()
      expect(screen.getByRole('dialog', { name: 'Timeline' })).toBeTruthy()
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(screen.queryByRole('dialog', { name: 'Timeline' })).toBeNull()
    })

    describe('focus trap (useModalFocus)', () => {
      const tab = (shiftKey = false) => fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey })
      const tabbable = (view: HTMLElement) =>
        Array.from(view.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]')).filter((el) => el.tabIndex >= 0)

      it('Tab from the last control goes back to the first, Shift+Tab from the first to the last', () => {
        render(<Harness />)
        openWithToggle()
        const view = screen.getByRole('dialog', { name: 'Timeline' })
        const items = tabbable(view)
        expect(items.length).toBeGreaterThan(2)
        items[items.length - 1].focus()
        tab()
        expect(document.activeElement).toBe(items[0])
        tab(true)
        expect(document.activeElement).toBe(items[items.length - 1])
      })

      it('Shift+Tab with focus on the view itself goes to its last control', () => {
        render(<Harness />)
        openWithToggle()
        const view = screen.getByRole('dialog', { name: 'Timeline' })
        view.focus()
        expect(document.activeElement).toBe(view)
        tab(true)
        const items = tabbable(view)
        expect(document.activeElement).toBe(items[items.length - 1])
      })

      it('makes the page behind inert and hidden while open, and gives it back on close', () => {
        const { container } = render(<Harness />)
        const toggle = openWithToggle()
        expect(container.hasAttribute('inert')).toBe(true)
        expect(container.getAttribute('aria-hidden')).toBe('true')
        expect(screen.getByRole('dialog', { name: 'Timeline' }).closest('[inert]')).toBeNull()
        fireEvent.keyDown(document, { key: 'Escape' })
        expect(container.hasAttribute('inert')).toBe(false)
        expect(container.getAttribute('aria-hidden')).toBeNull()
        expect(document.activeElement).toBe(toggle)
      })
    })
  })
})

describe('useResetTimelineOnPhone', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('closes a timeline left open on a phone', () => {
    setViewport(false)
    localStorage.setItem('chat-timeline-open', 'true')
    const setOpen = vi.fn()
    renderHook(() => useResetTimelineOnPhone(setOpen))
    expect(setOpen).toHaveBeenCalledWith(false)
  })

  it('writes nothing when it was closed, or on desktop', () => {
    const setOpen = vi.fn()
    setViewport(false)
    renderHook(() => useResetTimelineOnPhone(setOpen))
    setViewport(true)
    localStorage.setItem('chat-timeline-open', 'true')
    renderHook(() => useResetTimelineOnPhone(setOpen))
    expect(setOpen).not.toHaveBeenCalled()
  })

  it('survives a storage that throws', () => {
    setViewport(false)
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    const setOpen = vi.fn()
    expect(() => renderHook(() => useResetTimelineOnPhone(setOpen))).not.toThrow()
    expect(setOpen).not.toHaveBeenCalled()
    getItem.mockRestore()
  })
})
