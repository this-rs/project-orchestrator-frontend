/**
 * What the chat panel says and disables depending on the provider behind the
 * conversation: empty state without a usable instance, deleted instance,
 * provider badge, and the capability guards that live in the panel
 * (policy-only banner, compaction banner, background tasks, resume).
 *
 * With a backend without provider routes, none of it appears.
 *
 * Run with: npx vitest run src/components/chat/ChatPanel.providerState.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import {
  chatBackgroundTasksAtom,
  chatDraftInputAtom,
  chatPanelModeAtom,
  chatSelectedProjectAtom,
  chatSessionCapabilitiesSnapshotAtom,
  chatSessionIdAtom,
  chatSessionModelAtom,
  chatSessionOpenErrorAtom,
  chatSessionProviderAtom,
  chatWorkspaceHasProjectsAtom,
  providersLoadStateAtom,
} from '@/atoms'
import { ApiError } from '@/services/api'
import type { BackgroundTaskInfo, Project } from '@/types'
import type { ProviderCapabilities, ProviderInstance, ProvidersResponse } from '@/types/provider'
import { POLICY_ONLY_TEXT, RESUME_UNSUPPORTED_TEXT } from '@/constants/capabilities'
import { INSTANCE_MISSING_COMPOSER_TEXT, NO_PROVIDER_COMPOSER_TEXT } from '@/constants/providerErrors'

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
  changeAutoContinue: vi.fn(),
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
vi.mock('./ChatMessages', () => ({ ChatMessages: () => <div data-testid="messages" /> }))
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

/** An open conversation on a third-party instance with the given capabilities. */
const onLlama = (capabilities: Partial<ProviderCapabilities>) => (store: Store) => {
  chatStub.sessionId = 's1'
  store.set(chatSessionIdAtom, 's1')
  store.set(chatSessionProviderAtom, { id: 'local-llama', kind: 'openai_compatible', label: 'Local llama-server' })
  store.set(chatSessionModelAtom, 'qwen2.5-coder-32b')
  store.set(chatSessionCapabilitiesSnapshotAtom, capabilities)
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
  Object.assign(chatStub, { sessionId: null, isSending: false, isStreaming: false, isCompacting: false, messages: [] })
  listProviders.mockResolvedValue(listOf(instance('claude-code'), instance('local-llama')))
  getLiveActivity.mockResolvedValue({ generated_at: '', sessions: {} })
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia
})

describe('new conversation — no usable provider', () => {
  it.each(['open', 'fullscreen'] as const)('%s: shows the no_provider card and disables the composer with the reason', async (mode) => {
    listProviders.mockResolvedValue(
      listOf(
        instance('claude-code', { health: { status: 'auth_required' } }),
        instance('local-llama', { allowed_for_project: false }),
      ),
    )
    const store = renderPanel({ mode })
    await ready(store)
    const card = await screen.findByRole('alert')
    expect(card.getAttribute('data-error-code')).toBe('no_provider')
    expect(within(card).getByRole('link', { name: /provider settings/i }).getAttribute('href')).toBe('/providers')
    expect(input().getAttribute('data-disabled')).toBe('true')
    expect(input().getAttribute('data-reason')).toBe(NO_PROVIDER_COMPOSER_TEXT)
  })

  it('an empty instance list is "no provider" too', async () => {
    listProviders.mockResolvedValue(listOf())
    const store = renderPanel()
    await ready(store)
    expect((await screen.findByRole('alert')).getAttribute('data-error-code')).toBe('no_provider')
  })

  it('one healthy, allowed instance is enough: no card, composer enabled', async () => {
    const store = renderPanel()
    await ready(store)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(input().getAttribute('data-disabled')).toBe('false')
    expect(input().getAttribute('data-reason')).toBe('')
  })

  it('a backend WITHOUT provider routes: nothing appears, the composer is as it always was', async () => {
    listProviders.mockRejectedValue(new ApiError(404, 'Not Found'))
    const store = renderPanel()
    await waitFor(() => expect(store.get(providersLoadStateAtom)).toBe('unsupported'))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByTestId('provider-badge')).toBeNull()
    expect(screen.queryByTestId('policy-only-banner')).toBeNull()
    expect(input().getAttribute('data-disabled')).toBe('false')
  })

  it('a list that failed to load blocks nothing', async () => {
    listProviders.mockRejectedValue(new Error('offline'))
    const store = renderPanel()
    await waitFor(() => expect(store.get(providersLoadStateAtom)).toBe('error'))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(input().getAttribute('data-disabled')).toBe('false')
  })
})

