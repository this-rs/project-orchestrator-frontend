/**
 * The read-only mirror of a Claude Code sub-agent (P18c, `mirror_of`): the
 * sub-agent runs inside its parent's Claude Code session, so its mirror child
 * in PO cannot be written to — the composer is off and says why, and a banner
 * says what the conversation is. A normal session keeps its composer.
 *
 * Run with: npx vitest run src/components/chat/ChatPanel.mirror.test.tsx
 */
import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import {
  chatPanelModeAtom,
  chatSelectedProjectAtom,
  chatSessionCapabilitiesSnapshotAtom,
  chatSessionIdAtom,
  chatSessionModelAtom,
  chatSessionProviderAtom,
  chatWorkspaceHasProjectsAtom,
  providersLoadStateAtom,
} from '@/atoms'
import type { Project } from '@/types'
import type { ProviderCapabilities, ProviderInstance, ProvidersResponse } from '@/types/provider'
import { mirrorReadOnlyComposerText } from '@/constants/providerErrors'

const chatStub = {
  sessionId: null as string | null,
  isSending: false,
  messages: [] as unknown[],
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
  sessionMeta: null,
}

const listProviders = vi.fn()
const getLiveActivity = vi.fn()

vi.mock('@/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks')>()),
  useChat: () => chatStub,
  useDetachedRuns: () => ({ runs: [], hasActiveRuns: false }),
  useVisualViewportHeight: () => undefined,
  useWindowFullscreen: () => false,
  useWorkspaceSlug: () => 'ws',
}))
vi.mock('@/hooks/useChatUrlSync', () => ({ useChatUrlSync: () => undefined }))
vi.mock('@/services/chat', () => ({
  chatApi: {
    getSession: vi.fn().mockResolvedValue(null),
    getLiveActivity: (...a: unknown[]) => getLiveActivity(...a),
  },
}))
vi.mock('@/services/providers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/providers')>()),
  providersApi: { list: (...a: unknown[]) => listProviders(...a), status: vi.fn() },
}))
vi.mock('@/components/discussions/AttachSessionButton', () => ({ AttachSessionButton: () => null }))
vi.mock('@/components/discussions/DiscussionTreeView', () => ({ DiscussionTreeView: () => null }))
vi.mock('./ChatMessages', () => ({ ChatMessages: ({ isCompacting }: { isCompacting?: boolean }) => <div data-testid="messages">{isCompacting ? 'Compacting context' : null}</div> }))
vi.mock('./ComposerDock', () => ({
  ComposerDock: ({ children }: { children: ReactNode }) => <div data-testid="dock">{children}</div>,
}))
// The real composer is tested on its own; here only what the panel hands it matters.
vi.mock('./ChatInput', () => ({
  ChatInput: (props: { disabled?: boolean; disabledReason?: string | null; activity?: { kind: string }[] }) => (
    <div
      data-testid="input"
      data-disabled={String(!!props.disabled)}
      data-reason={props.disabledReason ?? ''}
      data-activity={(props.activity ?? []).map((a) => a.kind).join(',')}
    />
  ),
}))
vi.mock('./SecretRequestTray', () => ({ SecretRequestTray: () => null }))
vi.mock('./DetachedRunsPanel', () => ({ DetachedRunsPanel: () => null }))
vi.mock('./SessionList', () => ({ SessionList: () => null }))
vi.mock('./ProjectSelect', () => ({ ProjectSelect: () => null }))
vi.mock('./PermissionSettingsPanel', () => ({ PermissionSettingsPanel: () => null }))
vi.mock('./SessionBreadcrumb', () => ({ SessionBreadcrumb: () => null }))

import { ChatPanel } from './ChatPanel'

const instance = (id: string, over: Partial<ProviderInstance> = {}): ProviderInstance => ({
  id,
  kind: id === 'claude-code' ? 'claude_code' : 'openai_compatible',
  label: id === 'claude-code' ? 'Claude Code' : 'Local llama-server',
  health: { status: 'healthy' },
  models: [],
  ...over,
})
const listOf = (...providers: ProviderInstance[]): ProvidersResponse => ({ providers })

