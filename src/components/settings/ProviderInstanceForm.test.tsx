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
const get = vi.fn()
const models = vi.fn()
const overview = vi.fn()
vi.mock('@/services/providers', async (orig) => ({
  ...(await orig<typeof import('@/services/providers')>()),
  providersApi: {
    test: (...a: unknown[]) => test(...a),
    update: (...a: unknown[]) => update(...a),
    get: (...a: unknown[]) => get(...a),
    models: (...a: unknown[]) => models(...a),
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
import { clearModelCatalogCache } from './useModelCatalog'
import { DEEPSEEK, LOCAL, REMOTE, mountSettings } from './settingsTestKit'
import type { ProviderInstance } from '@/types/provider'

const onSaved = vi.fn()
const onCancel = vi.fn()

async function mount(instance: ProviderInstance = DEEPSEEK) {
  const utils = mountSettings(
    <ProviderInstanceForm instance={instance} onSaved={onSaved} onCancel={onCancel} />
  )
  await screen.findByRole('form')
  return utils
}
const stored = (i: ProviderInstance) => ({
  id: i.id,
  kind: i.kind,
  preset: i.preset ?? null,
  label: i.label,
  base_url: i.base_url ?? null,
  origin: i.origin ?? null,
  default_model: i.default_model ?? null,
  cost_source: i.cost_source ?? null,
  credential_ref: i.credential_ref ?? null,
  host: i.host ?? null,
  ssh_user: i.ssh_user ?? null,
  ssh_port: i.ssh_port ?? null,
  remote_cwd: i.remote_cwd ?? null,
  allow_trust: i.allow_trust ?? false,
  host_key_fingerprint: i.host_key_fingerprint ?? null,
})
const field = (name: RegExp | string) => screen.getByLabelText(name) as HTMLInputElement
function pick(combo: string, option: string) {
  const trigger = screen.getByRole('combobox', { name: combo })
  fireEvent.click(trigger)
  const listbox = document.getElementById(trigger.getAttribute('aria-controls')!)!
  fireEvent.click(within(listbox).getByRole('option', { name: option, hidden: true }))
}

beforeEach(() => {
  for (const m of [test, update, onSaved, onCancel]) m.mockReset()
  clearModelCatalogCache()
  get
    .mockReset()
    .mockImplementation(async (id: string) =>
      stored([DEEPSEEK, LOCAL, REMOTE].find((i) => i.id === id) ?? { ...LOCAL, id })
    )
  models.mockReset().mockResolvedValue([])
  update.mockResolvedValue({})
  overview
    .mockReset()
    .mockResolvedValue({ secrets: [{ name: 'my-nim-key' }, { name: 'deepseek-key' }] })
})

describe('validateBaseUrl (and its French twin)', () => {
  it.each([
    'https://api.deepseek.com',
    'http://localhost:11434/v1',
    'http://127.0.0.1:8000/v1',
    'http://[::1]:8080/v1',
  ])('accepts %s', (url) => {
    expect(validateBaseUrl(url)).toBeNull()
    expect(validateBaseUrlFr(url)).toBeNull()
  })
  it.each(['http://example.com/v1', 'ftp://localhost', 'not a url', ''])('refuses %s', (url) => {
    expect(validateBaseUrl(url)).not.toBeNull()
    expect(validateBaseUrlFr(url)).not.toBeNull()
  })
})

describe('ProviderInstanceForm (edit)', () => {
  it('keeps the id fixed and PATCHes without id or kind', async () => {
    await mount()
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
    await mount()
    fireEvent.change(field('URL de base'), { target: { value: 'http://example.com/v1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByText(/Utilisez https/)).toBeTruthy()
    expect(update).not.toHaveBeenCalled()
  })

  it('offers the vault secret NAMES and saves a reference, with no secret-like field in the body', async () => {
    await mount()
    await screen.findByRole('combobox', { name: 'Clé du coffre' })
    pick('Clé du coffre', 'my-nim-key')
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
    const body = update.mock.calls[0][1] as Record<string, unknown>
    expect(body.credential_ref).toBe('vault:my-nim-key')
    for (const forbidden of ['api_key', 'key', 'secret', 'token', 'value', 'password'])
      expect(body).not.toHaveProperty(forbidden)
  })

  it('has no password input and no value field, and links to the vault', async () => {
    const { container } = await mount()
    expect(container.querySelector('input[type="password"]')).toBeNull()
    expect(screen.queryByLabelText(/clé d’api|api key|valeur|token/i)).toBeNull()
    expect(
      screen
        .getByRole('link', { name: 'Ajouter ou remplacer la clé dans le coffre' })
        .getAttribute('href')
    ).toBe('/vault')
  })

  it('an environment credential is a variable NAME', async () => {
    await mount()
    pick('Référence de la clé', 'Variable d’environnement du serveur')
    fireEvent.change(field('Nom de la variable'), { target: { value: 'MY_KEY' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(update).toHaveBeenCalled())
    expect((update.mock.calls[0][1] as { credential_ref: string }).credential_ref).toBe(
      'env:MY_KEY'
    )
  })

  it('shows the test result: models, tools, window', async () => {
    test.mockResolvedValue({
      ok: true,
      health: { state: 'ok' },
      models: [{ id: 'm1' }, { id: 'm2' }],
      probe: { tools: true, context_window: 131072 },
    })
    await mount(LOCAL)
    fireEvent.click(screen.getByRole('button', { name: 'Tester' }))
    const result = await screen.findByTestId('provider-test-result')
    expect(result.textContent).toContain('2 modèles trouvés : m1, m2')
    expect(result.textContent).toContain('Appel d’outil : oui')
    expect(result.textContent).toMatch(/131\s072/)
    expect(test.mock.calls[0][0]).toMatchObject({ id: 'local-llama', credential_ref: 'none' })
  })

  it('a locked vault shows the credentials_locked card', async () => {
    test.mockResolvedValue({
      ok: false,
      health: { state: 'auth_required', code: 'credentials_locked' },
    })
    await mount()
    fireEvent.click(screen.getByRole('button', { name: 'Tester' }))
    const card = await screen.findByTestId('provider-test-error')
    expect(card.getAttribute('data-error-code')).toBe('credentials_locked')
  })

  it('saving after a failed test asks for an explicit confirmation', async () => {
    test.mockResolvedValue({ ok: false, health: { state: 'unreachable' } })
    await mount(LOCAL)
    fireEvent.click(screen.getByRole('button', { name: 'Tester' }))
    await screen.findByText('La connexion a échoué.')
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(update).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole('button', { name: 'Enregistrer quand même' }))
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
  })

  it('a 403 reads as the human-only rule, in French', async () => {
    update.mockRejectedValue(new ApiError(403, '{"error":"forbidden"}'))
    await mount(LOCAL)
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Seule une personne connectée peut faire ce changement (un agent ne le peut pas).'
    )
  })

  it('a codex instance has no URL field and its patch carries no base_url', async () => {
    const codex = { ...LOCAL, id: 'codex', kind: 'codex', base_url: undefined, label: 'Codex' }
    get.mockResolvedValue({ ...stored(codex), base_url: '' })
    await mount(codex)
    expect(screen.queryByLabelText('URL de base')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(update).toHaveBeenCalled())
    expect(update.mock.calls[0][1]).not.toHaveProperty('base_url')
  })

  it('actions are kit buttons, right-aligned in one footer', async () => {
    await mount()
    const save = screen.getByRole('button', { name: 'Enregistrer' })
    expect(save.parentElement!.className).toContain('justify-end')
    for (const name of ['Annuler', 'Tester', 'Enregistrer']) {
      expect(screen.getByRole('button', { name }).className).toMatch(
        /inline-flex items-center justify-center font-medium rounded-lg[\s\S]*min-h-9 px-3 py-2 text-sm/
      )
    }
  })

  it('loads the stored instance: URL, model, cost, preset and key reference are filled in, and "Tester" sends the loaded URL', async () => {
    // The list entry has neither base_url nor default_model, like GET /api/chat/providers.
    const listed = { ...DEEPSEEK, base_url: undefined, default_model: undefined }
    get.mockResolvedValue({
      ...stored(DEEPSEEK),
      base_url: 'https://api.deepseek.com/v1',
      default_model: 'deepseek-v4-pro',
    })
    test.mockResolvedValue({ ok: true, health: { state: 'ok' }, models: [] })
    mountSettings(<ProviderInstanceForm instance={listed} onSaved={onSaved} onCancel={onCancel} />)
    expect(screen.getByRole('status').textContent).toContain('Chargement de l’instance enregistrée')
    await screen.findByRole('form')
    expect(get).toHaveBeenCalledWith('deepseek')
    expect(field('URL de base').value).toBe('https://api.deepseek.com/v1')
    expect(field('Modèle par défaut').value).toBe('deepseek-v4-pro')
    expect(screen.getByRole('combobox', { name: 'Source du coût' }).textContent).toContain('Tarifé')
    fireEvent.click(screen.getByRole('button', { name: 'Tester' }))
    await waitFor(() => expect(test).toHaveBeenCalledTimes(1))
    expect(test.mock.calls[0][0]).toMatchObject({
      id: 'deepseek',
      base_url: 'https://api.deepseek.com/v1',
      default_model: 'deepseek-v4-pro',
      credential_ref: 'vault:deepseek-key',
      preset: 'deepseek',
    })
  })

  it('a server without the read route (404): said clearly, the URL field shows the saved origin, and an empty URL is not sent', async () => {
    get.mockRejectedValue(new ApiError(404, 'not found'))
    await mount({ ...DEEPSEEK, base_url: undefined, default_model: undefined })
    expect(screen.getByRole('alert').textContent).toContain('GET /api/chat/providers/{id} absent')
    expect(field('URL de base').value).toBe('')
    expect(
      screen.getByText(
        /URL enregistrée : https:\/\/api\.deepseek\.com \(le chemin n’est pas disponible\)/
      )
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Tester' }))
    expect(screen.getByTestId('provider-test-blocked').textContent).toContain(
      'saisissez-la pour tester'
    )
    expect(test).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(update).toHaveBeenCalled())
    expect(update.mock.calls[0][1]).not.toHaveProperty('base_url')
  })

  it('another refusal of the read route is shown as such', async () => {
    get.mockRejectedValue(new ApiError(403, '{"error":"forbidden"}'))
    await mount()
    expect(screen.getByRole('alert').textContent).toContain(
      'Impossible de relire l’instance enregistrée'
    )
  })

  it('a key test on a changed key reference asks to save first, instead of failing silently', async () => {
    await mount()
    await screen.findByRole('combobox', { name: 'Clé du coffre' })
    pick('Clé du coffre', 'my-nim-key')
    fireEvent.click(screen.getByRole('button', { name: 'Tester' }))
    expect(screen.getByTestId('provider-test-blocked').textContent).toBe(
      'Enregistrez d’abord l’instance : un test qui envoie une clé exige une instance enregistrée, avec la même URL et la même référence de clé.'
    )
    expect(test).not.toHaveBeenCalled()
  })

  it('a double click on "Tester" sends one test; an edit clears the obsolete verdict', async () => {
    let resolve!: (v: unknown) => void
    test.mockImplementation(() => new Promise((r) => (resolve = r)))
    await mount(LOCAL)
    const btn = screen.getByRole('button', { name: 'Tester' })
    fireEvent.click(btn)
    fireEvent.click(btn)
    expect(test).toHaveBeenCalledTimes(1)
    resolve({ ok: true, health: { state: 'ok' }, models: [] })
    await screen.findByTestId('provider-test-result')
    fireEvent.change(field('Modèle par défaut'), { target: { value: 'qwen3-big' } })
    expect(screen.queryByTestId('provider-test-result')).toBeNull()
  })

  it('the default model is picked from the instance catalog, with capabilities; "Actualiser" re-reads it', async () => {
    models.mockResolvedValue([
      {
        id: 'deepseek-flash',
        capabilities: { tools: false, context_window: { value: 1048576, source: 'catalog' } },
      },
      { id: 'deepseek-v4-pro', capabilities: { tools: true } },
    ])
    get.mockResolvedValue({ ...stored(DEEPSEEK), default_model: 'deepseek-v4-pro' })
    await mount()
    const box = (await screen.findByRole('combobox', { name: 'Modèle par défaut' })) as HTMLInputElement
    await waitFor(() => expect(box.value).toBe('deepseek-v4-pro'))
    fireEvent.click(box)
    expect(
      screen.getByRole('option', { name: /deepseek-flash\s*outils : non · 1\s048\s576 tokens/ })
    ).toBeTruthy()
    expect(screen.getByRole('option', { name: /deepseek-v4-pro/ }).getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(box, { key: 'Escape' })
    expect(models).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: /Actualiser la liste des modèles/ }))
    await waitFor(() => expect(models).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('2 modèles trouvés.')).toBeTruthy()
  })

  it('a catalog that cannot be read falls back to typing the model name', async () => {
    models.mockRejectedValue(new ApiError(502, '{"error":"endpoint_unreachable: down"}'))
    await mount()
    await screen.findByText(/Catalogue indisponible/)
    const input = field('Modèle par défaut')
    expect(input.tagName).toBe('INPUT')
    fireEvent.change(input, { target: { value: 'deepseek-chat' } })
    expect(input.value).toBe('deepseek-chat')
  })
})

describe('ProviderInstanceForm — Claude Code distant (SSH)', () => {
  it('shows the machine as stored, the pinned fingerprint, and Rock’n roll off', async () => {
    await mount(REMOTE)
    expect(field('Machine (nom ou adresse)').value).toBe('lab.example.com')
    expect(field('Utilisateur').value).toBe('me')
    expect(field('Port SSH').value).toBe('2222')
    expect(screen.getByTestId('remote-hostkey-kept').textContent).toContain('SHA256:abc123fingerprintOfTheMachine')
    expect((screen.getByRole('checkbox', { name: /Rock’n roll/ }) as HTMLInputElement).checked).toBe(false)
  })

  it('shows the dedicated-key-without-passphrase hint', async () => {
    await mount(REMOTE)
    expect(screen.getByTestId('remote-key-hint').textContent).toContain('clé dédiée, sans phrase secrète')
    expect(screen.getByTestId('remote-key-hint').textContent).toContain('n’utilise pas d’agent SSH')
  })

  it('a plain edit keeps the pinned key: the PATCH carries no host_key, and no private key anywhere', async () => {
    await mount(REMOTE)
    fireEvent.change(field('Dossier de travail sur la machine'), { target: { value: '/srv/other' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
    const [id, patch] = update.mock.calls[0] as [string, Record<string, unknown>]
    expect(id).toBe('claude-code@lab')
    expect(patch).toMatchObject({ host: 'lab.example.com', ssh_port: 2222, remote_cwd: '/srv/other', allow_trust: false, credential_ref: 'vault:lab-ssh-key' })
    expect(patch).not.toHaveProperty('host_key')
    expect(patch).not.toHaveProperty('base_url')
  })

  it('changing the machine drops the pinned key, warns that consents are revoked, and blocks saving until a new fingerprint is confirmed', async () => {
    await mount(REMOTE)
    fireEvent.change(field('Machine (nom ou adresse)'), { target: { value: 'other.example.com' } })
    expect(screen.getByTestId('remote-origin-moved').textContent).toContain('révoque')
    expect(screen.queryByTestId('remote-hostkey-kept')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await new Promise((r) => setTimeout(r, 20))
    expect(update).not.toHaveBeenCalled()
  })

  it('the key reference is a vault name: a pasted private key is refused and nothing is sent', async () => {
    overview.mockResolvedValue({ secrets: [] }) // empty vault → the name is typed
    await mount(REMOTE)
    const name = field('Nom de la clé dans le coffre')
    fireEvent.change(name, { target: { value: '-----BEGIN OPENSSH PRIVATE KEY-----' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByText(/ressemble à une clé privée/)).toBeTruthy()
    expect(update).not.toHaveBeenCalled()
    expect(test).not.toHaveBeenCalled()
  })

  it('only a vault reference can be chosen: no env, no "none"', async () => {
    await mount(REMOTE)
    const trigger = screen.getByRole('combobox', { name: 'Référence de la clé' })
    fireEvent.click(trigger)
    const listbox = document.getElementById(trigger.getAttribute('aria-controls')!)!
    expect(within(listbox).getAllByRole('option', { hidden: true }).map((o) => o.textContent)).toEqual(['Clé du coffre'])
  })
})
