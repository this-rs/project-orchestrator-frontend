/**
 * The assembled settings: sections with anchors, and the single-provider empty state.
 *
 * Run with: npx vitest run src/components/settings/ProviderSettings.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'

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
  vaultApi: { overview: vi.fn().mockResolvedValue({ secrets: [] }) },
}))

import { providersApi } from '@/services/providers'
import { ApiError } from '@/services/api'
import { ProviderSettings } from './ProviderSettings'
import { mountSettings } from './settingsTestKit'

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

  it('renders the four anchored sections', async () => {
    vi.mocked(providersApi.list).mockResolvedValue({ providers: [] })
    const { container } = mountSettings(<ProviderSettings />)
    for (const id of ['instances', 'consent', 'roles', 'models']) {
      expect(container.querySelector(`section#${id}`)).not.toBeNull()
    }
    expect(screen.getByRole('link', { name: 'Roles' }).getAttribute('href')).toBe('#roles')
  })
})
