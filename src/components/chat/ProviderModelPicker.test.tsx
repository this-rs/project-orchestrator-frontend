/**
 * Provider and model — one chip, one menu — in the composer.
 *
 * Mounted through `ChatInput`, which owns which menu is open: the tests cover
 * the picker AND its wiring into the composer.
 *
 * Run with: npx vitest run src/components/chat/ProviderModelPicker.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import {
  chatPermissionConfigAtom,
  chatSelectedProviderAtom,
  chatSessionCapabilitiesSnapshotAtom,
  chatSessionIdAtom,
  chatSessionModelAtom,
  chatSessionProviderAtom,
  modelCatalogAtom,
  modelCatalogLoadedAtom,
  providersAtom,
  providersLoadStateAtom,
} from '@/atoms'
import type { ModelDefinition } from '@/constants/models'
import {
  defaultModelLabel,
  newConversationOtherProviderLabel,
  providerLockedText,
  providerNotAllowedText,
  providerSignInRequiredText,
  setModelUnsupportedText,
} from '@/constants/providers'
import type { ProvidersResponse } from '@/types/provider'
import { clearModelCatalogCache } from '@/components/settings/useModelCatalog'
import { providersApi } from '@/services/providers'
import { ApiError } from '@/services/api'
import type { VaultOverview } from '@/services/vault'
import { ChatInput } from './ChatInput'

vi.mock('@/hooks', () => ({ useIsMobile: () => false }))
vi.mock('@/services/chat', () => ({
  chatApi: { getPermissionConfig: () => new Promise(() => {}) },
}))
vi.mock('@/services/providers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/providers')>()),
  providersApi: { models: vi.fn(), list: vi.fn() },
}))
vi.mock('@/services/documents', () => ({ documentsApi: { upload: vi.fn() } }))
const vaultApiMock = vi.hoisted(() => ({ overview: vi.fn(), unlock: vi.fn() }))
vi.mock('@/services/vault', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/vault')>()),
  vaultApi: { overview: vaultApiMock.overview, unlock: vaultApiMock.unlock },
}))

type Store = ReturnType<typeof createStore>

const claudeModel = (id: string, family: ModelDefinition['family'], version: string): ModelDefinition => ({
  id, family, version, tier: 'current', shortLabel: `${family} ${version}`, fullLabel: `Claude ${family} ${version}`, description: '',
})
const CATALOG = [claudeModel('claude-opus-5-5', 'opus', '5.5'), claudeModel('claude-sonnet-5', 'sonnet', '5')]

const PROVIDERS: ProvidersResponse = {
  providers: [
    { id: 'claude-code', kind: 'claude_code', label: 'Claude Code', builtin: true, health: { status: 'healthy' }, models: [], default_model: 'claude-sonnet-5' },
    {
      id: 'local-llama',
      kind: 'openai_compatible',
      label: 'Local llama-server',
      health: { status: 'healthy' },
      default_model: 'qwen2.5-coder-32b',
      models: [
        { id: 'qwen2.5-coder-32b', aliases: ['deep'] },
        { id: 'qwen2.5-coder-7b', label: 'Qwen Coder 7B' },
      ],
    },
    {
      id: 'deepseek',
      kind: 'openai_compatible',
      label: 'DeepSeek',
      health: { status: 'healthy' },
      models: [{ id: 'deepseek-chat' }],
      allowed_for_project: false,
    },
    {
      id: 'codex',
      kind: 'codex',
      label: 'Codex',
      health: { status: 'auth_required', login_hint: 'codex login' },
      models: [],
    },
    {
      id: 'vllm',
      kind: 'openai_compatible',
      label: 'vLLM box',
      health: { status: 'unhealthy', error: { code: 'endpoint_unreachable', message: 'Connection refused (10.0.0.5:8000)' } },
      models: [],
    },
  ],
  default: { provider: 'local-llama', model: 'qwen2.5-coder-32b', routed_by: 'project_rule' },
  aliases: [
    { alias: 'fast', provider: 'local-llama', model: 'qwen2.5-coder-7b' },
    { alias: 'utility', provider: 'claude-code', model: 'claude-sonnet-5' },
  ],
}

const withProviders = (response: ProvidersResponse = PROVIDERS) => (store: Store) => {
  store.set(providersAtom, response)
  store.set(providersLoadStateAtom, 'ready')
}

function mount({ sessionId = null as string | null, prepare }: { sessionId?: string | null; prepare?: (store: Store) => void } = {}) {
  const store = createStore()
  store.set(chatSessionIdAtom, sessionId)
  store.set(chatPermissionConfigAtom, { mode: 'default', allowed_tools: [], disallowed_tools: [] })
  store.set(modelCatalogAtom, CATALOG)
  store.set(modelCatalogLoadedAtom, true)
  prepare?.(store)
  const onChangeModel = vi.fn()
  // What `ChatPanel.handleNewSession` does, as far as the composer can tell.
  const onNewConversation = vi.fn(() => {
    store.set(chatSessionIdAtom, null)
    store.set(chatSessionProviderAtom, null)
    store.set(chatSessionCapabilitiesSnapshotAtom, null)
    store.set(chatSessionModelAtom, null)
    rerender(null)
  })
  const ui = (sid: string | null) => (
    <Provider store={store}>
      <ChatInput
        onSend={() => {}}
        onQueue={() => {}}
        onQueueOp={() => {}}
        onInterrupt={() => {}}
        isStreaming={false}
        sessionId={sid}
        onChangeModel={onChangeModel}
        onNewConversation={onNewConversation}
      />
    </Provider>
  )
  const view = render(ui(sessionId))
  function rerender(sid: string | null) {
    view.rerender(ui(sid))
  }
  return { store, onChangeModel, onNewConversation }
}

const targetChip = () => screen.getByTestId('target-chip')
const openTarget = () => {
  fireEvent.click(targetChip())
  return within(screen.getByTestId('target-picker-popover'))
}
const section = (id: string) => within(screen.getByTestId(`target-provider-${id}`))
/** Open a provider's section (a click on its header) and return it. */
const openSection = (id: string) => {
  const s = section(id)
  const header = s.getAllByRole('button')[0]
  if (header.getAttribute('aria-expanded') !== 'true') fireEvent.click(header)
  return section(id)
}

