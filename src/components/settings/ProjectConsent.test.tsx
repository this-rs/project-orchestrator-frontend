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
  it('asks to choose a project first and states that no project means Claude Code only', () => {
    mountSettings(<ProjectConsent />)
    expect(screen.getByText(/without a project can only use Claude Code/)).toBeTruthy()
    expect(screen.getByText(/Choose a project to see/)).toBeTruthy()
    expect(consents).not.toHaveBeenCalled()
  })

  it('?project= opens straight on that project; external instances only, a local one included', async () => {
    mountSettings(<ProjectConsent />, { url: '/providers?project=acme#consent' })
    expect(await screen.findByTestId('consent-deepseek')).toBeTruthy()
    expect(screen.getByTestId('consent-local-llama').getAttribute('data-state')).toBe('denied')
    expect(screen.queryByTestId('consent-claude-code')).toBeNull()
    expect(consents).toHaveBeenCalledWith('acme')
  })

  it('shows who consented and when, and an invalidated consent when the origin changed', async () => {
    consents.mockResolvedValue([
      { provider_id: 'deepseek', origin: 'https://api.deepseek.com', consented_by: 'alice', consented_at: '2026-10-01T10:00:00Z', valid: true },
      { provider_id: 'local-llama', origin: 'http://localhost:9999', consented_by: 'bob', consented_at: '2026-10-01T10:00:00Z', valid: false },
    ])
    mountSettings(<ProjectConsent />, { url: '/providers?project=acme' })
    const ok = await screen.findByTestId('consent-deepseek')
    expect(ok.getAttribute('data-state')).toBe('allowed')
    expect(ok.textContent).toContain('By alice')
    const stale = screen.getByTestId('consent-local-llama')
    expect(stale.getAttribute('data-state')).toBe('invalidated')
    expect(stale.textContent).toContain('http://localhost:9999')
    expect(stale.textContent).toContain('http://localhost:8080')
  })

  it('Allow names the exact origin, then PUTs { origin } and re-reads', async () => {
    mountSettings(<ProjectConsent />, { url: '/providers?project=acme' })
    const row = within(await screen.findByTestId('consent-deepseek'))
    fireEvent.click(row.getByRole('button', { name: 'Allow…' }))
    const dialog = screen.getByRole('alertdialog')
    expect(dialog.textContent).toContain('Content of project Acme will be sent to https://api.deepseek.com')
    expect(allow).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Allow https://api.deepseek.com' }))
    await waitFor(() => expect(allow).toHaveBeenCalledWith('acme', 'deepseek', 'https://api.deepseek.com'))
    await waitFor(() => expect(consents).toHaveBeenCalledTimes(2))
  })

  it('a local endpoint asks for consent too', async () => {
    mountSettings(<ProjectConsent />, { url: '/providers?project=acme' })
    fireEvent.click(within(await screen.findByTestId('consent-local-llama')).getByRole('button', { name: 'Allow…' }))
    expect(screen.getByRole('alertdialog').textContent).toContain('sent to http://localhost:8080')
  })

  it('Revoke confirms then DELETEs', async () => {
    consents.mockResolvedValue([
      { provider_id: 'deepseek', origin: 'https://api.deepseek.com', consented_by: 'alice', consented_at: '2026-10-01T10:00:00Z', valid: true },
    ])
    mountSettings(<ProjectConsent />, { url: '/providers?project=acme' })
    fireEvent.click(within(await screen.findByTestId('consent-deepseek')).getByRole('button', { name: 'Revoke' }))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Revoke' }))
    await waitFor(() => expect(revoke).toHaveBeenCalledWith('acme', 'deepseek'))
  })

  it('an instance with no known endpoint cannot be allowed, and says why', async () => {
    mountSettings(<ProjectConsent />, {
      url: '/providers?project=acme',
      list,
      providers: [CLAUDE, { ...DEEPSEEK, origin: null, base_url: null }],
    })
    const button = within(await screen.findByTestId('consent-deepseek')).getByRole('button', { name: 'Allow…' })
    expect(button.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(button)
    expect(screen.queryByRole('alertdialog')).toBeNull()
    const help = document.getElementById(button.getAttribute('aria-describedby')!)
    expect(help?.textContent).toContain('endpoint of this instance is unknown')
  })
})
