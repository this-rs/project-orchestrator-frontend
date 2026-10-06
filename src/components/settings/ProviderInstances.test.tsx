/**
 * Provider cards: state at a glance, what each card shows, Tester, Modifier,
 * Supprimer with a confirmation.
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

const card = (id: string) => screen.getByTestId(`instance-${id}`)

describe('ProviderInstances (cards)', () => {
  it('shows endpoint, default model, cost and the credential REFERENCE, with a state badge', () => {
    mountSettings(<ProviderInstances />)
    const row = card('deepseek')
    expect(row.textContent).toContain('https://api.deepseek.com')
    expect(row.textContent).toContain('deepseek-chat')
    expect(row.textContent).toContain('Tarifé (estimation)')
    expect(row.textContent).toContain('vault:deepseek-key')
    expect(row.textContent).toContain('Connecté')
    expect(row.getAttribute('data-status')).toBe('connected')
  })

  it.each([
    [{ status: 'auth_required' as const }, {}, 'key_missing', 'Clé manquante'],
    [{ status: 'unhealthy' as const, error: { code: 'endpoint_unreachable' as const, message: '' } }, {}, 'unreachable', 'Injoignable'],
    [{ status: 'unhealthy' as const, error: { code: 'credentials_locked' as const, message: '' } }, {}, 'key_missing', 'Clé manquante'],
    [{ status: 'healthy' as const }, { allowed_for_project: false }, 'not_allowed', 'Projet non autorisé'],
  ])('state %#: %s', (health, extra, key, label) => {
    mountSettings(<ProviderInstances />, { list, providers: [CLAUDE, { ...DEEPSEEK, ...extra, health }] })
    expect(card('deepseek').getAttribute('data-status')).toBe(key)
    expect(card('deepseek').textContent).toContain(label)
  })

  it('the built-in instance can be tested, but neither edited nor deleted', () => {
    mountSettings(<ProviderInstances />)
    const row = within(card('claude-code'))
    expect(row.queryByRole('button', { name: /Supprimer/ })).toBeNull()
    expect(row.queryByRole('button', { name: /Modifier/ })).toBeNull()
    expect(row.getByRole('button', { name: 'Tester Claude Code' })).toBeTruthy()
  })

  it('an unhealthy instance shows its last error in the state card', () => {
    mountSettings(<ProviderInstances />, {
      list,
      providers: [CLAUDE, { ...DEEPSEEK, health: { status: 'unhealthy', error: { code: 'endpoint_unreachable', message: 'connection refused' } } }],
    })
    expect(screen.getByTestId('instance-error-deepseek').getAttribute('data-error-code')).toBe('endpoint_unreachable')
  })

  it('auth_required shows the login command', () => {
    mountSettings(<ProviderInstances />, {
      list,
      providers: [{ ...CLAUDE, health: { status: 'auth_required', login_hint: 'claude login' } }],
    })
    expect(screen.getByTestId('instance-error-claude-code').textContent).toContain('claude login')
  })

  it('Tester calls GET status of that instance and shows the fresh health', async () => {
    status.mockResolvedValue({ status: 'degraded', version: '1.2.3', checked_at: '2026-10-02T08:00:00Z' })
    mountSettings(<ProviderInstances />)
    fireEvent.click(screen.getByRole('button', { name: 'Tester Local llama' }))
    await waitFor(() => expect(status).toHaveBeenCalledWith('local-llama'))
    await waitFor(() => expect(card('local-llama').textContent).toContain('Dégradé'))
    expect(card('local-llama').textContent).toContain('1.2.3')
  })

  it('Supprimer names the instance, warns about conversations, then DELETEs and re-fetches', async () => {
    mountSettings(<ProviderInstances />)
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer DeepSeek' }))
    const dialog = screen.getByRole('alertdialog')
    expect(dialog.textContent).toContain('Supprimer DeepSeek ?')
    expect(dialog.textContent).toContain('ne pourront plus être reprises')
    expect(remove).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Supprimer DeepSeek' }))
    await waitFor(() => expect(remove).toHaveBeenCalledWith('deepseek'))
    await waitFor(() => expect(list).toHaveBeenCalled())
  })

  it('Supprimer can be cancelled', () => {
    mountSettings(<ProviderInstances />)
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer DeepSeek' }))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Garder' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(remove).not.toHaveBeenCalled()
  })

  it('Modifier opens the edit form inside the card', () => {
    mountSettings(<ProviderInstances />)
    fireEvent.click(screen.getByRole('button', { name: 'Modifier DeepSeek' }))
    expect(within(card('deepseek')).getByRole('form', { name: 'Modifier DeepSeek' })).toBeTruthy()
  })

  it('card actions: same kit size, right-aligned in one footer', () => {
    mountSettings(<ProviderInstances />)
    const buttons = within(card('deepseek')).getAllByRole('button')
    expect(buttons.map((b) => b.textContent)).toEqual(['Tester', 'Modifier', 'Supprimer'])
    for (const b of buttons) expect(b.className).toMatch(/min-h-9 px-3 py-2 text-sm/)
    expect(buttons[0].parentElement!.className).toContain('justify-end')
  })
})
