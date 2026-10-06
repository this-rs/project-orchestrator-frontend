/**
 * Aliases and model policy: translated modes, "Appliquer" confirmation, ordered
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
  },
}))

import { ModelPolicy } from './ModelPolicy'
import { CLAUDE, DEEPSEEK, LOCAL, mountSettings } from './settingsTestKit'

const ALIASES = [
  { alias: 'default', provider: 'deepseek', model: 'deepseek-chat' },
  { alias: 'deep', provider: 'deepseek', model: 'deepseek-reasoner' },
  { alias: 'fast', provider: 'local-llama', model: 'qwen3' },
]
const OFF = { mode: 'off', rules: {}, fallback: [], caps: {} }

const el = (name: RegExp | string) => screen.getByLabelText(name) as HTMLInputElement & HTMLSelectElement
const policyPanel = () => within(screen.getByTestId('policy-panel'))
const aliasPanel = () => within(screen.getByTestId('aliases-panel'))

async function mount(providers = [CLAUDE, DEEPSEEK, LOCAL]) {
  const utils = mountSettings(<ModelPolicy />, { providers, list })
  await screen.findByRole('radio', { name: /Désactivée/ })
  await screen.findByTestId('alias-fast')
  return utils
}
const save = () => fireEvent.click(policyPanel().getByRole('button', { name: 'Enregistrer' }))

beforeEach(() => {
  list.mockReset()
  aliases.mockReset().mockResolvedValue(ALIASES)
  setAliases.mockReset().mockResolvedValue(ALIASES)
  policy.mockReset().mockResolvedValue(OFF)
  setPolicy.mockReset().mockImplementation(async (p: unknown) => p)
})

describe('alias table', () => {
  it('explains what an alias is, lists the four fixed aliases even when unset, and marks an alias on an unreachable instance', async () => {
    await mount([CLAUDE, DEEPSEEK, { ...LOCAL, health: { status: 'unhealthy' } }])
    expect(screen.getByTestId('aliases-panel').textContent).toContain('Un alias est un nom logique')
    expect(screen.getByTestId('alias-utility')).toBeTruthy()
    expect(screen.getByTestId('alias-unhealthy-fast').textContent).toContain('Injoignable')
    expect(screen.queryByTestId('alias-unhealthy-deep')).toBeNull()
    expect(screen.getByTestId('alias-fast')).toBeTruthy()
  })

  it('saves only complete rows with PUT /chat/model-aliases', async () => {
    await mount()
    fireEvent.change(el('Provider de utility'), { target: { value: 'local-llama' } })
    fireEvent.change(el('Modèle de utility'), { target: { value: 'qwen3' } })
    fireEvent.click(aliasPanel().getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(setAliases).toHaveBeenCalledTimes(1))
    const sent = setAliases.mock.calls[0][0] as { alias: string }[]
    expect(sent.map((a) => a.alias).sort()).toEqual(['deep', 'default', 'fast', 'utility'])
    expect(await aliasPanel().findByText('Alias enregistrés.')).toBeTruthy()
  })

  it('an alias that could not be read: the error and a retry, never an empty table that would overwrite', async () => {
    const { ApiError } = await import('@/services/api')
    aliases.mockRejectedValueOnce(new ApiError(500, '{"error":"boom"}')).mockRejectedValueOnce(new ApiError(500, '{"error":"boom"}'))
    mountSettings(<ModelPolicy />, { providers: [CLAUDE, DEEPSEEK, LOCAL], list })
    expect(await aliasPanel().findByRole('alert')).toBeTruthy()
    expect(screen.queryByTestId('alias-fast')).toBeNull()
    expect(aliasPanel().queryByRole('button', { name: 'Enregistrer' })).toBeNull()
    fireEvent.click(aliasPanel().getByRole('button', { name: 'Réessayer' }))
    expect(await screen.findByTestId('alias-fast')).toBeTruthy()
  })
})

describe('policy', () => {
  it('is delivered "Désactivée"; the modes are translated, and "Observer seulement" says it applies nothing', async () => {
    await mount()
    expect((screen.getByRole('radio', { name: /Désactivée/ }) as HTMLInputElement).checked).toBe(true)
    expect(screen.getByRole('radio', { name: /Observer seulement.*N’applique rien, enregistre ce qu’elle aurait choisi/ })).toBeTruthy()
    expect(screen.getByRole('radio', { name: /Appliquer/ })).toBeTruthy()
    expect(screen.getByTestId('policy-panel').textContent).not.toMatch(/shadow|enforce/i)
    expect(screen.queryByText(/sans l’appliquer/)).toBeNull()
    fireEvent.click(screen.getByRole('radio', { name: /Observer seulement/ }))
    expect(screen.getByText(/la politique calcule et enregistre son choix, sans l’appliquer/)).toBeTruthy()
  })

  it('"Appliquer" lists the usages whose model changes and only saves once confirmed', async () => {
    await mount()
    fireEvent.change(el('Runner, tâche complexe'), { target: { value: 'deep' } })
    fireEvent.change(el('Conversation'), { target: { value: 'default' } }) // same model as today: not listed
    fireEvent.click(screen.getByRole('radio', { name: /Appliquer/ }))
    save()
    const dialog = screen.getByRole('alertdialog')
    expect(dialog.textContent).toContain('Runner, tâche complexe : DeepSeek / deepseek-chat → DeepSeek / deepseek-reasoner')
    expect(dialog.textContent).not.toContain('Conversation :')
    expect(setPolicy).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Appliquer' }))
    await waitFor(() => expect(setPolicy).toHaveBeenCalledTimes(1))
    expect(setPolicy.mock.calls[0][0]).toMatchObject({ mode: 'enforce', rules: { 'runner.complex': 'deep', chat: 'default' } })
  })

  it('"Observer seulement" saves without a confirmation', async () => {
    await mount()
    fireEvent.click(screen.getByRole('radio', { name: /Observer seulement/ }))
    save()
    await waitFor(() => expect(setPolicy).toHaveBeenCalled())
    expect(setPolicy.mock.calls[0][0]).toMatchObject({ mode: 'shadow' })
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('the fallback chain is reordered with buttons', async () => {
    policy.mockResolvedValue({ ...OFF, fallback: ['default', 'deep', 'fast'] })
    await mount()
    const chain = screen.getByRole('list', { name: 'Chaîne de repli' })
    const order = () => within(chain).getAllByRole('listitem').map((li) => li.textContent!.replace(/^\d\./, '').trim().split(' ')[0])
    expect(order()).toEqual(['default', 'deep', 'fast'])
    fireEvent.click(screen.getByRole('button', { name: 'Monter fast' }))
    expect(order()).toEqual(['default', 'fast', 'deep'])
    fireEvent.click(screen.getByRole('button', { name: 'Descendre default' }))
    expect(order()).toEqual(['fast', 'default', 'deep'])
    expect((screen.getByRole('button', { name: 'Monter fast' }) as HTMLButtonElement).disabled).toBe(true)
    save()
    await waitFor(() => expect(setPolicy.mock.calls[0][0]).toMatchObject({ fallback: ['fast', 'default', 'deep'] }))
    expect(screen.getByText(/n’atteint jamais une origine que le projet n’a pas autorisée/)).toBeTruthy()
  })

  it('USD caps need a price on every aliased instance; otherwise explained and tokens only', async () => {
    policy.mockResolvedValue({ ...OFF, rules: { chat: 'fast' } }) // fast → free local instance
    await mount()
    const usd = el('Par exécution (USD)')
    expect(usd.getAttribute('aria-disabled')).toBe('true')
    expect(document.getElementById(usd.getAttribute('aria-describedby')!)?.textContent).toContain('refusée si son modèle n’en a pas')
    fireEvent.change(usd, { target: { value: '5' } })
    expect(usd.value).toBe('')
    fireEvent.change(el('Par exécution (tokens)'), { target: { value: '50000' } })
    save()
    await waitFor(() => expect(setPolicy.mock.calls[0][0].caps).toMatchObject({ per_run_tokens: 50000, per_run_usd: null }))
  })

  it('USD caps are offered when every aliased instance is priced', async () => {
    policy.mockResolvedValue({ ...OFF, rules: { chat: 'deep' } })
    await mount()
    const usd = el('Par exécution (USD)')
    expect(usd.getAttribute('aria-disabled')).toBeNull()
    fireEvent.change(usd, { target: { value: '5' } })
    save()
    await waitFor(() => expect(setPolicy.mock.calls[0][0].caps).toMatchObject({ per_run_usd: 5 }))
  })

  it('"Annuler" puts back the saved policy', async () => {
    await mount()
    const cancel = policyPanel().getByRole('button', { name: 'Annuler' }) as HTMLButtonElement
    expect(cancel.disabled).toBe(true)
    fireEvent.click(screen.getByRole('radio', { name: /Appliquer/ }))
    expect(cancel.disabled).toBe(false)
    fireEvent.click(cancel)
    expect((screen.getByRole('radio', { name: /Désactivée/ }) as HTMLInputElement).checked).toBe(true)
  })

  it('a 403 reads as the human-only rule, in French', async () => {
    const { ApiError } = await import('@/services/api')
    setPolicy.mockRejectedValue(new ApiError(403, ''))
    await mount()
    save()
    expect((await policyPanel().findByRole('alert')).textContent).toBe('Seule une personne connectée peut faire ce changement (un agent ne le peut pas).')
  })

  it('a policy answer that is not JSON: the named request, and no form that would save "Désactivée" over it', async () => {
    const { NonJsonResponseError } = await import('@/services/api')
    policy.mockRejectedValueOnce(new NonJsonResponseError(200, 'GET', '/api/chat/model-policy', 'text/html'))
    mountSettings(<ModelPolicy />, { providers: [CLAUDE, DEEPSEEK, LOCAL], list })
    const alert = await policyPanel().findByRole('alert')
    expect(alert.textContent).toBe('Le serveur a répondu autre chose que du JSON : GET /api/chat/model-policy → 200 (text/html)')
    expect(screen.queryByRole('radio', { name: /Désactivée/ })).toBeNull()
    expect(policyPanel().queryByRole('button', { name: 'Enregistrer' })).toBeNull()
    fireEvent.click(policyPanel().getByRole('button', { name: 'Réessayer' }))
    expect(await screen.findByRole('radio', { name: /Désactivée/ })).toBeTruthy()
  })
})
