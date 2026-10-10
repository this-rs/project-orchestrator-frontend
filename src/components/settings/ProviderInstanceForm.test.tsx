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
import { createTranslator } from '@/i18n/translate'
import { bundleOf } from '@/i18n/store'
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

const { t } = createTranslator('en', bundleOf('en')!)

describe('validateBaseUrl (and its localized twin)', () => {
  it.each([
    'https://api.deepseek.com',
    'http://localhost:11434/v1',
    'http://127.0.0.1:8000/v1',
    'http://[::1]:8080/v1',
  ])('accepts %s', (url) => {
    expect(validateBaseUrl(url)).toBeNull()
    expect(validateBaseUrlFr(url, t)).toBeNull()
  })
  it.each(['http://example.com/v1', 'ftp://localhost', 'not a url', ''])('refuses %s', (url) => {
    expect(validateBaseUrl(url)).not.toBeNull()
    expect(validateBaseUrlFr(url, t)).not.toBeNull()
  })
})

describe('ProviderInstanceForm (edit)', () => {
  it('keeps the id fixed and PATCHes without id or kind', async () => {
    await mount()
    expect(field('Identifier').disabled).toBe(true)
    fireEvent.change(field('Display name'), { target: { value: 'DS prod' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
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
    fireEvent.change(field('Base URL'), { target: { value: 'http://example.com/v1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText(/Use https/)).toBeTruthy()
    expect(update).not.toHaveBeenCalled()
  })

  it('offers the vault secret NAMES and saves a reference, with no secret-like field in the body', async () => {
    await mount()
    await screen.findByRole('combobox', { name: 'Vault key' })
    pick('Vault key', 'my-nim-key')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
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
        .getByRole('link', { name: 'Add or replace the key in the vault' })
        .getAttribute('href')
    ).toBe('/vault')
  })

  it('an environment credential is a variable NAME', async () => {
    await mount()
    pick('Key reference', 'Server environment variable')
    fireEvent.change(field('Variable name'), { target: { value: 'MY_KEY' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
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
    fireEvent.click(screen.getByRole('button', { name: 'Test' }))
    const result = await screen.findByTestId('provider-test-result')
    expect(result.textContent).toContain('2 models found: m1, m2')
    expect(result.textContent).toContain('Tool call: yes')
    expect(result.textContent).toMatch(/131,072/)
    expect(test.mock.calls[0][0]).toMatchObject({ id: 'local-llama', credential_ref: 'none' })
  })

  it('a locked vault shows the credentials_locked card', async () => {
    test.mockResolvedValue({
      ok: false,
      health: { state: 'auth_required', code: 'credentials_locked' },
    })
    await mount()
    fireEvent.click(screen.getByRole('button', { name: 'Test' }))
    const card = await screen.findByTestId('provider-test-error')
    expect(card.getAttribute('data-error-code')).toBe('credentials_locked')
  })

  it('saving after a failed test asks for an explicit confirmation', async () => {
    test.mockResolvedValue({ ok: false, health: { state: 'unreachable' } })
    await mount(LOCAL)
    fireEvent.click(screen.getByRole('button', { name: 'Test' }))
    await screen.findByText('The connection failed.')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(update).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole('button', { name: 'Save anyway' }))
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
  })

  it('a 403 reads as the human-only rule', async () => {
    update.mockRejectedValue(new ApiError(403, '{"error":"forbidden"}'))
    await mount(LOCAL)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Only a signed-in person can make this change (an agent cannot).'
    )
  })

  it('a codex instance has no URL field and its patch carries no base_url', async () => {
    const codex = { ...LOCAL, id: 'codex', kind: 'codex', base_url: undefined, label: 'Codex' }
    get.mockResolvedValue({ ...stored(codex), base_url: '' })
    await mount(codex)
    expect(screen.queryByLabelText('Base URL')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(update).toHaveBeenCalled())
    expect(update.mock.calls[0][1]).not.toHaveProperty('base_url')
  })

  it('actions are kit buttons, right-aligned in one footer', async () => {
    await mount()
    const save = screen.getByRole('button', { name: 'Save' })
    expect(save.parentElement!.className).toContain('justify-end')
    for (const name of ['Cancel', 'Test', 'Save']) {
      const b = screen.getByRole('button', { name })
      expect(b.classList.contains('btn')).toBe(true) // the glass recipe of <Button>
      expect(b.className).toContain('min-h-9 px-3 py-2 text-sm')
    }
  })

  it('loads the stored instance: URL, model, cost, preset and key reference are filled in, and "Test" sends the loaded URL', async () => {
    // The list entry has neither base_url nor default_model, like GET /api/chat/providers.
    const listed = { ...DEEPSEEK, base_url: undefined, default_model: undefined }
    get.mockResolvedValue({
      ...stored(DEEPSEEK),
      base_url: 'https://api.deepseek.com/v1',
      default_model: 'deepseek-v4-pro',
    })
    test.mockResolvedValue({ ok: true, health: { state: 'ok' }, models: [] })
    mountSettings(<ProviderInstanceForm instance={listed} onSaved={onSaved} onCancel={onCancel} />)
    expect(screen.getByRole('status').textContent).toContain('Loading the stored instance')
    await screen.findByRole('form')
    expect(get).toHaveBeenCalledWith('deepseek')
    expect(field('Base URL').value).toBe('https://api.deepseek.com/v1')
    expect(field('Default model').value).toBe('deepseek-v4-pro')
    expect(screen.getByRole('combobox', { name: 'Cost source' }).textContent).toContain('Priced')
    fireEvent.click(screen.getByRole('button', { name: 'Test' }))
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
    expect(screen.getByRole('alert').textContent).toContain('GET /api/chat/providers/{id} is missing')
    expect(field('Base URL').value).toBe('')
    expect(
      screen.getByText(
        /Saved URL: https:\/\/api\.deepseek\.com \(the path is not available\)/
      )
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Test' }))
    expect(screen.getByTestId('provider-test-blocked').textContent).toContain(
      'type it to test'
    )
    expect(test).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(update).toHaveBeenCalled())
    expect(update.mock.calls[0][1]).not.toHaveProperty('base_url')
  })

  it('another refusal of the read route is shown as such', async () => {
    get.mockRejectedValue(new ApiError(403, '{"error":"forbidden"}'))
    await mount()
    expect(screen.getByRole('alert').textContent).toContain(
      'Could not read back the stored instance'
    )
  })

  it('a key test on a changed key reference asks to save first, instead of failing silently', async () => {
    await mount()
    await screen.findByRole('combobox', { name: 'Vault key' })
    pick('Vault key', 'my-nim-key')
    fireEvent.click(screen.getByRole('button', { name: 'Test' }))
    expect(screen.getByTestId('provider-test-blocked').textContent).toBe(
      'Save the instance first: a test that sends a key requires a saved instance, with the same URL and the same key reference.'
    )
    expect(test).not.toHaveBeenCalled()
  })

  it('a double click on "Test" sends one test; an edit clears the obsolete verdict', async () => {
    let resolve!: (v: unknown) => void
    test.mockImplementation(() => new Promise((r) => (resolve = r)))
    await mount(LOCAL)
    const btn = screen.getByRole('button', { name: 'Test' })
    fireEvent.click(btn)
    fireEvent.click(btn)
    expect(test).toHaveBeenCalledTimes(1)
    resolve({ ok: true, health: { state: 'ok' }, models: [] })
    await screen.findByTestId('provider-test-result')
    fireEvent.change(field('Default model'), { target: { value: 'qwen3-big' } })
    expect(screen.queryByTestId('provider-test-result')).toBeNull()
  })

  it('the default model is picked from the instance catalog, with capabilities; "Refresh" re-reads it', async () => {
    models.mockResolvedValue([
      {
        id: 'deepseek-flash',
        capabilities: { tools: false, context_window: { value: 1048576, source: 'catalog' } },
      },
      { id: 'deepseek-v4-pro', capabilities: { tools: true } },
    ])
    get.mockResolvedValue({ ...stored(DEEPSEEK), default_model: 'deepseek-v4-pro' })
    await mount()
    const box = (await screen.findByRole('combobox', { name: 'Default model' })) as HTMLInputElement
    await waitFor(() => expect(box.value).toBe('deepseek-v4-pro'))
    fireEvent.click(box)
    expect(
      screen.getByRole('option', { name: /deepseek-flash\s*tools: no · 1,048,576 tokens/ })
    ).toBeTruthy()
    expect(screen.getByRole('option', { name: /deepseek-v4-pro/ }).getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(box, { key: 'Escape' })
    expect(models).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: /Refresh the model list/ }))
    await waitFor(() => expect(models).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('2 models found.')).toBeTruthy()
  })

  it('a catalog that cannot be read falls back to typing the model name', async () => {
    models.mockRejectedValue(new ApiError(502, '{"error":"endpoint_unreachable: down"}'))
    await mount()
    await screen.findByText(/Catalog unavailable/)
    const input = field('Default model')
    expect(input.tagName).toBe('INPUT')
    fireEvent.change(input, { target: { value: 'deepseek-chat' } })
    expect(input.value).toBe('deepseek-chat')
  })
})

describe('ProviderInstanceForm — Claude Code distant (SSH)', () => {
  it('shows the machine as stored, the pinned fingerprint, and Rock’n roll off', async () => {
    await mount(REMOTE)
    expect(field('Machine (name or address)').value).toBe('lab.example.com')
    expect(field('User').value).toBe('me')
    expect(field('SSH port').value).toBe('2222')
    expect(screen.getByTestId('remote-hostkey-kept').textContent).toContain('SHA256:abc123fingerprintOfTheMachine')
    expect((screen.getByRole('checkbox', { name: /Rock’n roll/ }) as HTMLInputElement).checked).toBe(false)
  })

  it('shows the dedicated-key-without-passphrase hint', async () => {
    await mount(REMOTE)
    expect(screen.getByTestId('remote-key-hint').textContent).toContain('dedicated key without a passphrase')
    expect(screen.getByTestId('remote-key-hint').textContent).toContain('does not use an SSH agent')
  })

  it('a plain edit keeps the pinned key: the PATCH carries no host_key, and no private key anywhere', async () => {
    await mount(REMOTE)
    fireEvent.change(field('Working folder on the machine'), { target: { value: '/srv/other' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
    const [id, patch] = update.mock.calls[0] as [string, Record<string, unknown>]
    expect(id).toBe('claude-code@lab')
    expect(patch).toMatchObject({ host: 'lab.example.com', ssh_port: 2222, remote_cwd: '/srv/other', allow_trust: false, credential_ref: 'vault:lab-ssh-key' })
    expect(patch).not.toHaveProperty('host_key')
    expect(patch).not.toHaveProperty('base_url')
  })

  it('changing the machine drops the pinned key, warns that consents are revoked, and blocks saving until a new fingerprint is confirmed', async () => {
    await mount(REMOTE)
    fireEvent.change(field('Machine (name or address)'), { target: { value: 'other.example.com' } })
    expect(screen.getByTestId('remote-origin-moved').textContent).toContain('revokes')
    expect(screen.queryByTestId('remote-hostkey-kept')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await new Promise((r) => setTimeout(r, 20))
    expect(update).not.toHaveBeenCalled()
  })

  it('the key reference is a vault name: a pasted private key is refused and nothing is sent', async () => {
    overview.mockResolvedValue({ secrets: [] }) // empty vault → the name is typed
    await mount(REMOTE)
    const name = field('Name of the key in the vault')
    fireEvent.change(name, { target: { value: '-----BEGIN OPENSSH PRIVATE KEY-----' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText(/looks like a private key/)).toBeTruthy()
    expect(update).not.toHaveBeenCalled()
    expect(test).not.toHaveBeenCalled()
  })

  it('only a vault reference can be chosen: no env, no "none"', async () => {
    await mount(REMOTE)
    const trigger = screen.getByRole('combobox', { name: 'Key reference' })
    fireEvent.click(trigger)
    const listbox = document.getElementById(trigger.getAttribute('aria-controls')!)!
    expect(within(listbox).getAllByRole('option', { hidden: true }).map((o) => o.textContent)).toEqual(['Vault key'])
  })
})
