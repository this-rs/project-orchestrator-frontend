/**
 * Aliases and model policy: translated modes, "Apply" confirmation, ordered
 * fallback, USD caps only where a price exists, load errors that block saving.
 *
 * Run with: npx vitest run src/components/settings/ModelPolicy.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'

const aliases = vi.fn()
const setAliases = vi.fn()
const policy = vi.fn()
const setPolicy = vi.fn()
const list = vi.fn()
vi.mock('@/services/providers', async (orig) => ({
  ...(await orig<typeof import('@/services/providers')>()),
  providersApi: {
    aliases: (...a: unknown[]) => aliases(...a),
    setAliases: (...a: unknown[]) => setAliases(...a),
    policy: (...a: unknown[]) => policy(...a),
    setPolicy: (...a: unknown[]) => setPolicy(...a),
    list: (...a: unknown[]) => list(...a),
    status: vi.fn(),
    models: vi.fn().mockRejectedValue(new Error('no catalog in this test')),
  },
}))

const vaultApiMock = vi.hoisted(() => ({ overview: vi.fn(), unlock: vi.fn() }))
vi.mock('@/services/vault', async (orig) => ({
  ...(await orig<typeof import('@/services/vault')>()),
  vaultApi: { overview: vaultApiMock.overview, unlock: vaultApiMock.unlock },
}))

import { modelCatalogAtom, modelCatalogLoadedAtom } from '@/atoms'
import { chatApi } from '@/services'
import { ModelPolicy } from './ModelPolicy'
import { CLAUDE, CLAUDE_CATALOG, DEEPSEEK, LOCAL, listHeadings, mountSettings, vaultState } from './settingsTestKit'

const ALIASES = [
  { alias: 'default', provider: 'deepseek', model: 'deepseek-chat' },
  { alias: 'deep', provider: 'deepseek', model: 'deepseek-reasoner' },
  { alias: 'fast', provider: 'local-llama', model: 'qwen3' },
]
const OFF = { mode: 'off', rules: {}, fallback: [], caps: {} }

const el = (name: RegExp | string) =>
  screen.getByLabelText(name) as HTMLInputElement & HTMLSelectElement
const policyPanel = () => within(screen.getByTestId('policy-panel'))
const aliasPanel = () => within(screen.getByTestId('aliases-panel'))
const box = (name: RegExp | string) => screen.getByRole('combobox', { name }) as HTMLInputElement
/** Open an alias row's model combobox and click the option with that name (what a person does). */
const pick = (field: RegExp | string, option: string | RegExp) => {
  fireEvent.click(box(field))
  fireEvent.click(screen.getByRole('option', { name: option }))
}
/** The live Claude catalog, already read by the app (or empty and settled = unreachable). */
const catalog = (models = CLAUDE_CATALOG) => (store: { set: (a: unknown, v: unknown) => void }) => {
  store.set(modelCatalogAtom, models)
  store.set(modelCatalogLoadedAtom, true)
}

async function mount(providers = [CLAUDE, DEEPSEEK, LOCAL]) {
  const utils = mountSettings(<ModelPolicy />, { providers, list })
  await screen.findByRole('radio', { name: /Off/ })
  await screen.findByTestId('alias-fast')
  return utils
}
const save = () => fireEvent.click(policyPanel().getByRole('button', { name: 'Save' }))

beforeEach(() => {
  list.mockReset()
  vaultApiMock.overview.mockReset().mockResolvedValue(vaultState())
  vaultApiMock.unlock.mockReset()
  vi.spyOn(chatApi, 'getModelCatalog').mockResolvedValue([])
  aliases.mockReset().mockResolvedValue(ALIASES)
  setAliases.mockReset().mockResolvedValue(ALIASES)
  policy.mockReset().mockResolvedValue(OFF)
  setPolicy.mockReset().mockImplementation(async (p: unknown) => p)
})

