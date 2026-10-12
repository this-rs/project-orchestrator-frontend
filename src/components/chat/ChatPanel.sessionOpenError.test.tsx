/**
 * A conversation that could not be opened: ChatPanel says so above the
 * composer, and a send never ends as an unhandled rejection.
 *
 * Run with: npx vitest run src/components/chat/ChatPanel.sessionOpenError.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import {
  chatPanelModeAtom,
  chatSelectedProjectAtom,
  chatSessionOpenErrorAtom,
  chatWorkspaceHasProjectsAtom,
  providersLoadStateAtom,
  type ChatSessionOpenError,
} from '@/atoms'
import type { Project } from '@/types'
import {
  chatOneOffProviderPickAtom,
  providersAtom,
  chatDraftAutoAtom,
  chatDraftSelectionAtom,
  chatForcedTargetAtom,
  chatSelectedProviderAtom,
  chatSessionModelAtom,
} from '@/atoms'

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
const unlockVault = vi.fn()
const allowForProject = vi.fn()

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
  providersApi: { list: (...a: unknown[]) => listProviders(...a), allowForProject: (...a: unknown[]) => allowForProject(...a) },
}))
vi.mock('@/services/vault', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/vault')>()),
  vaultApi: { unlock: (...a: unknown[]) => unlockVault(...a) },
}))
vi.mock('@/components/discussions/AttachSessionButton', () => ({ AttachSessionButton: () => null }))
vi.mock('@/components/discussions/DiscussionTreeView', () => ({ DiscussionTreeView: () => null }))
vi.mock('./ChatMessages', () => ({ ChatMessages: () => <div data-testid="messages" /> }))
vi.mock('./ComposerDock', () => ({
  ComposerDock: ({ children }: { children: ReactNode }) => <div data-testid="dock">{children}</div>,
}))
vi.mock('./ChatInput', () => ({
  ChatInput: ({ onSend }: { onSend: (text: string, ids?: string[]) => void }) => (
    <>
      <button data-testid="input" onClick={() => onSend('hello', ['doc-1'])}>send</button>
      <textarea data-chat-composer="true" aria-label="composer" />
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

const TYPED: ChatSessionOpenError = {
  info: { code: 'auth_required', message: 'Codex is not signed in', login_hint: 'codex login', status: 401 },
  message: 'Codex is not signed in',
  text: 'hello',
  attachments: [],
}
const UNTYPED: ChatSessionOpenError = { info: null, message: 'Internal Server Error', text: 'hello', attachments: [] }

function renderPanel(mode: 'open' | 'fullscreen', prepare?: (store: ReturnType<typeof createStore>) => void) {
  const store = createStore()
  store.set(chatPanelModeAtom, mode)
  store.set(chatWorkspaceHasProjectsAtom, true)
  store.set(chatSelectedProjectAtom, { id: 'p1', slug: 'demo', name: 'Demo', root_path: '/repo' } as unknown as Project)
  prepare?.(store)
  render(
    <Provider store={store}>
      <MemoryRouter>
        <ChatPanel />
      </MemoryRouter>
    </Provider>,
  )
  return store
}

beforeEach(() => {
  vi.clearAllMocks()
  listProviders.mockRejectedValue(new Error('offline'))
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia
})

describe('ChatPanel — a conversation that could not be opened', () => {
  it.each(['fullscreen', 'open'] as const)('%s: shows nothing while there is no error', async (mode) => {
    renderPanel(mode)
    await screen.findByTestId('input')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it.each(['fullscreen', 'open'] as const)('%s: says why above the composer, and Dismiss clears it', async (mode) => {
    const store = renderPanel(mode, (s) => s.set(chatSessionOpenErrorAtom, TYPED))
    const alert = await screen.findByRole('alert')
    expect(screen.getByTestId('dock').contains(alert)).toBe(true)
    expect(alert.textContent).toContain('Codex is not signed in')
    // The typed code is on the element: the per-code cards plug in here.
    expect(alert.getAttribute('data-error-code')).toBe('auth_required')

    fireEvent.click(within(alert).getByRole('button', { name: 'Dismiss' }))
    expect(store.get(chatSessionOpenErrorAtom)).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows the generic message of an untyped failure', async () => {
    renderPanel('open', (s) => s.set(chatSessionOpenErrorAtom, UNTYPED))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Internal Server Error')
    expect(alert.getAttribute('data-error-code')).toBeNull()
  })

  it('loads the provider instances for the selected project when the chat mounts', async () => {
    const store = renderPanel('open')
    await screen.findByTestId('input')
    expect(listProviders).toHaveBeenCalledWith({ project_slug: 'demo' })
    await vi.waitFor(() => expect(store.get(providersLoadStateAtom)).toBe('error'))
  })

  it('a send that rejects is caught, not left as an unhandled rejection', async () => {
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      chatStub.sendMessage.mockRejectedValue(new Error('socket exploded'))
      renderPanel('open')
      fireEvent.click(await screen.findByTestId('input'))
      expect(chatStub.sendMessage).toHaveBeenCalledWith(
        'hello',
        { cwd: '/repo', workspaceSlug: 'ws', projectSlug: undefined },
        ['doc-1'],
      )
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20))
      })
      expect(unhandled).not.toHaveBeenCalled()
      expect(logged).toHaveBeenCalledWith('Send failed', expect.any(Error))
    } finally {
      process.off('unhandledRejection', unhandled)
      logged.mockRestore()
    }
  })
})

describe('ChatPanel — Auto refused on a locked vault', () => {
  it('a fallback model makes the draft strict on it and sends the message again', async () => {
    const store = renderPanel('open', (s) => {
      s.set(chatDraftAutoAtom, true)
      s.set(chatSessionOpenErrorAtom, {
        info: {
          code: 'credentials_locked',
          message: 'The credential store is locked. Unlock it and try again.',
          fallbacks: [{ provider_id: 'ollama', model: 'qwen3' }],
          status: 423,
        },
        message: 'The credential store is locked. Unlock it and try again.',
        text: 'Plan the release',
        attachments: [],
      })
    })
    // Warning tone (fallbacks offered) and still announced: role="alert" in both tones.
    const card = await screen.findByRole('alert')
    expect(card.getAttribute('data-tone')).toBe('warning')
    fireEvent.click(within(card).getByTestId('locked-vault-fallback'))
    expect(store.get(chatDraftAutoAtom)).toBe(false)
    expect(store.get(chatDraftSelectionAtom)).toEqual([{ provider: 'ollama', model: 'qwen3' }])
    expect(store.get(chatSelectedProviderAtom)).toBe('ollama')
    expect(store.get(chatSessionModelAtom)).toBe('qwen3')
    expect(store.get(chatForcedTargetAtom)).toBe(true)
    expect(chatStub.sendMessage).toHaveBeenCalledTimes(1)
    expect(chatStub.sendMessage.mock.calls[0][0]).toBe('Plan the release')
  })
})

/** Auto refused on the locked vault, with what Auto could use instead. */
function lockedAuto(fallbacks?: { provider_id: string; model: string }[]): ChatSessionOpenError {
  return {
    info: {
      code: 'credentials_locked',
      message: 'The credential store is locked. Unlock it and try again.',
      ...(fallbacks ? { fallbacks } : { provider_id: 'openai' }),
      status: 423,
    },
    message: 'The credential store is locked. Unlock it and try again.',
    text: 'Plan the release',
    attachments: [],
  }
}

