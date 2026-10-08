/**
 * The chat panel is a global drop zone for references (the composer inside takes them first).
 *
 * Run with: npx vitest run src/components/chat/ChatPanel.refsDrop.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { chatComposerBlockedAtom, ReferenceSourceHost } from '@/refs/source'
import { makeDataTransfer, PLAN_ID } from '@/refs/source/__tests__/testDnd'
import { chatDraftInputAtom, chatPanelModeAtom, chatSelectedProjectAtom, chatServerFeaturesAtom, chatWorkspaceHasProjectsAtom } from '@/atoms'
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


function renderPanel(opts: { features?: string[]; project?: boolean } = {}) {
  const store = createStore()
  store.set(chatPanelModeAtom, 'open')
  store.set(chatServerFeaturesAtom, opts.features ?? ['refs_v1'])
  store.set(chatWorkspaceHasProjectsAtom, opts.project !== false)
  if (opts.project !== false) {
    store.set(chatSelectedProjectAtom, { id: 'p1', slug: 'demo', name: 'Demo', root_path: '/repo' } as unknown as Project)
  }
  render(
    <Provider store={store}>
      <MemoryRouter>
        <ReferenceSourceHost />
        <div data-testid="source" data-po-ref={`plan:${PLAN_ID}`} data-po-ref-label="Auth flow" draggable>source</div>
        <ChatPanel />
      </MemoryRouter>
    </Provider>,
  )
  return store
}
const panel = () => screen.getByTestId('messages').closest('[class*="fixed"]') as HTMLElement
const startDrag = () => {
  const dt = makeDataTransfer()
  fireEvent.dragStart(screen.getByTestId('source'), { dataTransfer: dt })
  return dt
}

describe('ChatPanel — global drop zone for references', () => {
  it('takes a reference dropped anywhere on the panel, with a visible frame that says so in words', async () => {
    const store = renderPanel()
    await screen.findByTestId('messages')
    const dt = startDrag()
    fireEvent.dragEnter(panel(), { dataTransfer: dt })
    expect(screen.getByTestId('ref-drop-overlay').textContent).toContain('Drop to add “Auth flow” to the message')
    expect(fireEvent.dragOver(screen.getByTestId('messages'), { dataTransfer: dt })).toBe(false)
    fireEvent.drop(screen.getByTestId('messages'), { dataTransfer: dt })
    expect(store.get(chatDraftInputAtom)).toBe(`#plan:${PLAN_ID} `)
    expect(screen.queryByTestId('ref-drop-overlay')).toBeNull()
    expect(screen.getByTestId('refs-add-announcer')).toBeTruthy()
  })

  it('a second drop of the same entity adds nothing', async () => {
    const store = renderPanel()
    await screen.findByTestId('messages')
    fireEvent.drop(screen.getByTestId('messages'), { dataTransfer: startDrag() })
    fireEvent.drop(screen.getByTestId('messages'), { dataTransfer: startDrag() })
    expect(store.get(chatDraftInputAtom).match(/#plan:/g)).toHaveLength(1)
  })

  it('tells the drop atom when the composer cannot take text, and a drop is then refused', async () => {
    const store = renderPanel({ project: false })
    const zone = document.querySelector('[class*="fixed"]') as HTMLElement
    expect(store.get(chatComposerBlockedAtom)).toBeTruthy()
    fireEvent.drop(zone, { dataTransfer: startDrag() })
    expect(store.get(chatDraftInputAtom)).toBe('')
  })

  it('leaves the file and text drags alone', async () => {
    renderPanel()
    await screen.findByTestId('messages')
    const files = makeDataTransfer({}, [new File(['x'], 'a.png')])
    expect(fireEvent.dragOver(screen.getByTestId('messages'), { dataTransfer: files })).toBe(true)
    expect(fireEvent.dragOver(screen.getByTestId('messages'), { dataTransfer: makeDataTransfer({ 'text/plain': 'hello' }) })).toBe(true)
  })

  it('does nothing without refs_v1', async () => {
    const store = renderPanel({ features: [] })
    await screen.findByTestId('messages')
    const dt = startDrag()
    expect(fireEvent.dragOver(screen.getByTestId('messages'), { dataTransfer: dt })).toBe(true)
    fireEvent.drop(screen.getByTestId('messages'), { dataTransfer: dt })
    expect(store.get(chatDraftInputAtom)).toBe('')
  })
})