beforeEach(() => {
  localStorage.clear()
  clearModelCatalogCache()
  vi.mocked(providersApi.models).mockReset().mockResolvedValue([])
  vaultApiMock.overview.mockReset().mockResolvedValue(vaultState())
  vaultApiMock.unlock.mockReset()
})

const vaultState = (over: Partial<VaultOverview> = {}): VaultOverview => ({
  initialized: true,
  unlocked_until: '2099-01-01T00:00:00Z',
  secret_count: 1,
  unavailable: null,
  secrets: [],
  grants: [],
  requests: [],
  ...over,
})

describe('ProviderModelPicker — new conversation', () => {
  it('starts on Auto, says what the server would pick, and remembers nothing', () => {
    mount({ prepare: withProviders() })
    expect(targetChip().textContent).toContain('Auto')
    const menu = openTarget()
    const auto = menu.getByTestId('target-auto')
    expect(auto.getAttribute('aria-pressed')).toBe('true')
    expect(auto.textContent).toContain('Local llama-server · qwen2.5-coder-32b · project default')
    // Preselected, not chosen: nothing is remembered, nothing will be sent.
    expect(localStorage.getItem('chat-selected-provider')).toBeNull()
  })

  it.each([
    ['global_rule', 'global default'],
    ['default', 'server default'],
    ['claude_code', 'Claude Code fallback'],
  ])('reads the origin %s as "%s"', (routed_by, label) => {
    mount({ prepare: withProviders({ ...PROVIDERS, default: { provider: 'claude-code', routed_by } }) })
    expect(openTarget().getByTestId('target-auto').textContent).toContain(label)
  })

  it('lists every instance with its kind, and disables the unusable ones with their reason', () => {
    const { store } = mount({ prepare: withProviders() })
    const menu = openTarget()
    expect(document.querySelectorAll('[data-testid^="target-provider-"]')).toHaveLength(5)

    const cases: [string, string, string][] = [
      ['deepseek', 'DeepSeek', providerNotAllowedText()],
      ['codex', 'Codex', providerSignInRequiredText()],
      ['vllm', 'vLLM box', 'Connection refused (10.0.0.5:8000)'],
    ]
    for (const [id, label, reason] of cases) {
      const row = section(id).getAllByRole('button')[0]
      expect(row.textContent).toContain(label)
      expect(row.getAttribute('aria-disabled')).toBe('true')
      // Still reachable with the keyboard, and the reason is tied to it.
      expect((row as HTMLButtonElement).disabled).toBe(false)
      const described = document.getElementById(row.getAttribute('aria-describedby') ?? '')
      expect(described?.textContent).toBe(reason)
      expect(menu.getByText(reason)).toBeTruthy()

      fireEvent.click(row)
      expect(store.get(chatSelectedProviderAtom)).toBeNull()
      // A refused instance never opens on models.
      expect(row.getAttribute('aria-expanded')).toBeNull()
    }
    // Refused clicks do not close the menu either.
    expect(screen.getByTestId('target-picker-popover')).toBeTruthy()
    expect(menu.getByTestId('target-auto').getAttribute('aria-pressed')).toBe('true')
  })

  it('remembers an explicit pick of another provider, and drops the model picked for the previous one', () => {
    const { store } = mount({
      prepare: (s) => {
        withProviders()(s)
        s.set(chatSessionModelAtom, 'qwen2.5-coder-7b')
      },
    })
    openTarget()
    fireEvent.click(within(openSection('claude-code').getByRole('button', { name: defaultModelLabel() }).parentElement!).getByRole('button', { name: defaultModelLabel() }))

    expect(store.get(chatSelectedProviderAtom)).toBe('claude-code')
    expect(store.get(chatSessionModelAtom)).toBeNull()
    expect(screen.queryByTestId('target-picker-popover')).toBeNull()
    expect(targetChip().textContent).toContain('Claude Code')
    expect(targetChip().textContent).not.toContain('Auto')
  })

  it('a model of another provider sets the provider AND the model in one gesture', () => {
    const { store } = mount({ prepare: withProviders() })
    openTarget()
    openSection('claude-code')
    // The Claude section shows its families; the llama one was open by default and collapsed.
    fireEvent.click(within(screen.getByTestId('model-family-sonnet')).getByRole('button'))
    expect(store.get(chatSelectedProviderAtom)).toBe('claude-code')
    expect(store.get(chatSessionModelAtom)).toBe('claude-sonnet-5')
    expect(targetChip().textContent).toBe('Claude Code › Sonnet 5')
  })

  it("picking the server default's own instance forgets the pick (the server resolves it)", () => {
    const { store } = mount({
      prepare: (s) => {
        withProviders()(s)
        s.set(chatSelectedProviderAtom, 'claude-code')
      },
    })
    openTarget()
    fireEvent.click(openSection('local-llama').getByRole('button', { name: 'Qwen Coder 7B' }))
    expect(store.get(chatSelectedProviderAtom)).toBeNull()
    expect(store.get(chatSessionModelAtom)).toBe('qwen2.5-coder-7b')
  })

  it('Auto clears both the pick and the model', () => {
    const { store } = mount({
      prepare: (s) => {
        withProviders()(s)
        s.set(chatSelectedProviderAtom, 'claude-code')
        s.set(chatSessionModelAtom, 'claude-sonnet-5')
      },
    })
    expect(targetChip().textContent).not.toContain('Auto')
    fireEvent.click(openTarget().getByTestId('target-auto'))
    expect(store.get(chatSelectedProviderAtom)).toBeNull()
    expect(store.get(chatSessionModelAtom)).toBeNull()
    expect(targetChip().textContent).toContain('Auto')
  })

  it('ignores a remembered pick the server no longer lists', () => {
    mount({
      prepare: (s) => {
        withProviders()(s)
        s.set(chatSelectedProviderAtom, 'gone')
      },
    })
    expect(targetChip().textContent).toContain('Auto')
  })

  it('shows a non-Anthropic model by its own name, with no Claude family dressing', () => {
    mount({
      prepare: (s) => {
        withProviders()(s)
        s.set(chatSessionModelAtom, 'qwen2.5-coder-32b')
      },
    })
    // Not "Qwen2.5 Coder 32b", and no family dot.
    expect(targetChip().textContent).toBe('Local llama-server › qwen2.5-coder-32b')
    expect(targetChip().querySelector('.bg-violet-500')).toBeNull()

    const menu = openTarget()
    expect(menu.getByRole('button', { name: 'Qwen Coder 7B' })).toBeTruthy()
    expect(menu.getByRole('button', { name: 'qwen2.5-coder-32b', pressed: true })).toBeTruthy()
    expect(screen.queryByTestId('model-family-other')).toBeNull()
    expect(screen.queryByRole('slider')).toBeNull()
  })

  it('lists the aliases of the instance first, then its models, under a "Default model" row', () => {
    const { store } = mount({ prepare: withProviders() })
    const menu = openTarget()
    const names = section('local-llama').getAllByRole('button').slice(1).map((b) => b.textContent)
    // `fast` from the alias table, `deep` declared by a model; `utility` belongs to another instance.
    expect(names).toEqual([defaultModelLabel(), 'fastQwen Coder 7B', 'deepqwen2.5-coder-32b', 'qwen2.5-coder-32b', 'Qwen Coder 7B'])

    fireEvent.click(menu.getByRole('button', { name: /^fast/ }))
    // The alias NAME is what the session-creation request carries.
    expect(store.get(chatSessionModelAtom)).toBe('fast')
    expect(targetChip().textContent).toBe('Local llama-server › fast')
  })

  it('picks a model of the instance for the session to be created', () => {
    const { store, onChangeModel } = mount({ prepare: withProviders() })
    fireEvent.click(openTarget().getByRole('button', { name: 'Qwen Coder 7B' }))
    expect(store.get(chatSessionModelAtom)).toBe('qwen2.5-coder-7b')
    expect(onChangeModel).not.toHaveBeenCalled()
    expect(targetChip().textContent).toBe('Local llama-server › Qwen Coder 7B')
  })

  it('keeps the Claude family picker for a Claude Code instance, with its aliases on top', () => {
    mount({
      prepare: (s) => {
        withProviders()(s)
        s.set(chatSelectedProviderAtom, 'claude-code')
      },
    })
    expect(targetChip().textContent).toBe('Claude Code › Sonnet 5')
    const menu = openTarget()
    expect(menu.getByRole('button', { name: /^utility/ })).toBeTruthy()
    expect(screen.getByTestId('model-family-opus')).toBeTruthy()
    expect(screen.getByTestId('model-family-sonnet')).toBeTruthy()
  })

  it('names no model when the server names none', async () => {
    mount({
      prepare: withProviders({
        providers: [{ id: 'acp-agent', kind: 'acp', label: 'opencode', health: { status: 'unknown' }, models: [] }],
        default: { provider: 'acp-agent', routed_by: 'default' },
      }),
    })
    expect(targetChip().textContent).toContain('Auto')
    expect(await openTarget().findByText('No models listed for this provider')).toBeTruthy()
  })

  it("lists the provider's own models, not only the one stored with the instance", async () => {
    vi.mocked(providersApi.models).mockResolvedValue([{ id: 'deepseek-chat' }, { id: 'deepseek-reasoner' }])
    mount({
      prepare: withProviders({
        providers: [{ id: 'deepseek', kind: 'openai_compatible', label: 'DeepSeek', health: { status: 'unknown' }, models: [] }],
        default: { provider: 'deepseek', routed_by: 'default' },
      }),
    })
    const menu = openTarget()
    expect(await menu.findByRole('button', { name: 'deepseek-reasoner' })).toBeTruthy()
    expect(menu.getByRole('button', { name: 'deepseek-chat' })).toBeTruthy()
    expect(providersApi.models).toHaveBeenCalledWith('deepseek')
  })

  it('loads the catalog of the open section only, and another section when it is opened', async () => {
    vi.mocked(providersApi.models).mockResolvedValue([{ id: 'm1' }])
    mount({ prepare: withProviders() })
    openTarget()
    await waitFor(() => expect(providersApi.models).toHaveBeenCalledWith('local-llama'))
    expect(providersApi.models).not.toHaveBeenCalledWith('claude-code')
    expect(providersApi.models).toHaveBeenCalledTimes(1)
  })

  it('says why no model is listed and offers a retry when the catalog cannot load', async () => {
    vi.mocked(providersApi.models).mockRejectedValueOnce(new Error('boom'))
    vi.mocked(providersApi.models).mockResolvedValueOnce([{ id: 'deepseek-chat' }])
    mount({
      prepare: withProviders({
        providers: [{ id: 'deepseek', kind: 'openai_compatible', label: 'DeepSeek', health: { status: 'unknown' }, models: [] }],
        default: { provider: 'deepseek', routed_by: 'default' },
      }),
    })
    const menu = openTarget()
    fireEvent.click(await menu.findByRole('button', { name: /retry/i }))
    await waitFor(() => expect(menu.getByRole('button', { name: 'deepseek-chat' })).toBeTruthy())
  })
})