/** The unlock the card starts, held until the test lets it answer. */
function heldUnlock() {
  let answer!: () => void
  unlockVault.mockImplementation(() => new Promise<void>((resolve) => (answer = resolve)))
  return {
    finish: async () => {
      await act(async () => {
        answer()
      })
    },
  }
}

function startUnlock(alert: HTMLElement) {
  const input = within(alert).getByPlaceholderText('Vault passphrase')
  fireEvent.change(input, { target: { value: 'correct horse' } })
  fireEvent.submit(input.closest('form')!)
}

describe('ChatPanel — the unlock started in the card (review of #335)', () => {
  /** As the real `sendMessage` does: a send clears the failure, so the card goes away. */
  function sendClears(store: ReturnType<typeof createStore>) {
    chatStub.sendMessage.mockImplementation(async () => {
      store.set(chatSessionOpenErrorAtom, null)
    })
  }

  it('a fallback cannot be picked while the unlock runs: the message goes out once', async () => {
    const store = renderPanel('open', (s) => {
      s.set(chatDraftAutoAtom, true)
      s.set(chatSessionOpenErrorAtom, lockedAuto([{ provider_id: 'ollama', model: 'qwen3' }]))
    })
    sendClears(store)
    const unlock = heldUnlock()
    // Warning tone (fallbacks offered) and still announced: role="alert" in both tones.
    const card = await screen.findByRole('alert')
    expect(card.getAttribute('data-tone')).toBe('warning')
    startUnlock(card)
    const fallback = within(card).getByTestId('locked-vault-fallback')
    expect(fallback).toHaveProperty('disabled', true)
    fireEvent.click(fallback)
    await unlock.finish()
    expect(chatStub.sendMessage).toHaveBeenCalledTimes(1)
    expect(chatStub.sendMessage.mock.calls[0][0]).toBe('Plan the release')
    // Sent by the unlock, on Auto: the draft was not made strict on the fallback.
    expect(store.get(chatForcedTargetAtom)).toBe(false)
  })

  it('an unlock that ends after the card was dismissed sends nothing', async () => {
    const store = renderPanel('open', (s) => s.set(chatSessionOpenErrorAtom, lockedAuto([])))
    sendClears(store)
    const unlock = heldUnlock()
    const alert = await screen.findByRole('alert')
    startUnlock(alert)
    fireEvent.click(within(alert).getByRole('button', { name: 'Dismiss' }))
    await unlock.finish()
    expect(chatStub.sendMessage).not.toHaveBeenCalled()
  })

  it('an unlock that ends after another failure replaced the one it was for sends nothing', async () => {
    const store = renderPanel('open', (s) => s.set(chatSessionOpenErrorAtom, lockedAuto([])))
    sendClears(store)
    const unlock = heldUnlock()
    const alert = await screen.findByRole('alert')
    startUnlock(alert)
    // Same card, same form (still mounted), but no longer the same failure.
    act(() => store.set(chatSessionOpenErrorAtom, { ...lockedAuto([]), text: 'Another message' }))
    await unlock.finish()
    expect(chatStub.sendMessage).not.toHaveBeenCalled()
  })

  it('after the unlock the message goes out, the focus is on the composer and the unlock is said', async () => {
    const store = renderPanel('open', (s) => s.set(chatSessionOpenErrorAtom, lockedAuto([])))
    sendClears(store)
    const unlock = heldUnlock()
    startUnlock(await screen.findByRole('alert'))
    await unlock.finish()
    expect(chatStub.sendMessage).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByTestId('session-open-resent').textContent).toBe('Vault unlocked: your message is being sent again.')
    await vi.waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('composer')))
  })

  it('a fallback picked returns the focus to the composer', async () => {
    const store = renderPanel('open', (s) =>
      s.set(chatSessionOpenErrorAtom, lockedAuto([{ provider_id: 'ollama', model: 'qwen3' }])),
    )
    sendClears(store)
    fireEvent.click(within(await screen.findByRole('alert')).getByTestId('locked-vault-fallback'))
    expect(chatStub.sendMessage).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('composer')))
  })

  /** Review of #335, finding 3: a NAMED instance's locked key (no `fallbacks`) gets the unlock too, without models. */
  it('a named instance whose key is locked: unlock in place and send again, no model offered', async () => {
    const store = renderPanel('open', (s) => s.set(chatSessionOpenErrorAtom, lockedAuto()))
    sendClears(store)
    const unlock = heldUnlock()
    const alert = await screen.findByRole('alert')
    expect(within(alert).queryByTestId('locked-vault-fallback')).toBeNull()
    startUnlock(alert)
    await unlock.finish()
    expect(chatStub.sendMessage).toHaveBeenCalledTimes(1)
    expect(chatStub.sendMessage.mock.calls[0][0]).toBe('Plan the release')
  })
})

