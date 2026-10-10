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
const vaultApiMock = vi.hoisted(() => ({ overview: vi.fn(), unlock: vi.fn() }))
vi.mock('@/services/vault', async (orig) => ({
  ...(await orig<typeof import('@/services/vault')>()),
  vaultApi: { overview: vaultApiMock.overview, unlock: vaultApiMock.unlock },
}))

import { chatEffectiveProviderIdAtom, modelCatalogAtom, modelCatalogLoadedAtom, providersAtom } from '@/atoms'
import { chatApi } from '@/services'
import { ProviderRoles } from './ProviderRoles'
import { CLAUDE, CLAUDE_CATALOG, DEEPSEEK, LOCAL, listHeadings, mountSettings, response, vaultState } from './settingsTestKit'

/** The live Claude catalog, already read by the app (or empty and settled = unreachable). */
const catalog = (models = CLAUDE_CATALOG) => (store: { set: (a: unknown, v: unknown) => void }) => {
  store.set(modelCatalogAtom, models)
  store.set(modelCatalogLoadedAtom, true)
}

const box = (name: RegExp | string, root: HTMLElement = document.body) =>
  within(root).getByRole('combobox', { name }) as HTMLInputElement
/** Open a role's combobox and click the option with that name (what a person does). */
const pick = (field: RegExp | string, option: string | RegExp, root: HTMLElement = document.body) => {
  fireEvent.click(box(field, root))
  fireEvent.click(within(root).getByRole('option', { name: option }))
}