describe('a conversation that could not be opened — typed card', () => {
  it('Retry sends the unsent message again, with its attachments', async () => {
    const store = renderPanel({
      prepare: (s) =>
        s.set(chatSessionOpenErrorAtom, {
          info: { code: 'endpoint_unreachable', message: 'connection refused', detail: 'ECONNREFUSED' },
          message: 'connection refused',
          text: 'hello',
          attachments: ['doc-1'],
        }),
    })
    await ready(store)
    const card = await screen.findByTestId('session-open-error')
    expect(card.getAttribute('data-error-code')).toBe('endpoint_unreachable')
    fireEvent.click(within(card).getByRole('button', { name: /retry/i }))
    expect(chatStub.sendMessage).toHaveBeenCalledWith(
      'hello',
      { cwd: '/repo', workspaceSlug: 'ws', projectSlug: undefined },
      ['doc-1'],
    )
  })

  it('Retry sends what is in the composer when the text was edited since', async () => {
    const store = renderPanel({
      prepare: (s) => {
        s.set(chatDraftInputAtom, 'hello, edited')
        s.set(chatSessionOpenErrorAtom, {
          info: { code: 'timeout', message: 'timed out', retryable: true },
          message: 'timed out',
          text: 'hello',
          attachments: [],
        })
      },
    })
    await ready(store)
    fireEvent.click(within(await screen.findByTestId('session-open-error')).getByRole('button', { name: /retry/i }))
    expect(chatStub.sendMessage.mock.calls[0][0]).toBe('hello, edited')
  })

  it('the consent card names the project the chat is about', async () => {
    renderPanel({
      prepare: (s) =>
        s.set(chatSessionOpenErrorAtom, {
          info: { code: 'endpoint_not_allowed', message: '', origin: 'https://api.deepseek.com' },
          message: 'Forbidden',
          text: 'hello',
          attachments: [],
        }),
    })
    const card = await screen.findByTestId('session-open-error')
    expect(within(card).getByRole('link', { name: /consent/i }).getAttribute('href')).toBe('/providers?project=demo#consent')
  })
})

describe('provider badge in the header', () => {
  it.each(['open', 'fullscreen'] as const)('%s: names the instance and the short model of the conversation', async (mode) => {
    const store = renderPanel({ mode, prepare: onLlama(FULL) })
    await ready(store)
    const badge = await screen.findByTestId('provider-badge')
    expect(badge.textContent).toBe('Local llama-server· qwen2.5-coder-32b')
  })

  it('a session without provider on a multi-instance server is badged Claude Code', async () => {
    const store = renderPanel({
      prepare: (s) => {
        chatStub.sessionId = 's1'
        s.set(chatSessionIdAtom, 's1')
        s.set(chatSessionModelAtom, 'claude-opus-4-5-20251101')
      },
    })
    await ready(store)
    expect((await screen.findByTestId('provider-badge')).textContent).toBe('Claude Code· opus-4-5')
  })

  it('a session without provider on a single-instance server gets no badge', async () => {
    listProviders.mockResolvedValue(listOf(instance('claude-code')))
    const store = renderPanel({
      prepare: (s) => {
        chatStub.sessionId = 's1'
        s.set(chatSessionIdAtom, 's1')
      },
    })
    await ready(store)
    expect(screen.queryByTestId('provider-badge')).toBeNull()
  })

  it('a new conversation has no badge (the picker already says it)', async () => {
    const store = renderPanel()
    await ready(store)
    expect(screen.queryByTestId('provider-badge')).toBeNull()
  })
})

describe('the instance of the conversation was deleted', () => {
  it('badge "unavailable", instance_not_found card, composer disabled with the reason', async () => {
    listProviders.mockResolvedValue(listOf(instance('claude-code')))
    const store = renderPanel({ prepare: onLlama(FULL) })
    await ready(store)
    const badge = await screen.findByTestId('provider-badge')
    expect(badge.getAttribute('data-unavailable')).toBe('true')
    const card = screen.getByRole('alert')
    expect(card.getAttribute('data-error-code')).toBe('instance_not_found')
    expect(input().getAttribute('data-disabled')).toBe('true')
    expect(input().getAttribute('data-reason')).toBe(INSTANCE_MISSING_COMPOSER_TEXT)

    fireEvent.click(within(card).getByRole('button', { name: /start a new conversation/i }))
    expect(chatStub.newSession).toHaveBeenCalled()
  })

  it('while the list is not loaded, nothing is declared missing', async () => {
    listProviders.mockRejectedValue(new Error('offline'))
    const store = renderPanel({ prepare: onLlama(FULL) })
    await waitFor(() => expect(store.get(providersLoadStateAtom)).toBe('error'))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(input().getAttribute('data-disabled')).toBe('false')
  })
})