describe('ChatPanel — the refusals of backend #722', () => {
  const LIST = {
    providers: [
      { id: 'claude-code', kind: 'claude_code', label: 'Claude Code', builtin: true, health: { status: 'unhealthy' as const }, models: [] },
      { id: 'deepseek', kind: 'openai_compatible', label: 'DeepSeek', origin: 'https://api.deepseek.com', health: { status: 'healthy' as const }, models: [] },
    ],
    default: null,
  }
  const sendClears = (store: ReturnType<typeof createStore>) =>
    chatStub.sendMessage.mockImplementation(async () => {
      store.set(chatSessionOpenErrorAtom, null)
    })
  beforeEach(() => {
    listProviders.mockResolvedValue(LIST)
    allowForProject.mockReset().mockResolvedValue({})
  })

  it('after a consent the message goes out, the focus is on the composer and it is said where it stays', async () => {
    const store = renderPanel('open', (s) => {
      s.set(providersAtom, LIST)
      s.set(providersLoadStateAtom, 'ready')
      s.set(chatSessionOpenErrorAtom, {
        info: { code: 'endpoint_not_allowed', message: '', provider_id: 'deepseek', consent_scope: 'project', status: 403 },
        message: '',
        text: 'hello',
        attachments: [],
      })
    })
    sendClears(store)
    fireEvent.click(within(await screen.findByRole('alert')).getByTestId('consent-allow'))
    await vi.waitFor(() => expect(chatStub.sendMessage).toHaveBeenCalledTimes(1))
    expect(allowForProject).toHaveBeenCalledWith('demo', 'deepseek', 'https://api.deepseek.com')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByTestId('session-open-resent').textContent).toBe('Allowed. Your message is sent again.')
    await vi.waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('composer')))
  })

  it('a candidate picked, then the card dismissed: the pick it covered goes with it', async () => {
    const store = renderPanel('open', (s) => {
      s.set(providersAtom, LIST)
      s.set(providersLoadStateAtom, 'ready')
      s.set(chatSessionOpenErrorAtom, {
        info: { code: 'provider_not_chosen', message: '', candidates: ['deepseek'], status: 409 },
        message: '',
        text: 'hello',
        attachments: [],
      })
    })
    // The send does not clear the failure here: the card stays to be dismissed.
    chatStub.sendMessage.mockImplementation(async () => {})
    const card = await screen.findByRole('alert')
    fireEvent.click(within(card).getByRole('button', { name: 'Use DeepSeek' }))
    expect(store.get(chatOneOffProviderPickAtom)).toBe(true)
    fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Dismiss' }))
    expect(store.get(chatSelectedProviderAtom)).toBeNull()
    expect(store.get(chatOneOffProviderPickAtom)).toBe(false)
  })

  it('a candidate picked is named for this opening only', async () => {
    const store = renderPanel('open', (s) => {
      s.set(providersAtom, LIST)
      s.set(providersLoadStateAtom, 'ready')
      s.set(chatSessionOpenErrorAtom, {
        info: { code: 'provider_not_chosen', message: '', candidates: ['deepseek'], status: 409 },
        message: '',
        text: 'hello',
        attachments: [],
      })
    })
    sendClears(store)
    fireEvent.click(within(await screen.findByRole('alert')).getByRole('button', { name: 'Use DeepSeek' }))
    expect(chatStub.sendMessage).toHaveBeenCalledTimes(1)
    expect(store.get(chatSelectedProviderAtom)).toBe('deepseek')
    expect(store.get(chatOneOffProviderPickAtom)).toBe(true)
    await vi.waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('composer')))
  })
})