beforeEach(() => {
  vaultApiMock.overview.mockReset().mockResolvedValue(vaultState())
  vaultApiMock.unlock.mockReset()
  vi.spyOn(chatApi, 'getModelCatalog').mockResolvedValue([])
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
    pick('Pilote', 'DeepSeek · deepseek-chat')
    fireEvent.click(within(panel).getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(setRoles).toHaveBeenCalledWith({ pilot: { provider: 'deepseek', model: 'deepseek-chat' } }))
    await waitFor(() => expect(store.get(providersAtom)?.default?.provider).toBe('deepseek'))
    expect(store.get(chatEffectiveProviderIdAtom)).toBe('deepseek')
    expect(await within(panel).findByText('Rôles enregistrés.')).toBeTruthy()
  })

  it('a role target is searched by instance name or model id', async () => {
    mountSettings(<ProviderRoles />)
    await screen.findByRole('combobox', { name: 'Pilote' })
    fireEvent.click(box('Pilote'))
    fireEvent.change(box('Pilote'), { target: { value: 'QWEN' } })
    const list = () => within(screen.getByRole('listbox')).getAllByRole('option')
    expect(list().map((o) => o.textContent)).toEqual(['Local llama · qwen3'])
    fireEvent.change(box('Pilote'), { target: { value: 'deepseek' } })
    expect(list().length).toBe(3)
  })

  it('an alias target is sent as { provider, alias }', async () => {
    list.mockResolvedValue(response([CLAUDE, DEEPSEEK], { aliases: [{ alias: 'deep', provider: 'deepseek', model: 'deepseek-reasoner' }] }))
    mountSettings(<ProviderRoles />, { providers: [CLAUDE, DEEPSEEK] })
    const panel = await screen.findByTestId('roles-global')
    await screen.findByRole('combobox', { name: 'Exécutant' })
    pick('Exécutant', 'DeepSeek · alias deep')
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
    expect(box('Pilote').value).toBe('DeepSeek · modèle par défaut')
    pick('Pilote', 'Non réglé : provider par défaut du serveur')
    expect(cancel.disabled).toBe(false)
    expect(box('Pilote').value).toBe('Non réglé : provider par défaut du serveur')
    fireEvent.click(cancel)
    expect(box('Pilote').value).toBe('DeepSeek · modèle par défaut')
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
    fireEvent.click(box('Pilote', scope))
    const blocked = within(scope).getByRole('option', { name: /DeepSeek · modèle par défaut/ })
    expect(blocked.getAttribute('aria-disabled')).toBe('true')
    expect(blocked.textContent).toContain('non autorisé pour ce projet')
    // A blocked target cannot be chosen, with the mouse or the keyboard.
    fireEvent.click(blocked)
    expect(box('Pilote', scope).getAttribute('aria-expanded')).toBe('true')
    fireEvent.keyDown(box('Pilote', scope), { key: 'Escape' })
    fireEvent.click(within(scope).getByRole('button', { name: 'Enregistrer' }))
    expect((await within(scope).findByRole('alert')).textContent).toContain('n’a pas autorisé')
    expect(setProjectRoles).not.toHaveBeenCalled()
  })

  it('the scope picker is the panel header; a project override is saved under /llm-roles; an unset role inherits', async () => {
    mountSettings(<ProviderRoles />)
    await screen.findByTestId('roles-global')
    const picker = screen.getByLabelText('Pour') as HTMLSelectElement
    // The scope picker stays a native select.
    await within(picker).findByRole('option', { name: 'Acme' })
    expect(within(picker).getByRole('option', { name: 'Tous les projets (rôles globaux)' })).toBeTruthy()
    fireEvent.change(picker, { target: { value: 'acme' } })
    const scope = await screen.findByTestId('roles-acme')
    await within(scope).findByLabelText('Exécutant')
    expect(box('Exécutant', scope).value).toBe('Hériter du rôle global')
    expect(box('Pilote', scope).value).toBe('Hériter du rôle global')
    expect(within(scope).getAllByText('Hérite du rôle global.').length).toBe(2)
    pick('Exécutant', 'Local llama · modèle par défaut', scope)
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
    expect(alert.textContent).toBe('The server answered something other than JSON: GET /api/chat/roles → 502 (text/html)')
    expect(screen.queryByLabelText('Pilote')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Enregistrer' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(await screen.findByLabelText('Pilote')).toBeTruthy()
  })

  it('a role lists every model of the live Claude catalog, grouped by provider then family, next to the other instances', async () => {
    mountSettings(<ProviderRoles />, { prepare: catalog() })
    await screen.findByRole('combobox', { name: 'Pilote' })
    fireEvent.click(box('Pilote'))
    const listbox = screen.getByRole('listbox')
    const names = within(listbox).getAllByRole('option').map((o) => o.textContent ?? '')
    expect(names).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Claude Code · modèle par défaut'),
        expect.stringContaining('Claude Code · Opus 5.5'),
        expect.stringContaining('Claude Code · Haiku 5.5'),
        expect.stringContaining('DeepSeek · deepseek-chat'),
      ]),
    )
    expect(listHeadings(listbox)).toEqual(['Claude Code', 'Claude Code · Opus', 'Claude Code · Sonnet', 'Claude Code · Haiku', 'DeepSeek', 'Local llama'])
    // Found by its id too, and saved as { provider, model }.
    fireEvent.change(box('Pilote'), { target: { value: 'claude-haiku-5-5' } })
    fireEvent.click(screen.getByRole('option', { name: /Claude Code · Haiku 5\.5/ }))
    fireEvent.click(within(screen.getByTestId('roles-global')).getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(setRoles).toHaveBeenCalledWith({ pilot: { provider: 'claude-code', model: 'claude-haiku-5-5' } }))
  })

  it('an unreachable live catalog: the list is said to be offline, in words and with an icon', async () => {
    mountSettings(<ProviderRoles />, { prepare: catalog([]) })
    const panel = await screen.findByTestId('roles-global')
    const note = await within(panel).findByTestId('catalog-offline')
    expect(note.textContent).toContain('Offline list.')
    expect(note.querySelector('svg')).toBeTruthy()
    expect(note.getAttribute('role')).toBe('note')
  })

  it('a role on a provider whose key sits in the locked vault: VaultUnlock in place; unlocking re-reads providers and catalogs', async () => {
    vaultApiMock.overview.mockResolvedValue(vaultState({ unlocked_until: null }))
    vaultApiMock.unlock.mockResolvedValue({ unlocked_until: '2099-01-01T00:00:00Z', unlock_proof: 'proof' })
    roles.mockResolvedValue({ pilot: { provider: 'deepseek', model: 'deepseek-chat' } })
    mountSettings(<ProviderRoles />)
    const panel = await screen.findByTestId('roles-global')
    const gate = await within(panel).findByTestId('target-vault-unlock')
    expect(gate.textContent).toContain('DeepSeek: the key is in the vault, which is locked.')
    const listsBefore = list.mock.calls.length
    const rolesBefore = roles.mock.calls.length
    const catalogsBefore = vi.mocked(chatApi.getModelCatalog).mock.calls.length
    fireEvent.change(within(gate).getByLabelText('Vault locked'), { target: { value: 'correct horse' } })
    fireEvent.click(within(gate).getByRole('button', { name: 'Unlock' }))
    await waitFor(() => expect(vaultApiMock.unlock).toHaveBeenCalledWith('correct horse', 60))
    expect((await within(gate).findByRole('status')).textContent).toContain('Vault unlocked')
    await waitFor(() => expect(list.mock.calls.length).toBeGreaterThan(listsBefore))
    await waitFor(() => expect(roles.mock.calls.length).toBeGreaterThan(rolesBefore))
    await waitFor(() => expect(vi.mocked(chatApi.getModelCatalog).mock.calls.length).toBeGreaterThan(catalogsBefore))
  })

  it('no unlock form when the chosen role does not depend on the vault', async () => {
    vaultApiMock.overview.mockResolvedValue(vaultState({ unlocked_until: null }))
    roles.mockResolvedValue({ pilot: { provider: 'local-llama' } })
    mountSettings(<ProviderRoles />)
    const panel = await screen.findByTestId('roles-global')
    await within(panel).findByLabelText('Pilote')
    expect(within(panel).queryByTestId('target-vault-unlock')).toBeNull()
    expect(vaultApiMock.overview).not.toHaveBeenCalled()
  })
})
