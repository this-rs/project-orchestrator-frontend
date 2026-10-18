/**
 * ChatPanel without a project (neutral place) and « Demander ici »: the question
 * is asked in a NEW conversation, then the confirmed anchors are placed on it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { chatDraftInputAtom, chatNeutralPlaceAtom, chatPanelModeAtom, chatProjectsLoadedAtom, chatSelectedProjectAtom, chatWorkspaceHasProjectsAtom } from '@/atoms'
import { askHereRequestAtom } from '@/atoms/anchors'
import { toastMessagesAtom } from '@/atoms/ui'
import { chatComposerBlockedAtom } from '@/refs/source/addToChat'
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
const placeAnchors = vi.fn()
vi.mock('@/components/anchors/placeAnchors', () => ({ placeAnchors: (...a: unknown[]) => placeAnchors(...a) }))
vi.mock('@/components/anchors/SessionAnchorsBar', () => ({ SessionAnchorsBar: ({ sessionId }: { sessionId: string | null }) => <div data-testid="anchors-bar">{sessionId}</div> }))
vi.mock('./SessionBreadcrumb', () => ({ SessionBreadcrumb: () => null }))

import { ChatPanel } from './ChatPanel'

const PLAN = '22222222-2222-4222-8222-222222222222'

beforeEach(() => {
  vi.clearAllMocks()
  chatStub.sessionId = null
  chatStub.sendMessage.mockResolvedValue(undefined)
  placeAnchors.mockResolvedValue(true)
  listProviders.mockRejectedValue(new Error('offline'))
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia
})

function renderPanel(opts: { projects?: boolean; loaded?: boolean; neutral?: boolean } = {}) {
  const store = createStore()
  store.set(chatPanelModeAtom, 'open')
  store.set(chatWorkspaceHasProjectsAtom, opts.projects ?? false)
  store.set(chatProjectsLoadedAtom, opts.loaded ?? true)
  store.set(chatNeutralPlaceAtom, opts.neutral ?? false)
  if (opts.projects) store.set(chatSelectedProjectAtom, { id: 'p1', slug: 'demo', name: 'Demo', root_path: '/repo' } as unknown as Project)
  const tree = () => <Provider store={store}><MemoryRouter><ChatPanel /></MemoryRouter></Provider>
  const view = render(tree())
  return { store, rerender: () => view.rerender(tree()) }
}

describe('ChatPanel — a conversation without a project', () => {
  it('a workspace without projects opens it in the neutral place: no cwd, no project, said on screen', async () => {
    renderPanel()
    expect(await screen.findByTestId('neutral-place-notice')).toBeTruthy()
    expect(screen.getByText(/neutral place, read-only/)).toBeTruthy()
    expect(screen.getByRole('link', { name: /Add a project/ })).toBeTruthy()
    fireEvent.click(screen.getByTestId('input'))
    expect(chatStub.sendMessage).toHaveBeenCalledWith('hello', { cwd: '' }, ['doc-1'])
  })

  it('« No project » picked in a workspace that has some: neutral too, without the add-project link', async () => {
    renderPanel({ projects: true, neutral: true })
    expect(await screen.findByTestId('neutral-place-notice')).toBeTruthy()
    expect(screen.queryByRole('link', { name: /Add a project/ })).toBeNull()
    fireEvent.click(screen.getByTestId('input'))
    expect(chatStub.sendMessage).toHaveBeenCalledWith('hello', { cwd: '' }, ['doc-1'])
  })

  it('while the project list has not answered, nothing is sent (never a neutral chat by accident)', async () => {
    const { store } = renderPanel({ loaded: false })
    fireEvent.click(await screen.findByTestId('input'))
    expect(chatStub.sendMessage).not.toHaveBeenCalled()
    expect(store.get(chatComposerBlockedAtom)).toBeTruthy()
    expect(screen.queryByTestId('neutral-place-notice')).toBeNull()
  })

  it('a project picked keeps the behaviour of before', async () => {
    renderPanel({ projects: true })
    fireEvent.click(await screen.findByTestId('input'))
    expect(chatStub.sendMessage).toHaveBeenCalledWith('hello', { cwd: '/repo', workspaceSlug: 'ws', projectSlug: undefined }, ['doc-1'])
    expect(screen.queryByTestId('neutral-place-notice')).toBeNull()
  })
})

describe('ChatPanel — « Demander ici »', () => {
  const request = {
    id: 1,
    text: `Why? #plan:${PLAN}`,
    refs: [{ kind: 'plan', id: PLAN, label: 'Auth flow' }],
    anchors: [{ target_type: 'plan' as const, target_id: PLAN, roles: ['focus' as const] }],
  }

  it('asks the question in a new conversation, then places the confirmed anchors on it', async () => {
    const { store, rerender } = renderPanel()
    act(() => store.set(askHereRequestAtom, request))
    await waitFor(() => expect(chatStub.sendMessage).toHaveBeenCalledWith(request.text, { cwd: '' }, undefined, request.refs))
    expect(store.get(askHereRequestAtom)).toBeNull()
    expect(placeAnchors).not.toHaveBeenCalled()
    chatStub.sessionId = 's9'
    rerender()
    await waitFor(() => expect(placeAnchors).toHaveBeenCalledWith('s9', request.anchors))
    expect(screen.getByTestId('anchors-bar').textContent).toBe('s9')
  })

  it('leaves the conversation on screen first (a new one is opened)', async () => {
    chatStub.sessionId = 's1'
    const { store } = renderPanel({ projects: true })
    act(() => store.set(askHereRequestAtom, { ...request, anchors: [] }))
    await waitFor(() => expect(chatStub.newSession).toHaveBeenCalled())
    expect(chatStub.sendMessage).not.toHaveBeenCalled()
  })

  it('a composer that cannot send keeps the question in the draft, nothing is lost', async () => {
    const { store } = renderPanel({ loaded: false })
    act(() => store.set(askHereRequestAtom, request))
    await waitFor(() => expect(store.get(chatDraftInputAtom)).toBe(request.text))
    expect(chatStub.sendMessage).not.toHaveBeenCalled()
    expect(store.get(askHereRequestAtom)).toBeNull()
  })

  it('anchors that could not all be placed are reported, the conversation stays', async () => {
    placeAnchors.mockResolvedValue(false)
    const { store, rerender } = renderPanel()
    act(() => store.set(askHereRequestAtom, request))
    await waitFor(() => expect(chatStub.sendMessage).toHaveBeenCalled())
    chatStub.sessionId = 's9'
    rerender()
    await waitFor(() => expect(placeAnchors).toHaveBeenCalled())
    await waitFor(() => expect(store.get(toastMessagesAtom).map((m) => m.message)).toContain('The conversation is open, but its anchors could not all be placed.'))
  })
})
