/**
 * Stand-alone vault page (`/vault`, linked from chat cards).
 *
 * Checks what the page promises: names only (a value is never rendered),
 * grants readable as "what → who, until when", and changes locked behind the
 * passphrase when this tab holds no unlock proof (e.g. after a reload).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ApiError } from '@/services/api'
import { MemoryRouter } from 'react-router-dom'
import { VaultPage } from '../VaultPage'
import type { VaultOverview } from '@/services/vault'

let proofHeld = true
const overview = vi.fn<() => Promise<VaultOverview>>()
const createGrant = vi.fn()
const putSecret = vi.fn()
const deleteSecret = vi.fn()
const revokeGrant = vi.fn()
const listProviders = vi.fn()
vi.mock('@/services/providers', async (orig) => ({
  ...(await orig<typeof import('@/services/providers')>()),
  providersApi: { list: (...a: unknown[]) => listProviders(...a) },
}))
vi.mock('@/services/vault', async (orig) => ({
  ...(await orig<typeof import('@/services/vault')>()),
  vaultApi: {
    overview: () => overview(),
    createGrant: (...a: unknown[]) => createGrant(...a),
    putSecret: (...a: unknown[]) => putSecret(...a),
    deleteSecret: (...a: unknown[]) => deleteSecret(...a),
    revokeGrant: (...a: unknown[]) => revokeGrant(...a),
  },
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
  putSecret.mockReset().mockResolvedValue(undefined)
  deleteSecret.mockReset().mockResolvedValue(undefined)
  revokeGrant.mockReset().mockResolvedValue(undefined)
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
    const valueField = screen.getByLabelText('Valeur du secret') as HTMLTextAreaElement
    expect(valueField.dataset.masked).toBe('true')
    expect(valueField.value).toBe('')
  })

  it('asks the passphrase before any change when this tab holds no proof', async () => {
    proofHeld = false
    overview.mockResolvedValue(OPEN)
    mount()
    expect(await screen.findByText(/enter the passphrase to make changes/)).toBeTruthy()
    expect(screen.queryByLabelText('Valeur du secret')).toBeNull()
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

  it('shows an existing provider grant as "Instance de provider : <id>", not as a blank scope', async () => {
    overview.mockResolvedValue({
      ...OPEN,
      grants: [{ ...OPEN.grants[0], id: 'g2', scope: { kind: 'provider', value: 'deepseek' } }],
    })
    mount()
    expect(await screen.findByText(/→ Instance de provider : deepseek/)).toBeTruthy()
  })

  describe('secrets', () => {
    const KEY = '-----BEGIN OPENSSH PRIVATE KEY-----\nTOPSECRETLINE1\nTOPSECRETLINE2\n-----END OPENSSH PRIVATE KEY-----\n'
    const fill = (name: string, value: string) => {
      fireEvent.change(screen.getByLabelText('Nom du secret'), { target: { value: name } })
      fireEvent.change(screen.getByLabelText('Valeur du secret'), { target: { value } })
    }
    const consoleSpies = () =>
      (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}))

    it('is masked by default, toggles, and gives the SSH hint', async () => {
      overview.mockResolvedValue(OPEN)
      mount()
      const field = (await screen.findByLabelText('Valeur du secret')) as HTMLTextAreaElement
      expect(field.tagName).toBe('TEXTAREA')
      expect(field.dataset.masked).toBe('true')
      expect(field.className).toContain('text-security')
      expect(field.getAttribute('autocomplete')).toBe('off')
      expect(field.getAttribute('spellcheck')).toBe('false')
      fireEvent.click(screen.getByRole('button', { name: 'Afficher' }))
      expect(field.dataset.masked).toBe('false')
      fireEvent.click(screen.getByRole('button', { name: 'Masquer' }))
      expect(field.dataset.masked).toBe('true')
      expect(screen.getByText(/clé dédiée, sans phrase/)).toBeTruthy()
    })

    it('sends exactly {name, value} (multi-line kept) and clears the field', async () => {
      overview.mockResolvedValue(OPEN)
      mount()
      await screen.findByLabelText('Nom du secret')
      fill('ssh-vps', KEY)
      fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
      await waitFor(() => expect(putSecret).toHaveBeenCalledTimes(1))
      expect(putSecret).toHaveBeenCalledWith('ssh-vps', KEY, undefined)
      await waitFor(() => expect((screen.getByLabelText('Valeur du secret') as HTMLTextAreaElement).value).toBe(''))
      expect(document.body.innerHTML).not.toContain('TOPSECRETLINE')
    })

    it('on failure: clears the value, guides to unlock, and echoes nothing (DOM, console)', async () => {
      const spies = consoleSpies()
      putSecret.mockRejectedValue(new ApiError(409, `vault is locked (${KEY})`))
      overview.mockResolvedValue(OPEN)
      mount()
      await screen.findByLabelText('Nom du secret')
      fill('ssh-vps', KEY)
      fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
      const alert = await screen.findByText(/Le coffre est verrouillé/)
      expect(alert.textContent).toContain('déverrouillez-le')
      expect((screen.getByLabelText('Valeur du secret') as HTMLTextAreaElement).value).toBe('')
      expect(document.body.innerHTML).not.toContain('TOPSECRETLINE')
      for (const spy of spies) expect(JSON.stringify(spy.mock.calls)).not.toContain('TOPSECRET')
      spies.forEach((x) => x.mockRestore())
    })

    it('rejects names the backend would reject', async () => {
      overview.mockResolvedValue(OPEN)
      mount()
      await screen.findByLabelText('Nom du secret')
      fill('bad name/x', KEY)
      expect(screen.getByText(/Nom invalide/)).toBeTruthy()
      expect((screen.getByRole('button', { name: 'Enregistrer' }) as HTMLButtonElement).disabled).toBe(true)
    })

    it('asks before overwriting an existing name', async () => {
      overview.mockResolvedValue(OPEN)
      mount()
      await screen.findByLabelText('Nom du secret')
      fill('acme-api-token', KEY)
      fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
      expect(putSecret).not.toHaveBeenCalled()
      expect(screen.getByText(/existe déjà/)).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
      expect(putSecret).not.toHaveBeenCalled()
      fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
      fireEvent.click(screen.getByRole('button', { name: 'Remplacer' }))
      await waitFor(() => expect(putSecret).toHaveBeenCalledWith('acme-api-token', KEY, undefined))
    })

    it('deletes only after a second explicit click', async () => {
      overview.mockResolvedValue(OPEN)
      mount()
      fireEvent.click(await screen.findByRole('button', { name: 'Supprimer le secret acme-api-token' }))
      expect(deleteSecret).not.toHaveBeenCalled()
      fireEvent.click(screen.getByRole('button', { name: 'Confirmer la suppression' }))
      await waitFor(() => expect(deleteSecret).toHaveBeenCalledWith('acme-api-token'))
    })

    it('revokes a grant only after confirmation', async () => {
      overview.mockResolvedValue(OPEN)
      mount()
      fireEvent.click(await screen.findByRole('button', { name: 'Revoke' }))
      expect(revokeGrant).not.toHaveBeenCalled()
      fireEvent.click(screen.getByRole('button', { name: 'Confirmer la révocation' }))
      await waitFor(() => expect(revokeGrant).toHaveBeenCalledWith('g1'))
    })

    it('never renders a value field from the response, only metadata', async () => {
      overview.mockResolvedValue({
        ...OPEN,
        secrets: [{ ...OPEN.secrets[0], value: 'LEAKED-VALUE', size: 12 } as never],
      })
      mount()
      await screen.findByText(/créé .* modifié/)
      expect(document.body.innerHTML).not.toContain('LEAKED-VALUE')
    })

    it('lists pending agent requests with the shared answer card', async () => {
      overview.mockResolvedValue({
        ...OPEN,
        requests: [
          { id: 'r1', name: 'deploy-key', reason: 'deploy', session_id: 's1', exists: false, created_at: '2026-10-01T00:00:00Z' },
        ],
      })
      mount()
      expect(await screen.findByText('Demandes en attente')).toBeTruthy()
      expect(screen.getByText('deploy-key')).toBeTruthy()
    })
  })
})
