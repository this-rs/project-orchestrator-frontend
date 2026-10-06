/**
 * "Ajouter un provider" wizard: steps, presets, validation, what blocks
 * "Suivant", the chain secret → instance → grant → test, a failure half-way,
 * a locked vault, consent, and that only kit buttons are used.
 *
 * Run with: npx vitest run src/components/settings/ProviderWizard.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'

const test = vi.fn()
const create = vi.fn()
const remove = vi.fn()
const allow = vi.fn()
const list = vi.fn()
vi.mock('@/services/providers', async (orig) => ({
  ...(await orig<typeof import('@/services/providers')>()),
  providersApi: {
    test: (...a: unknown[]) => test(...a),
    create: (...a: unknown[]) => create(...a),
    remove: (...a: unknown[]) => remove(...a),
    allow: (...a: unknown[]) => allow(...a),
    list: (...a: unknown[]) => list(...a),
    status: vi.fn(),
  },
}))

const overview = vi.fn()
const putSecret = vi.fn()
const createGrant = vi.fn()
const deleteSecret = vi.fn()
const revokeGrant = vi.fn()
let proof = true
vi.mock('@/services/vault', async (orig) => ({
  ...(await orig<typeof import('@/services/vault')>()),
  hasUnlockProof: () => proof,
  vaultApi: {
    overview: () => overview(),
    putSecret: (...a: unknown[]) => putSecret(...a),
    createGrant: (...a: unknown[]) => createGrant(...a),
    deleteSecret: (...a: unknown[]) => deleteSecret(...a),
    revokeGrant: (...a: unknown[]) => revokeGrant(...a),
    unlock: vi.fn(),
    lock: vi.fn(),
    init: vi.fn(),
  },
}))
vi.mock('@/services/projects', () => ({
  projectsApi: { list: vi.fn().mockResolvedValue({ items: [{ slug: 'acme', name: 'Acme' }] }) },
}))

import { ApiError } from '@/services/api'
import { ProviderWizard } from './ProviderWizard'
import { CLAUDE, DEEPSEEK, mountSettings, response } from './settingsTestKit'

const onClose = vi.fn()
const onFinished = vi.fn()
const OPEN_VAULT = {
  initialized: true,
  unlocked_until: '2999-01-01T00:00:00Z',
  secret_count: 1,
  unavailable: null,
  secrets: [{ name: 'old-key', created_at: '', updated_at: '' }],
  grants: [],
  requests: [],
}

function mount() {
  return mountSettings(<ProviderWizard existingIds={['claude-code', 'deepseek']} onClose={onClose} onFinished={onFinished} />, {
    providers: [CLAUDE, DEEPSEEK],
    list,
  })
}
const field = (name: string | RegExp) => screen.getByLabelText(name) as HTMLInputElement
const button = (name: string | RegExp) => screen.getByRole('button', { name })
const current = () => screen.getByRole('list', { name: 'Étapes de l’assistant' }).querySelector('[aria-current="step"]')?.textContent

/** Pick an option of a kit Select (a combobox + listbox, not a native select). */
function pick(combo: string, option: string) {
  const trigger = screen.getByRole('combobox', { name: combo })
  fireEvent.click(trigger)
  const listbox = document.getElementById(trigger.getAttribute('aria-controls')!)!
  fireEvent.click(within(listbox).getByRole('option', { name: option, hidden: true }))
}

beforeEach(() => {
  list.mockReset().mockResolvedValue(response([CLAUDE, DEEPSEEK]))
  for (const m of [test, create, remove, allow, putSecret, createGrant, deleteSecret, revokeGrant, onClose, onFinished]) m.mockReset()
  proof = true
  overview.mockReset().mockResolvedValue(OPEN_VAULT)
  create.mockResolvedValue({})
  remove.mockResolvedValue(undefined)
  allow.mockResolvedValue({})
  putSecret.mockResolvedValue({})
  createGrant.mockResolvedValue({ id: 'grant-1' })
  deleteSecret.mockResolvedValue({})
  revokeGrant.mockResolvedValue({})
  test.mockResolvedValue({ ok: true, health: { state: 'ok' }, models: [{ id: 'qwen3' }, { id: 'llama3' }], probe: { tools: true, context_window: 131072 } })
})

