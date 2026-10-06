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
import { CLAUDE, DEEPSEEK, LOCAL, mountSettings, response } from './settingsTestKit'

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
    expect(within(panel).getByLabelText('Projet')).toBeTruthy()
    expect(panel.textContent).toContain('Une conversation sans projet ne peut utiliser que Claude Code')
    expect(panel.textContent).toContain('Choisissez un projet')
    expect(consents).not.toHaveBeenCalled()
    await within(panel).findByRole('option', { name: 'Acme' })
  })

  it('?project= opens straight on that project; one line per external provider with its ORIGIN and state', async () => {
    mountSettings(<ProjectConsent />, { url: '/providers?project=acme#consent' })
    const ds = await screen.findByTestId('consent-deepseek')
    expect(ds.textContent).toContain('https://api.deepseek.com')
    expect(ds.textContent).toContain('Non autorisé')
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
    expect(ok.textContent).toContain('Autorisé')
    expect(ok.textContent).toContain('par alice')
    const stale = screen.getByTestId('consent-local-llama')
    expect(stale.getAttribute('data-state')).toBe('invalidated')
    expect(stale.textContent).toContain('Autorisation périmée')
    expect(stale.textContent).toContain('L’origine ou la référence de clé a changé')
    expect(stale.textContent).toContain('http://localhost:9999')
    expect(stale.textContent).toContain('http://localhost:8080')
    expect(within(stale).getByRole('button', { name: 'Autoriser Local llama' }).textContent).toBe('Autoriser à nouveau')
  })

  it('"Autoriser" says the content will go to that exact origin, then PUTs { origin } and re-reads', async () => {
    mountSettings(<ProjectConsent />, { url: '/providers?project=acme' })
    await screen.findByRole('option', { name: 'Acme' })
    const row = within(await screen.findByTestId('consent-deepseek'))
    fireEvent.click(row.getByRole('button', { name: 'Autoriser DeepSeek' }))
    const dialog = screen.getByRole('alertdialog')
    expect(dialog.textContent).toContain('Le contenu du projet Acme partira vers https://api.deepseek.com')
    expect(allow).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Autoriser https://api.deepseek.com' }))
    await waitFor(() => expect(allow).toHaveBeenCalledWith('acme', 'deepseek', 'https://api.deepseek.com'))
    await waitFor(() => expect(consents).toHaveBeenCalledTimes(2))
  })

  it('a local endpoint asks for consent too', async () => {
    mountSettings(<ProjectConsent />, { url: '/providers?project=acme' })
    fireEvent.click(within(await screen.findByTestId('consent-local-llama')).getByRole('button', { name: 'Autoriser Local llama' }))
    expect(screen.getByRole('alertdialog').textContent).toContain('partira vers http://localhost:8080')
  })

  it('"Retirer" confirms (danger) then DELETEs', async () => {
    consents.mockResolvedValue([
      { provider_id: 'deepseek', origin: 'https://api.deepseek.com', consented_by: 'alice', consented_at: '2026-10-01T10:00:00Z', valid: true },
    ])
    mountSettings(<ProjectConsent />, { url: '/providers?project=acme' })
    fireEvent.click(within(await screen.findByTestId('consent-deepseek')).getByRole('button', { name: 'Retirer l’autorisation de DeepSeek' }))
    const dialog = screen.getByRole('alertdialog')
    const confirm = within(dialog).getByRole('button', { name: 'Retirer l’autorisation' })
    expect(confirm.className).toContain('bg-red-600')
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
    const button = within(await screen.findByTestId('consent-deepseek')).getByRole('button', { name: 'Autoriser DeepSeek' })
    expect(button.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(button)
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(document.getElementById(button.getAttribute('aria-describedby')!)?.textContent).toContain('L’origine de ce provider est inconnue')
  })

  it('no provider registered: says so and offers to add one', () => {
    const onAdd = vi.fn()
    mountSettings(<ProjectConsent onAddProvider={onAdd} />, { url: '/providers?project=acme', list, providers: [CLAUDE] })
    expect(screen.getByText(/Aucun provider enregistré : ajoutez-en un/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un provider' }))
    expect(onAdd).toHaveBeenCalled()
  })

  it('a consent answer that is not JSON is shown as the named request', async () => {
    const { NonJsonResponseError } = await import('@/services/api')
    consents.mockRejectedValue(new NonJsonResponseError(502, 'GET', '/api/projects/acme/llm-consent', 'text/html'))
    mountSettings(<ProjectConsent />, { url: '/providers?project=acme' })
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Le serveur a répondu autre chose que du JSON : GET /api/projects/acme/llm-consent → 502 (text/html)',
    )
  })
})