describe('ProviderModelPicker — remote Claude Code', () => {
  const remote = (health: ProvidersResponse['providers'][number]['health']): ProvidersResponse => ({
    providers: [
      PROVIDERS.providers[0],
      { id: 'claude-code@lab', kind: 'claude_code_remote', label: 'Claude Code', health, models: [{ id: 'claude-sonnet-5' }] },
    ],
    default: { provider: 'claude-code', routed_by: 'default' },
  })

  it('lists the machine as claude-code@lab (not a second "Claude Code") with its kind', () => {
    mount({ prepare: withProviders(remote({ status: 'healthy' })) })
    openTarget()
    const rows = Array.from(document.querySelectorAll('[data-testid^="target-provider-"]'))
    expect(rows).toHaveLength(2)
    const header = section('claude-code@lab').getAllByRole('button')[0]
    expect(header.textContent).toContain('Claude Code (SSH)')
    // Beyond its id and its kind, the row carries no bare "Claude Code" name.
    expect((header.textContent ?? '').replace('Claude Code (SSH)', '')).not.toContain('Claude Code')
    fireEvent.click(openSection('claude-code@lab').getByRole('button', { name: defaultModelLabel() }))
    expect(targetChip().textContent).toContain('claude-code@lab')
  })

  it('an unreachable machine is disabled with its reason, and picking it never falls back to the local Claude Code', () => {
    const reason = 'lab: the machine cannot be reached'
    const { store } = mount({ prepare: withProviders(remote({ status: 'unhealthy', error: { code: 'provider_unavailable', message: reason } })) })
    const menu = openTarget()
    const row = section('claude-code@lab').getAllByRole('button')[0]
    expect(row.getAttribute('aria-disabled')).toBe('true')
    expect(menu.getByText(reason)).toBeTruthy()
    fireEvent.click(row)
    expect(store.get(chatSelectedProviderAtom)).toBeNull()
  })
})