describe('alias table', () => {
  it('explains what an alias is, lists the four fixed aliases even when unset, and marks an alias on an unreachable instance', async () => {
    await mount([CLAUDE, DEEPSEEK, { ...LOCAL, health: { status: 'unhealthy' } }])
    expect(screen.getByTestId('aliases-panel').textContent).toContain('An alias is a logical name')
    expect(screen.getByTestId('alias-utility')).toBeTruthy()
    expect(screen.getByTestId('alias-unhealthy-fast').textContent).toContain('Unreachable')
    expect(screen.queryByTestId('alias-unhealthy-deep')).toBeNull()
    expect(screen.getByTestId('alias-fast')).toBeTruthy()
  })

  it('saves only complete rows with PUT /chat/model-aliases', async () => {
    await mount()
    pick('Model of utility', 'Local llama · qwen3')
    fireEvent.click(aliasPanel().getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(setAliases).toHaveBeenCalledTimes(1))
    const sent = setAliases.mock.calls[0][0] as { alias: string }[]
    expect(sent.map((a) => a.alias).sort()).toEqual(['deep', 'default', 'fast', 'utility'])
    expect(await aliasPanel().findByText('Aliases saved.')).toBeTruthy()
  })

  it('the default alias lists every model of the live Claude catalog, by provider then family, with the other instances', async () => {
    mountSettings(<ModelPolicy />, { providers: [CLAUDE, DEEPSEEK, LOCAL], list, prepare: catalog() })
    await screen.findByTestId('alias-fast')
    fireEvent.click(box('Model of default'))
    const listbox = screen.getByRole('listbox')
    const names = within(listbox).getAllByRole('option').map((o) => o.textContent)
    expect(names).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Claude Code · Opus 5.5'),
        expect.stringContaining('Claude Code · Sonnet 5'),
        expect.stringContaining('Claude Code · Haiku 5.5'),
        expect.stringContaining('DeepSeek · deepseek-reasoner'),
        expect.stringContaining('Local llama · qwen3'),
      ]),
    )
    expect(listHeadings(listbox)).toEqual(['Claude Code · Opus', 'Claude Code · Sonnet', 'Claude Code · Haiku', 'DeepSeek', 'Local llama'])
    // A legacy model says so in words, under its row.
    expect(within(listbox).getByRole('option', { name: /Sonnet 4\.5/ }).textContent).toContain('legacy')
    expect(screen.queryByTestId('catalog-offline')).toBeNull()
  })

  it('a model of another provider is chosen in the one control and saved with its provider', async () => {
    await mount()
    pick('Model of fast', 'DeepSeek · deepseek-reasoner')
    expect(box('Model of fast').value).toBe('DeepSeek · deepseek-reasoner')
    fireEvent.click(aliasPanel().getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(setAliases).toHaveBeenCalledTimes(1))
    expect(setAliases.mock.calls[0][0]).toEqual(
      expect.arrayContaining([{ alias: 'fast', provider: 'deepseek', model: 'deepseek-reasoner' }]),
    )
  })

  it('an unreachable live catalog: the list is said to be offline (text and icon) and Claude Code lists what the server knows', async () => {
    const claude = { ...CLAUDE, models: [{ id: 'claude-sonnet-5' }] }
    mountSettings(<ModelPolicy />, { providers: [claude, DEEPSEEK, LOCAL], list, prepare: catalog([]) })
    await screen.findByTestId('alias-fast')
    const note = await aliasPanel().findByTestId('catalog-offline')
    expect(note.textContent).toContain('Offline list.')
    expect(note.querySelector('svg')).toBeTruthy()
    fireEvent.click(box('Model of default'))
    expect(screen.getByRole('option', { name: /Claude Code · claude-sonnet-5/ })).toBeTruthy()
    // "Retry" reads the catalog again.
    fireEvent.click(within(note).getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(chatApi.getModelCatalog).toHaveBeenCalled())
  })

  it('the chosen provider keeps its key in the locked vault: VaultUnlock in place; unlocking re-reads providers and catalogs', async () => {
    vaultApiMock.overview.mockResolvedValue(vaultState({ unlocked_until: null }))
    vaultApiMock.unlock.mockResolvedValue({ unlocked_until: '2099-01-01T00:00:00Z', unlock_proof: 'proof' })
    await mount() // the default alias runs on DeepSeek, whose credential is `vault:deepseek-key`
    const gate = await aliasPanel().findByTestId('target-vault-unlock')
    expect(gate.textContent).toContain('DeepSeek: the key is in the vault, which is locked.')
    const listsBefore = list.mock.calls.length
    const catalogsBefore = vi.mocked(chatApi.getModelCatalog).mock.calls.length
    fireEvent.change(within(gate).getByLabelText('Vault locked'), { target: { value: 'correct horse' } })
    fireEvent.click(within(gate).getByRole('button', { name: 'Unlock' }))
    await waitFor(() => expect(vaultApiMock.unlock).toHaveBeenCalledWith('correct horse', 60))
    expect((await within(gate).findByRole('status')).textContent).toContain('Vault unlocked')
    await waitFor(() => expect(list.mock.calls.length).toBeGreaterThan(listsBefore))
    await waitFor(() => expect(vi.mocked(chatApi.getModelCatalog).mock.calls.length).toBeGreaterThan(catalogsBefore))
  })

  it('no unlock form while the vault is open, nor when the chosen providers do not use it', async () => {
    vaultApiMock.overview.mockResolvedValue(vaultState({ unlocked_until: null }))
    aliases.mockResolvedValue([{ alias: 'default', provider: 'local-llama', model: 'qwen3' }])
    await mount()
    expect(vaultApiMock.overview).not.toHaveBeenCalled()
    expect(screen.queryByTestId('target-vault-unlock')).toBeNull()
  })

  it('an alias that could not be read: the error and a retry, never an empty table that would overwrite', async () => {
    const { ApiError } = await import('@/services/api')
    aliases
      .mockRejectedValueOnce(new ApiError(500, '{"error":"boom"}'))
      .mockRejectedValueOnce(new ApiError(500, '{"error":"boom"}'))
    mountSettings(<ModelPolicy />, { providers: [CLAUDE, DEEPSEEK, LOCAL], list })
    expect(await aliasPanel().findByRole('alert')).toBeTruthy()
    expect(screen.queryByTestId('alias-fast')).toBeNull()
    expect(aliasPanel().queryByRole('button', { name: 'Save' })).toBeNull()
    fireEvent.click(aliasPanel().getByRole('button', { name: 'Retry' }))
    expect(await screen.findByTestId('alias-fast')).toBeTruthy()
  })
})