describe('ProviderWizard — steps and presets', () => {
  it('shows five numbered steps and starts on "Modèle"', () => {
    mount()
    const steps = within(screen.getByRole('list', { name: 'Étapes de l’assistant' })).getAllByRole('listitem')
    expect(steps.map((s) => s.textContent)).toEqual(['1Modèle', '2Clé', '3Connexion', '4Projet', '5Récapitulatif'])
    expect(current()).toContain('Modèle')
    expect(screen.getByText('Étape 1 sur 5')).toBeTruthy()
  })

  it('a preset pre-fills id, label, base URL, model, cost and the kind of key', () => {
    mount()
    fireEvent.click(screen.getByRole('radio', { name: /Ollama \(local\)/ }))
    expect(field('Identifiant').value).toBe('ollama')
    expect(field('Nom affiché').value).toBe('Ollama (local)')
    expect(field('URL de base').value).toBe('http://localhost:11434/v1')
    expect(screen.getByRole('combobox', { name: 'Source du coût' }).textContent).toContain('Gratuit (local)')
    fireEvent.click(button('Suivant'))
    expect((screen.getByRole('radio', { name: /Aucune clé/ }) as HTMLInputElement).checked).toBe(true)
    expect(screen.getByTestId('wizard-credential-ref').textContent).toBe('none')
  })

  it('DeepSeek pre-fills its model and a vault key named after the id', () => {
    mount()
    fireEvent.change(field('Identifiant'), { target: { value: 'ds' } })
    expect(field('Modèle par défaut').value).toBe('deepseek-chat')
    expect(field('URL de base').value).toBe('https://api.deepseek.com')
    fireEvent.click(button('Suivant'))
    expect((screen.getByRole('radio', { name: /Saisir une nouvelle clé/ }) as HTMLInputElement).checked).toBe(true)
    expect(field('Nom dans le coffre').value).toBe('ds')
    expect(screen.getByTestId('wizard-credential-ref').textContent).toBe('vault:ds')
  })

  it('Codex and opencode (ACP) have no URL field; ACP only allows no key', () => {
    mount()
    fireEvent.click(screen.getByRole('radio', { name: /opencode \(ACP\)/ }))
    expect(screen.queryByLabelText('URL de base')).toBeNull()
    expect(screen.getByText(/CHAT_PROVIDER_ACP_COMMANDS/, { selector: 'p' })).toBeTruthy()
    fireEvent.click(button('Suivant'))
    expect((screen.getByRole('radio', { name: /Saisir une nouvelle clé/ }) as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByRole('radio', { name: /Aucune clé/ }) as HTMLInputElement).checked).toBe(true)
  })

  it('"Précédent" goes back and keeps what was typed', () => {
    mount()
    fireEvent.click(screen.getByRole('radio', { name: /Ollama/ }))
    fireEvent.change(field('Identifiant'), { target: { value: 'my-ollama' } })
    fireEvent.click(button('Suivant'))
    expect(current()).toContain('Clé')
    fireEvent.click(button('Précédent'))
    expect(current()).toContain('Modèle')
    expect(field('Identifiant').value).toBe('my-ollama')
  })
})