describe('ProviderModelPicker — long model list', () => {
  const many = (n: number): ProvidersResponse => ({
    providers: [
      {
        id: 'big',
        kind: 'openai_compatible',
        label: 'Big host',
        health: { status: 'healthy' },
        default_model: 'model-0',
        models: Array.from({ length: n }, (_, i) => ({ id: `model-${i}`, ...(i === 3 ? { label: 'Édition spéciale' } : {}) })),
      },
    ],
    default: { provider: 'big', model: 'model-0', routed_by: 'default' },
  })
  const MODELS = /^model-|Édition/

  it('up to 6 models there is no search field, the buttons stay as they were', () => {
    mount({ prepare: withProviders(many(6)) })
    const menu = openTarget()
    expect(menu.queryByRole('searchbox')).toBeNull()
    expect(menu.getAllByRole('button', { name: MODELS }).length).toBe(6)
  })

  it('past 6 models a search field filters by id and label, ignoring case and accents, and counts', () => {
    mount({ prepare: withProviders(many(12)) })
    const menu = openTarget()
    const search = menu.getByRole('searchbox', { name: 'Search models' })
    expect(menu.getByText('12 models')).toBeTruthy()
    fireEvent.change(search, { target: { value: 'MODEL-1' } })
    // model-1, model-10, model-11
    expect(menu.getAllByRole('button', { name: MODELS }).length).toBe(3)
    expect(menu.getByText('3 of 12')).toBeTruthy()
    fireEvent.change(search, { target: { value: 'edition' } })
    expect(menu.getAllByRole('button', { name: MODELS }).map((b) => b.textContent)).toEqual(['Édition spéciale'])
    fireEvent.change(search, { target: { value: 'nope' } })
    expect(menu.getByText('No model matches “nope”')).toBeTruthy()
    expect(menu.queryAllByRole('button', { name: MODELS }).length).toBe(0)
  })

  it('picking from a filtered list sets the model; Escape in the field clears it first', () => {
    const { store } = mount({ prepare: withProviders(many(12)) })
    const menu = openTarget()
    const search = menu.getByRole('searchbox') as HTMLInputElement
    fireEvent.change(search, { target: { value: 'model-7' } })
    fireEvent.keyDown(search, { key: 'Escape' })
    expect(search.value).toBe('')
    expect(screen.queryByTestId('target-picker-popover')).toBeTruthy()
    fireEvent.change(search, { target: { value: 'model-7' } })
    fireEvent.click(menu.getByRole('button', { name: 'model-7' }))
    expect(store.get(chatSessionModelAtom)).toBe('model-7')
  })
})