type Store = ReturnType<typeof createStore>

function renderPanel(options: { mode?: 'open' | 'fullscreen'; prepare?: (store: Store) => void } = {}) {
  const store = createStore()
  store.set(chatPanelModeAtom, options.mode ?? 'open')
  store.set(chatWorkspaceHasProjectsAtom, true)
  store.set(chatSelectedProjectAtom, { id: 'p1', slug: 'demo', name: 'Demo', root_path: '/repo' } as unknown as Project)
  options.prepare?.(store)
  render(
    <Provider store={store}>
      <MemoryRouter>
        <ChatPanel />
      </MemoryRouter>
    </Provider>,
  )
  return store
}

/** Every capability on, so one test turns exactly one off. */
const FULL: Partial<ProviderCapabilities> = {
  interactive_permissions: true,
  permission_scopes: ['once', 'session'],
  compaction_signal: true,
  thinking: true,
  images: true,
  tools: true,
  background_tasks: true,
  tool_cancel: true,
  native_question: true,
  resume: true,
  subagents: 'nested',
}

const input = () => screen.getByTestId('input')
const ready = (store: Store) => waitFor(() => expect(store.get(providersLoadStateAtom)).toBe('ready'))

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(chatStub, { sessionId: null, isSending: false, isStreaming: false, isCompacting: false, messages: [], sessionMeta: null })
  listProviders.mockResolvedValue(listOf(instance('claude-code'), instance('local-llama')))
  getLiveActivity.mockResolvedValue({ generated_at: '', sessions: {} })
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia
})

/** An open Claude Code conversation; `mirrorOf` set = the mirror of a sub-agent. */
const onClaudeCode = (mirrorOf: string | null) => (store: Store) => {
  chatStub.sessionId = 'child-1'
  Object.assign(chatStub, {
    sessionMeta: {
      cwd: '/repo',
      spawnedBy: { type: 'conversation', parent_session_id: 'parent-1', tool_use_id: 'toolu_1' },
      mirrorOf,
    },
  })
  store.set(chatSessionIdAtom, 'child-1')
  store.set(chatSessionProviderAtom, { id: 'claude-code', kind: 'claude_code', label: 'Claude Code' })
  store.set(chatSessionModelAtom, 'claude-sonnet')
  store.set(chatSessionCapabilitiesSnapshotAtom, FULL)
}

describe('a read-only mirror of a Claude Code sub-agent', () => {
  it.each(['open', 'fullscreen'] as const)('%s: the composer is off, says why, and a banner names the mirror', async (mode) => {
    const store = renderPanel({ mode, prepare: onClaudeCode('claude_code') })
    await ready(store)
    expect(input().getAttribute('data-disabled')).toBe('true')
    expect(input().getAttribute('data-reason')).toBe(mirrorReadOnlyComposerText())
    expect(mirrorReadOnlyComposerText()).toMatch(/Read-only/)
    expect(screen.getByTestId('mirror-readonly-banner')).toHaveTextContent('Read-only mirror of a Claude Code sub-agent')
  })

  it('a mirror value this client does not know yet is still read-only', async () => {
    const store = renderPanel({ prepare: onClaudeCode('some_future_cli') })
    await ready(store)
    expect(input().getAttribute('data-disabled')).toBe('true')
  })

  it('a normal child (no mirror_of, or a backend without mirrors) keeps its composer', async () => {
    const store = renderPanel({ prepare: onClaudeCode(null) })
    await ready(store)
    expect(input().getAttribute('data-disabled')).toBe('false')
    expect(input().getAttribute('data-reason')).toBe('')
    expect(screen.queryByTestId('mirror-readonly-banner')).not.toBeInTheDocument()
  })
})
