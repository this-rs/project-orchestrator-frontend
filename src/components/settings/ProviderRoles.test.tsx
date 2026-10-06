/**
 * Pilot / executor roles, global or for one project, and the effective default.
 *
 * Run with: npx vitest run src/components/settings/ProviderRoles.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'

const roles = vi.fn()
const setRoles = vi.fn()
const projectRoles = vi.fn()
const setProjectRoles = vi.fn()
const list = vi.fn()
vi.mock('@/services/providers', async (orig) => ({
  ...(await orig<typeof import('@/services/providers')>()),
  providersApi: {
    roles: (...a: unknown[]) => roles(...a),
    setRoles: (...a: unknown[]) => setRoles(...a),
    projectRoles: (...a: unknown[]) => projectRoles(...a),
    setProjectRoles: (...a: unknown[]) => setProjectRoles(...a),
    list: (...a: unknown[]) => list(...a),
    status: vi.fn(),
  },
}))
vi.mock('@/services/projects', () => ({
  projectsApi: { list: vi.fn().mockResolvedValue({ items: [{ slug: 'acme', name: 'Acme' }] }) },
}))

import { chatEffectiveProviderIdAtom, providersAtom } from '@/atoms'
import { ProviderRoles } from './ProviderRoles'
import { CLAUDE, DEEPSEEK, LOCAL, mountSettings, response } from './settingsTestKit'

const select = (name: RegExp | string) => screen.getByLabelText(name) as HTMLSelectElement

beforeEach(() => {
  roles.mockReset().mockResolvedValue({})
  setRoles.mockReset().mockResolvedValue({})
  projectRoles.mockReset().mockResolvedValue({})
  setProjectRoles.mockReset().mockResolvedValue({})
  list.mockReset().mockResolvedValue(response([CLAUDE, DEEPSEEK, LOCAL]))
})

describe('ProviderRoles', () => {
  it('explains pilot, executor and inheritance in one sentence; an unset global role reads as the server default', async () => {
    mountSettings(<ProviderRoles />)
    await screen.findByTestId('effective-default')
    const panel = screen.getByTestId('roles-global')
    expect(panel.textContent).toContain('le modèle qui décide et planifie')
    expect(panel.textContent).toContain('celui qui exécute les tâches')
    expect(panel.textContent).toContain('Un rôle vide hérite du rôle global, puis du provider par défaut du serveur')
    expect(screen.getAllByText('Non réglé : le provider par défaut du serveur.').length).toBe(2)
    expect(panel.textContent).not.toMatch(/routed_by|global_rule/)
  })

  it('shows the effective default and, in French, which rule chose it', async () => {
    list.mockResolvedValue(response([CLAUDE, DEEPSEEK], { default: { provider: 'deepseek', model: 'deepseek-chat', routed_by: 'global_rule' } }))
    mountSettings(<ProviderRoles />)
    const eff = await screen.findByTestId('effective-default')
    await waitFor(() => expect(eff.textContent).toContain('DeepSeek · deepseek-chat'))
    expect(eff.textContent).toContain('choisi par le rôle global')
  })

  it('PUTs the global roles, and the new default is what a new conversation preselects after re-fetch', async () => {
    let saved = false
    list.mockImplementation(async () =>
      saved
        ? response([CLAUDE, DEEPSEEK], { default: { provider: 'deepseek', model: 'deepseek-chat', routed_by: 'global_rule' } })
        : response([CLAUDE, DEEPSEEK]),
    )
    setRoles.mockImplementation(async () => {
      saved = true
      return {}
    })
    const { store } = mountSettings(<ProviderRoles />, { providers: [CLAUDE, DEEPSEEK] })
    expect(store.get(chatEffectiveProviderIdAtom)).toBe('claude-code')
    const panel = await screen.findByTestId('roles-global')
    await within(panel).findByLabelText('Pilote')
    fireEvent.change(select('Pilote'), { target: { value: 'm|deepseek|deepseek-chat' } })
    fireEvent.click(within(panel).getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(setRoles).toHaveBeenCalledWith({ pilot: { provider: 'deepseek', model: 'deepseek-chat' } }))
    await waitFor(() => expect(store.get(providersAtom)?.default?.provider).toBe('deepseek'))
    expect(store.get(chatEffectiveProviderIdAtom)).toBe('deepseek')
    expect(await within(panel).findByText('Rôles enregistrés.')).toBeTruthy()
  })

  it('an alias target is sent as { provider, alias }', async () => {
    list.mockResolvedValue(response([CLAUDE, DEEPSEEK], { aliases: [{ alias: 'deep', provider: 'deepseek', model: 'deepseek-reasoner' }] }))
    mountSettings(<ProviderRoles />, { providers: [CLAUDE, DEEPSEEK] })
    const panel = await screen.findByTestId('roles-global')
    await screen.findAllByRole('option', { name: 'DeepSeek · alias deep' })
    fireEvent.change(select('Exécutant'), { target: { value: 'a|deepseek|deep' } })
    fireEvent.click(within(panel).getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(setRoles).toHaveBeenCalledWith({ executor: { provider: 'deepseek', alias: 'deep' } }))
  })

  it('"Annuler" puts back the saved roles and is disabled while nothing changed', async () => {
    roles.mockResolvedValue({ pilot: { provider: 'deepseek' } })
    mountSettings(<ProviderRoles />)
    const panel = await screen.findByTestId('roles-global')
    await within(panel).findByLabelText('Pilote')
    const cancel = within(panel).getByRole('button', { name: 'Annuler' }) as HTMLButtonElement
    expect(cancel.disabled).toBe(true)
    fireEvent.change(select('Pilote'), { target: { value: '' } })
    expect(cancel.disabled).toBe(false)
    fireEvent.click(cancel)
    expect(select('Pilote').value).toBe('d|deepseek|')
  })

  it('a project override that points at a not-allowed instance is refused locally, with a link to the consent', async () => {
    projectRoles.mockResolvedValue({ pilot: { provider: 'deepseek' } })
    list.mockImplementation(async (params: { project_slug?: string }) =>
      params?.project_slug ? response([CLAUDE, { ...DEEPSEEK, allowed_for_project: false }]) : response([CLAUDE, DEEPSEEK]),
    )
    mountSettings(<ProviderRoles />, { url: '/providers?project=acme#roles' })
    const scope = await screen.findByTestId('roles-acme')
    const link = await within(scope).findByRole('link', { name: 'Voir les autorisations du projet' })
    expect(link.getAttribute('href')).toBe('/providers?project=acme#consent')
    const blocked = within(scope).getAllByRole('option', { name: 'DeepSeek · modèle par défaut' })
    expect(blocked.length).toBe(2)
    expect(blocked.every((o) => o.hasAttribute('disabled'))).toBe(true)
    fireEvent.click(within(scope).getByRole('button', { name: 'Enregistrer' }))
    expect((await within(scope).findByRole('alert')).textContent).toContain('n’a pas autorisé')
    expect(setProjectRoles).not.toHaveBeenCalled()
  })

  it('the scope picker is the panel header; a project override is saved under /llm-roles; an unset role inherits', async () => {
    mountSettings(<ProviderRoles />)
    await screen.findByTestId('roles-global')
    const picker = screen.getByLabelText('Pour') as HTMLSelectElement
    await within(picker).findByRole('option', { name: 'Acme' })
    expect(within(picker).getByRole('option', { name: 'Tous les projets (rôles globaux)' })).toBeTruthy()
    fireEvent.change(picker, { target: { value: 'acme' } })
    const scope = await screen.findByTestId('roles-acme')
    await within(scope).findByLabelText('Exécutant')
    expect(within(scope).getAllByRole('option', { name: 'Hériter du rôle global' }).length).toBe(2)
    expect(within(scope).getAllByText('Hérite du rôle global.').length).toBe(2)
    fireEvent.change(within(scope).getByLabelText('Exécutant'), { target: { value: 'd|local-llama|' } })
    fireEvent.click(within(scope).getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(setProjectRoles).toHaveBeenCalledWith('acme', { executor: { provider: 'local-llama' } }))
  })

  it('a 403 reads as the human-only rule, in French', async () => {
    const { ApiError } = await import('@/services/api')
    setRoles.mockRejectedValue(new ApiError(403, ''))
    mountSettings(<ProviderRoles />)
    const panel = await screen.findByTestId('roles-global')
    await within(panel).findByLabelText('Pilote')
    fireEvent.click(within(panel).getByRole('button', { name: 'Enregistrer' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Seule une personne connectée peut faire ce changement (un agent ne le peut pas).')
  })

  it('a roles answer that is not JSON: the named request, and a retry instead of the form', async () => {
    const { NonJsonResponseError } = await import('@/services/api')
    roles.mockRejectedValueOnce(new NonJsonResponseError(502, 'GET', '/api/chat/roles', 'text/html'))
    mountSettings(<ProviderRoles />)
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('Le serveur a répondu autre chose que du JSON : GET /api/chat/roles → 502 (text/html)')
    expect(screen.queryByLabelText('Pilote')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Enregistrer' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(await screen.findByLabelText('Pilote')).toBeTruthy()
  })
})
