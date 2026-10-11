/**
 * The refused openings of backend #722 (M1, "Claude Code becomes optional"), as the
 * card shows them: `provider_not_chosen` with its `candidates`, the three kinds of
 * `endpoint_not_allowed` (`consent_scope` project / no_project / none), and the
 * instance the server NAMED in `provider_id`.
 *
 * Run with: npx vitest run src/components/chat/ProviderStateCard.claudeOptional.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { MemoryRouter } from 'react-router-dom'
import { readProviderError, type ProviderErrorInfo, type ProvidersResponse } from '@/types/provider'

const allowForProject = vi.fn()
const allowOutsideProjects = vi.fn()
const list = vi.fn()
vi.mock('@/services/providers', () => ({
  providersApi: {
    status: vi.fn(),
    list: (...a: unknown[]) => list(...a),
    allowForProject: (...a: unknown[]) => allowForProject(...a),
    allowOutsideProjects: (...a: unknown[]) => allowOutsideProjects(...a),
  },
}))

import { authModeAtom, authModeConfirmedAtom, currentUserAtom, providersAtom, providersLoadStateAtom } from '@/atoms'
import type { AuthUser } from '@/types'
import { ProviderStateCard } from './ProviderStateCard'
import { SessionOpenError } from './SessionOpenError'
import { RoutedByBadge } from './ProviderBadge'
import { SettingsErrorCard } from '@/components/settings/SettingsErrorCard'

const PROVIDERS: ProvidersResponse = {
  providers: [
    { id: 'claude-code', kind: 'claude_code', label: 'Claude Code', builtin: true, health: { status: 'unhealthy' }, models: [] },
    { id: 'deepseek', kind: 'openai_compatible', label: 'DeepSeek', origin: 'https://api.deepseek.com', health: { status: 'healthy' }, models: [] },
    { id: 'local-llama', kind: 'openai_compatible', label: 'Local llama', origin: 'http://localhost:8080', health: { status: 'healthy' }, models: [] },
  ],
  default: null,
}

const user = (is_root: boolean) => ({ id: 'u1', email: 'a@b.c', name: 'A', is_root }) as unknown as AuthUser

function mount(error: ProviderErrorInfo, props: Partial<Parameters<typeof ProviderStateCard>[0]> = {}, { root = false } = {}) {
  const store = createStore()
  store.set(providersAtom, PROVIDERS)
  store.set(providersLoadStateAtom, 'ready')
  store.set(authModeAtom, 'required')
  store.set(authModeConfirmedAtom, true)
  store.set(currentUserAtom, user(root))
  render(
    <Provider store={store}>
      <MemoryRouter>
        <ProviderStateCard error={error} {...props} />
      </MemoryRouter>
    </Provider>,
  )
  return { store, card: screen.getByRole('alert') }
}

/** A body as the server sends it (`OpenFailure::to_json`), read the way the app reads it. */
const fromBody = (status: number, body: Record<string, unknown>) => readProviderError(body, status)!

beforeEach(() => {
  allowForProject.mockReset().mockResolvedValue({})
  allowOutsideProjects.mockReset().mockResolvedValue({})
  list.mockReset().mockResolvedValue(PROVIDERS)
})