describe('policy', () => {
  it('is delivered "Off"; the modes are translated, and "Observe only" says it applies nothing', async () => {
    await mount()
    expect((screen.getByRole('radio', { name: /Off/ }) as HTMLInputElement).checked).toBe(
      true
    )
    expect(
      screen.getByRole('radio', {
        name: /Observe only.*Applies nothing, records what it would have chosen/,
      })
    ).toBeTruthy()
    expect(screen.getByRole('radio', { name: /Apply/ })).toBeTruthy()
    expect(screen.getByTestId('policy-panel').textContent).not.toMatch(/shadow|enforce/i)
    expect(screen.queryByText(/sans l’appliquer/)).toBeNull()
    fireEvent.click(screen.getByRole('radio', { name: /Observe only/ }))
    expect(
      screen.getByText(/the policy computes and records its choice without applying it/)
    ).toBeTruthy()
  })

  it('"Apply" lists the usages whose model changes and only saves once confirmed', async () => {
    await mount()
    fireEvent.change(el('Runner, complex task'), { target: { value: 'deep' } })
    fireEvent.change(el('Chat'), { target: { value: 'default' } }) // same model as today: not listed
    fireEvent.click(screen.getByRole('radio', { name: /Apply/ }))
    save()
    const dialog = screen.getByRole('alertdialog')
    expect(dialog.textContent).toContain(
      'Runner, complex task: DeepSeek / deepseek-chat → DeepSeek / deepseek-reasoner'
    )
    expect(dialog.textContent).not.toContain('Conversation :')
    expect(setPolicy).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply' }))
    await waitFor(() => expect(setPolicy).toHaveBeenCalledTimes(1))
    expect(setPolicy.mock.calls[0][0]).toMatchObject({
      mode: 'enforce',
      rules: { 'runner.complex': 'deep', chat: 'default' },
    })
  })

  it('"Observe only" saves without a confirmation', async () => {
    await mount()
    fireEvent.click(screen.getByRole('radio', { name: /Observe only/ }))
    save()
    await waitFor(() => expect(setPolicy).toHaveBeenCalled())
    expect(setPolicy.mock.calls[0][0]).toMatchObject({ mode: 'shadow' })
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('the fallback chain is reordered with buttons', async () => {
    policy.mockResolvedValue({ ...OFF, fallback: ['default', 'deep', 'fast'] })
    await mount()
    const chain = screen.getByRole('list', { name: 'Fallback chain' })
    const order = () =>
      within(chain)
        .getAllByRole('listitem')
        .map((li) => li.textContent!.replace(/^\d\./, '').trim().split(' ')[0])
    expect(order()).toEqual(['default', 'deep', 'fast'])
    fireEvent.click(screen.getByRole('button', { name: 'Move fast up' }))
    expect(order()).toEqual(['default', 'fast', 'deep'])
    fireEvent.click(screen.getByRole('button', { name: 'Move default down' }))
    expect(order()).toEqual(['fast', 'default', 'deep'])
    expect(
      (screen.getByRole('button', { name: 'Move fast up' }) as HTMLButtonElement).disabled
    ).toBe(true)
    save()
    await waitFor(() =>
      expect(setPolicy.mock.calls[0][0]).toMatchObject({ fallback: ['fast', 'default', 'deep'] })
    )
    expect(
      screen.getByText(/never reaches an origin the project has not allowed/)
    ).toBeTruthy()
  })

  it('USD caps need a price on every aliased instance; otherwise explained and tokens only', async () => {
    policy.mockResolvedValue({ ...OFF, rules: { chat: 'fast' } }) // fast → free local instance
    await mount()
    const usd = el('Per run (USD)')
    expect(usd.getAttribute('aria-disabled')).toBe('true')
    expect(document.getElementById(usd.getAttribute('aria-describedby')!)?.textContent).toContain(
      'is refused if its model has none'
    )
    fireEvent.change(usd, { target: { value: '5' } })
    expect(usd.value).toBe('')
    fireEvent.change(el('Per run (tokens)'), { target: { value: '50000' } })
    save()
    await waitFor(() =>
      expect(setPolicy.mock.calls[0][0].caps).toMatchObject({
        per_run_tokens: 50000,
        per_run_usd: null,
      })
    )
  })

  it('USD caps are offered when every aliased instance is priced', async () => {
    policy.mockResolvedValue({ ...OFF, rules: { chat: 'deep' } })
    await mount()
    const usd = el('Per run (USD)')
    expect(usd.getAttribute('aria-disabled')).toBeNull()
    fireEvent.change(usd, { target: { value: '5' } })
    save()
    await waitFor(() => expect(setPolicy.mock.calls[0][0].caps).toMatchObject({ per_run_usd: 5 }))
  })

  it('"Cancel" puts back the saved policy', async () => {
    await mount()
    const cancel = policyPanel().getByRole('button', { name: 'Cancel' }) as HTMLButtonElement
    expect(cancel.disabled).toBe(true)
    fireEvent.click(screen.getByRole('radio', { name: /Apply/ }))
    expect(cancel.disabled).toBe(false)
    fireEvent.click(cancel)
    expect((screen.getByRole('radio', { name: /Off/ }) as HTMLInputElement).checked).toBe(
      true
    )
  })

  it('a 403 reads as the human-only rule, in French', async () => {
    const { ApiError } = await import('@/services/api')
    setPolicy.mockRejectedValue(new ApiError(403, ''))
    await mount()
    save()
    expect((await policyPanel().findByRole('alert')).textContent).toBe(
      'Only a signed-in person can make this change (an agent cannot).'
    )
  })

  it('a policy answer that is not JSON: the named request, and no form that would save "Off" over it', async () => {
    const { NonJsonResponseError } = await import('@/services/api')
    policy.mockRejectedValueOnce(
      new NonJsonResponseError(200, 'GET', '/api/chat/model-policy', 'text/html')
    )
    mountSettings(<ModelPolicy />, { providers: [CLAUDE, DEEPSEEK, LOCAL], list })
    const alert = await policyPanel().findByRole('alert')
    expect(alert.textContent).toBe(
      'The server answered something other than JSON: GET /api/chat/model-policy → 200 (text/html)'
    )
    expect(screen.queryByRole('radio', { name: /Off/ })).toBeNull()
    expect(policyPanel().queryByRole('button', { name: 'Save' })).toBeNull()
    fireEvent.click(policyPanel().getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('radio', { name: /Off/ })).toBeTruthy()
  })
})