describe('ProviderWizard — validation blocks "Suivant"', () => {
  it('a taken id blocks the step and says why', () => {
    mount()
    // The DeepSeek preset suggests `deepseek`, which exists already.
    expect((button('Suivant') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByTestId('wizard-blocker').textContent).toContain('Un provider porte déjà cet identifiant.')
    fireEvent.change(field('Identifiant'), { target: { value: 'deepseek-2' } })
    expect((button('Suivant') as HTMLButtonElement).disabled).toBe(false)
  })

  it.each([
    ['Mon_ID', 'Lettres minuscules'],
    ['claude-code', 'réservé'],
  ])('refuses the id %s', (id, msg) => {
    mount()
    fireEvent.change(field('Identifiant'), { target: { value: id } })
    fireEvent.blur(field('Identifiant'))
    expect((button('Suivant') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('alert').textContent).toContain(msg)
  })

  it('refuses plain http outside loopback', () => {
    mount()
    fireEvent.change(field('Identifiant'), { target: { value: 'x' } })
    fireEvent.change(field('URL de base'), { target: { value: 'http://example.com/v1' } })
    fireEvent.blur(field('URL de base'))
    expect((button('Suivant') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('alert').textContent).toContain('Utilisez https')
  })

  it('step 2: a new key must be typed, and an existing vault name is never overwritten', async () => {
    mount()
    fireEvent.change(field('Identifiant'), { target: { value: 'ds' } })
    fireEvent.click(button('Suivant'))
    await screen.findByTestId('wizard-vault-open')
    const go = button('Enregistrer et tester') as HTMLButtonElement
    expect(go.disabled).toBe(true)
    expect(screen.getByTestId('wizard-blocker').textContent).toContain('Saisissez la clé')
    fireEvent.change(field('Clé d’API'), { target: { value: 'sk-x' } })
    fireEvent.change(field('Nom dans le coffre'), { target: { value: 'old-key' } })
    expect(go.disabled).toBe(true)
    expect(screen.getByTestId('wizard-blocker').textContent).toContain('Une clé porte déjà ce nom dans le coffre')
    fireEvent.change(field('Nom dans le coffre'), { target: { value: 'ds-key' } })
    expect(go.disabled).toBe(false)
  })

  it('step 2: an env reference needs a variable name', () => {
    mount()
    fireEvent.change(field('Identifiant'), { target: { value: 'ds' } })
    fireEvent.click(button('Suivant'))
    fireEvent.click(screen.getByRole('radio', { name: /Variable d’environnement/ }))
    expect((button('Enregistrer et tester') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(field('Nom de la variable'), { target: { value: 'DEEPSEEK_API_KEY' } })
    expect(screen.getByTestId('wizard-credential-ref').textContent).toBe('env:DEEPSEEK_API_KEY')
    expect((button('Enregistrer et tester') as HTMLButtonElement).disabled).toBe(false)
  })

  it('a locked vault: the unlock flow of the vault page is shown, and nothing is written', async () => {
    proof = false
    overview.mockResolvedValue({ ...OPEN_VAULT, unlocked_until: null })
    mount()
    fireEvent.change(field('Identifiant'), { target: { value: 'ds' } })
    fireEvent.click(button('Suivant'))
    const locked = await screen.findByTestId('wizard-vault-locked')
    expect(within(locked).getByLabelText('Vault passphrase')).toBeTruthy()
    fireEvent.change(field('Clé d’API'), { target: { value: 'sk-locked' } })
    const go = button('Enregistrer et tester') as HTMLButtonElement
    expect(go.disabled).toBe(true)
    expect(screen.getByTestId('wizard-blocker').textContent).toContain('Déverrouillez le coffre')
    fireEvent.click(go)
    expect(putSecret).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })
})

describe('ProviderWizard — the chain and the test', () => {
  it('no key (Ollama): create → test, readable verdict, consent bound to the origin, summary, finish', async () => {
    mount()
    fireEvent.click(screen.getByRole('radio', { name: /Ollama/ }))
    fireEvent.click(button('Suivant'))
    fireEvent.click(button('Enregistrer et tester'))
    const result = await screen.findByTestId('wizard-test-result')
    expect(result.textContent).toContain('La connexion fonctionne.')
    expect(result.textContent).toContain('2 trouvés : qwen3, llama3')
    expect(result.textContent).toContain('Appel d’outil')
    expect(result.textContent).toContain('131')
    expect(create).toHaveBeenCalledTimes(1)
    expect(create.mock.calls[0][0]).toMatchObject({ id: 'ollama', kind: 'openai_compatible', preset: 'ollama', credential_ref: 'none' })
    expect(putSecret).not.toHaveBeenCalled()
    expect(createGrant).not.toHaveBeenCalled()
    expect(screen.getByTestId('wizard-task-instance').getAttribute('data-state')).toBe('done')
    expect(screen.getByTestId('wizard-task-test').getAttribute('data-state')).toBe('done')
    expect(screen.queryByTestId('wizard-task-secret')).toBeNull()

    fireEvent.click(button('Suivant'))
    expect(current()).toContain('Projet')
    expect(screen.getByTestId('wizard-origin').textContent).toBe('http://localhost:11434')
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Projet' }).hasAttribute('disabled')).toBe(false))
    pick('Projet', 'Acme')
    fireEvent.click(button('Autoriser http://localhost:11434'))
    await screen.findByTestId('wizard-consented')
    expect(allow).toHaveBeenCalledWith('acme', 'ollama', 'http://localhost:11434')

    fireEvent.click(button('Suivant'))
    const summary = screen.getByTestId('wizard-summary')
    expect(summary.textContent).toContain('ollama')
    expect(summary.textContent).toContain('réussi')
    expect(summary.textContent).toContain('acme autorisé')
    fireEvent.click(button('Terminer'))
    expect(onFinished).toHaveBeenCalledWith('ollama')
  })

  it('the project step can be skipped', async () => {
    mount()
    fireEvent.click(screen.getByRole('radio', { name: /Ollama/ }))
    fireEvent.click(button('Suivant'))
    fireEvent.click(button('Enregistrer et tester'))
    await screen.findByTestId('wizard-test-result')
    fireEvent.click(button('Suivant'))
    fireEvent.click(button('Passer cette étape'))
    expect(screen.getByTestId('wizard-summary').textContent).toContain('aucun autorisé')
  })

  it('a failed test is translated from its code, and does not hide that the instance exists', async () => {
    test.mockResolvedValue({ ok: false, health: { state: 'unreachable', code: 'endpoint_unreachable' } })
    mount()
    fireEvent.click(screen.getByRole('radio', { name: /Ollama/ }))
    fireEvent.click(button('Suivant'))
    fireEvent.click(button('Enregistrer et tester'))
    const result = await screen.findByTestId('wizard-test-result')
    expect(result.textContent).toContain('Échec du test')
    expect(screen.getByTestId('wizard-test-problem').textContent).toBe('Le point d’accès ne répond pas. Vérifiez l’URL et que le service tourne.')
    expect(result.textContent).toContain('Non')
    expect(screen.getByText(/Vous pouvez continuer : l’instance existe/)).toBeTruthy()
    test.mockResolvedValue({ ok: true, health: { state: 'ok' }, models: [] })
    fireEvent.click(button('Tester à nouveau'))
    await waitFor(() => expect(screen.getByTestId('wizard-test-result').textContent).toContain('La connexion fonctionne.'))
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('a new key: secret → instance → grant → test, in that order, with the reference only in the instance body', async () => {
    mount()
    fireEvent.change(field('Identifiant'), { target: { value: 'ds' } })
    fireEvent.click(button('Suivant'))
    await screen.findByTestId('wizard-vault-open')
    fireEvent.change(field('Clé d’API'), { target: { value: 'sk-very-secret' } })
    pick('Durée de l’accord', '7 jours')
    fireEvent.click(button('Enregistrer et tester'))
    await screen.findByTestId('wizard-test-result')
    expect(putSecret).toHaveBeenCalledWith('ds', 'sk-very-secret', expect.any(String))
    expect(createGrant).toHaveBeenCalledWith({
      secrets: { kind: 'names', names: ['ds'] },
      scope: { kind: 'provider', value: 'ds' },
      minutes: 10080,
      note: 'Provider ds',
    })
    const order = [putSecret, create, createGrant, test].map((m) => m.mock.invocationCallOrder[0])
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    for (const body of [create.mock.calls[0][0], test.mock.calls[0][0]] as Record<string, unknown>[]) {
      expect(body.credential_ref).toBe('vault:ds')
      expect(JSON.stringify(body)).not.toContain('sk-very-secret')
      for (const k of ['api_key', 'key', 'secret', 'token', 'value', 'password']) expect(body).not.toHaveProperty(k)
    }
  })

  it('a key already in the vault: no secret is written, the grant names that key', async () => {
    mount()
    fireEvent.change(field('Identifiant'), { target: { value: 'ds' } })
    fireEvent.click(button('Suivant'))
    await screen.findByTestId('wizard-vault-open')
    fireEvent.click(screen.getByRole('radio', { name: /Clé déjà dans le coffre/ }))
    pick('Clé du coffre', 'old-key')
    fireEvent.click(button('Enregistrer et tester'))
    await screen.findByTestId('wizard-test-result')
    expect(putSecret).not.toHaveBeenCalled()
    expect(create.mock.calls[0][0]).toMatchObject({ credential_ref: 'vault:old-key' })
    expect(createGrant.mock.calls[0][0]).toMatchObject({ secrets: { kind: 'names', names: ['old-key'] } })
  })

  it('a failure half-way says exactly what exists, offers to resume, or to cancel and remove it', async () => {
    create.mockRejectedValueOnce(new ApiError(409, '{"error":"security_gate_closed: authentication is off"}'))
    mount()
    fireEvent.change(field('Identifiant'), { target: { value: 'ds' } })
    fireEvent.click(button('Suivant'))
    await screen.findByTestId('wizard-vault-open')
    fireEvent.change(field('Clé d’API'), { target: { value: 'sk-half-way' } })
    fireEvent.click(button('Enregistrer et tester'))
    const failure = await screen.findByTestId('wizard-failure')
    expect(failure.textContent).toContain('Échec : Créer l’instance.')
    expect(failure.textContent).toContain('authentification soit activée')
    expect(screen.getByTestId('wizard-already-done').textContent).toBe(
      'Déjà fait : la clé « ds » est enregistrée dans le coffre. Rien d’autre n’a été créé.',
    )
    expect(screen.getByTestId('wizard-task-secret').getAttribute('data-state')).toBe('done')
    expect(screen.getByTestId('wizard-task-instance').getAttribute('data-state')).toBe('error')
    expect(screen.getByTestId('wizard-task-grant').getAttribute('data-state')).toBe('todo')
    expect((button('Suivant') as HTMLButtonElement).disabled).toBe(true)
    expect((button('Précédent') as HTMLButtonElement).disabled).toBe(true)
    expect(document.body.innerHTML).not.toContain('sk-half-way')

    // Cancel: removes the secret THIS wizard wrote, and nothing else.
    fireEvent.click(within(failure).getByRole('button', { name: 'Annuler et supprimer ce qui a été créé' }))
    const confirm = screen.getByRole('alertdialog')
    expect(confirm.textContent).toContain('la clé « ds » est enregistrée dans le coffre')
    fireEvent.click(within(confirm).getByRole('button', { name: 'Supprimer ce qui a été créé' }))
    await waitFor(() => expect(deleteSecret).toHaveBeenCalledWith('ds'))
    expect(remove).not.toHaveBeenCalled()
    expect(revokeGrant).not.toHaveBeenCalled()
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('"Reprendre" continues from the failed sub-step without writing the secret again', async () => {
    createGrant.mockRejectedValueOnce(new ApiError(400, '{"error":"a provider grant names its secret"}'))
    mount()
    fireEvent.change(field('Identifiant'), { target: { value: 'ds' } })
    fireEvent.click(button('Suivant'))
    await screen.findByTestId('wizard-vault-open')
    fireEvent.change(field('Clé d’API'), { target: { value: 'sk-resume' } })
    fireEvent.click(button('Enregistrer et tester'))
    await screen.findByTestId('wizard-failure')
    expect(screen.getByTestId('wizard-already-done').textContent).toContain('l’instance « ds » est créée')
    fireEvent.click(button('Reprendre'))
    await screen.findByTestId('wizard-test-result')
    expect(putSecret).toHaveBeenCalledTimes(1)
    expect(create).toHaveBeenCalledTimes(1)
    expect(createGrant).toHaveBeenCalledTimes(2)
    expect((button('Suivant') as HTMLButtonElement).disabled).toBe(false)
  })

  it('a failure before anything exists says so, and sends back to the key step', async () => {
    putSecret.mockRejectedValueOnce(new ApiError(409, '{"error":"vault locked"}'))
    mount()
    fireEvent.change(field('Identifiant'), { target: { value: 'ds' } })
    fireEvent.click(button('Suivant'))
    await screen.findByTestId('wizard-vault-open')
    fireEvent.change(field('Clé d’API'), { target: { value: 'sk-first' } })
    fireEvent.click(button('Enregistrer et tester'))
    await screen.findByTestId('wizard-failure')
    expect(screen.getByTestId('wizard-already-done').textContent).toBe('Rien n’a été créé : ni clé, ni instance, ni accord.')
    expect(create).not.toHaveBeenCalled()
    fireEvent.click(button('Revenir à l’étape Clé'))
    expect(current()).toContain('Clé')
    expect(field('Clé d’API').value).toBe('')
  })

  it('cancelling with nothing created just closes', () => {
    mount()
    fireEvent.click(button('Annuler'))
    expect(onClose).toHaveBeenCalled()
  })
})

describe('ProviderWizard — buttons', () => {
  it('every button is a kit Button (or part of a kit Select), with one size per zone', async () => {
    proof = false
    overview.mockResolvedValue({ ...OPEN_VAULT, unlocked_until: null })
    const { container } = mount()
    const check = () => {
      const wizard = container.querySelector('[data-testid="provider-wizard"]')!
      for (const b of wizard.querySelectorAll('button')) {
        const role = b.getAttribute('role')
        if (role === 'combobox' || role === 'option') continue
        expect(b.className).toMatch(/inline-flex items-center justify-center font-medium rounded-lg/)
      }
      const footer = wizard.querySelector('footer')!
      const sizes = new Set([...footer.querySelectorAll('button')].map((b) => /min-h-9 px-3 py-2 text-sm/.test(b.className)))
      expect(sizes).toEqual(new Set([true]))
    }
    check()
    fireEvent.change(field('Identifiant'), { target: { value: 'ds' } })
    fireEvent.click(button('Suivant'))
    await screen.findByTestId('wizard-vault-locked')
    check()
  })

  it('the main actions sit on the right of a single footer', () => {
    const { container } = mount()
    const footers = container.querySelectorAll('[data-testid="provider-wizard"] footer')
    expect(footers).toHaveLength(1)
    const right = within(footers[0] as HTMLElement).getByRole('button', { name: 'Suivant' }).parentElement!
    expect(right.className).toContain('justify-end')
  })
})

describe('ProviderWizard — list refresh', () => {
  it('re-reads the provider list once the instance exists', async () => {
    list.mockResolvedValue(response([CLAUDE, DEEPSEEK]))
    mount()
    // Let the mount's own load settle first (overlapping loads share one request).
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
    const before = list.mock.calls.length
    fireEvent.click(screen.getByRole('radio', { name: /Ollama/ }))
    fireEvent.click(button('Suivant'))
    fireEvent.click(button('Enregistrer et tester'))
    await screen.findByTestId('wizard-test-result')
    await waitFor(() => expect(list.mock.calls.length).toBeGreaterThan(before))
  })
})
