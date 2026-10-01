/**
 * The secure input card for an agent's secret request.
 *
 * What matters here:
 * - the value leaves ONLY through the vault API (never as a chat message);
 * - a locked vault is unlocked from the same card, in the same call;
 * - an existing secret is granted without retyping it;
 * - after a reconnect, pending requests come back from the server — but only
 *   this conversation's.
 *
 * Run with: npx vitest run src/components/chat/SecretRequestTray.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Provider, createStore } from 'jotai'
import { chatSecretRequestsAtom } from '@/atoms'
import { SecretRequestTray } from './SecretRequestTray'
import type { VaultOverview } from '@/services/vault'

const overview = vi.fn<() => Promise<VaultOverview>>()
const answer = vi.fn()
let proofHeld = true
vi.mock('@/services/vault', async (orig) => {
  const actual = await orig<typeof import('@/services/vault')>()
  return {
    ...actual,
    vaultApi: { overview: () => overview(), answer: (...a: unknown[]) => answer(...a) },
    hasUnlockProof: () => proofHeld,
  }
})

function state(partial: Partial<VaultOverview>): VaultOverview {
  return {
    initialized: true,
    unlocked_until: '2099-01-01T00:00:00Z',
    secret_count: 0,
    unavailable: null,
    secrets: [],
    grants: [],
    requests: [],
    ...partial,
  }
}

const REQ = {
  id: 'r1',
  name: 'demo-secret',
  reason: 'publish diagrams',
  session_id: 'session-1',
  project_slug: 'po',
  exists: false,
  created_at: '2026-10-01T00:00:00Z',
}

function mount(store = createStore()) {
  render(
    <Provider store={store}>
      <MemoryRouter>
        <SecretRequestTray sessionId="session-1" />
      </MemoryRouter>
    </Provider>,
  )
  return store
}

beforeEach(() => {
  proofHeld = true
  overview.mockReset()
  answer.mockReset()
  answer.mockResolvedValue({ outcome: 'provided', grant: null })
})

describe('SecretRequestTray', () => {
  it('drops a request answered elsewhere on the next refresh', async () => {
    overview.mockResolvedValue(state({ requests: [] }))
    const store = createStore()
    store.set(chatSecretRequestsAtom, [{ id: 'gone', name: 'stale', reason: '', exists: false }])
    mount(store)
    await waitFor(() => expect(store.get(chatSecretRequestsAtom)).toEqual([]))
  })

  it('rehydrates only this conversation’s requests from the server', async () => {
    overview.mockResolvedValue(
      state({ requests: [REQ, { ...REQ, id: 'r2', name: 'other', session_id: 'session-2' }] }),
    )
    mount()
    expect(await screen.findByText('demo-secret')).toBeTruthy()
    expect(screen.queryByText('other')).toBeNull()
  })

  it('sends the typed value to the vault API, scoped to this conversation', async () => {
    overview.mockResolvedValue(state({ requests: [REQ] }))
    answer.mockImplementation(async () => {
      // Answered: the server no longer lists it.
      overview.mockResolvedValue(state({ requests: [] }))
      return { outcome: 'provided', grant: null }
    })
    const store = mount()
    const field = await screen.findByLabelText('Value of secret demo-secret')
    expect(field.getAttribute('type')).toBe('password')
    fireEvent.change(field, { target: { value: 'the-demo-passphrase' } })
    fireEvent.click(screen.getByRole('button', { name: 'Provide' }))
    await waitFor(() => expect(answer).toHaveBeenCalledTimes(1))
    expect(answer).toHaveBeenCalledWith('r1', expect.objectContaining({
      action: 'provide',
      value: 'the-demo-passphrase',
      scope: { kind: 'session', value: 'session-1' },
      passphrase: undefined,
    }))
    await waitFor(() => expect(store.get(chatSecretRequestsAtom)).toEqual([]))
  })

  it('unlocks a locked vault in the same answer', async () => {
    overview.mockResolvedValue(state({ unlocked_until: null, requests: [REQ] }))
    mount()
    fireEvent.change(await screen.findByLabelText('Vault passphrase'), {
      target: { value: 'correct horse battery staple' },
    })
    fireEvent.change(screen.getByLabelText('Value of secret demo-secret'), {
      target: { value: 'the-demo-passphrase' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Provide' }))
    await waitFor(() =>
      expect(answer).toHaveBeenCalledWith('r1', expect.objectContaining({
        passphrase: 'correct horse battery staple',
      })),
    )
  })

  it('asks the passphrase when the vault is open but this tab never typed it', async () => {
    // e.g. after a reload: the proof lives in memory only.
    proofHeld = false
    overview.mockResolvedValue(state({ requests: [{ ...REQ, exists: true }] }))
    mount()
    const allow = await screen.findByRole('button', { name: 'Allow' })
    expect((allow as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Vault passphrase'), { target: { value: 'correct horse battery staple' } })
    fireEvent.click(allow)
    await waitFor(() =>
      expect(answer).toHaveBeenCalledWith('r1', expect.objectContaining({ passphrase: 'correct horse battery staple' })),
    )
  })

  it('grants an existing secret without asking its value again', async () => {
    overview.mockResolvedValue(state({ requests: [{ ...REQ, exists: true }] }))
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Allow' }))
    await waitFor(() =>
      expect(answer).toHaveBeenCalledWith('r1', expect.objectContaining({ action: 'grant', value: undefined })),
    )
    expect(screen.queryByLabelText('Value of secret demo-secret')).toBeNull()
  })

  it('keeps the card and shows the reason when the answer is refused', async () => {
    overview.mockResolvedValue(state({ unlocked_until: null, requests: [REQ] }))
    const { ApiError } = await import('@/services/api')
    answer.mockRejectedValue(new ApiError(403, '{"error":"wrong passphrase"}'))
    mount()
    fireEvent.change(await screen.findByLabelText('Vault passphrase'), { target: { value: 'nope-nope-nope' } })
    fireEvent.change(screen.getByLabelText('Value of secret demo-secret'), { target: { value: 'the-demo-passphrase' } })
    fireEvent.click(screen.getByRole('button', { name: 'Provide' }))
    expect((await screen.findByRole('alert')).textContent).toContain('wrong passphrase')
    expect(screen.getByText('demo-secret')).toBeTruthy()
  })
})
