/**
 * Edit form of an instance (adding goes through the wizard): validation, test
 * before save, the PATCH shape, and the rule that no secret value goes through it.
 *
 * Run with: npx vitest run src/components/settings/ProviderInstanceForm.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'

const test = vi.fn()
const update = vi.fn()
const overview = vi.fn()
vi.mock('@/services/providers', async (orig) => ({
  ...(await orig<typeof import('@/services/providers')>()),
  providersApi: {
    test: (...a: unknown[]) => test(...a),
    update: (...a: unknown[]) => update(...a),
    create: vi.fn(),
    status: vi.fn(),
    list: vi.fn(),
  },
}))
vi.mock('@/services/vault', async (orig) => ({
  ...(await orig<typeof import('@/services/vault')>()),
  vaultApi: { overview: () => overview() },
}))

import { ApiError } from '@/services/api'
import { validateBaseUrl } from '@/constants/providerSettings'
import { validateBaseUrlFr } from '@/constants/providerWizard'
import { ProviderInstanceForm } from './ProviderInstanceForm'
import { DEEPSEEK, LOCAL, mountSettings } from './settingsTestKit'
import type { ProviderInstance } from '@/types/provider'

const onSaved = vi.fn()
const onCancel = vi.fn()

function mount(instance: ProviderInstance = DEEPSEEK) {
  return mountSettings(<ProviderInstanceForm instance={instance} onSaved={onSaved} onCancel={onCancel} />)
}
const field = (name: RegExp | string) => screen.getByLabelText(name) as HTMLInputElement
function pick(combo: string, option: string) {
  const trigger = screen.getByRole('combobox', { name: combo })
  fireEvent.click(trigger)
  const listbox = document.getElementById(trigger.getAttribute('aria-controls')!)!
  fireEvent.click(within(listbox).getByRole('option', { name: option, hidden: true }))
}

beforeEach(() => {
  for (const m of [test, update, onSaved, onCancel]) m.mockReset()
  update.mockResolvedValue({})
  overview.mockReset().mockResolvedValue({ secrets: [{ name: 'my-nim-key' }, { name: 'deepseek-key' }] })
})

describe('validateBaseUrl (and its French twin)', () => {
  it.each(['https://api.deepseek.com', 'http://localhost:11434/v1', 'http://127.0.0.1:8000/v1', 'http://[::1]:8080/v1'])(
    'accepts %s',
    (url) => {
      expect(validateBaseUrl(url)).toBeNull()
      expect(validateBaseUrlFr(url)).toBeNull()
    },
  )
  it.each(['http://example.com/v1', 'ftp://localhost', 'not a url', ''])('refuses %s', (url) => {
    expect(validateBaseUrl(url)).not.toBeNull()
    expect(validateBaseUrlFr(url)).not.toBeNull()
  })
})

describe('ProviderInstanceForm (edit)', () => {
  it('keeps the id fixed and PATCHes without id or kind', async () => {
    mount()
    expect(field('Identifiant').disabled).toBe(true)
    fireEvent.change(field('Nom affiché'), { target: { value: 'DS prod' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
    const [id, patch] = update.mock.calls[0] as [string, Record<string, unknown>]
    expect(id).toBe('deepseek')
    expect(patch.label).toBe('DS prod')
    expect(patch).not.toHaveProperty('id')
    expect(patch).not.toHaveProperty('kind')
    expect(patch.credential_ref).toBe('vault:deepseek-key')
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
  })

  it('refuses plain http outside loopback and sends nothing', async () => {
    mount()
    fireEvent.change(field('URL de base'), { target: { value: 'http://example.com/v1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByText(/Utilisez https/)).toBeTruthy()
    expect(update).not.toHaveBeenCalled()
  })

  it('offers the vault secret NAMES and saves a reference, with no secret-like field in the body', async () => {
    mount()
    await screen.findByRole('combobox', { name: 'Clé du coffre' })
    pick('Clé du coffre', 'my-nim-key')
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
    const body = update.mock.calls[0][1] as Record<string, unknown>
    expect(body.credential_ref).toBe('vault:my-nim-key')
    for (const forbidden of ['api_key', 'key', 'secret', 'token', 'value', 'password']) expect(body).not.toHaveProperty(forbidden)
  })

  it('has no password input and no value field, and links to the vault', () => {
    const { container } = mount()
    expect(container.querySelector('input[type="password"]')).toBeNull()
    expect(screen.queryByLabelText(/clé d’api|api key|valeur|token/i)).toBeNull()
    expect(screen.getByRole('link', { name: 'Ajouter ou remplacer la clé dans le coffre' }).getAttribute('href')).toBe('/vault')
  })

  it('an environment credential is a variable NAME', async () => {
    mount()
    pick('Référence de la clé', 'Variable d’environnement du serveur')
    fireEvent.change(field('Nom de la variable'), { target: { value: 'MY_KEY' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(update).toHaveBeenCalled())
    expect((update.mock.calls[0][1] as { credential_ref: string }).credential_ref).toBe('env:MY_KEY')
  })

  it('shows the test result: models, tools, window', async () => {
    test.mockResolvedValue({
      ok: true,
      health: { state: 'ok' },
      models: [{ id: 'm1' }, { id: 'm2' }],
      probe: { tools: true, context_window: 131072 },
    })
    mount(LOCAL)
    fireEvent.click(screen.getByRole('button', { name: 'Tester' }))
    const result = await screen.findByTestId('provider-test-result')
    expect(result.textContent).toContain('2 modèles trouvés : m1, m2')
    expect(result.textContent).toContain('Appel d’outil : oui')
    expect(result.textContent).toMatch(/131\s072/)
    expect(test.mock.calls[0][0]).toMatchObject({ id: 'local-llama', credential_ref: 'none' })
  })

  it('a locked vault shows the credentials_locked card', async () => {
    test.mockResolvedValue({ ok: false, health: { state: 'auth_required', code: 'credentials_locked' } })
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Tester' }))
    const card = await screen.findByTestId('provider-test-error')
    expect(card.getAttribute('data-error-code')).toBe('credentials_locked')
  })

  it('saving after a failed test asks for an explicit confirmation', async () => {
    test.mockResolvedValue({ ok: false, health: { state: 'unreachable' } })
    mount(LOCAL)
    fireEvent.click(screen.getByRole('button', { name: 'Tester' }))
    await screen.findByText('La connexion a échoué.')
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(update).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole('button', { name: 'Enregistrer quand même' }))
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
  })

  it('a 403 reads as the human-only rule, in French', async () => {
    update.mockRejectedValue(new ApiError(403, '{"error":"forbidden"}'))
    mount(LOCAL)
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Seule une personne connectée peut faire ce changement (un agent ne le peut pas).',
    )
  })

  it('a codex instance has no URL field and its patch carries no base_url', async () => {
    mount({ ...LOCAL, id: 'codex', kind: 'codex', base_url: undefined, label: 'Codex' })
    expect(screen.queryByLabelText('URL de base')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(update).toHaveBeenCalled())
    expect(update.mock.calls[0][1]).not.toHaveProperty('base_url')
  })

  it('actions are kit buttons, right-aligned in one footer', () => {
    mount()
    const save = screen.getByRole('button', { name: 'Enregistrer' })
    expect(save.parentElement!.className).toContain('justify-end')
    for (const name of ['Annuler', 'Tester', 'Enregistrer']) {
      expect(screen.getByRole('button', { name }).className).toMatch(/inline-flex items-center justify-center font-medium rounded-lg[\s\S]*min-h-9 px-3 py-2 text-sm/)
    }
  })
})