describe('ProviderModelPicker — backend without provider routes', () => {
  const unsupported = (s: Store) => {
    s.set(providersLoadStateAtom, 'unsupported')
    // A stale pick from another server must change nothing.
    s.set(chatSelectedProviderAtom, 'local-llama')
  }

  it('renders no provider selector, and the Claude model picker as before', () => {
    const { store } = mount({
      prepare: (s) => {
        unsupported(s)
        s.set(chatPermissionConfigAtom, { mode: 'default', allowed_tools: [], disallowed_tools: [], default_model: 'claude-opus-5-5' })
      },
    })
    expect(targetChip().textContent).toBe('Opus 5.5')
    expect(targetChip().querySelector('.bg-violet-500')).not.toBeNull()

    const menu = openTarget()
    expect(menu.queryByTestId('target-auto')).toBeNull()
    fireEvent.click(within(screen.getByTestId('model-family-sonnet')).getByRole('button'))
    expect(store.get(chatSessionModelAtom)).toBe('claude-sonnet-5')
    expect(targetChip().textContent).toBe('Sonnet 5')
  })

  it('invents no model when the server advertises no default', () => {
    mount({ prepare: unsupported })
    expect(targetChip().textContent).toBe(defaultModelLabel())
  })

  it('still switches the model of a live Claude session over the socket', () => {
    const { onChangeModel } = mount({
      sessionId: 's1',
      prepare: (s) => {
        unsupported(s)
        s.set(chatSessionModelAtom, 'claude-sonnet-5')
      },
    })
    expect(targetChip().getAttribute('aria-disabled')).toBeNull()
    openTarget()
    fireEvent.click(within(screen.getByTestId('model-family-opus')).getByRole('button'))
    expect(onChangeModel).toHaveBeenCalledWith('claude-opus-5-5')
  })

  it('renders no Auto and no provider before the list is known either', () => {
    mount()
    expect(openTarget().queryByTestId('target-auto')).toBeNull()
  })
})

