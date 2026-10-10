/**
 * The full-screen chat makes room for its timeline column (timelineRoom): it hides the
 * conversations sidebar (and, below lg, the assistant tree) instead of covering anything,
 * and what it hides stays reachable from the header.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { MemoryRouter } from 'react-router-dom'
import { useEffect, type ReactNode } from 'react'
import { chatPanelModeAtom, chatTimelineOpenAtom } from '@/atoms'

const detached = vi.hoisted(() => ({ value: { runs: [] as unknown[], hasActiveRuns: false } }))
const chatStub = {
  sessionId: 's1',
  isSending: false,
  messages: [],
  isStreaming: false,
  isLoadingHistory: false,
  isReplaying: false,
  hasOlderMessages: false,
  isLoadingOlder: false,
  loadOlderMessages: vi.fn(),
  hasNewerMessages: false,
  isLoadingNewer: false,
  loadNewerMessages: vi.fn(),
  hasLiveActivity: false,
  jumpToTail: vi.fn(),
  respondPermission: vi.fn(),
  respondInput: vi.fn(),
  interrupt: vi.fn(),
  changePermissionMode: vi.fn(),
  changeModel: vi.fn(),
  changeAutoContinue: vi.fn(),
  loadSession: vi.fn(),
  isCompacting: false,
  wsStatus: 'connected',
}

vi.mock('@/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks')>()),
  useChat: () => chatStub,
  useDetachedRuns: () => detached.value,
  useVisualViewportHeight: () => undefined,
  useWindowFullscreen: () => false,
  useWorkspaceSlug: () => 'ws',
}))
vi.mock('@/hooks/useChatUrlSync', () => ({ useChatUrlSync: () => undefined }))
vi.mock('@/services/chat', () => ({ chatApi: { getSession: vi.fn().mockResolvedValue(null) } }))
vi.mock('@/components/discussions/AttachSessionButton', () => ({ AttachSessionButton: () => null }))
vi.mock('@/components/discussions/DiscussionTreeView', () => ({ DiscussionTreeView: () => <div data-testid="tree" /> }))
vi.mock('./ChatMessages', () => ({
  ChatMessages: ({ bottomInset }: { bottomInset?: number }) => <div data-testid="messages" data-inset={bottomInset} />,
}))
vi.mock('./ComposerDock', () => ({
  ComposerDock: ({ onHeight, children }: { onHeight: (h: number) => void; children: ReactNode }) => {
    useEffect(() => onHeight(64), [onHeight])
    return <div data-testid="dock">{children}</div>
  },
}))
vi.mock('./ChatInput', () => ({ ChatInput: () => <div data-testid="input" /> }))
vi.mock('./CompactionBanner', () => ({ CompactionBanner: () => null }))
vi.mock('./SecretRequestTray', () => ({ SecretRequestTray: () => null }))
vi.mock('./DetachedRunsPanel', () => ({ DetachedRunsPanel: () => null }))
vi.mock('./SessionList', () => ({
  SessionList: ({ onSelect }: { onSelect: (id: string) => void }) => (
    <div data-testid="session-list"><button type="button" onClick={() => onSelect('other')}>Pick other</button></div>
  ),
}))
vi.mock('./ProjectSelect', () => ({ ProjectSelect: () => null }))
vi.mock('./PermissionSettingsPanel', () => ({ PermissionSettingsPanel: () => null }))
vi.mock('./SessionBreadcrumb', () => ({ SessionBreadcrumb: () => null }))
vi.mock('./ChatTimelinePanel', () => ({
  ChatTimelinePanel: ({ placement }: { placement: string }) => <aside data-testid="timeline" data-placement={placement} />,
}))

import { ChatPanel } from './ChatPanel'

import { CHAT_COLUMN_WIDTH, CHAT_SIDEBAR_WIDTH } from './timelineRoom'

function renderFullscreen(timelineOpen: boolean) {
  const store = createStore()
  store.set(chatPanelModeAtom, 'fullscreen')
  store.set(chatTimelineOpenAtom, timelineOpen)
  render(
    <Provider store={store}>
      <MemoryRouter>
        <ChatPanel />
      </MemoryRouter>
    </Provider>,
  )
  return store
}

function setWidth(width: number) {
  window.matchMedia = ((q: string) => {
    const min = /min-width:\s*(\d+)px/.exec(q)
    const max = /max-width:\s*(\d+)px/.exec(q)
    return {
      matches: (!min || width >= Number(min[1])) && (!max || width <= Number(max[1])),
      media: q, onchange: null,
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
      addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
    }
  }) as unknown as typeof window.matchMedia
}

const sidebar = () => screen.getByTestId('chat-sessions-sidebar')
/** The sidebar column is on screen from md: `hidden md:flex`; set aside: `hidden` alone. */
const sidebarShown = () => sidebar().className.split(/\s+/).includes('md:flex')
const treeButton = () => screen.getByRole('button', { name: 'Assistant tree' })
/** A header button only for a compact layout carries `md:hidden`: from md it is not on screen. */
const onScreenFromMd = (el: HTMLElement) => !el.className.split(/\s+/).includes('md:hidden')

