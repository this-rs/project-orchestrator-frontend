/**
 * Instance list: what each row shows, re-check, delete confirmation.
 *
 * Run with: npx vitest run src/components/settings/ProviderInstances.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'

const status = vi.fn()
const remove = vi.fn()
const list = vi.fn()
vi.mock('@/services/providers', async (orig) => ({
  ...(await orig<typeof import('@/services/providers')>()),
  providersApi: {
    status: (...a: unknown[]) => status(...a),
    remove: (...a: unknown[]) => remove(...a),
    list: (...a: unknown[]) => list(...a),
    test: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}))
vi.mock('@/services/vault', async (orig) => ({
  ...(await orig<typeof import('@/services/vault')>()),
  vaultApi: { overview: vi.fn().mockResolvedValue({ secrets: [] }) },
}))

import { ProviderInstances } from './ProviderInstances'
import { CLAUDE, DEEPSEEK, LOCAL, mountSettings, response } from './settingsTestKit'

beforeEach(() => {
  status.mockReset().mockResolvedValue({ status: 'healthy' })
  remove.mockReset().mockResolvedValue(undefined)
  list.mockReset().mockResolvedValue(response([CLAUDE, DEEPSEEK, LOCAL]))
})

describe('ProviderInstances', () => {
  it('shows endpoint, default model, cost basis and the credential REFERENCE', () => {
    mountSettings(<ProviderInstances />)
    const row = screen.getByTestId('instance-deepseek')
    expect(row.textContent).toContain('https://api.deepseek.com')
    expect(row.textContent).toContain('deepseek-chat')
    expect(row.textContent).toContain('Priced (estimate)')
    expect(row.textContent).toContain('vault:deepseek-key')
    expect(row.textContent).toContain('Healthy')
  })

  it('the built-in instance can be neither edited nor deleted', () => {
    mountSettings(<ProviderInstances />)
    const row = within(screen.getByTestId('instance-claude-code'))
    expect(row.queryByRole('button', { name: /Delete/ })).toBeNull()
    expect(row.queryByRole('button', { name: /Edit/ })).toBeNull()
    expect(row.getByRole('button', { name: 'Re-check' })).toBeTruthy()
  })

  it('an unhealthy instance shows its last error in the state card', () => {
    mountSettings(<ProviderInstances />, {
      list,
      providers: [CLAUDE, { ...DEEPSEEK, health: { status: 'unhealthy', error: { code: 'endpoint_unreachable', message: 'connection refused' } } }],
    })
    expect(screen.getByTestId('instance-error-deepseek').getAttribute('data-error-code')).toBe('endpoint_unreachable')
  })

  it('auth_required shows the login command and a Re-check', () => {
    mountSettings(<ProviderInstances />, {
      list,
      providers: [{ ...CLAUDE, health: { status: 'auth_required', login_hint: 'claude login' } }],
    })
    const card = screen.getByTestId('instance-error-claude-code')
    expect(card.textContent).toContain('claude login')
    expect(within(card).getByRole('button', { name: 'Re-check' })).toBeTruthy()
  })

  it('Re-check calls GET status of that instance and shows the fresh health', async () => {
    status.mockResolvedValue({ status: 'degraded', version: '1.2.3', checked_at: '2026-10-02T08:00:00Z' })
    mountSettings(<ProviderInstances />)
    fireEvent.click(within(screen.getByTestId('instance-local-llama')).getByRole('button', { name: 'Re-check' }))
    await waitFor(() => expect(status).toHaveBeenCalledWith('local-llama'))
    await waitFor(() => expect(screen.getByTestId('instance-local-llama').textContent).toContain('Degraded'))
    expect(screen.getByTestId('instance-local-llama').textContent).toContain('1.2.3')
  })

  it('deleting names the instance, warns about conversations, then DELETEs and re-fetches', async () => {
    mountSettings(<ProviderInstances />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete DeepSeek' }))
    const dialog = screen.getByRole('alertdialog')
    expect(dialog.textContent).toContain('Delete DeepSeek?')
    expect(dialog.textContent).toContain('no longer be resumable')
    expect(remove).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete DeepSeek' }))
    await waitFor(() => expect(remove).toHaveBeenCalledWith('deepseek'))
    await waitFor(() => expect(list).toHaveBeenCalled())
  })

  it('opens the add form', () => {
    mountSettings(<ProviderInstances />)
    fireEvent.click(screen.getByRole('button', { name: /Add an instance/ }))
    expect(screen.getByRole('form', { name: 'Add a provider instance' })).toBeTruthy()
  })
})
