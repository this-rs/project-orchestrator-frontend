/**
 * One card per typed provider failure: what it says, and the action it offers.
 *
 * Run with: npx vitest run src/components/chat/ProviderStateCard.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { MemoryRouter } from 'react-router-dom'
import type { ProviderErrorInfo } from '@/types/provider'

const status = vi.fn()
const list = vi.fn()
vi.mock('@/services/providers', () => ({
  providersApi: { status: (...a: unknown[]) => status(...a), list: (...a: unknown[]) => list(...a) },
}))

import { providersAtom, providersLoadStateAtom } from '@/atoms'
import { NO_PROVIDER_ERROR, RETRY_BY_SENDING_TEXT } from '@/constants/providerErrors'
import { ProviderStateCard } from './ProviderStateCard'

function mount(error: ProviderErrorInfo, props: Partial<Parameters<typeof ProviderStateCard>[0]> = {}) {
  const store = createStore()
  render(
    <Provider store={store}>
      <MemoryRouter>
        <ProviderStateCard error={error} {...props} />
      </MemoryRouter>
    </Provider>,
  )
  const card = screen.getByRole('alert')
  return { store, card, link: (name: RegExp | string) => within(card).getByRole('link', { name }) }
}

const err = (code: ProviderErrorInfo['code'], extra: Partial<ProviderErrorInfo> = {}): ProviderErrorInfo => ({
  code,
  message: '',
  ...extra,
})

beforeEach(() => {
  status.mockReset()
  list.mockReset()
})

describe('ProviderStateCard', () => {
  it('auth_required — never offers a plain Retry, even when the server says retryable', () => {
    const { card } = mount(err('auth_required', { provider_id: 'codex', retryable: true }), { onRetry: vi.fn() })
    expect(within(card).queryByRole('button', { name: /^retry$/i })).toBeNull()
  })

  it('no_provider — links to the provider settings', () => {
    const { card, link } = mount(NO_PROVIDER_ERROR)
    expect(card.getAttribute('data-error-code')).toBe('no_provider')
    expect(card.textContent).toContain('No provider available')
    expect(link(/provider settings/i).getAttribute('href')).toBe('/providers')
  })

  it('endpoint_not_allowed — names the project and the origin, links to the project consent', () => {
    const { card, link } = mount(err('endpoint_not_allowed', { project_slug: 'demo', origin: 'https://api.deepseek.com' }))
    expect(card.textContent).toContain('Project "demo"')
    expect(card.textContent).toContain('https://api.deepseek.com')
    expect(link(/consent/i).getAttribute('href')).toBe('/providers?project=demo#consent')
  })

  it('endpoint_not_allowed — falls back on the project the chat is about', () => {
    const { card, link } = mount(err('endpoint_not_allowed', { origin: 'http://localhost:8080' }), { projectSlug: 'alpha' })
    expect(card.textContent).toContain('Project "alpha"')
    expect(link(/consent/i).getAttribute('href')).toBe('/providers?project=alpha#consent')
  })

  it('auth_required — shows the command to run, copies it, and Re-check asks the status and reloads the list', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    status.mockResolvedValue({ status: 'healthy' })
    list.mockResolvedValue({ providers: [{ id: 'codex', kind: 'codex', label: 'Codex', health: { status: 'healthy' }, models: [] }] })
    const { card, store } = mount(err('auth_required', { provider_id: 'codex', login_hint: 'codex login', message: 'Codex is not signed in' }))

    const command = card.querySelector('code')
    expect(command?.textContent).toBe('codex login')
    expect(card.textContent).toContain('does not sign in for you')

    fireEvent.click(within(card).getByRole('button', { name: /copy the command/i }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('codex login'))

    fireEvent.click(within(card).getByRole('button', { name: /re-check/i }))
    await waitFor(() => expect(status).toHaveBeenCalledWith('codex'))
    await waitFor(() => expect(store.get(providersLoadStateAtom)).toBe('ready'))
    expect(store.get(providersAtom)?.providers[0].id).toBe('codex')
    expect((await within(card).findByRole('status')).textContent).toContain('Signed in')
    // Never a "Retry" that would pretend to sign in.
    expect(within(card).queryByRole('button', { name: /^retry$/i })).toBeNull()
  })

  it('auth_required — still signed out after a re-check is said, not hidden', async () => {
    status.mockResolvedValue({ status: 'auth_required', login_hint: 'codex login' })
    list.mockResolvedValue({ providers: [] })
    const { card } = mount(err('auth_required', { provider_id: 'codex', login_hint: 'codex login' }))
    fireEvent.click(within(card).getByRole('button', { name: /re-check/i }))
    expect((await within(card).findByRole('status')).textContent).toContain('Still not signed in')
  })

  it('credentials_locked — links to the vault and says there is no fallback', () => {
    const { card, link } = mount(err('credentials_locked'))
    expect(card.textContent).toContain('There is no fallback to another provider')
    expect(link(/vault/i).getAttribute('href')).toBe('/vault')
  })

  it('unauthorized — links to the instance in the settings', () => {
    const { link } = mount(err('unauthorized', { provider_id: 'deepseek' }))
    expect(link(/instance settings/i).getAttribute('href')).toBe('/providers?instance=deepseek')
  })

  it('endpoint_unreachable — shows the redacted detail and a working Retry', () => {
    const onRetry = vi.fn()
    const { card } = mount(err('endpoint_unreachable', { detail: 'connect ECONNREFUSED 127.0.0.1:8080' }), { onRetry })
    expect(card.querySelector('pre')?.textContent).toBe('connect ECONNREFUSED 127.0.0.1:8080')
    fireEvent.click(within(card).getByRole('button', { name: /retry/i }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('endpoint_unreachable — without a retry handler, says how to retry instead of a dead button', () => {
    const { card } = mount(err('endpoint_unreachable'))
    expect(within(card).queryByRole('button', { name: /retry/i })).toBeNull()
    expect(card.textContent).toContain(RETRY_BY_SENDING_TEXT)
  })

  it('model_no_tools — says to choose another model', () => {
    const { card } = mount(err('model_no_tools', { model: 'tiny-1b' }))
    expect(card.textContent).toContain('Model "tiny-1b" cannot call tools')
    expect(card.textContent).toContain('Choose another model')
  })

  it('context_too_small — gives needed and available tokens when known', () => {
    const { card } = mount(err('context_too_small', { needed: 48000, available: 8192 }))
    expect(card.textContent).toContain('48,000 tokens are needed, 8,192 are available')
  })

  it('context_too_small — without figures, still explains', () => {
    const { card } = mount(err('context_too_small'))
    expect(card.textContent).toContain('too small for this conversation')
    expect(card.textContent).not.toContain('undefined')
  })

  it('instance_not_found — cannot be resumed, offers a new conversation', () => {
    const onNewConversation = vi.fn()
    const { card } = mount(err('instance_not_found'), { onNewConversation })
    expect(card.textContent).toContain('has been deleted')
    fireEvent.click(within(card).getByRole('button', { name: /start a new conversation/i }))
    expect(onNewConversation).toHaveBeenCalledTimes(1)
    expect(within(card).queryByRole('button', { name: /retry/i })).toBeNull()
  })

  it('cli_not_found — names the missing program', () => {
    const { card } = mount(err('cli_not_found', { program: 'codex' }))
    expect(card.textContent).toContain('"codex" is not installed')
  })

  it('rate_limited — says how long to wait, Retry when retryable', () => {
    const onRetry = vi.fn()
    const { card } = mount(err('rate_limited', { retry_after_ms: 12_000, retryable: true }), { onRetry })
    expect(card.textContent).toContain('Try again in 12 s')
    fireEvent.click(within(card).getByRole('button', { name: /retry/i }))
    expect(onRetry).toHaveBeenCalled()
  })

  it('unsupported — names the capability', () => {
    const { card } = mount(err('unsupported', { capability: 'resume' }))
    expect(card.textContent).toContain('does not support "resume"')
  })

  it.each([
    ['overloaded', 'Provider overloaded'],
    ['timeout', 'The provider timed out'],
    ['process_exited', 'The provider process exited'],
    ['protocol', 'Unexpected answer from the provider'],
    ['turn_in_progress', 'A turn is already running'],
    ['invalid_request', 'Request refused'],
    ['closed', 'The session is closed'],
    ['provider_conflict', 'Provider conflict'],
  ] as const)('%s — a clean message, Retry only when the server says it is retryable', (code, title) => {
    const onRetry = vi.fn()
    const first = mount(err(code, { message: 'server sentence', retryable: true }), { onRetry })
    expect(first.card.textContent).toContain(title)
    expect(first.card.textContent).toContain('server sentence')
    fireEvent.click(within(first.card).getByRole('button', { name: /retry/i }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it.each(['overloaded', 'timeout', 'process_exited', 'protocol', 'turn_in_progress', 'invalid_request', 'closed', 'provider_conflict', 'provider_error', 'provider_unknown', 'provider_unavailable'] as const)(
    '%s — no Retry when not retryable',
    (code) => {
      const { card } = mount(err(code, { retryable: false }), { onRetry: vi.fn() })
      expect(within(card).queryByRole('button', { name: /retry/i })).toBeNull()
    },
  )

  it('Dismiss is offered only when a handler is given', () => {
    const onDismiss = vi.fn()
    const { card } = mount(err('timeout'), { onDismiss })
    fireEvent.click(within(card).getByRole('button', { name: 'Dismiss' }))
    expect(onDismiss).toHaveBeenCalled()
  })

  it('renders outside a router too (a transcript mounted alone): links degrade to anchors', () => {
    render(<ProviderStateCard error={err('credentials_locked')} />)
    expect(screen.getByRole('link', { name: /vault/i }).getAttribute('href')).toBe('/vault')
  })
})

describe('ProviderStateCard — every code the backend can send', () => {
  const codes = [
    'security_gate_closed',
    'origin_mismatch',
    'endpoint_invalid_url',
    'endpoint_scheme_not_allowed',
    'endpoint_http_outside_loopback',
    'endpoint_credentials_in_url',
    'endpoint_host_missing',
    'endpoint_private_address',
    'envelope_unbound_token',
    'envelope_parent_not_found',
    'envelope_depth_exceeded',
    'envelope_too_many_children',
    'envelope_cwd_outside_parent',
    'envelope_add_dir_outside_parent',
    'envelope_project_mismatch',
    'envelope_workspace_mismatch',
    'envelope_not_a_child',
    'tool_not_in_profile',
  ] as const

  it.each(codes)('%s — has its own title and a sentence that says what to do', (code) => {
    const { card } = mount(err(code))
    expect(card.getAttribute('data-error-code')).toBe(code)
    const [title, sentence] = Array.from(card.querySelectorAll('p')).map((p) => p.textContent ?? '')
    expect(title.length).toBeGreaterThan(8)
    expect(sentence.length).toBeGreaterThan(30)
    expect(title).not.toBe(code)
  })

  it('security_gate_closed — says authentication must be on', () => {
    const { card } = mount(err('security_gate_closed'))
    expect(card.textContent).toMatch(/authentication/i)
  })

  it('origin_mismatch — links to the project consent', () => {
    const { link } = mount(err('origin_mismatch', { project_slug: 'demo' }))
    expect(link(/consent/i).getAttribute('href')).toBe('/providers?project=demo#consent')
  })

  it.each(['endpoint_invalid_url', 'endpoint_private_address', 'endpoint_http_outside_loopback'] as const)('%s — links to the instance settings', (code) => {
    const { link } = mount(err(code, { provider_id: 'deepseek' }))
    expect(link(/instance settings/i).getAttribute('href')).toBe('/providers?instance=deepseek')
  })
})
