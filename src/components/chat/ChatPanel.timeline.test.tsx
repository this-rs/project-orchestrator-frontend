/**
 * The full-screen chat makes room for its timeline column (timelineRoom): below lg it hides
 * the conversations sidebar, so the panel never lies over the conversation or the composer.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { MemoryRouter } from 'react-router-dom'
import { useEffect, type ReactNode } from 'react'
import { chatPanelModeAtom, chatTimelineOpenAtom } from '@/atoms'

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
  useDetachedRuns: () => ({ runs: [], hasActiveRuns: false }),
  useVisualViewportHeight: () => undefined,
  useWindowFullscreen: () => false,
  useWorkspaceSlug: () => 'ws',
}))
vi.mock('@/hooks/useChatUrlSync', () => ({ useChatUrlSync: () => undefined }))
vi.mock('@/services/chat', () => ({ chatApi: { getSession: vi.fn().mockResolvedValue(null) } }))
vi.mock('@/components/discussions/AttachSessionButton', () => ({ AttachSessionButton: () => null }))
vi.mock('@/components/discussions/DiscussionTreeView', () => ({ DiscussionTreeView: () => null }))
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
vi.mock('./SessionList', () => ({ SessionList: () => null }))
vi.mock('./ProjectSelect', () => ({ ProjectSelect: () => null }))
vi.mock('./PermissionSettingsPanel', () => ({ PermissionSettingsPanel: () => null }))
vi.mock('./SessionBreadcrumb', () => ({ SessionBreadcrumb: () => null }))
vi.mock('./ChatTimelinePanel', () => ({
  ChatTimelinePanel: ({ placement }: { placement: string }) => <aside data-testid="timeline" data-placement={placement} />,
}))

import { ChatPanel } from './ChatPanel'

function renderFullscreen(timelineOpen: boolean) {
  const store = createStore()
  store.set(chatPanelModeAtom, 'fullscreen')
  store.set(chatTimelineOpenAtom, timelineOpen)
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <ChatPanel />
      </MemoryRouter>
    </Provider>,
  )
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

beforeEach(() => localStorage.clear())

describe('ChatPanel full screen: room for the timeline column', () => {
  it.each([800, 900])('at %i px the sidebar steps aside while the timeline is open, and comes back', async (width) => {
    setWidth(width)
    renderFullscreen(true)
    const timeline = await screen.findByTestId('timeline')
    expect(timeline.dataset.placement).toBe('column')
    expect(screen.getByTestId('chat-sessions-sidebar').className).not.toContain('md:flex')
  })

  it('keeps the sidebar while the timeline is closed', async () => {
    setWidth(900)
    renderFullscreen(false)
    await screen.findByTestId('messages')
    expect(screen.queryByTestId('timeline')).toBeNull()
    expect(screen.getByTestId('chat-sessions-sidebar').className).toContain('md:flex')
  })

  it.each([1024, 1280])('at %i px the sidebar, the conversation and the column fit side by side', async (width) => {
    setWidth(width)
    renderFullscreen(true)
    await screen.findByTestId('timeline')
    expect(screen.getByTestId('chat-sessions-sidebar').className).toContain('md:flex')
  })
})