describe('ProviderModelPicker — existing session', () => {
  const onLlama = (capabilities: Record<string, unknown>) => (s: Store) => {
    withProviders()(s)
    s.set(chatSessionProviderAtom, { id: 'local-llama', kind: 'openai_compatible', label: 'Local llama-server' })
    s.set(chatSessionCapabilitiesSnapshotAtom, capabilities)
    s.set(chatSessionModelAtom, 'qwen2.5-coder-32b')
  }

  it('shows the provider as locked, explains why, and offers a new conversation with the targets open', () => {
    const { store, onNewConversation } = mount({ sessionId: 's1', prepare: onLlama({ set_model_live: true }) })
    expect(targetChip().textContent).toBe('Local llama-server › qwen2.5-coder-32b')

    const menu = openTarget()
    expect(menu.queryByTestId('target-auto')).toBeNull()
    expect(menu.getByText('Local llama-server')).toBeTruthy()
    expect(menu.getByText('OpenAI-compatible')).toBeTruthy()
    expect(menu.getByText(providerLockedText())).toBeTruthy()

    fireEvent.click(menu.getByRole('button', { name: newConversationOtherProviderLabel() }))
    expect(onNewConversation).toHaveBeenCalledTimes(1)
    // Now a new conversation, with the instances to choose from already shown.
    expect(document.querySelectorAll('[data-testid^="target-provider-"]')).toHaveLength(5)
    expect(store.get(chatSelectedProviderAtom)).toBeNull()
  })

  it('a legacy session (no provider named) is locked on Claude Code', () => {
    mount({ sessionId: 's1', prepare: withProviders() })
    expect(targetChip().textContent).toContain('Claude Code')
    expect(openTarget().getByText(providerLockedText())).toBeTruthy()
  })

  it('changes the model live when the provider can, among the models of the session instance', () => {
    const { store, onChangeModel } = mount({ sessionId: 's1', prepare: onLlama({ set_model_live: true }) })
    const menu = openTarget()
    // Aliases are for session creation: a live switch takes a model id.
    const names = menu.getAllByRole('button', { name: /^qwen|^Qwen/ }).map((b) => b.textContent)
    expect(names).toEqual(['qwen2.5-coder-32b', 'Qwen Coder 7B'])
    expect(menu.queryByRole('group', { name: 'Model aliases' })).toBeNull()
    fireEvent.click(menu.getByRole('button', { name: 'Qwen Coder 7B' }))
    expect(onChangeModel).toHaveBeenCalledWith('qwen2.5-coder-7b')
    // The atom is the hook's to update (optimistically, then on `model_changed`).
    expect(store.get(chatSessionModelAtom)).toBe('qwen2.5-coder-32b')
  })

  it('set_model_live: false — the menu explains it and offers no model to pick', () => {
    const { onChangeModel } = mount({ sessionId: 's1', prepare: onLlama({ set_model_live: false }) })
    const popover = openTarget()
    expect(popover.getByText(setModelUnsupportedText())).toBeTruthy()
    expect(popover.queryByRole('button', { name: /qwen/i })).toBeNull()
    expect(onChangeModel).not.toHaveBeenCalled()
  })
})

