/**
 * Aliases and model policy: shadow banner, enforce confirmation, ordered
 * fallback, and USD caps only where a price exists.
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

async function mount(providers = [CLAUDE, DEEPSEEK, LOCAL]) {
  const utils = mountSettings(<ModelPolicy />, { providers, list })
  await screen.findByText('Save policy')
  return utils
}

beforeEach(() => {
  list.mockReset()
  aliases.mockReset().mockResolvedValue(ALIASES)
  setAliases.mockReset().mockResolvedValue(ALIASES)
  policy.mockReset().mockResolvedValue(OFF)
  setPolicy.mockReset().mockImplementation(async (p: unknown) => p)
})

describe('alias table', () => {
  it('lists the four fixed aliases even when unset, and marks an alias on an unhealthy instance', async () => {
    await mount([CLAUDE, DEEPSEEK, { ...LOCAL, health: { status: 'unhealthy' } }])
    expect(screen.getByTestId('alias-utility')).toBeTruthy()
    expect(screen.getByTestId('alias-unhealthy-fast').textContent).toContain('not healthy')
    expect(screen.queryByTestId('alias-unhealthy-deep')).toBeNull()
    // marked, not hidden
    expect(screen.getByTestId('alias-fast')).toBeTruthy()
  })

  it('saves only complete rows with PUT /chat/model-aliases', async () => {
    await mount()
    fireEvent.change(el('Instance for utility'), { target: { value: 'local-llama' } })
    fireEvent.change(el('Model for utility'), { target: { value: 'qwen3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save aliases' }))
    await waitFor(() => expect(setAliases).toHaveBeenCalledTimes(1))
    const sent = setAliases.mock.calls[0][0] as { alias: string }[]
    expect(sent.map((a) => a.alias).sort()).toEqual(['deep', 'default', 'fast', 'utility'])
  })
})

describe('policy', () => {
  it('is delivered off, and shadow shows the "not applied" banner', async () => {
    await mount()
    expect((screen.getByRole('radio', { name: 'Off' }) as HTMLInputElement).checked).toBe(true)
    expect(screen.queryByText('Computed and recorded, not applied')).toBeNull()
    fireEvent.click(screen.getByRole('radio', { name: 'Shadow' }))
    expect(screen.getByText('Computed and recorded, not applied')).toBeTruthy()
  })

  it('enforce lists the roles whose model changes and only saves once confirmed', async () => {
    await mount()
    fireEvent.change(el('Runner, complex task'), { target: { value: 'deep' } })
    fireEvent.change(el('Chat'), { target: { value: 'default' } }) // same model as today: not listed
    fireEvent.click(screen.getByRole('radio', { name: 'Enforce' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save policy' }))
    const dialog = screen.getByRole('alertdialog')
    expect(dialog.textContent).toContain('Runner, complex task: DeepSeek / deepseek-chat → DeepSeek / deepseek-reasoner')
    expect(dialog.textContent).not.toContain('Chat:')
    expect(setPolicy).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enforce' }))
    await waitFor(() => expect(setPolicy).toHaveBeenCalledTimes(1))
    expect(setPolicy.mock.calls[0][0]).toMatchObject({ mode: 'enforce', rules: { 'runner.complex': 'deep', chat: 'default' } })
  })

  it('shadow saves without a confirmation', async () => {
    await mount()
    fireEvent.click(screen.getByRole('radio', { name: 'Shadow' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save policy' }))
    await waitFor(() => expect(setPolicy).toHaveBeenCalled())
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('the fallback chain is reordered with buttons', async () => {
    policy.mockResolvedValue({ ...OFF, fallback: ['default', 'deep', 'fast'] })
    await mount()
    const chain = screen.getByRole('list', { name: 'Fallback chain' })
    const order = () => within(chain).getAllByRole('listitem').map((li) => li.textContent!.replace(/^\d\./, '').trim().split(' ')[0])
    expect(order()).toEqual(['default', 'deep', 'fast'])
    fireEvent.click(screen.getByRole('button', { name: 'Move fast up' }))
    expect(order()).toEqual(['default', 'fast', 'deep'])
    fireEvent.click(screen.getByRole('button', { name: 'Move default down' }))
    expect(order()).toEqual(['fast', 'default', 'deep'])
    expect((screen.getByRole('button', { name: 'Move fast up' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Save policy' }))
    await waitFor(() => expect(setPolicy.mock.calls[0][0]).toMatchObject({ fallback: ['fast', 'default', 'deep'] }))
    expect(screen.getByText(/never reaches an endpoint the project has not agreed to/)).toBeTruthy()
  })

  it('USD caps need a price on every aliased instance; otherwise explained and tokens only', async () => {
    policy.mockResolvedValue({ ...OFF, rules: { chat: 'fast' } }) // fast → free local instance
    await mount()
    const usd = el('Per run (USD)')
    expect(usd.getAttribute('aria-disabled')).toBe('true')
    expect(document.getElementById(usd.getAttribute('aria-describedby')!)?.textContent).toContain('refused when its model has none')
    fireEvent.change(usd, { target: { value: '5' } })
    expect(usd.value).toBe('')
    fireEvent.change(el('Per run (tokens)'), { target: { value: '50000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save policy' }))
    await waitFor(() => expect(setPolicy.mock.calls[0][0].caps).toMatchObject({ per_run_tokens: 50000, per_run_usd: null }))
  })

  it('USD caps are offered when every aliased instance is priced', async () => {
    policy.mockResolvedValue({ ...OFF, rules: { chat: 'deep' } })
    await mount()
    const usd = el('Per run (USD)')
    expect(usd.getAttribute('aria-disabled')).toBeNull()
    fireEvent.change(usd, { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save policy' }))
    await waitFor(() => expect(setPolicy.mock.calls[0][0].caps).toMatchObject({ per_run_usd: 5 }))
  })

  it('a 403 reads "Only a signed-in user can change this"', async () => {
    const { ApiError } = await import('@/services/api')
    setPolicy.mockRejectedValue(new ApiError(403, ''))
    await mount()
    fireEvent.click(screen.getByRole('button', { name: 'Save policy' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Only a signed-in user can change this')
  })
})
