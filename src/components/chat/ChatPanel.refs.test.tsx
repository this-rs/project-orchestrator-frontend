/**
 * ChatPanel hands the composer's references to sendMessage - and only when there are some.
 *
 * Run with: npx vitest run src/components/chat/ChatPanel.refs.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { chatPanelModeAtom, chatSelectedProjectAtom, chatWorkspaceHasProjectsAtom } from '@/atoms'
import type { Project } from '@/types'

const chatStub = {
  sessionId: null as string | null,
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
  newSession: vi.fn(),
  sendMessage: vi.fn(),
  isCompacting: false,
  wsStatus: 'connected',
}

const listProviders = vi.fn()

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
vi.mock('@/services/providers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/providers')>()),
  providersApi: { list: (...a: unknown[]) => listProviders(...a) },
}))
vi.mock('@/components/discussions/AttachSessionButton', () => ({ AttachSessionButton: () => null }))
vi.mock('@/components/discussions/DiscussionTreeView', () => ({ DiscussionTreeView: () => null }))
vi.mock('./ChatMessages', () => ({ ChatMessages: () => <div data-testid="messages" /> }))
vi.mock('./ComposerDock', () => ({
  ComposerDock: ({ children }: { children: ReactNode }) => <div data-testid="dock">{children}</div>,
}))
vi.mock('./ChatInput', () => ({
  ChatInput: ({ onSend }: { onSend: (text: string, ids?: string[], refs?: unknown[]) => void }) => (
    <>
      <button data-testid="input" onClick={() => onSend('hello', ['doc-1'])}>send</button>
      <button data-testid="input-refs" onClick={() => onSend('hello #plan:57cf05c9-25b6-495d-ab07-de4b11d64736', ['doc-1'], [{ kind: 'plan', id: '57cf05c9-25b6-495d-ab07-de4b11d64736', label: 'P' }])}>send refs</button>
    </>
  ),
}))
vi.mock('./CompactionBanner', () => ({ CompactionBanner: () => null }))
vi.mock('./SecretRequestTray', () => ({ SecretRequestTray: () => null }))
vi.mock('./DetachedRunsPanel', () => ({ DetachedRunsPanel: () => null }))
vi.mock('./SessionList', () => ({ SessionList: () => null }))
vi.mock('./ProjectSelect', () => ({ ProjectSelect: () => null }))
vi.mock('./PermissionSettingsPanel', () => ({ PermissionSettingsPanel: () => null }))
vi.mock('./SessionBreadcrumb', () => ({ SessionBreadcrumb: () => null }))

import { ChatPanel } from './ChatPanel'


beforeEach(() => {
  vi.clearAllMocks()
  chatStub.sendMessage.mockResolvedValue(undefined)
  listProviders.mockRejectedValue(new Error('offline'))
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia
})

function renderPanel() {
  const store = createStore()
  store.set(chatPanelModeAtom, 'open')
  store.set(chatWorkspaceHasProjectsAtom, true)
  store.set(chatSelectedProjectAtom, { id: 'p1', slug: 'demo', name: 'Demo', root_path: '/repo' } as unknown as Project)
  render(<Provider store={store}><MemoryRouter><ChatPanel /></MemoryRouter></Provider>)
}

describe('ChatPanel — references', () => {
  it('passes the references to sendMessage as the 4th argument, for a new conversation', async () => {
    renderPanel()
    fireEvent.click(await screen.findByTestId('input-refs'))
    expect(chatStub.sendMessage).toHaveBeenCalledWith(
      'hello #plan:57cf05c9-25b6-495d-ab07-de4b11d64736',
      { cwd: '/repo', workspaceSlug: 'ws', projectSlug: undefined },
      ['doc-1'],
      [{ kind: 'plan', id: '57cf05c9-25b6-495d-ab07-de4b11d64736', label: 'P' }],
    )
  })

  it('passes them in a follow-up too', async () => {
    chatStub.sessionId = 's1'
    try {
      renderPanel()
      fireEvent.click(await screen.findByTestId('input-refs'))
      expect(chatStub.sendMessage.mock.calls[0]).toHaveLength(4)
      expect(chatStub.sendMessage.mock.calls[0][1]).toBeUndefined()
    } finally {
      chatStub.sessionId = null
    }
  })

  it('calls sendMessage with exactly three arguments when there is no reference', async () => {
    renderPanel()
    fireEvent.click(await screen.findByTestId('input'))
    expect(chatStub.sendMessage.mock.calls[0]).toHaveLength(3)
  })
})
