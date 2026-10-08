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
  chatDraftRoutingModeAtom,
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
  beforeEach(() => {
    vi.clearAllMocks()
    // The picked target is persisted: one test's pick must not reach the next.
    localStorage.clear()
  })

  it('primary: is exactly the provider/model picker', () => {
    mount('primary')
    expect(screen.getByTestId('target-chip')).toBeTruthy()
    expect(screen.queryByTestId('routing-chip')).toBeNull()
  })

  it('a new conversation: one menu, the three modes at the top, the current one checked', () => {
    mount('mixed')
    fireEvent.click(screen.getByTestId('target-chip'))
    const tabs = screen.getByTestId('routing-tabs')
    expect(within(tabs).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Auto', 'Mixed', 'Strict'])
    expect(within(tabs).getByTestId('routing-mode-mixed').getAttribute('aria-checked')).toBe('true')
    expect(screen.queryByTestId('routing-chip')).toBeNull()
  })

  it('mixed: the chip says Mixed and names the pilot you can pick below', () => {
    mount('mixed')
    expect(screen.getByTestId('target-chip').textContent).toContain('Mixed · ')
    fireEvent.click(screen.getByTestId('target-chip'))
    expect(screen.getByTestId('target-provider-local-llama')).toBeTruthy()
  })

  it('full: nothing to pick - the chip reads Auto and the menu only explains it', () => {
    mount('full')
    const chip = screen.getByTestId('target-chip')
    expect(chip.textContent).toContain('Auto')
    fireEvent.click(chip)
    expect(screen.getByTestId('routing-auto-panel').textContent).toBe('PO will choose at the first message')
    expect(screen.queryByTestId('target-provider-local-llama')).toBeNull()
  })

  it('switching mode is this conversation\'s own: nothing is saved, the settings are untouched', () => {
    const store = mount('mixed')
    fireEvent.click(screen.getByTestId('target-chip'))
    fireEvent.click(screen.getByTestId('routing-mode-primary'))
    expect(routingApi.put).not.toHaveBeenCalled()
    expect(routingApi.putProject).not.toHaveBeenCalled()
    expect(store.get(chatDraftRoutingModeAtom)).toBe('primary')
    expect(store.get(chatRoutingModeAtom)).toBe('primary')
    expect(store.get(routingSettingsAtom('')).settings?.mode).toBe('mixed')
    expect(screen.getByTestId('routing-mode-primary').getAttribute('aria-checked')).toBe('true')
  })

  it('switching to Auto drops the target picked for this draft', () => {
    const store = mount('primary', {
      prepare: (s) => {
        s.set(chatSelectedProviderAtom, 'local-llama')
        s.set(chatSessionModelAtom, 'qwen')
        s.set(chatForcedTargetAtom, true)
      },
    })
    fireEvent.click(screen.getByTestId('target-chip'))
    fireEvent.click(screen.getByTestId('routing-mode-full'))
    expect(store.get(chatSelectedProviderAtom)).toBeNull()
    expect(store.get(chatSessionModelAtom)).toBeNull()
    expect(store.get(chatForcedTargetAtom)).toBe(false)
    expect(store.get(chatDraftRoutingModeAtom)).toBe('full')
  })

  it('an existing chat keeps the mode it was opened with: its tabs only change the view', () => {
    const store = mount('primary', {
      sessionId: 's1',
      prepare: (s) => s.set(chatSessionRoutingAtom, { routed_by: 'auto', route_reason: 'cheap', routing_mode: 'full' }),
    })
    // The record's mode wins over the settings' (primary).
    expect(store.get(chatRoutingModeAtom)).toBe('full')
    fireEvent.click(screen.getByTestId('target-chip'))
    expect(screen.getByTestId('routing-mode-full').getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByTestId('routing-mode-primary'))
    expect(screen.queryByTestId('routing-auto-panel')).toBeNull()
    expect(store.get(chatRoutingModeAtom)).toBe('full')
    expect(routingApi.put).not.toHaveBeenCalled()
    expect(store.get(chatDraftRoutingModeAtom)).toBeNull()
  })

  it('strict: picking a model forces the target', () => {
    const store = mount('primary')
    fireEvent.click(screen.getByTestId('target-chip'))
    fireEvent.click(within(screen.getByTestId('target-provider-local-llama')).getAllByRole('button')[0])
    fireEvent.click(within(screen.getByTestId('target-provider-local-llama')).getByRole('button', { name: 'qwen' }))
    expect(store.get(chatForcedTargetAtom)).toBe(true)
    expect(store.get(chatSelectedProviderAtom)).toBe('local-llama')
  })

  it('a backend without the router: the plain picker, no tabs', () => {
    mount('primary', { prepare: (s) => s.set(routingSettingsAtom(''), { state: 'unsupported', settings: null }) })
    fireEvent.click(screen.getByTestId('target-chip'))
    expect(screen.queryByTestId('routing-tabs')).toBeNull()
  })

  it('full: with a session, the menu says what PO chose and why - same tabs, no separate page', () => {
    mount('full', {
      sessionId: 's1',
      prepare: (s) => s.set(chatSessionRoutingAtom, { routed_by: 'auto', route_reason: 'cheapest capable model', routing_mode: 'full' }),
    })
    expect(screen.getByTestId('target-chip').textContent).toContain('Auto')
    fireEvent.click(screen.getByTestId('target-chip'))
    expect(screen.getByTestId('routing-tabs')).toBeTruthy()
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

  it('a chat in Strict: the tabs and the locked provider, model switch as before', () => {
    mount('primary', { sessionId: 's1' })
    fireEvent.click(screen.getByTestId('target-chip'))
    expect(screen.getByTestId('routing-tabs')).toBeTruthy()
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
