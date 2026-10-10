/**
 * Moving an EXISTING conversation to another provider from the routing menu: the
 * pick opens a confirmation that says what happens and takes the message to send,
 * the switch route is called with the right body, the tab follows the new session;
 * a typed refusal is said and nothing moves. Mounted through `ChatInput`.
 *
 * Run with: npx vitest run src/components/chat/RoutingSelectionMenu.switch.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { clearModelCatalogCache } from '@/components/settings/useModelCatalog'
import { providersApi } from '@/services/providers'
import { ApiError } from '@/services/api'
import {
  chatDraftInputAtom,
  chatFollowRequestAtom,
  chatPermissionConfigAtom,
  chatSessionCapabilitiesSnapshotAtom,
  chatSessionIdAtom,
  chatSessionModelAtom,
  chatSessionProviderAtom,
  chatSessionRoutingAtom,
  chatSwitchingSessionAtom,
  modelCatalogAtom,
  modelCatalogLoadedAtom,
  providersAtom,
  providersLoadStateAtom,
  routingSettingsAtom,
} from '@/atoms'
import type { ProvidersResponse } from '@/types/provider'
import type { RoutingSettingsResponse } from '@/types/routing'
import { ChatInput } from './ChatInput'

vi.mock('@/hooks', () => ({ useIsMobile: () => false }))
const changeConversationRouting = vi.hoisted(() => vi.fn())
const switchConversationProvider = vi.hoisted(() => vi.fn())
vi.mock('@/services/chat', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/chat')>()),
  chatApi: { getPermissionConfig: () => new Promise(() => {}) },
  changeConversationRouting,
  switchConversationProvider,
}))
vi.mock('@/services/providers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/providers')>()),
  providersApi: { models: vi.fn().mockResolvedValue({ models: [] }), list: vi.fn() },
}))
vi.mock('@/services/routing', () => ({
  routingApi: { get: vi.fn(() => new Promise(() => {})), getProject: vi.fn(() => new Promise(() => {})), put: vi.fn(), putProject: vi.fn() },
}))
vi.mock('@/services/vault', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/vault')>()),
  vaultApi: {
    overview: vi.fn().mockResolvedValue({ initialized: true, unlocked_until: '2099-01-01T00:00:00Z', secret_count: 0, unavailable: null, secrets: [], grants: [], requests: [] }),
    unlock: vi.fn(),
  },
}))
vi.mock('@/services/documents', () => ({ documentsApi: { upload: vi.fn() } }))

const MODELS = [{ id: 'qwen' }, { id: 'phi' }]
const PROVIDERS: ProvidersResponse = {
  providers: [
    { id: 'claude-code', kind: 'claude_code', label: 'Claude Code', builtin: true, health: { status: 'healthy' }, models: [], default_model: 'claude-sonnet-5' },
    { id: 'local-llama', kind: 'openai_compatible', label: 'Local llama', health: { status: 'healthy' }, default_model: 'qwen', models: MODELS },
    { id: 'broken', kind: 'openai_compatible', label: 'Broken one', health: { status: 'unhealthy', error: { code: 'endpoint_unreachable', message: 'Endpoint unreachable' } }, models: [{ id: 'x' }] },
  ],
  default: { provider: 'claude-code', model: 'claude-sonnet-5', routed_by: 'default' },
}

const SETTINGS: RoutingSettingsResponse = { mode: 'primary', stage: 'auto', primary: null, exploration_epsilon: 0, cost_weight: 0, latency_weight: 0, demote_after: 0, scope: 'global' }

const MOVE = { session_id: 's2', stream_url: '/ws/chat/s2', previous_session_id: 's1', relayed_entries: 12, omitted_entries: 3, conversation_id: 'conv-1' }

/** A conversation running on Claude Code (s1), with `draft` in its composer. */
function mount({ draft = '', setModelLive = true }: { draft?: string; setModelLive?: boolean } = {}) {
  const store = createStore()
  store.set(chatSessionIdAtom, 's1')
  store.set(chatPermissionConfigAtom, { mode: 'default', allowed_tools: [], disallowed_tools: [] })
  store.set(modelCatalogAtom, [])
  store.set(modelCatalogLoadedAtom, true)
  store.set(providersAtom, PROVIDERS)
  store.set(providersLoadStateAtom, 'ready')
  store.set(routingSettingsAtom(''), { state: 'ready', settings: SETTINGS })
  store.set(chatSessionProviderAtom, { id: 'claude-code' })
  store.set(chatSessionModelAtom, 'claude-sonnet-5')
  store.set(chatSessionCapabilitiesSnapshotAtom, { set_model_live: setModelLive })
  store.set(chatSessionRoutingAtom, { routed_by: 'request', route_reason: null, routing_mode: 'primary' })
  if (draft) store.set(chatDraftInputAtom, draft)
  render(
    <Provider store={store}>
      <ChatInput onSend={() => {}} onQueue={() => {}} onQueueOp={() => {}} onInterrupt={() => {}} isStreaming={false} sessionId="s1" />
    </Provider>,
  )
  return store
}

