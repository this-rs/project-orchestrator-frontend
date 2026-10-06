/**
 * The assembled settings: anchored sections, the "Avancé" fold, the wizard
 * entry point, and the single-provider empty state.
 *
 * Run with: npx vitest run src/components/settings/ProviderSettings.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, screen, within } from '@testing-library/react'

vi.mock('@/services/providers', async (orig) => ({
  ...(await orig<typeof import('@/services/providers')>()),
  providersApi: {
    list: vi.fn().mockRejectedValue(new Error('not reached')),
    status: vi.fn(),
    roles: vi.fn().mockResolvedValue({}),
    projectRoles: vi.fn().mockResolvedValue({}),
    aliases: vi.fn().mockResolvedValue([]),
    policy: vi.fn().mockResolvedValue({ mode: 'off', rules: {}, fallback: [], caps: {} }),
    consents: vi.fn().mockResolvedValue([]),
  },
}))
vi.mock('@/services/projects', () => ({ projectsApi: { list: vi.fn().mockResolvedValue({ items: [] }) } }))
vi.mock('@/services/vault', async (orig) => ({
  ...(await orig<typeof import('@/services/vault')>()),
  vaultApi: { overview: vi.fn().mockResolvedValue({ initialized: false, unlocked_until: null, secrets: [], grants: [], requests: [] }) },
}))

import { providersApi } from '@/services/providers'
import { ApiError } from '@/services/api'
import { ProviderSettings } from './ProviderSettings'
import { mountSettings, response, CLAUDE } from './settingsTestKit'

beforeEach(() => {
  vi.mocked(providersApi.list).mockReset()
})

describe('ProviderSettings', () => {
  it('on a backend without provider routes: an explanation, and no form or button', async () => {
    vi.mocked(providersApi.list).mockRejectedValue(new ApiError(404, 'not found'))
    const { container } = mountSettings(<ProviderSettings />, { state: 'unsupported' })
    const empty = await screen.findByTestId('providers-unsupported')
    expect(empty.textContent).toContain('only handles one provider: Claude Code')
    expect(container.querySelector('form, button, select, input')).toBeNull()
  })

  it('renders the anchored sections; roles and policy are folded under "Avancé"', () => {
    vi.mocked(providersApi.list).mockResolvedValue(response([CLAUDE]))
    const { container } = mountSettings(<ProviderSettings />)
    for (const id of ['instances', 'consent', 'advanced']) expect(container.querySelector(`section#${id}`)).not.toBeNull()
    expect(container.querySelector('#roles')).toBeNull()
    expect(container.querySelector('#models')).toBeNull()
    expect(screen.getByRole('link', { name: 'Avancé' }).getAttribute('href')).toBe('#advanced')
    fireEvent.click(screen.getByRole('button', { name: 'Avancé' }))
    expect(container.querySelector('#roles')).not.toBeNull()
    expect(container.querySelector('#models')).not.toBeNull()
    expect(screen.getByRole('region', { name: 'Rôles' })).toBeTruthy()
  })

  it('a link to #roles or #models opens the fold', () => {
    vi.mocked(providersApi.list).mockResolvedValue(response([CLAUDE]))
    const { container } = mountSettings(<ProviderSettings />, { url: '/providers#roles' })
    expect(container.querySelector('#roles')).not.toBeNull()
  })

  it('"Ajouter un provider" opens the wizard in place of the button', () => {
    vi.mocked(providersApi.list).mockResolvedValue(response([CLAUDE]))
    mountSettings(<ProviderSettings />)
    fireEvent.click(screen.getByRole('button', { name: /Ajouter un provider/ }))
    expect(screen.getByRole('region', { name: 'Ajouter un provider' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Ajouter un provider/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(screen.queryByRole('region', { name: 'Ajouter un provider' })).toBeNull()
  })

  it('every button of the page is a kit Button, and the sections have one right-aligned footer each', async () => {
    vi.mocked(providersApi.list).mockResolvedValue(response([CLAUDE]))
    const { container } = mountSettings(<ProviderSettings />, { url: '/providers#advanced' })
    await screen.findByRole('radio', { name: /Désactivée/ })
    for (const b of container.querySelectorAll('button')) {
      if (b.getAttribute('role') === 'combobox' || b.getAttribute('role') === 'option') continue
      if (b.getAttribute('aria-expanded') !== null) continue // the "Avancé" toggle of the kit Section
      expect(b.className).toMatch(/inline-flex items-center justify-center font-medium rounded-lg/)
    }
    for (const id of ['roles-global', 'aliases-panel', 'policy-panel']) {
      const footers = screen.getByTestId(id).querySelectorAll(':scope > footer')
      expect(footers).toHaveLength(1)
      expect(footers[0].className).toContain('justify-end')
      const save = within(footers[0] as HTMLElement).getByRole('button', { name: 'Enregistrer' })
      expect(save.className).toContain('bg-indigo-600')
      expect(within(footers[0] as HTMLElement).getByRole('button', { name: 'Annuler' }).className).toContain('hover:bg-white/[0.06] text-gray-300')
    }
  })
})