beforeEach(() => {
  localStorage.clear()
  chatStub.loadSession.mockClear()
  detached.value = { runs: [], hasActiveRuns: false }
})

describe('ChatPanel full screen: room for the timeline column', () => {
  it.each([800, 900])('at %i px the sidebar steps aside while the timeline is open', async (width) => {
    setWidth(width)
    renderFullscreen(true)
    expect((await screen.findByTestId('timeline')).dataset.placement).toBe('column')
    expect(sidebarShown()).toBe(false)
  })

  it('at 900 px with the timeline open, the conversations stay reachable from the header', async () => {
    setWidth(900)
    renderFullscreen(true)
    await screen.findByTestId('timeline')
    const sessions = screen.getByRole('button', { name: 'Sessions' })
    expect(onScreenFromMd(sessions)).toBe(true)
    expect(onScreenFromMd(screen.getByRole('button', { name: 'New chat' }))).toBe(true)
    // One list so far: the one in the sidebar, set aside (display: none).
    expect(screen.getAllByTestId('session-list')).toHaveLength(1)
    fireEvent.click(sessions)
    // The full-screen list opens over everything, as on a phone.
    const lists = screen.getAllByTestId('session-list')
    expect(lists).toHaveLength(2)
    const overlay = lists[1].parentElement!
    expect(overlay.className).toContain('fixed inset-0')
    expect(within(overlay).getByText('Conversations')).toBeTruthy()
  })

  it('at 900 px picking a conversation in the full-screen list loads it and puts the list away', async () => {
    setWidth(900)
    renderFullscreen(true)
    await screen.findByTestId('timeline')
    fireEvent.click(screen.getByRole('button', { name: 'Sessions' }))
    const lists = screen.getAllByTestId('session-list')
    expect(lists).toHaveLength(2)
    fireEvent.click(within(lists[1]).getByRole('button', { name: 'Pick other' }))
    expect(chatStub.loadSession).toHaveBeenCalledWith('other', undefined)
    expect(screen.getAllByTestId('session-list')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Sessions' }).getAttribute('aria-expanded')).toBe('false')
  })

  it('the full-screen list does not come back unasked when the timeline closes and reopens', async () => {
    setWidth(900)
    const store = renderFullscreen(true)
    await screen.findByTestId('timeline')
    const counts: number[] = []
    fireEvent.click(screen.getByRole('button', { name: 'Sessions' }))
    counts.push(screen.getAllByTestId('session-list').length)
    act(() => store.set(chatTimelineOpenAtom, false))
    counts.push(screen.getAllByTestId('session-list').length)
    act(() => store.set(chatTimelineOpenAtom, true))
    counts.push(screen.getAllByTestId('session-list').length)
    expect(counts).toEqual([2, 1, 1])
    expect(screen.getByRole('button', { name: 'Sessions' }).getAttribute('aria-expanded')).toBe('false')
  })

  it('keeps the sidebar, and the header without its compact buttons, while the timeline is closed', async () => {
    setWidth(900)
    renderFullscreen(false)
    await screen.findByTestId('messages')
    expect(screen.queryByTestId('timeline')).toBeNull()
    expect(sidebarShown()).toBe(true)
    expect(sidebar().className).toContain(CHAT_SIDEBAR_WIDTH.className)
    expect(onScreenFromMd(screen.getByRole('button', { name: 'Sessions' }))).toBe(false)
    expect(onScreenFromMd(screen.getByRole('button', { name: 'New chat' }))).toBe(false)
  })

  it('at 1024 px without the tree: sidebar, conversation and timeline side by side, header unchanged', async () => {
    setWidth(1024)
    renderFullscreen(true)
    await screen.findByTestId('timeline')
    expect(sidebarShown()).toBe(true)
    expect(onScreenFromMd(screen.getByRole('button', { name: 'Sessions' }))).toBe(false)
  })

  describe('with the assistant tree (a session with children)', () => {
    beforeEach(() => {
      detached.value = { runs: [{ sessionId: 'kid', title: 'Kid', isStreaming: false, startedAt: new Date(0).toISOString() }], hasActiveRuns: false }
    })

    it('at 900 px the tree is set aside while the timeline is open, and its button says so', async () => {
      setWidth(900)
      renderFullscreen(false)
      fireEvent.click(await screen.findByRole('button', { name: 'Assistant tree' }))
      expect(screen.getByTestId('tree')).toBeTruthy()
      expect(treeButton().getAttribute('aria-pressed')).toBe('true')
    })

    it('at 900 px asking for the tree closes the timeline: one column, the last asked for', async () => {
      setWidth(900)
      const store = renderFullscreen(true)
      await screen.findByTestId('timeline')
      expect(screen.queryByTestId('tree')).toBeNull()
      expect(treeButton().getAttribute('aria-pressed')).toBe('false')
      fireEvent.click(treeButton())
      expect(store.get(chatTimelineOpenAtom)).toBe(false)
      expect(screen.queryByTestId('timeline')).toBeNull()
      expect(screen.getByTestId('tree')).toBeTruthy()
      expect(treeButton().getAttribute('aria-pressed')).toBe('true')
      // Opening the timeline again sets the tree aside, and the button follows.
      act(() => store.set(chatTimelineOpenAtom, true))
      expect(screen.getByTestId('timeline')).toBeTruthy()
      expect(screen.queryByTestId('tree')).toBeNull()
      expect(treeButton().getAttribute('aria-pressed')).toBe('false')
    })

    it('at 1024 px the tree and the timeline both stay, the sidebar steps aside (reachable from the header)', async () => {
      setWidth(1024)
      renderFullscreen(true)
      await screen.findByTestId('timeline')
      fireEvent.click(treeButton())
      expect(screen.getByTestId('tree')).toBeTruthy()
      expect(screen.getByTestId('chat-tree-column').className).toContain(CHAT_COLUMN_WIDTH.className)
      expect(screen.getByTestId('timeline')).toBeTruthy()
      expect(treeButton().getAttribute('aria-pressed')).toBe('true')
      expect(sidebarShown()).toBe(false)
      expect(onScreenFromMd(screen.getByRole('button', { name: 'Sessions' }))).toBe(true)
    })

    it('at 1280 px everything fits: sidebar, conversation, timeline and tree', async () => {
      setWidth(1280)
      renderFullscreen(true)
      await screen.findByTestId('timeline')
      fireEvent.click(treeButton())
      expect(screen.getByTestId('tree')).toBeTruthy()
      expect(screen.getByTestId('timeline')).toBeTruthy()
      expect(sidebarShown()).toBe(true)
      expect(onScreenFromMd(screen.getByRole('button', { name: 'Sessions' }))).toBe(false)
    })
  })
})

describe('ChatPanel full screen on a phone: the conversations list is modal (useModalFocus)', () => {
  const tab = (shiftKey = false) => fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey })

  async function openList() {
    setWidth(390)
    renderFullscreen(false)
    const trigger = await screen.findByRole('button', { name: 'Sessions' })
    trigger.focus()
    fireEvent.click(trigger)
    const overlay = screen.getByRole('dialog', { name: 'Conversations' })
    return { trigger, overlay }
  }

  it('focus moves to its close control; Tab from the last control wraps to it, Shift+Tab from it to the last', async () => {
    const { overlay } = await openList()
    const close = within(overlay).getByRole('button', { name: 'Back to chat' })
    const last = within(overlay).getByRole('button', { name: 'Pick other' })
    expect(document.activeElement).toBe(close)
    last.focus()
    tab()
    expect(document.activeElement).toBe(close)
    tab(true)
    expect(document.activeElement).toBe(last)
  })

  it('Escape closes it and focus goes back to the Sessions button', async () => {
    const { trigger } = await openList()
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Conversations' })).toBeNull()
    expect(document.activeElement).toBe(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('the chat behind it (rendered in place) is inert and hidden while open, and given back on close', async () => {
    const { trigger, overlay } = await openList()
    const header = trigger.closest('.h-14')!
    expect(trigger.closest('[inert]')).not.toBeNull()
    expect(trigger.closest('[aria-hidden="true"]')).not.toBeNull()
    expect(screen.getByTestId('chat-sessions-sidebar').hasAttribute('inert')).toBe(true)
    // The list itself and its ancestors stay usable.
    expect(overlay.closest('[inert]')).toBeNull()
    expect(overlay.closest('[aria-hidden="true"]')).toBeNull()
    fireEvent.click(within(overlay).getByRole('button', { name: 'Back to chat' }))
    expect(header.closest('[inert]')).toBeNull()
    expect(header.closest('[aria-hidden="true"]')).toBeNull()
    expect(screen.getByTestId('chat-sessions-sidebar').hasAttribute('inert')).toBe(false)
    expect(document.activeElement).toBe(trigger)
  })
})