describe('ProviderModelPicker — one menu at a time', () => {
  it('opening the target menu closes the mode menu, and the mode menu closes the target menu', () => {
    mount({ prepare: withProviders({ ...PROVIDERS, default: { provider: 'claude-code', routed_by: 'claude_code' } }) })
    fireEvent.click(screen.getByRole('button', { name: /^Default/ }))
    fireEvent.click(targetChip())
    expect(screen.getByTestId('target-picker-popover')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^Default$/ }))
    expect(screen.queryByTestId('target-picker-popover')).toBeNull()
  })
})

describe('ProviderModelPicker — vault locked', () => {
  const LOCKED = vaultState({ unlocked_until: null })
  const RELISTED: ProvidersResponse = {
    ...PROVIDERS,
    providers: [
      ...PROVIDERS.providers,
      { id: 'vault-llm', kind: 'openai_compatible', label: 'Vault LLM', health: { status: 'healthy' }, models: [{ id: 'vault-model' }] },
    ],
  }

  beforeEach(() => {
    vi.mocked(providersApi.list).mockReset()
  })

  it('shows a passphrase field and an Unlock button in the menu while the vault is locked', async () => {
    vaultApiMock.overview.mockResolvedValue(LOCKED)
    mount({ prepare: withProviders() })
    openTarget()
    expect(await screen.findByLabelText('Vault locked')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeTruthy()
    // The settings link stays as the fallback.
    expect(screen.getByRole('link', { name: 'Vault settings' }).getAttribute('href')).toBe('/vault')
  })

  it('shows no field while the vault is open', async () => {
    mount({ prepare: withProviders() })
    openTarget()
    await waitFor(() => expect(vaultApiMock.overview).toHaveBeenCalled())
    expect(screen.queryByLabelText('Vault locked')).toBeNull()
  })

  it('unlocks in place with the passphrase, then re-reads the providers and shows the new one', async () => {
    vaultApiMock.overview.mockResolvedValue(LOCKED)
    vaultApiMock.unlock.mockResolvedValue({ unlocked_until: '2099-01-01T00:00:00Z', unlock_proof: 'proof' })
    vi.mocked(providersApi.list).mockResolvedValue(RELISTED)
    mount({ prepare: withProviders() })
    const menu = openTarget()
    fireEvent.change(await screen.findByLabelText('Vault locked'), { target: { value: 'correct horse' } })
    fireEvent.click(menu.getByRole('button', { name: 'Unlock' }))

    await waitFor(() => expect(vaultApiMock.unlock).toHaveBeenCalledWith('correct horse', 60))
    expect((await screen.findByRole('status')).textContent).toContain('Vault unlocked')
    expect(providersApi.list).toHaveBeenCalled()
    expect(await screen.findByText('Vault LLM')).toBeTruthy()
  })

  it('a wrong passphrase says so in text, keeps the field, and does not re-read the providers', async () => {
    vaultApiMock.overview.mockResolvedValue(LOCKED)
    vaultApiMock.unlock.mockRejectedValue(new ApiError(403, JSON.stringify({ error: 'wrong passphrase' })))
    mount({ prepare: withProviders() })
    const menu = openTarget()
    fireEvent.change(await screen.findByLabelText('Vault locked'), { target: { value: 'nope' } })
    fireEvent.click(menu.getByRole('button', { name: 'Unlock' }))

    expect((await screen.findByRole('alert')).textContent).toBe('Wrong passphrase.')
    expect(screen.getByLabelText('Vault locked')).toBeTruthy()
    expect(providersApi.list).not.toHaveBeenCalled()
  })
})
