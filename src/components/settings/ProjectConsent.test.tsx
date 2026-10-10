/**
 * Per-project consent: state, who/when, an Allow that names the exact origin.
 *
 * Run with: npx vitest run src/components/settings/ProjectConsent.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'

const consents = vi.fn()
const allow = vi.fn()
const revoke = vi.fn()
const list = vi.fn()
vi.mock('@/services/providers', async (orig) => ({
  ...(await orig<typeof import('@/services/providers')>()),
  providersApi: {
    consents: (...a: unknown[]) => consents(...a),
    allow: (...a: unknown[]) => allow(...a),
    revoke: (...a: unknown[]) => revoke(...a),
    list: (...a: unknown[]) => list(...a),
    status: vi.fn(),
  },
}))
vi.mock('@/services/projects', () => ({
  projectsApi: { list: vi.fn().mockResolvedValue({ items: [{ slug: 'acme', name: 'Acme' }, { slug: 'other', name: 'Other' }] }) },
}))

import { ProjectConsent } from './ProjectConsent'
import { CLAUDE, DEEPSEEK, LOCAL, REMOTE, mountSettings, response } from './settingsTestKit'

beforeEach(() => {
  consents.mockReset().mockResolvedValue([])
  allow.mockReset().mockResolvedValue({})
  revoke.mockReset().mockResolvedValue(undefined)
  list.mockReset().mockResolvedValue(response([CLAUDE, DEEPSEEK, LOCAL]))
})

describe('ProjectConsent', () => {
  it('the project picker heads the panel; without a project, it says to choose one and that no project means Claude Code only', async () => {
    mountSettings(<ProjectConsent />)
    const panel = screen.getByTestId('consent-panel')
    expect(within(panel).getByLabelText('Project')).toBeTruthy()
    expect(panel.textContent).toContain('A conversation without a project can only use Claude Code')
    expect(panel.textContent).toContain('Choose a project')
    expect(consents).not.toHaveBeenCalled()
    await within(panel).findByRole('option', { name: 'Acme' })
  })

  it('?project= opens straight on that project; one line per external provider with its ORIGIN and state', async () => {
    mountSettings(<ProjectConsent />, { url: '/providers?project=acme#consent' })
    const ds = await screen.findByTestId('consent-deepseek')
    expect(ds.textContent).toContain('https://api.deepseek.com')
    expect(ds.textContent).toContain('Not allowed')
    expect(screen.getByTestId('consent-local-llama').getAttribute('data-state')).toBe('denied')
    expect(screen.getByTestId('consent-local-llama').textContent).toContain('http://localhost:8080')
    expect(screen.queryByTestId('consent-claude-code')).toBeNull()
    expect(consents).toHaveBeenCalledWith('acme')
  })

  it('shows who allowed and when, and an out-of-date consent when the origin or key reference changed', async () => {
    consents.mockResolvedValue([
      { provider_id: 'deepseek', origin: 'https://api.deepseek.com', consented_by: 'alice', consented_at: '2026-10-01T10:00:00Z', valid: true },
      { provider_id: 'local-llama', origin: 'http://localhost:9999', consented_by: 'bob', consented_at: '2026-10-01T10:00:00Z', valid: false },
    ])
    mountSettings(<ProjectConsent />, { url: '/providers?project=acme' })
    const ok = await screen.findByTestId('consent-deepseek')
    expect(ok.getAttribute('data-state')).toBe('allowed')
    expect(ok.textContent).toContain('Allowed')
    expect(ok.textContent).toContain('by alice')
    const stale = screen.getByTestId('consent-local-llama')
    expect(stale.getAttribute('data-state')).toBe('invalidated')
    expect(stale.textContent).toContain('Consent out of date')
    expect(stale.textContent).toContain('The origin or the key reference changed')
    expect(stale.textContent).toContain('http://localhost:9999')
    expect(stale.textContent).toContain('http://localhost:8080')
    expect(within(stale).getByRole('button', { name: 'Allow Local llama' }).textContent).toBe('Allow again')
  })

  it('"Allow" says the content will go to that exact origin, then PUTs { origin } and re-reads', async () => {
    mountSettings(<ProjectConsent />, { url: '/providers?project=acme' })
    await screen.findByRole('option', { name: 'Acme' })
    const row = within(await screen.findByTestId('consent-deepseek'))
    fireEvent.click(row.getByRole('button', { name: 'Allow DeepSeek' }))
    const dialog = screen.getByRole('alertdialog')
    expect(dialog.textContent).toContain('The content of project Acme will be sent to https://api.deepseek.com')
    expect(allow).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Allow https://api.deepseek.com' }))
    await waitFor(() => expect(allow).toHaveBeenCalledWith('acme', 'deepseek', 'https://api.deepseek.com'))
    await waitFor(() => expect(consents).toHaveBeenCalledTimes(2))
  })

  it('a local endpoint asks for consent too', async () => {
    mountSettings(<ProjectConsent />, { url: '/providers?project=acme' })
    fireEvent.click(within(await screen.findByTestId('consent-local-llama')).getByRole('button', { name: 'Allow Local llama' }))
    expect(screen.getByRole('alertdialog').textContent).toContain('will be sent to http://localhost:8080')
  })

  it('"Withdraw" confirms (danger) then DELETEs', async () => {
    consents.mockResolvedValue([
      { provider_id: 'deepseek', origin: 'https://api.deepseek.com', consented_by: 'alice', consented_at: '2026-10-01T10:00:00Z', valid: true },
    ])
    mountSettings(<ProjectConsent />, { url: '/providers?project=acme' })
    fireEvent.click(within(await screen.findByTestId('consent-deepseek')).getByRole('button', { name: 'Withdraw the permission of DeepSeek' }))
    const dialog = screen.getByRole('alertdialog')
    const confirm = within(dialog).getByRole('button', { name: 'Withdraw the permission' })
    expect(confirm.className).toContain('btn-danger')
    expect(revoke).not.toHaveBeenCalled()
    fireEvent.click(confirm)
    await waitFor(() => expect(revoke).toHaveBeenCalledWith('acme', 'deepseek'))
  })

  it('a provider with no known origin cannot be allowed, and says why', async () => {
    mountSettings(<ProjectConsent />, {
      url: '/providers?project=acme',
      list,
      providers: [CLAUDE, { ...DEEPSEEK, origin: null, base_url: null }],
    })
    const button = within(await screen.findByTestId('consent-deepseek')).getByRole('button', { name: 'Allow DeepSeek' })
    expect(button.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(button)
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(document.getElementById(button.getAttribute('aria-describedby')!)?.textContent).toContain('This provider’s origin is unknown')
  })

  it('no provider registered: says so and offers to add one', () => {
    const onAdd = vi.fn()
    mountSettings(<ProjectConsent onAddProvider={onAdd} />, { url: '/providers?project=acme', list, providers: [CLAUDE] })
    expect(screen.getByText(/No provider registered: add one/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Add a provider' }))
    expect(onAdd).toHaveBeenCalled()
  })

  it('a consent answer that is not JSON is shown as the named request', async () => {
    const { NonJsonResponseError } = await import('@/services/api')
    consents.mockRejectedValue(new NonJsonResponseError(502, 'GET', '/api/projects/acme/llm-consent', 'text/html'))
    mountSettings(<ProjectConsent />, { url: '/providers?project=acme' })
    expect((await screen.findByRole('alert')).textContent).toBe(
      'The server answered something other than JSON: GET /api/projects/acme/llm-consent → 502 (text/html)',
    )
  })
})

describe('ProjectConsent — Claude Code distant (SSH)', () => {
  it('names the machine by its id and shows its ssh origin; Allow names that exact origin', async () => {
    list.mockResolvedValue(response([CLAUDE, REMOTE]))
    mountSettings(<ProjectConsent />, { list, providers: [CLAUDE, REMOTE], url: '/providers?project=acme' })
    const row = await screen.findByTestId('consent-claude-code@lab')
    expect(row.textContent).toContain('claude-code@lab')
    expect(row.textContent).toContain('ssh:me@lab.example.com:2222')
    fireEvent.click(within(row).getByRole('button', { name: 'Allow claude-code@lab' }))
    const dialog = screen.getByRole('alertdialog')
    expect(dialog.textContent).toContain('will be sent to ssh:me@lab.example.com:2222')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Allow ssh:me@lab.example.com:2222' }))
    await waitFor(() => expect(allow).toHaveBeenCalledWith('acme', 'claude-code@lab', 'ssh:me@lab.example.com:2222'))
  })

  it('a consent given for another host is out of date once host/port/user changed', async () => {
    consents.mockResolvedValue([
      { provider_id: 'claude-code@lab', origin: 'ssh:me@old.example.com:22', consented_by: 'alice', consented_at: '2026-10-01T10:00:00Z', valid: false },
    ])
    list.mockResolvedValue(response([CLAUDE, REMOTE]))
    mountSettings(<ProjectConsent />, { list, providers: [CLAUDE, REMOTE], url: '/providers?project=acme' })
    const row = await screen.findByTestId('consent-claude-code@lab')
    expect(row.getAttribute('data-state')).toBe('invalidated')
    expect(row.textContent).toContain('ssh:me@old.example.com:22')
    expect(row.textContent).toContain('ssh:me@lab.example.com:2222')
  })
})
