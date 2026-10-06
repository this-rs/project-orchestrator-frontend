// Shared fixtures of the settings tests (not a test file itself).
import type { ReactElement } from 'react'
import { render } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { MemoryRouter } from 'react-router-dom'
import { providersAtom, providersLoadStateAtom } from '@/atoms'
import type { ProviderInstance, ProvidersResponse } from '@/types/provider'

export const CLAUDE: ProviderInstance = {
  id: 'claude-code',
  kind: 'claude_code',
  label: 'Claude Code',
  builtin: true,
  health: { status: 'healthy', version: '2.1.0', checked_at: '2026-10-01T10:00:00Z' },
  models: [],
}

export const DEEPSEEK: ProviderInstance = {
  id: 'deepseek',
  kind: 'openai_compatible',
  label: 'DeepSeek',
  preset: 'deepseek',
  origin: 'https://api.deepseek.com',
  base_url: 'https://api.deepseek.com',
  credential_ref: 'vault:deepseek-key',
  cost_source: 'priced',
  default_model: 'deepseek-chat',
  health: { status: 'healthy', version: null, checked_at: '2026-10-01T10:00:00Z' },
  models: [{ id: 'deepseek-chat' }, { id: 'deepseek-reasoner' }],
}

export const LOCAL: ProviderInstance = {
  id: 'local-llama',
  kind: 'openai_compatible',
  label: 'Local llama',
  preset: 'llama_server',
  origin: 'http://localhost:8080',
  base_url: 'http://localhost:8080/v1',
  credential_ref: 'none',
  cost_source: 'free',
  health: { status: 'healthy' },
  models: [{ id: 'qwen3' }],
}

/** A Claude Code on another machine. Its label says "Claude Code" on purpose: the id is what tells it apart. */
export const REMOTE: ProviderInstance = {
  id: 'claude-code@lab',
  kind: 'claude_code_remote',
  label: 'Claude Code',
  origin: 'ssh:me@lab.example.com:2222',
  credential_ref: 'vault:lab-ssh-key',
  cost_source: 'subscription',
  host: 'lab.example.com',
  ssh_user: 'me',
  ssh_port: 2222,
  remote_cwd: '/srv/work',
  allow_trust: false,
  host_key_fingerprint: 'SHA256:abc123fingerprintOfTheMachine',
  health: { status: 'healthy', version: '2.1.0', checked_at: '2026-10-01T10:00:00Z' },
  models: [],
}

export function response(providers: ProviderInstance[], extra: Partial<ProvidersResponse> = {}): ProvidersResponse {
  return { providers, default: { provider: 'claude-code', model: null, routed_by: 'default' }, ...extra }
}

/** Mount inside a store (with the list already loaded) and a router at `url`. */
export function mountSettings(
  ui: ReactElement,
  opts: {
    providers?: ProviderInstance[]
    url?: string
    state?: 'ready' | 'unsupported'
    /** The mocked `providersApi.list`: the mount's own re-fetch must answer with the same instances. */
    list?: { mockResolvedValue: (v: ProvidersResponse) => unknown }
  } = {},
) {
  if (opts.list && opts.state !== 'unsupported') opts.list.mockResolvedValue(response(opts.providers ?? [CLAUDE, DEEPSEEK, LOCAL]))
  const store = createStore()
  if (opts.state === 'unsupported') {
    store.set(providersAtom, null)
    store.set(providersLoadStateAtom, 'unsupported')
  } else {
    store.set(providersAtom, response(opts.providers ?? [CLAUDE, DEEPSEEK, LOCAL]))
    store.set(providersLoadStateAtom, 'ready')
  }
  const utils = render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[opts.url ?? '/providers']}>{ui}</MemoryRouter>
    </Provider>,
  )
  return { store, ...utils }
}
