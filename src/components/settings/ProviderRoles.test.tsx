/**
 * Pilot / executor roles, global and per project, and the effective default.
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
  it('unset roles read "single provider (current behaviour)", and the resolution order is stated', async () => {
    mountSettings(<ProviderRoles />)
    await screen.findByTestId('effective-default')
    expect(screen.getAllByText(/single provider \(current behaviour\)/).length).toBeGreaterThan(0)
    expect(screen.getByText(/Resolution order:/)).toBeTruthy()
  })

  it('shows the effective default and where it comes from', async () => {
    list.mockResolvedValue(response([CLAUDE, DEEPSEEK], { default: { provider: 'deepseek', model: 'deepseek-chat', routed_by: 'global_rule' } }))
    mountSettings(<ProviderRoles />)
    const eff = await screen.findByTestId('effective-default')
    await waitFor(() => expect(eff.textContent).toContain('DeepSeek'))
    expect(eff.textContent).toContain('global default')
  })

  it('PUTs the global roles, and the new default is what a new conversation preselects after re-fetch', async () => {
    // Before: Claude Code is the default. After the save the server resolves DeepSeek.
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
    await screen.findByTestId('roles-global')
    fireEvent.change(select('Pilot'), { target: { value: 'm|deepseek|deepseek-chat' } })
    fireEvent.click(within(screen.getByTestId('roles-global')).getByRole('button', { name: 'Save roles' }))
    await waitFor(() => expect(setRoles).toHaveBeenCalledWith({ pilot: { provider: 'deepseek', model: 'deepseek-chat' } }))
    await waitFor(() => expect(store.get(providersAtom)?.default?.provider).toBe('deepseek'))
    expect(store.get(chatEffectiveProviderIdAtom)).toBe('deepseek')
  })

  it('an alias target is sent as { provider, alias }', async () => {
    list.mockResolvedValue(response([CLAUDE, DEEPSEEK], { aliases: [{ alias: 'deep', provider: 'deepseek', model: 'deepseek-reasoner' }] }))
    mountSettings(<ProviderRoles />, { providers: [CLAUDE, DEEPSEEK] })
    await screen.findByTestId('roles-global')
    await screen.findAllByRole('option', { name: 'DeepSeek / alias deep' })
    fireEvent.change(select('Executor'), { target: { value: 'a|deepseek|deep' } })
    fireEvent.click(within(screen.getByTestId('roles-global')).getByRole('button', { name: 'Save roles' }))
    await waitFor(() => expect(setRoles).toHaveBeenCalledWith({ executor: { provider: 'deepseek', alias: 'deep' } }))
  })

  it('a project override that points at a not-allowed instance is refused locally, with a link to the consent', async () => {
    projectRoles.mockResolvedValue({ pilot: { provider: 'deepseek' } })
    list.mockImplementation(async (params: { project_slug?: string }) =>
      params?.project_slug
        ? response([CLAUDE, { ...DEEPSEEK, allowed_for_project: false }])
        : response([CLAUDE, DEEPSEEK]),
    )
    mountSettings(<ProviderRoles />, { url: '/providers?project=acme#roles' })
    const scope = await screen.findByTestId('roles-acme')
    await waitFor(() => expect(within(scope).getByRole('link', { name: /Review the project/ })).toBeTruthy())
    expect(within(scope).getByRole('link', { name: /Review the project/ }).getAttribute('href')).toBe('/providers?project=acme#consent')
    const blocked = within(scope).getAllByRole('option', { name: 'DeepSeek, default model' })
    expect(blocked.length).toBe(2)
    expect(blocked.every((o) => o.hasAttribute('disabled'))).toBe(true)
    fireEvent.click(within(scope).getByRole('button', { name: 'Save roles' }))
    expect((await within(scope).findByRole('alert')).textContent).toContain('has not agreed')
    expect(setProjectRoles).not.toHaveBeenCalled()
  })

  it('a project override is saved under /llm-roles of that project; an unset role inherits', async () => {
    mountSettings(<ProviderRoles />, { url: '/providers?project=acme' })
    const scope = await screen.findByTestId('roles-acme')
    fireEvent.change(within(scope).getByLabelText('Executor'), { target: { value: 'd|local-llama|' } })
    fireEvent.click(within(scope).getByRole('button', { name: 'Save roles' }))
    await waitFor(() => expect(setProjectRoles).toHaveBeenCalledWith('acme', { executor: { provider: 'local-llama' } }))
    expect(within(scope).getAllByRole('option', { name: 'Inherit the global role' }).length).toBe(2)
  })

  it('a 403 reads "Only a signed-in user can change this"', async () => {
    const { ApiError } = await import('@/services/api')
    setRoles.mockRejectedValue(new ApiError(403, ''))
    mountSettings(<ProviderRoles />)
    await screen.findByTestId('roles-global')
    fireEvent.click(within(screen.getByTestId('roles-global')).getByRole('button', { name: 'Save roles' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Only a signed-in user can change this')
  })
})
