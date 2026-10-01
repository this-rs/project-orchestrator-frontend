/**
 * Stand-alone vault page (`/vault`, linked from chat cards).
 *
 * Checks what the page promises: names only (a value is never rendered),
 * grants readable as "what → who, until when", and changes locked behind the
 * passphrase when this tab holds no unlock proof (e.g. after a reload).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { VaultPage } from '../VaultPage'
import type { VaultOverview } from '@/services/vault'

let proofHeld = true
const overview = vi.fn<() => Promise<VaultOverview>>()
vi.mock('@/services/vault', async (orig) => ({
  ...(await orig<typeof import('@/services/vault')>()),
  vaultApi: { overview: () => overview() },
  hasUnlockProof: () => proofHeld,
}))

const OPEN: VaultOverview = {
  initialized: true,
  unlocked_until: '2099-01-01T10:00:00Z',
  secret_count: 1,
  unavailable: null,
  secrets: [
    {
      name: 'demo-secret',
      description: 'demo service, vault default',
      created_at: '2026-10-01T00:00:00Z',
      updated_at: '2026-10-01T00:00:00Z',
    },
  ],
  grants: [
    {
      id: 'g1',
      secrets: { kind: 'names', names: ['demo-secret'] },
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
})

describe('VaultPage', () => {
  it('shows names and grants, never a value, with the page chrome', async () => {
    overview.mockResolvedValue(OPEN)
    mount()
    expect(screen.getByRole('button', { name: /Back/ })).toBeTruthy()
    expect(await screen.findByText('demo service, vault default')).toBeTruthy()
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
})
