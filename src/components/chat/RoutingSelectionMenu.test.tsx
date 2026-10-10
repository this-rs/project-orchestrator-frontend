/**
 * The ONE routing menu of the composer, mounted through `ChatInput`: the Auto
 * switch, ticked models per provider, the mode read from the ticks, a new or an
 * existing conversation, and the badge rules.
 *
 * Run with: npx vitest run src/components/chat/RoutingSelectionMenu.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Provider, createStore } from 'jotai'
import { routingApi } from '@/services/routing'
import { providersApi } from '@/services/providers'
import { clearModelCatalogCache } from '@/components/settings/useModelCatalog'
import {
  chatDraftAutoAtom,
  chatDraftRoutingModeAtom,
  chatDraftSelectionAtom,
  chatEffectiveProviderIdAtom,
  chatForcedTargetAtom,
  chatPermissionConfigAtom,
  chatRoutingModeAtom,
  chatSelectedProviderAtom,
  chatSessionModelAtom,
  chatSessionCapabilitiesSnapshotAtom,
  chatSessionIdAtom,
  chatSessionProviderAtom,
  chatSessionRoutingAtom,
  modelCatalogAtom,
  modelCatalogLoadedAtom,
  providersAtom,
  providersLoadStateAtom,
  routingSettingsAtom,
} from '@/atoms'
import type { ProvidersResponse } from '@/types/provider'
import type { ProviderRoutingMode, RoutingSettingsResponse } from '@/types/routing'
import type { ContentBlock } from '@/types'
import { I18nProvider, type LocaleCode } from '@/i18n'
import { loadLocale } from '@/i18n/store'
import { ChatInput } from './ChatInput'
import { ChatHeaderTitle } from './ChatHeaderTitle'
import { ModelChangedBlock } from './ModelChangedBlock'

vi.mock('@/hooks', () => ({ useIsMobile: () => false }))
/**
 * The server of `PUT /chat/sessions/{id}/routing`, as backend #638 answers: Auto = full and
 * routed by PO; one model = strict, imposed, routed_by request; several = mixed.
 */
type RoutingChange = { auto: true } | { auto: false; routing_pool: { provider: string; model: string }[] }
const serverAnswer = (change: RoutingChange, model = 'qwen') =>
  change.auto
    ? { id: 's1', routing_mode: 'full', routed_by: 'auto', route_reason: null, routing_pool: null, model }
    : change.routing_pool.length === 1
      ? { id: 's1', routing_mode: 'primary', routed_by: 'request', route_reason: null, routing_pool: change.routing_pool, model: change.routing_pool[0].model }
      : { id: 's1', routing_mode: 'mixed', routed_by: 'auto', route_reason: null, routing_pool: change.routing_pool, model: change.routing_pool[0].model }
const changeConversationRouting = vi.hoisted(() => vi.fn())
vi.mock('@/services/chat', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/chat')>()),
  chatApi: { getPermissionConfig: () => new Promise(() => {}) },
  changeConversationRouting,
}))
vi.mock('@/services/providers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/providers')>()),
  providersApi: { models: vi.fn().mockResolvedValue({ models: [] }), list: vi.fn() },
}))
vi.mock('@/services/routing', () => ({
  routingApi: { get: vi.fn(() => new Promise(() => {})), getProject: vi.fn(() => new Promise(() => {})), put: vi.fn(), putProject: vi.fn() },
}))
const vaultApiMock = vi.hoisted(() => ({ overview: vi.fn() }))
vi.mock('@/services/vault', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/vault')>()),
  vaultApi: { overview: vaultApiMock.overview, unlock: vi.fn() },
}))
vi.mock('@/services/documents', () => ({ documentsApi: { upload: vi.fn() } }))

type Store = ReturnType<typeof createStore>

