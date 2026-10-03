/**
 * The composer floats over the transcript: ChatPanel wraps ChatMessages + the composer in one
 * relative box and feeds the dock's measured height back to the messages as `bottomInset`,
 * in BOTH layouts (fullscreen and the docked side panel).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { MemoryRouter } from 'react-router-dom'
import { useEffect, type ReactNode } from 'react'
import { chatPanelModeAtom } from '@/atoms'

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
vi.mock('./AgenticModeBanner', () => ({ AgenticModeBanner: () => null }))
vi.mock('./AgenticModePill', () => ({ AgenticModePill: () => null }))
vi.mock('./SessionList', () => ({ SessionList: () => null }))
vi.mock('./ProjectSelect', () => ({ ProjectSelect: () => null }))
vi.mock('./PermissionSettingsPanel', () => ({ PermissionSettingsPanel: () => null }))
vi.mock('./SessionBreadcrumb', () => ({ SessionBreadcrumb: () => null }))

import { ChatPanel } from './ChatPanel'

function renderPanel(mode: 'open' | 'fullscreen') {
  const store = createStore()
  store.set(chatPanelModeAtom, mode)
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <ChatPanel />
      </MemoryRouter>
    </Provider>,
  )
}

beforeEach(() => {
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia
})

describe('ChatPanel: the composer floats over the transcript', () => {
  it.each(['fullscreen', 'open'] as const)('%s: the dock height becomes the messages bottomInset', async (mode) => {
    renderPanel(mode)
    const messages = await screen.findByTestId('messages')
    expect(screen.getByTestId('dock').contains(screen.getByTestId('input'))).toBe(true)
    // the messages are NOT inside the dock: they scroll under it
    expect(screen.getByTestId('dock').contains(messages)).toBe(false)
    expect(messages.getAttribute('data-inset')).toBe('64')
  })
})
