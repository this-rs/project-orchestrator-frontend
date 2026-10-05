/**
 * Stand-alone vault page (`/vault`, linked from chat cards).
 *
 * Checks what the page promises: names only (a value is never rendered),
 * grants readable as "what → who, until when", and changes locked behind the
 * passphrase when this tab holds no unlock proof (e.g. after a reload).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { VaultPage } from '../VaultPage'
import type { VaultOverview } from '@/services/vault'

let proofHeld = true
const overview = vi.fn<() => Promise<VaultOverview>>()
const createGrant = vi.fn()
const listProviders = vi.fn()
vi.mock('@/services/providers', async (orig) => ({
  ...(await orig<typeof import('@/services/providers')>()),
  providersApi: { list: (...a: unknown[]) => listProviders(...a) },
}))
vi.mock('@/services/vault', async (orig) => ({
  ...(await orig<typeof import('@/services/vault')>()),
  vaultApi: { overview: () => overview(), createGrant: (...a: unknown[]) => createGrant(...a) },
  hasUnlockProof: () => proofHeld,
}))

const OPEN: VaultOverview = {
  initialized: true,
  unlocked_until: '2099-01-01T10:00:00Z',
  secret_count: 1,
  unavailable: null,
  secrets: [
    {
      name: 'acme-api-token',
      description: 'acme-api-token, vault default',
      created_at: '2026-10-01T00:00:00Z',
      updated_at: '2026-10-01T00:00:00Z',
    },
  ],
  grants: [
    {
      id: 'g1',
      secrets: { kind: 'names', names: ['acme-api-token'] },
      scope: { kind: 'project', value: 'po' },
      created_at: '2026-10-01T00:00:00Z',
      expires_at: '2099-01-02T00:00:00Z',
      note: 'requested: publish diagrams',
    },
  ],
  requests: [],
}

function mount() {
  render(
    <MemoryRouter>
      <VaultPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  proofHeld = true
  overview.mockReset()
  createGrant.mockReset().mockResolvedValue({})
  listProviders.mockReset().mockResolvedValue({
    providers: [
      { id: 'claude-code', kind: 'claude_code', label: 'Claude Code', builtin: true, models: [] },
      { id: 'deepseek', kind: 'openai_compatible', label: 'DeepSeek', models: [] },
    ],
  })
})

describe('VaultPage', () => {
  it('shows names and grants, never a value, with the page chrome', async () => {
    overview.mockResolvedValue(OPEN)
    mount()
    expect(screen.getByRole('button', { name: /Back/ })).toBeTruthy()
    expect(await screen.findByText('acme-api-token, vault default')).toBeTruthy()
    expect(screen.getByText('Agent access')).toBeTruthy()
    expect(screen.getByText(/→ project po/)).toBeTruthy()
    expect(screen.getByText(/Open until/)).toBeTruthy()
    // The only value-bearing field is the empty "add a secret" input.
    const valueField = screen.getByLabelText('Secret value') as HTMLInputElement
    expect(valueField.type).toBe('password')
    expect(valueField.value).toBe('')
  })

  it('asks the passphrase before any change when this tab holds no proof', async () => {
    proofHeld = false
    overview.mockResolvedValue(OPEN)
    mount()
    expect(await screen.findByText(/enter the passphrase to make changes/)).toBeTruthy()
    expect(screen.queryByLabelText('Secret value')).toBeNull()
    expect((screen.getByRole('button', { name: 'Grant' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('says so when the vault file cannot be read', async () => {
    overview.mockResolvedValue({ ...OPEN, unavailable: 'malformed file' })
    mount()
    expect((await screen.findByRole('alert')).textContent).toContain('malformed file')
  })

  it('grants a secret to a provider instance (server-side read), for one named secret only', async () => {
    overview.mockResolvedValue(OPEN)
    mount()
    await screen.findByText('Agent access')
    fireEvent.change(screen.getByLabelText('Scope'), { target: { value: 'provider' } })
    const grant = screen.getByRole('button', { name: 'Grant' }) as HTMLButtonElement
    const instance = await screen.findByLabelText('Provider instance')
    await waitFor(() => expect(screen.getByRole('option', { name: 'DeepSeek' })).toBeTruthy())
    // The built-in Claude Code has no endpoint to authenticate to: not offered.
    expect(screen.queryByRole('option', { name: 'Claude Code' })).toBeNull()
    fireEvent.change(instance, { target: { value: 'deepseek' } })
    // "all secrets" cannot be granted to a provider: it is no longer offered, and the page says why Grant is off.
    expect(screen.queryByRole('option', { name: 'all secrets' })).toBeNull()
    expect((screen.getByLabelText('Secrets') as HTMLSelectElement).value).toBe('')
    expect(grant.disabled).toBe(true)
    expect(screen.getByTestId('provider-grant-why').textContent).toMatch(/one secret/)
    fireEvent.change(screen.getByLabelText('Secrets'), { target: { value: 'acme-api-token' } })
    expect(grant.disabled).toBe(false)
    fireEvent.click(grant)
    await waitFor(() =>
      expect(createGrant).toHaveBeenCalledWith(
        expect.objectContaining({
          secrets: { kind: 'names', names: ['acme-api-token'] },
          scope: { kind: 'provider', value: 'deepseek' },
        }),
      ),
    )
  })

  it('shows an existing provider grant as "provider <id>", not as a blank scope', async () => {
    overview.mockResolvedValue({
      ...OPEN,
      grants: [{ ...OPEN.grants[0], id: 'g2', scope: { kind: 'provider', value: 'deepseek' } }],
    })
    mount()
    expect(await screen.findByText(/→ provider deepseek/)).toBeTruthy()
  })
})