const PROVIDERS: ProvidersResponse = {
  providers: [
    { id: 'claude-code', kind: 'claude_code', label: 'Claude Code', builtin: true, health: { status: 'healthy' }, models: [], default_model: 'claude-sonnet-5' },
    { id: 'local-llama', kind: 'openai_compatible', label: 'Local llama', health: { status: 'healthy' }, default_model: 'qwen', models: [{ id: 'qwen' }] },
  ],
  default: { provider: 'claude-code', model: 'claude-sonnet-5', routed_by: 'default' },
}

const CLAUDE_MODELS = ['opus', 'sonnet'].map((family) => ({
  id: `claude-${family}-5`,
  family,
  version: '5',
  tier: 'current',
  shortLabel: `${family} 5`,
  fullLabel: `Claude ${family} 5`,
  description: '',
})) as never[]

const settings = (mode: ProviderRoutingMode, primary: RoutingSettingsResponse['primary'] = null): RoutingSettingsResponse => ({
  mode, stage: 'auto', primary, exploration_epsilon: 0, cost_weight: 0, latency_weight: 0, demote_after: 0, scope: 'global',
})

function mount(mode: ProviderRoutingMode, { sessionId = null as string | null, primary = null as RoutingSettingsResponse['primary'], prepare, onChangeModel, locale }: { sessionId?: string | null; primary?: RoutingSettingsResponse['primary']; prepare?: (s: Store) => void; onChangeModel?: (model: string) => void; locale?: LocaleCode } = {}) {
  const store = createStore()
  store.set(chatSessionIdAtom, sessionId)
  store.set(chatPermissionConfigAtom, { mode: 'default', allowed_tools: [], disallowed_tools: [] })
  store.set(modelCatalogAtom, [])
  store.set(modelCatalogLoadedAtom, true)
  store.set(providersAtom, PROVIDERS)
  store.set(providersLoadStateAtom, 'ready')
  store.set(routingSettingsAtom(''), { state: 'ready', settings: settings(mode, primary) })
  prepare?.(store)
  const input = (
    <Provider store={store}>
      <ChatInput onSend={() => {}} onQueue={() => {}} onQueueOp={() => {}} onInterrupt={() => {}} isStreaming={false} sessionId={sessionId} onChangeModel={onChangeModel} />
    </Provider>
  )
  render(locale ? <I18nProvider initial={locale}>{input}</I18nProvider> : input)
  return store
}

