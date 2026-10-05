/**
 * Provider, then model, in the composer.
 *
 * Mounted through `ChatInput`, which owns which menu is open: the tests cover
 * the picker AND its wiring into the composer.
 *
 * Run with: npx vitest run src/components/chat/ProviderModelPicker.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
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
  DEFAULT_MODEL_LABEL,
  NEW_CONVERSATION_OTHER_PROVIDER_LABEL,
  PROVIDER_LOCKED_TEXT,
  PROVIDER_NOT_ALLOWED_TEXT,
  PROVIDER_SIGN_IN_REQUIRED_TEXT,
  SET_MODEL_UNSUPPORTED_TEXT,
} from '@/constants/providers'
import type { ProvidersResponse } from '@/types/provider'
import { ChatInput } from './ChatInput'

vi.mock('@/hooks', () => ({ useIsMobile: () => false }))
vi.mock('@/services/chat', () => ({
  chatApi: { getPermissionConfig: () => new Promise(() => {}) },
}))
vi.mock('@/services/documents', () => ({ documentsApi: { upload: vi.fn() } }))

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

const providerChip = () => screen.getByTestId('provider-chip')
const modelChip = () => screen.getByTestId('model-chip')
const openProviders = () => {
  fireEvent.click(providerChip())
  return within(screen.getByTestId('provider-picker-popover'))
}
const openModels = () => {
  fireEvent.click(modelChip())
  return within(screen.getByTestId('model-picker-popover'))
}

beforeEach(() => {
  localStorage.clear()
})

describe('ProviderModelPicker — new conversation', () => {
  it('preselects the server default and says where it comes from', () => {
    mount({ prepare: withProviders() })
    expect(providerChip().textContent).toContain('Local llama-server')
    expect(providerChip().textContent).toContain('project default')

    const menu = openProviders()
    const selected = menu.getByRole('radio', { checked: true })
    expect(selected.textContent).toContain('Local llama-server')
    expect(selected.textContent).toContain('OpenAI-compatible')
    expect(selected.textContent).toContain('project default')
    // Preselected, not chosen: nothing is remembered, nothing will be sent.
    expect(localStorage.getItem('chat-selected-provider')).toBeNull()
  })

  it.each([
    ['global_rule', 'global default'],
    ['configured_default', 'server default'],
    ['claude_code_fallback', 'fallback'],
  ])('reads the origin %s as "%s"', (routed_by, label) => {
    mount({ prepare: withProviders({ ...PROVIDERS, default: { provider: 'claude-code', routed_by } }) })
    expect(providerChip().textContent).toContain(label)
  })

  it('lists every instance with its kind, and disables the unusable ones with their reason', () => {
    const { store } = mount({ prepare: withProviders() })
    const menu = openProviders()
    expect(menu.getAllByRole('radio')).toHaveLength(5)

    const cases: [string, string][] = [
      ['DeepSeek', PROVIDER_NOT_ALLOWED_TEXT],
      ['Codex', PROVIDER_SIGN_IN_REQUIRED_TEXT],
      ['vLLM box', 'Connection refused (10.0.0.5:8000)'],
    ]
    for (const [label, reason] of cases) {
      const row = menu.getByRole('radio', { name: new RegExp(label) })
      expect(row.getAttribute('aria-disabled')).toBe('true')
      // Still reachable with the keyboard, and the reason is tied to it.
      expect((row as HTMLButtonElement).disabled).toBe(false)
      const described = document.getElementById(row.getAttribute('aria-describedby') ?? '')
      expect(described?.textContent).toBe(reason)
      expect(menu.getByText(reason)).toBeTruthy()

      fireEvent.click(row)
      expect(store.get(chatSelectedProviderAtom)).toBeNull()
    }
    // Refused clicks do not close the menu either.
    expect(screen.getByTestId('provider-picker-popover')).toBeTruthy()
  })

  it('remembers an explicit pick, and drops the model picked for the previous provider', () => {
    const { store } = mount({
      prepare: (s) => {
        withProviders()(s)
        s.set(chatSessionModelAtom, 'qwen2.5-coder-7b')
      },
    })
    fireEvent.click(openProviders().getByRole('radio', { name: /Claude Code/ }))

    expect(store.get(chatSelectedProviderAtom)).toBe('claude-code')
    expect(store.get(chatSessionModelAtom)).toBeNull()
    expect(screen.queryByTestId('provider-picker-popover')).toBeNull()
    expect(providerChip().textContent).toContain('Claude Code')
    expect(providerChip().textContent).not.toContain('project default')
  })

  it('picking the server default again forgets the pick (the server resolves it)', () => {
    const { store } = mount({
      prepare: (s) => {
        withProviders()(s)
        s.set(chatSelectedProviderAtom, 'claude-code')
      },
    })
    fireEvent.click(openProviders().getByRole('radio', { name: /Local llama-server/ }))
    expect(store.get(chatSelectedProviderAtom)).toBeNull()
  })

  it('ignores a remembered pick the server no longer lists', () => {
    mount({
      prepare: (s) => {
        withProviders()(s)
        s.set(chatSelectedProviderAtom, 'gone')
      },
    })
    expect(providerChip().textContent).toContain('Local llama-server')
  })

  it('shows a non-Anthropic model by its own name, with no Claude family dressing', () => {
    mount({ prepare: withProviders() })
    // Not "Qwen2.5 Coder 32b", and no family dot.
    expect(modelChip().textContent).toBe('qwen2.5-coder-32b')
    expect(modelChip().querySelector('.rounded-full')).toBeNull()

    const menu = openModels()
    expect(menu.getByRole('button', { name: 'Qwen Coder 7B' })).toBeTruthy()
    expect(menu.getByRole('button', { name: 'qwen2.5-coder-32b', pressed: true })).toBeTruthy()
    expect(screen.queryByTestId('model-family-other')).toBeNull()
    expect(screen.queryByRole('slider')).toBeNull()
  })

  it('lists the aliases of the instance first, then its models', () => {
    const { store } = mount({ prepare: withProviders() })
    const menu = openModels()
    const names = menu.getAllByRole('button').map((b) => b.textContent)
    // `fast` from the alias table, `deep` declared by a model; `utility` belongs to another instance.
    expect(names).toEqual(['fastQwen Coder 7B', 'deepqwen2.5-coder-32b', 'qwen2.5-coder-32b', 'Qwen Coder 7B'])

    fireEvent.click(menu.getByRole('button', { name: /^fast/ }))
    // The alias NAME is what the session-creation request carries.
    expect(store.get(chatSessionModelAtom)).toBe('fast')
    expect(modelChip().textContent).toBe('fast')
  })

  it('picks a model of the instance for the session to be created', () => {
    const { store, onChangeModel } = mount({ prepare: withProviders() })
    fireEvent.click(openModels().getByRole('button', { name: 'Qwen Coder 7B' }))
    expect(store.get(chatSessionModelAtom)).toBe('qwen2.5-coder-7b')
    expect(onChangeModel).not.toHaveBeenCalled()
    expect(modelChip().textContent).toBe('Qwen Coder 7B')
  })

  it('keeps the Claude family picker for a Claude Code instance, with its aliases on top', () => {
    mount({
      prepare: (s) => {
        withProviders()(s)
        s.set(chatSelectedProviderAtom, 'claude-code')
      },
    })
    expect(modelChip().textContent).toBe('Sonnet 5')
    const menu = openModels()
    expect(menu.getByRole('button', { name: /^utility/ })).toBeTruthy()
    expect(screen.getByTestId('model-family-opus')).toBeTruthy()
    expect(screen.getByTestId('model-family-sonnet')).toBeTruthy()
  })

  it('names no model when the server names none', () => {
    mount({
      prepare: withProviders({
        providers: [{ id: 'acp-agent', kind: 'acp', label: 'opencode', health: { status: 'unknown' }, models: [] }],
        default: { provider: 'acp-agent', routed_by: 'configured_default' },
      }),
    })
    expect(modelChip().textContent).toBe(DEFAULT_MODEL_LABEL)
    expect(openModels().getByText('No models listed for this provider')).toBeTruthy()
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
    expect(screen.queryByTestId('provider-chip')).toBeNull()
    expect(modelChip().textContent).toBe('Opus 5.5')
    expect(modelChip().querySelector('.bg-violet-500')).not.toBeNull()

    openModels()
    fireEvent.click(within(screen.getByTestId('model-family-sonnet')).getByRole('button'))
    expect(store.get(chatSessionModelAtom)).toBe('claude-sonnet-5')
    expect(modelChip().textContent).toBe('Sonnet 5')
  })

  it('invents no model when the server advertises no default', () => {
    mount({ prepare: unsupported })
    expect(modelChip().textContent).toBe(DEFAULT_MODEL_LABEL)
  })

  it('still switches the model of a live Claude session over the socket', () => {
    const { onChangeModel } = mount({
      sessionId: 's1',
      prepare: (s) => {
        unsupported(s)
        s.set(chatSessionModelAtom, 'claude-sonnet-5')
      },
    })
    expect(screen.queryByTestId('provider-chip')).toBeNull()
    expect(modelChip().getAttribute('aria-disabled')).toBeNull()
    openModels()
    fireEvent.click(within(screen.getByTestId('model-family-opus')).getByRole('button'))
    expect(onChangeModel).toHaveBeenCalledWith('claude-opus-5-5')
  })

  it('renders no provider selector before the list is known either', () => {
    mount()
    expect(screen.queryByTestId('provider-chip')).toBeNull()
  })
})

describe('ProviderModelPicker — existing session', () => {
  const onLlama = (capabilities: Record<string, unknown>) => (s: Store) => {
    withProviders()(s)
    s.set(chatSessionProviderAtom, { id: 'local-llama', kind: 'openai_compatible', label: 'Local llama-server' })
    s.set(chatSessionCapabilitiesSnapshotAtom, capabilities)
    s.set(chatSessionModelAtom, 'qwen2.5-coder-32b')
  }

  it('shows the provider as locked, explains why, and offers a new conversation with the selector open', () => {
    const { store, onNewConversation } = mount({ sessionId: 's1', prepare: onLlama({ set_model_live: true }) })
    expect(providerChip().textContent).toContain('Local llama-server')

    const menu = openProviders()
    expect(menu.queryByRole('radio')).toBeNull()
    expect(menu.getByText('Local llama-server')).toBeTruthy()
    expect(menu.getByText('OpenAI-compatible')).toBeTruthy()
    expect(menu.getByText(PROVIDER_LOCKED_TEXT)).toBeTruthy()

    fireEvent.click(menu.getByRole('button', { name: NEW_CONVERSATION_OTHER_PROVIDER_LABEL }))
    expect(onNewConversation).toHaveBeenCalledTimes(1)
    // Now a new conversation, with the instances to choose from already shown.
    const picker = within(screen.getByTestId('provider-picker-popover'))
    expect(picker.getAllByRole('radio')).toHaveLength(5)
    expect(store.get(chatSelectedProviderAtom)).toBeNull()
  })

  it('a legacy session (no provider named) is locked on Claude Code', () => {
    mount({ sessionId: 's1', prepare: withProviders() })
    expect(providerChip().textContent).toContain('Claude Code')
    expect(openProviders().getByText(PROVIDER_LOCKED_TEXT)).toBeTruthy()
  })

  it('changes the model live when the provider can, among the models of the session instance', () => {
    const { store, onChangeModel } = mount({ sessionId: 's1', prepare: onLlama({ set_model_live: true }) })
    const menu = openModels()
    // Aliases are for session creation: a live switch takes a model id.
    expect(menu.getAllByRole('button').map((b) => b.textContent)).toEqual(['qwen2.5-coder-32b', 'Qwen Coder 7B'])
    fireEvent.click(menu.getByRole('button', { name: 'Qwen Coder 7B' }))
    expect(onChangeModel).toHaveBeenCalledWith('qwen2.5-coder-7b')
    // The atom is the hook's to update (optimistically, then on `model_changed`).
    expect(store.get(chatSessionModelAtom)).toBe('qwen2.5-coder-32b')
  })

  it('set_model_live: false — the model control is disabled, with the explanation tied to it', () => {
    const { onChangeModel } = mount({ sessionId: 's1', prepare: onLlama({ set_model_live: false }) })
    const chip = modelChip()
    expect(chip.getAttribute('aria-disabled')).toBe('true')
    expect((chip as HTMLButtonElement).disabled).toBe(false)
    const describedBy = chip.getAttribute('aria-describedby') ?? ''
    expect(document.getElementById(describedBy)?.textContent).toBe(SET_MODEL_UNSUPPORTED_TEXT)

    // Activating it shows the explanation, and offers no model to pick.
    fireEvent.click(chip)
    const popover = within(screen.getByTestId('model-picker-popover'))
    expect(popover.getByText(SET_MODEL_UNSUPPORTED_TEXT)).toBeTruthy()
    expect(popover.queryByRole('button')).toBeNull()
    expect(document.getElementById(describedBy)?.textContent).toBe(SET_MODEL_UNSUPPORTED_TEXT)
    expect(document.querySelectorAll(`[id="${describedBy}"]`)).toHaveLength(1)
    expect(onChangeModel).not.toHaveBeenCalled()
  })
})

describe('ProviderModelPicker — one menu at a time', () => {
  it('opening the model menu closes the provider menu, and the mode menu closes both', () => {
    mount({ prepare: withProviders({ ...PROVIDERS, default: { provider: 'claude-code', routed_by: 'claude_code_fallback' } }) })
    fireEvent.click(providerChip())
    expect(screen.getByTestId('provider-picker-popover')).toBeTruthy()
    fireEvent.click(modelChip())
    expect(screen.queryByTestId('provider-picker-popover')).toBeNull()
    expect(screen.getByTestId('model-picker-popover')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^Default/ }))
    expect(screen.queryByTestId('model-picker-popover')).toBeNull()
  })
})