const openMenu = () => fireEvent.click(screen.getByTestId('target-chip'))
/** Open the section of another provider (closed by default on an existing chat) and pick one of its models. */
function pickOther(provider: string, label: RegExp, model: string) {
  const section = screen.getByTestId(`target-provider-${provider}`)
  fireEvent.click(within(section).getByRole('button', { name: label }))
  fireEvent.click(within(screen.getByTestId(`target-provider-${provider}`)).getByRole('checkbox', { name: model }))
}

describe('RoutingSelectionMenu - move an existing conversation to another provider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    clearModelCatalogCache()
    vi.mocked(providersApi.models).mockImplementation((id: string) => Promise.resolve({ models: id === 'local-llama' ? MODELS : [] } as never))
    switchConversationProvider.mockReset().mockResolvedValue(MOVE)
  })

  it('pick on another provider -> confirmation says what happens -> route called with the draft -> the tab follows', async () => {
    const store = mount({ draft: 'Now continue on the local model' })
    openMenu()
    expect(screen.getByTestId('routing-switch-hint-local-llama')).toBeTruthy()
    pickOther('local-llama', /Local llama/, 'phi')

    const dialog = await screen.findByRole('dialog', { name: /Move this conversation to Local llama › phi\?/ })
    // What happens, in words.
    expect(dialog.textContent).toContain('A new session opens on Local llama › phi.')
    expect(dialog.textContent).toContain('replayed to it as text')
    expect(dialog.textContent).toMatch(/oldest turns are left out/)
    expect(dialog.textContent).toMatch(/current session on Claude Code .* is closed/)
    // The draft is the message, focused, editable; nothing was sent yet, nothing routed.
    const message = within(dialog).getByTestId('switch-provider-message') as HTMLTextAreaElement
    expect(message.value).toBe('Now continue on the local model')
    expect(document.activeElement).toBe(message)
    expect(switchConversationProvider).not.toHaveBeenCalled()
    expect(changeConversationRouting).not.toHaveBeenCalled()

    fireEvent.click(within(dialog).getByTestId('switch-provider-confirm'))
    expect(switchConversationProvider).toHaveBeenCalledWith('s1', { provider: 'local-llama', model: 'phi', message: 'Now continue on the local model' })
    // This tab is the one moving it: no "moved elsewhere" notice when the old thread says so.
    expect(store.get(chatSwitchingSessionAtom)).toBe('s1')

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(store.get(chatFollowRequestAtom)).toEqual({ sessionId: 's2', fromSessionId: 's1', notice: null })
    expect(store.get(chatSwitchingSessionAtom)).toBeNull()
    // The message left with the move: the draft is spent. Focus is back on the menu's trigger.
    expect(store.get(chatDraftInputAtom)).toBe('')
    expect(document.activeElement).toBe(screen.getByTestId('target-chip'))
  })

  it('an empty composer: the confirmation asks for the message, required before anything is sent', async () => {
    mount()
    openMenu()
    pickOther('local-llama', /Local llama/, 'qwen')
    const dialog = await screen.findByRole('dialog')
    const message = within(dialog).getByTestId('switch-provider-message') as HTMLTextAreaElement
    expect(message.value).toBe('')
    expect(message.required).toBe(true)
    fireEvent.click(within(dialog).getByTestId('switch-provider-confirm'))
    expect(switchConversationProvider).not.toHaveBeenCalled()
    expect(message.getAttribute('aria-invalid')).toBe('true')
    expect(dialog.textContent).toContain('Write the message to send first.')
    fireEvent.change(message, { target: { value: 'go on' } })
    fireEvent.click(within(dialog).getByTestId('switch-provider-confirm'))
    expect(switchConversationProvider).toHaveBeenCalledWith('s1', { provider: 'local-llama', model: 'qwen', message: 'go on' })
  })

  it('a typed refusal (consent / endpoint guard) is said in the dialog, and nothing moves', async () => {
    switchConversationProvider.mockRejectedValue(
      new ApiError(403, JSON.stringify({ code: 'endpoint_not_allowed', error: 'not allowed', origin: 'http://10.0.0.5:8080', project_slug: 'po' })),
    )
    const store = mount({ draft: 'hello' })
    openMenu()
    pickOther('local-llama', /Local llama/, 'phi')
    fireEvent.click(within(await screen.findByRole('dialog')).getByTestId('switch-provider-confirm'))
    const refusal = await screen.findByTestId('switch-provider-refusal')
    expect(refusal.getAttribute('role')).toBe('alert')
    expect(refusal.textContent).toContain('http://10.0.0.5:8080')
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(store.get(chatFollowRequestAtom)).toBeNull()
    expect(store.get(chatDraftInputAtom)).toBe('hello')
  })

  it('an agent token (403 without a code) is told apart from a failure; Escape cancels and gives focus back', async () => {
    switchConversationProvider.mockRejectedValue(new ApiError(403, JSON.stringify({ error: 'only a signed-in user can move a conversation to another provider' })))
    const store = mount({ draft: 'hello' })
    openMenu()
    pickOther('local-llama', /Local llama/, 'phi')
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByTestId('switch-provider-confirm'))
    expect((await screen.findByTestId('switch-provider-refusal')).textContent).toContain('Only a signed-in person can move a conversation')
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(screen.getByTestId('target-chip'))
    expect(store.get(chatFollowRequestAtom)).toBeNull()
  })

  it('keeps focus inside the dialog (Tab wraps around)', async () => {
    mount({ draft: 'hello' })
    openMenu()
    pickOther('local-llama', /Local llama/, 'phi')
    const dialog = await screen.findByRole('dialog')
    const confirm = within(dialog).getByTestId('switch-provider-confirm')
    confirm.focus()
    fireEvent.keyDown(dialog, { key: 'Tab' })
    expect(document.activeElement).toBe(within(dialog).getByTestId('switch-provider-message'))
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(confirm)
  })

  it('a provider that cannot change model live still offers the move; an unavailable provider keeps its reason', () => {
    mount({ setModelLive: false })
    openMenu()
    expect(screen.getByTestId('target-provider-claude-code').hasAttribute('inert')).toBe(true)
    expect(screen.getByTestId('target-provider-local-llama').hasAttribute('inert')).toBe(false)
    const broken = screen.getByTestId('target-provider-broken')
    expect(broken.textContent).toContain('Endpoint unreachable')
    expect(screen.queryByTestId('routing-switch-hint-broken')).toBeNull()
    expect(within(broken).queryByRole('checkbox')).toBeNull()
  })
})
