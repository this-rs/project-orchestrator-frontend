/**
 * The routing-mode control of the composer, mounted through `ChatInput`:
 * one rendering per mode, the Advanced path, and the badge rules.
 *
 * Run with: npx vitest run src/components/chat/RoutingModePicker.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Provider, createStore } from 'jotai'
import { routingApi } from '@/services/routing'
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
import { ChatInput } from './ChatInput'
import { ChatHeaderTitle } from './ChatHeaderTitle'
import { ModelChangedBlock } from './ModelChangedBlock'

vi.mock('@/hooks', () => ({ useIsMobile: () => false }))
vi.mock('@/services/chat', () => ({ chatApi: { getPermissionConfig: () => new Promise(() => {}) } }))
vi.mock('@/services/providers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/providers')>()),
  providersApi: { models: vi.fn().mockResolvedValue({ models: [] }), list: vi.fn() },
}))
vi.mock('@/services/routing', () => ({
  routingApi: { get: vi.fn(() => new Promise(() => {})), getProject: vi.fn(() => new Promise(() => {})), put: vi.fn(), putProject: vi.fn() },
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

function mount(mode: ProviderRoutingMode, { sessionId = null as string | null, primary = null as RoutingSettingsResponse['primary'], prepare }: { sessionId?: string | null; primary?: RoutingSettingsResponse['primary']; prepare?: (s: Store) => void } = {}) {
  const store = createStore()
  store.set(chatSessionIdAtom, sessionId)
  store.set(chatPermissionConfigAtom, { mode: 'default', allowed_tools: [], disallowed_tools: [] })
  store.set(modelCatalogAtom, [])
  store.set(modelCatalogLoadedAtom, true)
  store.set(providersAtom, PROVIDERS)
  store.set(providersLoadStateAtom, 'ready')
  store.set(routingSettingsAtom(''), { state: 'ready', settings: settings(mode, primary) })
  prepare?.(store)
  render(
    <Provider store={store}>
      <ChatInput onSend={() => {}} onQueue={() => {}} onQueueOp={() => {}} onInterrupt={() => {}} isStreaming={false} sessionId={sessionId} />
    </Provider>,
  )
  return store
}

describe('RoutingModePicker', () => {
  const openMenu = () => fireEvent.click(screen.getByTestId('target-chip'))
  beforeEach(() => {
    vi.clearAllMocks()
    // The picked target is persisted: one test's pick must not reach the next.
    localStorage.clear()
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
    expect(screen.getByTestId('routing-summary').textContent).toContain('Strict')
    // The single pick the rest of the composer reads follows.
    expect(store.get(chatSelectedProviderAtom)).toBe('local-llama')
    expect(store.get(chatSessionModelAtom)).toBe('qwen')
    expect(store.get(chatForcedTargetAtom)).toBe(true)

    // Claude: a version stop is a tickable checkbox on the family line.
    fireEvent.click(within(screen.getByTestId('target-provider-claude-code')).getByRole('checkbox', { name: /All models of Claude Code/ }))
    expect(store.get(chatDraftRoutingModeAtom)).toBe('mixed')
    expect(screen.getByTestId('target-chip').textContent).toContain('Mixed · 3 models')
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

  it('an existing chat keeps the mode it was opened with: the switch only changes the view', () => {
    const store = mount('primary', {
      sessionId: 's1',
      prepare: (s) => s.set(chatSessionRoutingAtom, { routed_by: 'auto', route_reason: 'cheap', routing_mode: 'full' }),
    })
    // The record's mode wins over the settings' (primary).
    expect(store.get(chatRoutingModeAtom)).toBe('full')
    openMenu()
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByRole('switch'))
    expect(screen.queryByTestId('routing-auto-panel')).toBeNull()
    expect(store.get(chatRoutingModeAtom)).toBe('full')
    expect(routingApi.put).not.toHaveBeenCalled()
    expect(store.get(chatDraftAutoAtom)).toBeNull()
  })

  it('a backend without the router: the plain picker, no switch', () => {
    mount('primary', { prepare: (s) => s.set(routingSettingsAtom(''), { state: 'unsupported', settings: null }) })
    fireEvent.click(screen.getByTestId('target-chip'))
    expect(screen.queryByTestId('routing-auto-switch')).toBeNull()
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