describe('remote Claude Code conversation', () => {
  const onRemote = (store: Store) => {
    chatStub.sessionId = 's1'
    store.set(chatSessionIdAtom, 's1')
    store.set(chatSessionProviderAtom, { id: 'claude-code@lab', kind: 'claude_code_remote', label: 'Claude Code' })
    store.set(chatSessionModelAtom, 'claude-sonnet-5')
    store.set(chatSessionCapabilitiesSnapshotAtom, { ...FULL, per_session_mcp: false, tool_cancel: false })
  }

  it('says it has no PO tools (MCP) in this version, and the badge shows claude-code@lab', async () => {
    listProviders.mockResolvedValue(
      listOf(instance('claude-code'), instance('claude-code@lab', { kind: 'claude_code_remote', label: 'Claude Code' })),
    )
    const store = renderPanel({ prepare: onRemote })
    await ready(store)
    const banner = screen.getByTestId('remote-no-tools-banner')
    expect(banner.textContent).toContain('claude-code@lab')
    expect(banner.textContent).toContain('outils PO (MCP)')
    expect(screen.getByTestId('dock').contains(banner)).toBe(true)
    expect((await screen.findByTestId('provider-badge')).textContent).toContain('claude-code@lab')
  })

  it('the local Claude Code gets no such banner', async () => {
    const store = renderPanel({
      prepare: (s) => {
        chatStub.sessionId = 's1'
        s.set(chatSessionIdAtom, 's1')
      },
    })
    await ready(store)
    expect(screen.queryByTestId('remote-no-tools-banner')).toBeNull()
  })
})

describe('capability guards of the panel', () => {
  it('interactive_permissions: false — the "Policy only" banner is shown above the composer', async () => {
    const store = renderPanel({ prepare: onLlama({ ...FULL, interactive_permissions: false }) })
    await ready(store)
    const banner = screen.getByTestId('policy-only-banner')
    expect(banner.textContent).toContain(POLICY_ONLY_TEXT)
    expect(screen.getByTestId('dock').contains(banner)).toBe(true)
  })

  it('interactive_permissions: true — no banner', async () => {
    const store = renderPanel({ prepare: onLlama(FULL) })
    await ready(store)
    expect(screen.queryByTestId('policy-only-banner')).toBeNull()
  })

  it('compaction_signal: false — no compaction banner, even if a compaction flag is set', async () => {
    chatStub.isCompacting = true
    const store = renderPanel({ prepare: onLlama({ ...FULL, compaction_signal: false }) })
    await ready(store)
    expect(screen.queryByText('Compacting context')).toBeNull()
  })

  it('compaction_signal: true — the banner shows while compacting', async () => {
    chatStub.isCompacting = true
    const store = renderPanel({ prepare: onLlama(FULL) })
    await ready(store)
    expect(screen.getByText('Compacting context')).toBeTruthy()
  })

  const TASKS = [
    { id: 't1', kind: 'bash', description: 'npm run dev', started_at: new Date().toISOString(), last_seen_at: new Date().toISOString(), pid: null },
  ] as unknown as BackgroundTaskInfo[]

  it('background_tasks: false — tracked tasks are not listed in the activity bar', async () => {
    const store = renderPanel({
      prepare: (s) => {
        onLlama({ ...FULL, background_tasks: false })(s)
        s.set(chatBackgroundTasksAtom, TASKS)
      },
    })
    await ready(store)
    expect(input().getAttribute('data-activity')).toBe('')
  })

  it('background_tasks: true — tracked tasks are listed', async () => {
    const store = renderPanel({
      prepare: (s) => {
        onLlama(FULL)(s)
        s.set(chatBackgroundTasksAtom, TASKS)
      },
    })
    await ready(store)
    expect(input().getAttribute('data-activity')).not.toBe('')
  })

  it('resume: false on a session whose process is gone — sending is disabled, with the explanation', async () => {
    getLiveActivity.mockResolvedValue({ generated_at: '', sessions: { s1: { live: false } } })
    const store = renderPanel({ prepare: onLlama({ ...FULL, resume: false }) })
    await ready(store)
    await waitFor(() => expect(input().getAttribute('data-disabled')).toBe('true'))
    expect(input().getAttribute('data-reason')).toBe(RESUME_UNSUPPORTED_TEXT)
    expect(RESUME_UNSUPPORTED_TEXT).toContain('This provider cannot resume a conversation')
  })

  it('resume: false, session absent from live activity (quiet) — also blocked', async () => {
    const store = renderPanel({ prepare: onLlama({ ...FULL, resume: false }) })
    await ready(store)
    await waitFor(() => expect(input().getAttribute('data-reason')).toBe(RESUME_UNSUPPORTED_TEXT))
  })

  it('resume: false but the process is alive — the conversation goes on', async () => {
    getLiveActivity.mockResolvedValue({ generated_at: '', sessions: { s1: { live: true } } })
    const store = renderPanel({ prepare: onLlama({ ...FULL, resume: false }) })
    await ready(store)
    await waitFor(() => expect(getLiveActivity).toHaveBeenCalled())
    expect(input().getAttribute('data-disabled')).toBe('false')
  })

  it('resume: false while a turn streams — never blocked, never asked', async () => {
    chatStub.isStreaming = true
    const store = renderPanel({ prepare: onLlama({ ...FULL, resume: false }) })
    await ready(store)
    expect(getLiveActivity).not.toHaveBeenCalled()
    expect(input().getAttribute('data-disabled')).toBe('false')
  })

  it('resume: true — live activity is not even asked', async () => {
    const store = renderPanel({ prepare: onLlama(FULL) })
    await ready(store)
    expect(getLiveActivity).not.toHaveBeenCalled()
    expect(input().getAttribute('data-disabled')).toBe('false')
  })
})