describe('RoutingSelectionMenu', () => {
  const openMenu = () => fireEvent.click(screen.getByTestId('target-chip'))
  beforeEach(() => {
    vi.clearAllMocks()
    // The picked target is persisted: one test's pick must not reach the next.
    localStorage.clear()
    clearModelCatalogCache()
    vi.mocked(providersApi.models).mockResolvedValue({ models: [] } as never)
    changeConversationRouting.mockReset().mockImplementation((_id: string, change: RoutingChange) => Promise.resolve(serverAnswer(change)))
    vaultApiMock.overview.mockReset().mockResolvedValue({ initialized: true, unlocked_until: '2099-01-01T00:00:00Z', secret_count: 0, unavailable: null, secrets: [], grants: [], requests: [] })
  })

    const tick = (provider: string, name: string | RegExp) =>
    fireEvent.click(within(screen.getByTestId(`target-provider-${provider}`)).getByRole('checkbox', { name }))

  it('a new conversation: ONE menu - the Auto switch, then a section per provider, no mode tabs', () => {
    mount('primary')
    openMenu()
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false')
    expect(screen.getByTestId('target-provider-claude-code')).toBeTruthy()
    expect(screen.getByTestId('target-provider-local-llama')).toBeTruthy()
    expect(screen.queryByTestId('routing-tabs')).toBeNull()
    expect(screen.queryByTestId('routing-chip')).toBeNull()
  })

  it('the mode is read from the ticks: none = server default, one = strict, several = mixed', () => {
    const store = mount('primary', { prepare: (s) => s.set(modelCatalogAtom, CLAUDE_MODELS) })
    openMenu()
    expect(screen.getByTestId('target-chip').textContent).toContain('Server default')
    expect(store.get(chatDraftRoutingModeAtom)).toBeNull()

    fireEvent.click(within(screen.getByTestId('target-provider-local-llama')).getByRole('button', { name: /Local llama/ }))
    tick('local-llama', 'qwen')
    expect(store.get(chatDraftRoutingModeAtom)).toBe('primary')
    expect(screen.getByTestId('target-chip').textContent).toContain('Local llama › qwen')
    expect(screen.getByTestId('routing-summary').textContent).toContain('Strict: 1 model')
    // The single pick the rest of the composer reads follows.
    expect(store.get(chatSelectedProviderAtom)).toBe('local-llama')
    expect(store.get(chatSessionModelAtom)).toBe('qwen')
    expect(store.get(chatForcedTargetAtom)).toBe(true)

    // Claude: a version stop is a tickable checkbox on the family line.
    fireEvent.click(within(screen.getByTestId('target-provider-claude-code')).getByRole('checkbox', { name: /All models of Claude Code/ }))
    expect(store.get(chatDraftRoutingModeAtom)).toBe('mixed')
    expect(screen.getByTestId('target-chip').textContent).toContain('Mixed: 3 models')
    expect(screen.getByTestId('routing-summary').textContent).toContain('Mixed: 3 models')
    expect(screen.getByTestId('routing-summary').textContent).toContain('PO routes among the 3 picked models')
  })

  it('the Auto switch turns everything below off, and keeps what was ticked for when it comes back', () => {
    const store = mount('primary')
    openMenu()
    fireEvent.click(within(screen.getByTestId('target-provider-local-llama')).getByRole('button', { name: /Local llama/ }))
    tick('local-llama', 'qwen')
    fireEvent.click(screen.getByRole('switch'))
    expect(store.get(chatDraftRoutingModeAtom)).toBe('full')
    expect(screen.getByTestId('target-chip').textContent).toContain('Auto')
    expect(screen.getByTestId('routing-selection').hasAttribute('inert')).toBe(true)
    // PO chooses: the composer is told nothing is picked...
    expect(store.get(chatSelectedProviderAtom)).toBeNull()
    expect(store.get(chatForcedTargetAtom)).toBe(false)
    // ...and switching Auto off brings the ticks back.
    fireEvent.click(screen.getByRole('switch'))
    expect(store.get(chatDraftRoutingModeAtom)).toBe('primary')
    expect(store.get(chatSelectedProviderAtom)).toBe('local-llama')
    expect(screen.getByTestId('routing-selection').hasAttribute('inert')).toBe(false)
  })

  it('the settings decide until the menu is touched: full settings open on Auto', () => {
    mount('full')
    expect(screen.getByTestId('target-chip').textContent).toContain('Auto')
    openMenu()
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true')
  })

  it('select all and clear all, for everything that can be used', () => {
    const store = mount('primary', { prepare: (s) => s.set(modelCatalogAtom, CLAUDE_MODELS) })
    openMenu()
    fireEvent.click(screen.getByTestId('routing-select-all'))
    expect(store.get(chatDraftSelectionAtom).map((p) => p.provider)).toContain('local-llama')
    expect(store.get(chatDraftRoutingModeAtom)).toBe('mixed')
    fireEvent.click(screen.getByTestId('routing-clear-all'))
    expect(store.get(chatDraftSelectionAtom)).toEqual([])
    expect(store.get(chatSelectedProviderAtom)).toBeNull()
    expect(store.get(chatForcedTargetAtom)).toBe(false)
  })

  it('a provider that cannot serve the project stays listed with its reason and cannot be ticked', () => {
    const store = mount('primary', {
      prepare: (s) =>
        s.set(providersAtom, {
          ...PROVIDERS,
          providers: [PROVIDERS.providers[0], { ...PROVIDERS.providers[1], allowed_for_project: false }],
        }),
    })
    openMenu()
    fireEvent.click(screen.getByTestId('routing-provider-check-local-llama'))
    expect(store.get(chatDraftSelectionAtom)).toEqual([])
    expect(within(screen.getByTestId('target-provider-local-llama')).getByText(/project|allowed/i)).toBeTruthy()
  })

  it('switching the mode never writes the settings', () => {
    mount('mixed')
    openMenu()
    fireEvent.click(screen.getByRole('switch'))
    expect(routingApi.put).not.toHaveBeenCalled()
    expect(routingApi.putProject).not.toHaveBeenCalled()
  })

  it('an existing chat: Auto on and off go to the server, and the menu shows what it answers', async () => {
    const store = mount('primary', {
      sessionId: 's1',
      prepare: (s) => {
        s.set(chatSessionProviderAtom, { id: 'local-llama' })
        s.set(chatSessionModelAtom, 'qwen')
        s.set(providersAtom, { ...PROVIDERS, providers: [PROVIDERS.providers[0], { ...PROVIDERS.providers[1], models: [{ id: 'qwen' }, { id: 'phi' }, { id: 'mistral' }] }] })
        s.set(chatSessionCapabilitiesSnapshotAtom, { set_model_live: true })
        s.set(chatSessionRoutingAtom, { routed_by: 'request', route_reason: null, routing_mode: 'primary' })
      },
    })
    openMenu()
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false')
    // "Hand it to PO".
    fireEvent.click(screen.getByRole('switch'))
    expect(changeConversationRouting).toHaveBeenLastCalledWith('s1', { auto: true })
    await waitFor(() => expect(store.get(chatRoutingModeAtom)).toBe('full'))
    expect(screen.getByTestId('target-chip').textContent).toContain('Auto')
    // Its list stays visible and usable below the panel.
    expect(screen.getByTestId('routing-selection').hasAttribute('inert')).toBe(false)
    // Off again: the chat keeps the model it runs, imposed.
    fireEvent.click(screen.getByRole('switch'))
    expect(changeConversationRouting).toHaveBeenLastCalledWith('s1', { auto: false, routing_pool: [{ provider: 'local-llama', model: 'qwen' }] })
    await waitFor(() => expect(store.get(chatRoutingModeAtom)).toBe('primary'))
    // Nothing global was written, and no draft was touched.
    expect(routingApi.put).not.toHaveBeenCalled()
    expect(routingApi.putProject).not.toHaveBeenCalled()
    expect(store.get(chatDraftAutoAtom)).toBeNull()
    expect(store.get(chatDraftSelectionAtom)).toEqual([])
  })

  it('an existing chat: one tick = strict, several = mixed, sent to the route; no mass gestures, other providers offer a move', async () => {
    // The catalog read when the menu opens lists the same models (it replaces the listing's).
    clearModelCatalogCache()
    vi.mocked(providersApi.models).mockImplementation((id: string) =>
      Promise.resolve({ models: id === 'local-llama' ? [{ id: 'qwen' }, { id: 'phi' }, { id: 'mistral' }] : [] } as never),
    )
    const onChangeModel = vi.fn()
    const store = mount('primary', {
      sessionId: 's1',
      onChangeModel,
      prepare: (s) => {
        s.set(chatSessionProviderAtom, { id: 'local-llama' })
        s.set(chatSessionModelAtom, 'qwen')
        s.set(providersAtom, { ...PROVIDERS, providers: [PROVIDERS.providers[0], { ...PROVIDERS.providers[1], models: [{ id: 'qwen' }, { id: 'phi' }, { id: 'mistral' }] }] })
        s.set(chatSessionCapabilitiesSnapshotAtom, { set_model_live: true })
        s.set(chatSessionRoutingAtom, { routed_by: 'request', route_reason: null, routing_mode: 'primary' })
      },
    })
    openMenu()
    expect(screen.queryByTestId('routing-select-all')).toBeNull()
    expect(screen.queryByTestId('routing-provider-check-local-llama')).toBeNull()
    expect(screen.getByTestId('routing-switch-hint-claude-code').textContent).toMatch(/moves this conversation there/i)
    // A second model ticked: mixed among the two.
    tick('local-llama', 'phi')
    expect(changeConversationRouting).toHaveBeenLastCalledWith('s1', {
      auto: false,
      routing_pool: [
        { provider: 'local-llama', model: 'qwen' },
        { provider: 'local-llama', model: 'phi' },
      ],
    })
    await waitFor(() => expect(store.get(chatRoutingModeAtom)).toBe('mixed'))
    await waitFor(() => expect(screen.getByTestId('routing-selection').hasAttribute('aria-busy')).toBe(false))
    expect(screen.getByTestId('routing-summary').textContent).toContain('Mixed: 2 models')
    // One path only: the route, not the set_model frame as well.
    expect(onChangeModel).not.toHaveBeenCalled()
    // Unticking back to one: strict on that one.
    tick('local-llama', 'qwen')
    expect(changeConversationRouting).toHaveBeenLastCalledWith('s1', { auto: false, routing_pool: [{ provider: 'local-llama', model: 'phi' }] })
    await waitFor(() => expect(store.get(chatRoutingModeAtom)).toBe('primary'))
    expect(store.get(chatSessionModelAtom)).toBe('phi')
    await waitFor(() => expect(screen.getByTestId('routing-selection').hasAttribute('aria-busy')).toBe(false))
    // The last model cannot be unticked (a chat runs on something): nothing is sent.
    changeConversationRouting.mockClear()
    tick('local-llama', 'phi')
    expect(changeConversationRouting).not.toHaveBeenCalled()
  })

  it('an existing chat shows the state the server returned, not a local guess', async () => {
    changeConversationRouting.mockImplementation((_id: string, change: RoutingChange) => Promise.resolve(serverAnswer(change, 'mistral')))
    const store = mount('primary', {
      sessionId: 's1',
      prepare: (s) => {
        s.set(chatSessionProviderAtom, { id: 'local-llama' })
        s.set(chatSessionModelAtom, 'qwen')
        s.set(providersAtom, { ...PROVIDERS, providers: [PROVIDERS.providers[0], { ...PROVIDERS.providers[1], models: [{ id: 'qwen' }, { id: 'phi' }, { id: 'mistral' }] }] })
        s.set(chatSessionCapabilitiesSnapshotAtom, { set_model_live: true })
        s.set(chatSessionRoutingAtom, { routed_by: 'request', route_reason: null, routing_mode: 'primary' })
      },
    })
    openMenu()
    fireEvent.click(screen.getByRole('switch'))
    // While the call runs the list is busy and nothing has changed yet.
    expect(screen.getByTestId('routing-selection').getAttribute('aria-busy')).toBe('true')
    expect(store.get(chatRoutingModeAtom)).toBe('primary')
    await waitFor(() => expect(store.get(chatRoutingModeAtom)).toBe('full'))
    // The model the server says the chat runs on.
    expect(store.get(chatSessionModelAtom)).toBe('mistral')
    expect(screen.getByTestId('routing-auto-panel').textContent).toContain('PO chose: mistral')
  })

  it('a refusal (routing_pool_other_provider) keeps the previous state and says why', async () => {
    const { ApiError } = await import('@/services/api')
    changeConversationRouting.mockRejectedValue(
      new ApiError(400, JSON.stringify({ error: 'not on this provider', code: 'routing_pool_other_provider', retryable: false })),
    )
    const store = mount('primary', {
      sessionId: 's1',
      prepare: (s) => {
        s.set(chatSessionProviderAtom, { id: 'local-llama' })
        s.set(chatSessionModelAtom, 'qwen')
        s.set(providersAtom, { ...PROVIDERS, providers: [PROVIDERS.providers[0], { ...PROVIDERS.providers[1], models: [{ id: 'qwen' }, { id: 'phi' }, { id: 'mistral' }] }] })
        s.set(chatSessionCapabilitiesSnapshotAtom, { set_model_live: true })
        s.set(chatSessionRoutingAtom, { routed_by: 'auto', route_reason: 'cheap', routing_mode: 'full' })
      },
    })
    openMenu()
    tick('local-llama', 'phi')
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('another provider')
    expect(store.get(chatRoutingModeAtom)).toBe('full')
    expect(store.get(chatSessionModelAtom)).toBe('qwen')
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true')
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('Auto before the auto learning stage: the panel says PO observes and does not switch models yet', () => {
    mount('primary', {
      sessionId: 's1',
      prepare: (s) => {
        s.set(routingSettingsAtom(''), { state: 'ready', settings: { ...settings('primary'), stage: 'shadow' } })
        s.set(chatSessionModelAtom, 'qwen')
        s.set(chatSessionRoutingAtom, { routed_by: 'auto', route_reason: 'cheap', routing_mode: 'full' })
      },
    })
    openMenu()
    const panel = screen.getByTestId('routing-auto-panel').textContent!
    expect(panel).toContain('PO observes this conversation but does not switch models yet (learning stage: Shadow)')
    expect(panel).toContain('Running:')
    expect(panel).not.toContain('PO chose')
  })

  it('a new conversation on Auto before the auto stage says it too', () => {
    mount('full', { prepare: (s) => s.set(routingSettingsAtom(''), { state: 'ready', settings: { ...settings('full'), stage: 'advisory' } }) })
    openMenu()
    expect(screen.getByTestId('routing-stage-note').textContent).toContain('does not switch models yet')
  })

  it('the vault is unlocked from this menu too: a locked vault shows the passphrase field', async () => {
    vaultApiMock.overview.mockResolvedValue({ initialized: true, unlocked_until: null, secret_count: 1, unavailable: null, secrets: [], grants: [], requests: [] })
    mount('primary')
    openMenu()
    expect(await screen.findByLabelText('Vault locked')).toBeTruthy()
  })

  it('no vault field while the vault is open', async () => {
    mount('primary')
    openMenu()
    await waitFor(() => expect(vaultApiMock.overview).toHaveBeenCalled())
    expect(screen.queryByLabelText('Vault locked')).toBeNull()
  })

  it('a whole provider is ticked and cleared in one gesture, and the global gestures are disabled when there is nothing to do', () => {
    const store = mount('primary')
    openMenu()
    expect((screen.getByTestId('routing-clear-all') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByTestId('routing-provider-check-local-llama'))
    expect(store.get(chatDraftSelectionAtom)).toEqual([{ provider: 'local-llama', model: 'qwen' }])
    fireEvent.click(screen.getByTestId('routing-provider-check-local-llama'))
    expect(store.get(chatDraftSelectionAtom)).toEqual([])
  })

  it('a backend without the router: the plain picker, no switch', () => {
    mount('primary', { prepare: (s) => s.set(routingSettingsAtom(''), { state: 'unsupported', settings: null }) })
    fireEvent.click(screen.getByTestId('target-chip'))
    expect(screen.getByTestId('target-picker-popover')).toBeTruthy()
    expect(screen.queryByRole('switch')).toBeNull()
  })

  it('full: with a session, the menu says what PO chose and why - same switch, no separate page', () => {
    mount('full', {
      sessionId: 's1',
      prepare: (s) => s.set(chatSessionRoutingAtom, { routed_by: 'auto', route_reason: 'cheapest capable model', routing_mode: 'full' }),
    })
    expect(screen.getByTestId('target-chip').textContent).toContain('Auto')
    openMenu()
    const panel = screen.getByTestId('routing-auto-panel').textContent!
    expect(panel).toContain('Reason: cheapest capable model')
    expect(panel).toContain('Routed by: PO chose')
    expect(screen.queryByTestId('routing-popover')).toBeNull()
    expect(screen.queryByTestId('routing-advanced')).toBeNull()
  })

  it('full: a chat given its own model shows that model, not Auto', () => {
    mount('full', {
      sessionId: 's1',
      prepare: (s) => {
        s.set(chatSessionModelAtom, 'qwen')
        s.set(chatSessionRoutingAtom, { routed_by: 'request', route_reason: null, routing_mode: 'full' })
      },
    })
    expect(screen.getByTestId('target-chip').textContent).toMatch(/qwen/i)
    expect(screen.getByTestId('target-chip').textContent).not.toContain('Auto')
  })

  it('full: another chat without its own choice still reads Auto', () => {
    mount('full', {
      sessionId: 's2',
      prepare: (s) => {
        s.set(chatSessionModelAtom, 'qwen')
        s.set(chatSessionRoutingAtom, { routed_by: 'auto', route_reason: 'cheapest capable model', routing_mode: 'full' })
      },
    })
    expect(screen.getByTestId('target-chip').textContent).toContain('Auto')
  })

  it('full: the effective provider id is null before a session, and the session provider after', () => {
    const store = mount('full')
    expect(store.get(chatEffectiveProviderIdAtom)).toBeNull()
    store.set(chatSessionIdAtom, 's1')
    store.set(chatSessionProviderAtom, { id: 'local-llama' })
    expect(store.get(chatEffectiveProviderIdAtom)).toBe('local-llama')
  })

  it('primary: the effective provider id is still reported before a session', () => {
    const store = mount('primary')
    expect(store.get(chatEffectiveProviderIdAtom)).toBe('claude-code')
  })

  it('an alias ticked next to the model it stands for is ONE model: strict, not mixed', () => {
    const store = mount('primary', {
      prepare: (s) => s.set(providersAtom, { ...PROVIDERS, aliases: [{ alias: 'fast', provider: 'local-llama', model: 'qwen' }] } as ProvidersResponse),
    })
    openMenu()
    fireEvent.click(within(screen.getByTestId('target-provider-local-llama')).getByRole('button', { name: /Local llama/ }))
    tick('local-llama', 'qwen')
    tick('local-llama', /fast/)
    expect(store.get(chatDraftSelectionAtom)).toHaveLength(2)
    expect(store.get(chatDraftRoutingModeAtom)).toBe('primary')
    expect(screen.getByTestId('routing-summary').textContent).toContain('Strict: 1 model')
  })

  it('an existing chat on Auto: the panel says what PO chose; picking a model takes the hand back and says so; "Hand it back to PO" restores Auto', async () => {
    const onChangeModel = vi.fn()
    const store = mount('primary', {
      sessionId: 's1',
      onChangeModel,
      prepare: (s) => {
        s.set(chatSessionProviderAtom, { id: 'local-llama' })
        s.set(chatSessionModelAtom, 'qwen')
        s.set(providersAtom, { ...PROVIDERS, providers: [PROVIDERS.providers[0], { ...PROVIDERS.providers[1], models: [{ id: 'qwen' }, { id: 'phi' }, { id: 'mistral' }] }] })
        s.set(chatSessionCapabilitiesSnapshotAtom, { set_model_live: true })
        s.set(chatSessionRoutingAtom, { routed_by: 'auto', route_reason: 'cheap', routing_mode: 'full' })
      },
    })
    openMenu()
    expect(screen.getByTestId('routing-auto-panel').textContent).toContain('PO chose: qwen')
    expect(screen.queryByTestId('routing-hand-back')).toBeNull()
    // The list is still there, below the panel, and usable: picking ONE model takes the hand back on it.
    tick('local-llama', 'phi')
    expect(changeConversationRouting).toHaveBeenLastCalledWith('s1', { auto: false, routing_pool: [{ provider: 'local-llama', model: 'phi' }] })
    expect((await screen.findByRole('status')).textContent).toContain('You took the hand back: phi')
    expect(store.get(chatRoutingModeAtom)).toBe('primary')
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false')
    expect(onChangeModel).not.toHaveBeenCalled()
    // Hand it back.
    fireEvent.click(screen.getByTestId('routing-hand-back'))
    expect(changeConversationRouting).toHaveBeenLastCalledWith('s1', { auto: true })
    await waitFor(() => expect(store.get(chatRoutingModeAtom)).toBe('full'))
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true')
    expect(routingApi.put).not.toHaveBeenCalled()
  })

  it('an existing chat shows ITS mode, not the settings: full settings, a chat opened in strict', () => {
    mount('full', { sessionId: 's1', prepare: (s) => s.set(chatSessionRoutingAtom, { routed_by: 'default', route_reason: null, routing_mode: null }) })
    expect(screen.getByTestId('target-chip').textContent).not.toContain('Auto')
    openMenu()
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false')
  })

  it('every control has a visible focus ring and a target of 24px (44px on touch)', () => {
    mount('primary', { prepare: (s) => s.set(modelCatalogAtom, CLAUDE_MODELS) })
    openMenu()
    const popover = screen.getByTestId('target-picker-popover')
    const controls = [screen.getByTestId('target-chip'), ...within(popover).getAllByRole('button'), ...within(popover).getAllByRole('checkbox')]
    for (const el of controls) {
      expect(el.className, el.outerHTML.slice(0, 120)).toMatch(/focus-visible:ring-2/)
      expect(el.className, el.outerHTML.slice(0, 120)).toMatch(/min-h-6|size-6|h-9|min-h-11/)
      expect(el.className, el.outerHTML.slice(0, 120)).toMatch(/pointer-coarse:(min-h-11|size-11|h-11)/)
    }
  })

  it('reads in the user\'s language', async () => {
    await loadLocale('fr')
    mount('primary', { locale: 'fr', prepare: (s) => s.set(modelCatalogAtom, CLAUDE_MODELS) })
    openMenu()
    fireEvent.click(within(screen.getByTestId('target-provider-claude-code')).getByRole('checkbox', { name: /Tous les modèles de Claude Code/ }))
    expect(screen.getByTestId('routing-summary').textContent).toContain('Mixte : 2 modèles')
    expect(screen.getAllByRole('group', { name: /^Versions de /i })[0]).toBeTruthy()
  })

  it('a chat opened in Strict: the switch is off and the locked provider shows', () => {
    mount('primary', { sessionId: 's1' })
    openMenu()
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false')
    expect(screen.queryByTestId('routing-auto-panel')).toBeNull()
  })
})

describe('routed_by badge in the header', () => {
  const header = (routing: Parameters<Store['set']>[1] | null) => {
    const store = createStore()
    store.set(chatSessionRoutingAtom, routing as never)
    render(
      <Provider store={store}>
        <MemoryRouter>
          <ChatHeaderTitle title="T" />
        </MemoryRouter>
      </Provider>,
    )
  }

  it('shows nothing on the default path', () => {
    header({ routed_by: 'default', route_reason: null, routing_mode: 'primary' })
    expect(screen.queryByTestId('routed-by-badge')).toBeNull()
  })

  it('shows nothing without routing information', () => {
    header(null)
    expect(screen.queryByTestId('routed-by-badge')).toBeNull()
  })

  it('shows "PO chose" with the reason when routed_by is auto', () => {
    header({ routed_by: 'auto', route_reason: 'low-risk edit', routing_mode: 'full' })
    const badge = screen.getByTestId('routed-by-badge')
    expect(badge.textContent).toBe('PO chose')
    expect(badge.getAttribute('title')).toContain('Reason: low-risk edit')
  })

  it('shows the fallback chain for routed_by fallback', () => {
    header({ routed_by: 'fallback', route_reason: null, routing_mode: null })
    expect(screen.getByTestId('routed-by-badge').textContent).toBe('Fallback chain')
  })

  it('shows up for a session with a reason even on another rule', () => {
    header({ routed_by: 'project_rule', route_reason: 'because', routing_mode: null })
    expect(screen.getByTestId('routed-by-badge').textContent).toBe('Project rule')
  })
})

describe('ModelChangedBlock', () => {
  const block = (metadata: Record<string, unknown>): ContentBlock => ({ id: 'b', type: 'model_changed', content: '', metadata })

  it('without a reason: just the model', () => {
    render(<ModelChangedBlock block={block({ model: 'claude-sonnet-5' })} />)
    expect(screen.queryByTestId('model-changed-reason')).toBeNull()
  })

  it('with a reason: shows it', () => {
    render(<ModelChangedBlock block={block({ model: 'claude-sonnet-5', reason: 'task got harder' })} />)
    expect(screen.getByTestId('model-changed-reason').textContent).toBe('Reason: task got harder')
  })
})
