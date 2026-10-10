/**
 * Permission settings: Claude Code keeps its modes, rule lists and wire
 * strings; another provider gets neutral modes, no Claude rule presets, and a
 * refused `trust` when it has no sandbox.
 *
 * Run with: npx vitest run src/components/chat/PermissionSettingsPanel.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import {
  chatSessionCapabilitiesSnapshotAtom,
  chatSessionIdAtom,
  chatSessionProviderAtom,
  providersAtom,
  providersLoadStateAtom,
} from '@/atoms'
import { rulesUnsupportedText, trustRequiresSandboxText } from '@/constants/toolPolicy'

const api = vi.hoisted(() => ({
  getChatConfig: vi.fn(),
  getPermissionConfig: vi.fn(),
  updateChatConfig: vi.fn(),
  updatePermissionConfig: vi.fn(),
}))
vi.mock('@/services/chat', () => ({ chatApi: api }))
vi.mock('@/hooks', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }))

import { PermissionSettingsPanel } from './PermissionSettingsPanel'

type Store = ReturnType<typeof createStore>

async function mount(serverMode: string, prepare?: (store: Store) => void) {
  api.getChatConfig.mockResolvedValue({ mode: serverMode, allowed_tools: ['Read'], disallowed_tools: [], default_model: 'm' })
  api.updateChatConfig.mockImplementation(async (patch: Record<string, unknown>) => ({ default_model: 'm', ...patch }))
  const store = createStore()
  store.set(chatSessionIdAtom, 's1')
  prepare?.(store)
  render(
    <Provider store={store}>
      <PermissionSettingsPanel />
    </Provider>,
  )
  await waitFor(() => expect(screen.getByText('Permission Mode')).toBeTruthy())
  return store
}

const option = (label: string) => screen.getByRole('button', { name: new RegExp(`^${label}`) })

/** A Claude Code on another machine; `allow_trust` is the per-machine switch of its record. */
const remoteMachine = ({ allow_trust }: { allow_trust: boolean }) => (store: Store) => {
  store.set(providersLoadStateAtom, 'ready')
  store.set(providersAtom, {
    providers: [{ id: 'claude-code@lab', kind: 'claude_code_remote', label: 'Claude Code', health: { status: 'healthy' }, models: [], allow_trust }],
    default: { provider: 'claude-code@lab', routed_by: 'default' },
  } as never)
  store.set(chatSessionProviderAtom, { id: 'claude-code@lab', kind: 'claude_code_remote' })
  store.set(chatSessionCapabilitiesSnapshotAtom, { sandbox: 'none' })
}

const thirdParty = (capabilities: Record<string, unknown>) => (store: Store) => {
  store.set(providersLoadStateAtom, 'ready')
  store.set(chatSessionProviderAtom, { id: 'local-llama', kind: 'openai_compatible' })
  store.set(chatSessionCapabilitiesSnapshotAtom, capabilities)
}

describe('PermissionSettingsPanel — Claude Code', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows its four modes and both rule lists, as before', async () => {
    await mount('default')
    for (const label of ["Rock'n roll", 'Accept Edits', 'Default', 'Plan Only']) expect(option(label)).toBeTruthy()
    expect(option('Default').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('Allowed Tools')).toBeTruthy()
    expect(screen.getByText('Disallowed Tools')).toBeTruthy()
    expect(screen.getAllByText('+ Presets')).toHaveLength(2)
    expect(screen.queryByText(rulesUnsupportedText())).toBeNull()
    expect(option("Rock'n roll").getAttribute('aria-disabled')).toBeNull()
  })

  it('saves a picked mode as the legacy Claude string', async () => {
    await mount('default')
    fireEvent.click(option("Rock'n roll"))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.updateChatConfig).toHaveBeenCalled())
    expect(api.updateChatConfig).toHaveBeenCalledWith({ mode: 'bypassPermissions', allowed_tools: ['Read'], disallowed_tools: [] })
  })

  it('reads a CLI-only mode without crashing, and does not rewrite it when only a rule changes', async () => {
    await mount('auto')
    // `auto` is read as the closest neutral mode.
    expect(option('Accept Edits').getAttribute('aria-pressed')).toBe('true')
    fireEvent.change(screen.getAllByPlaceholderText('e.g. Bash(git *)')[0], { target: { value: 'Edit' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Add' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.updateChatConfig).toHaveBeenCalled())
    expect(api.updateChatConfig).toHaveBeenCalledWith({ mode: 'auto', allowed_tools: ['Read', 'Edit'], disallowed_tools: [] })
  })
})

describe('PermissionSettingsPanel — third-party provider', () => {
  beforeEach(() => vi.clearAllMocks())

  it('hides the Claude rule presets and lists when the provider has no rule scopes, and says why', async () => {
    await mount('default', thirdParty({ permission_scopes: [], sandbox: 'workspace' }))
    expect(screen.getByText(rulesUnsupportedText())).toBeTruthy()
    expect(screen.queryByText('Allowed Tools')).toBeNull()
    expect(screen.queryByText('Disallowed Tools')).toBeNull()
    expect(screen.queryByText('+ Presets')).toBeNull()
    expect(screen.queryByPlaceholderText('e.g. Bash(git *)')).toBeNull()
  })

  it('keeps the rule lists for a provider that applies them', async () => {
    await mount('default', thirdParty({ permission_scopes: ['session'], sandbox: 'workspace' }))
    expect(screen.getByText('Allowed Tools')).toBeTruthy()
    expect(screen.queryByText(rulesUnsupportedText())).toBeNull()
  })

  it('uses neutral labels and saves a picked mode as its neutral name, the hidden rules untouched', async () => {
    await mount('default', thirdParty({ permission_scopes: [], sandbox: 'workspace' }))
    expect(option('Ask').getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(option("Rock'n roll"))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.updateChatConfig).toHaveBeenCalled())
    expect(api.updateChatConfig).toHaveBeenCalledWith({ mode: 'trust', allowed_tools: ['Read'], disallowed_tools: [] })
  })

  it('offers Trust on a third-party provider with no sandbox, like on Claude Code', async () => {
    await mount('default', thirdParty({ permission_scopes: [], sandbox: 'none' }))
    const trust = option("Rock'n roll") as HTMLButtonElement
    expect(trust.getAttribute('aria-disabled')).toBeNull()
    fireEvent.click(trust)
    expect(trust.getAttribute('aria-pressed')).toBe('true')
  })

  it('refuses Trust only for a remote machine whose record does not allow it', async () => {
    await mount('default', remoteMachine({ allow_trust: false }))
    const trust = option("Rock'n roll") as HTMLButtonElement
    expect(trust.getAttribute('aria-disabled')).toBe('true')
    expect(trust.disabled).toBe(false)
    expect(document.getElementById(trust.getAttribute('aria-describedby') ?? '')?.textContent).toBe(trustRequiresSandboxText())
    fireEvent.click(trust)
    expect(trust.getAttribute('aria-pressed')).toBe('false')
    expect(option('Ask').getAttribute('aria-pressed')).toBe('true')
  })

  it('offers Trust on a remote machine that allows it', async () => {
    await mount('default', remoteMachine({ allow_trust: true }))
    expect(option("Rock'n roll").getAttribute('aria-disabled')).toBeNull()
  })
})