describe('provider_not_chosen (409, candidates)', () => {
  const body = {
    error: 'several providers can answer here: name one, or set the pilot role',
    code: 'provider_not_chosen',
    retryable: false,
    candidates: ['deepseek', 'local-llama'],
  }

  it('offers each candidate by its name, and a pick sends the message on that instance', () => {
    const onPickProvider = vi.fn()
    const { card } = mount(fromBody(409, body), { onPickProvider })
    expect(card.getAttribute('data-error-code')).toBe('provider_not_chosen')
    expect(card.textContent).toContain('Choose a provider')
    const group = within(card).getByRole('group', { name: 'Send this message to:' })
    const offered = within(group).getAllByTestId('provider-candidate')
    expect(offered.map((b) => b.textContent)).toEqual(['Use DeepSeek', 'Use Local llama'])
    fireEvent.click(within(card).getByRole('button', { name: 'Use Local llama' }))
    expect(onPickProvider).toHaveBeenCalledWith('local-llama')
    // Never a retry on the same refusal, never Claude Code offered.
    expect(within(card).queryByRole('button', { name: /^retry$/i })).toBeNull()
    expect(card.textContent).not.toContain('Use Claude Code')
  })

  it('root: links to the pilot role setting', () => {
    const { card } = mount(fromBody(409, body), { onPickProvider: vi.fn() }, { root: true })
    expect(within(card).getByRole('link', { name: 'Set the default provider' }).getAttribute('href')).toBe('/providers#roles')
    expect(within(card).queryByTestId('pilot-ask-admin')).toBeNull()
  })

  it('anyone else: no pilot setting (PUT /chat/roles is root-only), "ask the administrator" instead', () => {
    const { card } = mount(fromBody(409, body), { onPickProvider: vi.fn() })
    expect(within(card).queryByRole('link', { name: 'Set the default provider' })).toBeNull()
    expect(within(card).getByTestId('pilot-ask-admin').textContent).toMatch(/only the administrator/i)
  })

  it('reaches the opening card from the ChatPanel through SessionOpenError', () => {
    const onPickProvider = vi.fn()
    const store = createStore()
    store.set(providersAtom, PROVIDERS)
    render(
      <Provider store={store}>
        <MemoryRouter>
          <SessionOpenError
            error={{ info: fromBody(409, body), message: '', text: 'hello', attachments: [] }}
            onDismiss={vi.fn()}
            onPickProvider={onPickProvider}
          />
        </MemoryRouter>
      </Provider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Use DeepSeek' }))
    expect(onPickProvider).toHaveBeenCalledWith('deepseek')
  })
})

describe('endpoint_not_allowed (403) by consent_scope', () => {
  const refused = (consent_scope?: string) =>
    fromBody(403, {
      error: 'no consent holds for this endpoint here',
      code: 'endpoint_not_allowed',
      provider_id: 'deepseek',
      retryable: false,
      ...(consent_scope ? { consent_scope } : {}),
    })

  it('project: allows the origin for the project (PUT /projects/{slug}/llm-consents/{id}), then sends again', async () => {
    const onRetry = vi.fn()
    const { card } = mount(refused('project'), { projectSlug: 'demo', onRetry })
    const allow = within(card).getByTestId('consent-allow')
    expect(allow.getAttribute('data-consent-scope')).toBe('project')
    expect(allow.textContent).toContain('https://api.deepseek.com')
    expect(allow.textContent).toContain('demo')
    fireEvent.click(allow)
    await waitFor(() => expect(onRetry).toHaveBeenCalledTimes(1))
    expect(allowForProject).toHaveBeenCalledWith('demo', 'deepseek', 'https://api.deepseek.com')
    expect(allowOutsideProjects).not.toHaveBeenCalled()
    // The settings link of the existing flow stays.
    expect(within(card).getByRole('link', { name: /consent/i }).getAttribute('href')).toBe('/providers?project=demo#consent')
  })

  it('no_project, root: allows it for the chats outside any project (PUT /chat/llm-consents/{id})', async () => {
    const onRetry = vi.fn()
    const { card } = mount(refused('no_project'), { onRetry }, { root: true })
    expect(card.textContent).toContain('Endpoint not allowed outside a project')
    const allow = within(card).getByTestId('consent-allow')
    expect(allow.getAttribute('data-consent-scope')).toBe('no_project')
    fireEvent.click(allow)
    await waitFor(() => expect(onRetry).toHaveBeenCalledTimes(1))
    expect(allowOutsideProjects).toHaveBeenCalledWith('deepseek', 'https://api.deepseek.com')
    expect(allowForProject).not.toHaveBeenCalled()
  })

  it('no_project, not root: no consent button (the server answers 403 root_required), "ask the administrator"', () => {
    const { card } = mount(refused('no_project'), { onRetry: vi.fn() })
    expect(within(card).queryByTestId('consent-allow')).toBeNull()
    expect(within(card).getByTestId('consent-ask-admin').textContent).toMatch(/only the administrator/i)
  })

  it('no_project, root refused anyway (403): says to ask the administrator, sends nothing', async () => {
    const { ApiError } = await import('@/services/api')
    allowOutsideProjects.mockRejectedValue(new ApiError(403, JSON.stringify({ error: 'root_required: root account only' })))
    const onRetry = vi.fn()
    const { card } = mount(refused('no_project'), { onRetry }, { root: true })
    fireEvent.click(within(card).getByTestId('consent-allow'))
    await waitFor(() => expect(card.textContent).toMatch(/only the administrator/i))
    expect(onRetry).not.toHaveBeenCalled()
  })

  it('no_project, root, a 403 that is not root_required (an agent token): the failure is said, not "ask the administrator"', async () => {
    const { ApiError } = await import('@/services/api')
    allowOutsideProjects.mockRejectedValue(new ApiError(403, JSON.stringify({ error: 'provider settings can only be changed by a signed-in user' })))
    const { card } = mount(refused('no_project'), { onRetry: vi.fn() }, { root: true })
    fireEvent.click(within(card).getByTestId('consent-allow'))
    await waitFor(() => expect(card.textContent).toContain('The consent could not be recorded'))
    expect(card.textContent).not.toMatch(/only the administrator/i)
  })

  it('on a past error of the transcript (no way to send again): no consent button, the settings link stays', () => {
    const { card } = mount(refused('project'), { projectSlug: 'demo' })
    expect(within(card).queryByTestId('consent-allow')).toBeNull()
    expect(within(card).getByRole('link', { name: /consent/i }).getAttribute('href')).toBe('/providers?project=demo#consent')
  })

  it('no_project on a past error, root: no consent button either', () => {
    const { card } = mount(refused('no_project'), {}, { root: true })
    expect(within(card).queryByTestId('consent-allow')).toBeNull()
  })

  it('onConsented is what runs after a consent, when given', async () => {
    const onRetry = vi.fn()
    const onConsented = vi.fn()
    const { card } = mount(refused('project'), { projectSlug: 'demo', onRetry, onConsented })
    fireEvent.click(within(card).getByTestId('consent-allow'))
    await waitFor(() => expect(onConsented).toHaveBeenCalledTimes(1))
    expect(onRetry).not.toHaveBeenCalled()
  })

  it('no consent_scope: an endpoint-guard refusal, no consent button and no consent link', () => {
    const { card } = mount(refused(), { projectSlug: 'demo', onRetry: vi.fn() }, { root: true })
    expect(card.textContent).toContain('Endpoint refused')
    expect(within(card).queryByTestId('consent-allow')).toBeNull()
    expect(within(card).queryByRole('link', { name: /consent/i })).toBeNull()
    expect(within(card).getByRole('link', { name: 'Open the instance settings' }).getAttribute('href')).toBe(
      '/providers?instance=deepseek',
    )
  })
})

describe('the opening card names the instance the server named (provider_id)', () => {
  it('a locked vault of DeepSeek is said as DeepSeek, never as Claude Code', () => {
    const info = fromBody(423, { error: 'the vault is locked', code: 'credentials_locked', provider_id: 'deepseek', retryable: false })
    const store = createStore()
    store.set(providersAtom, PROVIDERS)
    render(
      <Provider store={store}>
        <MemoryRouter>
          <SessionOpenError error={{ info, message: '', text: 'hello', attachments: [] }} onDismiss={vi.fn()} />
        </MemoryRouter>
      </Provider>,
    )
    const card = screen.getByTestId('session-open-error')
    expect(within(card).getByTestId('provider-error-provider').textContent).toBe('Provider: DeepSeek')
    expect(card.textContent).not.toContain('Claude Code')
  })

  it('an instance the list does not know is named by its id', () => {
    const { card } = mount(fromBody(424, { error: 'not installed', code: 'cli_not_found', provider_id: 'opencode', retryable: false }))
    expect(within(card).getByTestId('provider-error-provider').textContent).toBe('Provider: opencode')
  })
})

describe('routed_by sole_instance', () => {
  it('is labelled on the session badge', () => {
    render(<RoutedByBadge routedBy="sole_instance" />)
    expect(screen.getByTestId('routed-by-badge').textContent).toBe('Only allowed instance')
  })
})

describe('the title says which refusal it is, outside the chat card too', () => {
  const guard: ProviderErrorInfo = { code: 'endpoint_not_allowed', message: '' }
  it('SettingsErrorCard: an endpoint-guard refusal is not titled as a project consent', () => {
    render(<SettingsErrorCard error={guard} />)
    expect(screen.getByRole('alert').textContent).toContain('Endpoint refused')
    expect(screen.getByRole('alert').textContent).not.toContain('for this project')
  })
  it('SettingsErrorCard: the no-project consent has its own title', () => {
    render(<SettingsErrorCard error={{ ...guard, consent_scope: 'no_project' }} />)
    expect(screen.getByRole('alert').textContent).toContain('Endpoint not allowed outside a project')
  })
})
