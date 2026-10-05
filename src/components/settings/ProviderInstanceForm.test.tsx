/**
 * Add/edit form of an instance: presets, validation, test before save, and the
 * rule that no secret value ever goes through it.
 *
 * Run with: npx vitest run src/components/settings/ProviderInstanceForm.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'

const test = vi.fn()
const create = vi.fn()
const update = vi.fn()
const overview = vi.fn()
vi.mock('@/services/providers', async (orig) => ({
  ...(await orig<typeof import('@/services/providers')>()),
  providersApi: {
    test: (...a: unknown[]) => test(...a),
    create: (...a: unknown[]) => create(...a),
    update: (...a: unknown[]) => update(...a),
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
import { ProviderInstanceForm } from './ProviderInstanceForm'
import { DEEPSEEK, mountSettings } from './settingsTestKit'

const onSaved = vi.fn()
const onCancel = vi.fn()

function mount(props: Partial<Parameters<typeof ProviderInstanceForm>[0]> = {}) {
  return mountSettings(<ProviderInstanceForm existingIds={['claude-code', 'deepseek']} onSaved={onSaved} onCancel={onCancel} {...props} />)
}
const field = (name: RegExp | string) => screen.getByLabelText(name) as HTMLInputElement

beforeEach(() => {
  for (const m of [test, create, update, onSaved, onCancel]) m.mockReset()
  create.mockResolvedValue({})
  update.mockResolvedValue({})
  overview.mockReset().mockResolvedValue({ secrets: [{ name: 'my-nim-key' }, { name: 'deepseek-key' }] })
})

describe('validateBaseUrl', () => {
  it.each([
    ['https://api.deepseek.com', null],
    ['http://localhost:11434/v1', null],
    ['http://127.0.0.1:8000/v1', null],
    ['http://[::1]:8080/v1', null],
  ])('accepts %s', (url, expected) => expect(validateBaseUrl(url)).toBe(expected))
  it.each(['http://example.com/v1', 'ftp://localhost', 'not a url', ''])('refuses %s', (url) =>
    expect(validateBaseUrl(url)).not.toBeNull(),
  )
})

describe('ProviderInstanceForm', () => {
  it('a preset fills URL, cost basis and the suggested credential type', () => {
    mount()
    fireEvent.change(field('Preset'), { target: { value: 'deepseek' } })
    expect(field('Base URL').value).toBe('https://api.deepseek.com')
    expect(field('Cost basis').value).toBe('priced')
    expect(field('Credential type').value).toBe('vault')
    fireEvent.change(field('Preset'), { target: { value: 'ollama' } })
    expect(field('Base URL').value).toBe('http://localhost:11434/v1')
    expect(field('Cost basis').value).toBe('free')
    expect(field('Credential type').value).toBe('none')
  })

  it('refuses plain http outside loopback and a duplicate id, and sends nothing', async () => {
    mount()
    fireEvent.change(field('Id'), { target: { value: 'deepseek' } })
    fireEvent.change(field('Base URL'), { target: { value: 'http://example.com/v1' } })
    fireEvent.change(field('Credential type'), { target: { value: 'none' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText(/already exists/)).toBeTruthy()
    expect(screen.getByText(/Use https/)).toBeTruthy()
    expect(create).not.toHaveBeenCalled()
  })

  it('offers the vault secret NAMES and saves a reference, with no secret-like field in the body', async () => {
    mount()
    fireEvent.change(field('Preset'), { target: { value: 'nim' } })
    const names = await screen.findByRole('option', { name: 'my-nim-key' })
    expect(names).toBeTruthy()
    fireEvent.change(field('Secret name'), { target: { value: 'my-nim-key' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    const body = create.mock.calls[0][0] as Record<string, unknown>
    expect(body.credential_ref).toBe('vault:my-nim-key')
    for (const forbidden of ['api_key', 'key', 'secret', 'token', 'value', 'password']) expect(body).not.toHaveProperty(forbidden)
    expect(JSON.stringify(body)).not.toMatch(/sk-/)
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
  })

  it('has no password input and no value field, and links to the vault', () => {
    const { container } = mount()
    expect(container.querySelector('input[type="password"]')).toBeNull()
    expect(screen.queryByLabelText(/api key|secret value|token/i)).toBeNull()
    expect(screen.getByRole('link', { name: 'Add the key in the vault' }).getAttribute('href')).toBe('/vault')
  })

  it('an environment credential is a variable NAME', async () => {
    mount()
    fireEvent.change(field('Id'), { target: { value: 'mine' } })
    fireEvent.change(field('Base URL'), { target: { value: 'https://llm.example.com/v1' } })
    fireEvent.change(field('Credential type'), { target: { value: 'env' } })
    fireEvent.change(field('Variable name'), { target: { value: 'MY_KEY' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(create).toHaveBeenCalled())
    expect((create.mock.calls[0][0] as { credential_ref: string }).credential_ref).toBe('env:MY_KEY')
  })

  it('shows the test result: models, tools, window', async () => {
    test.mockResolvedValue({
      ok: true,
      health: { status: 'healthy' },
      models: [{ id: 'm1' }, { id: 'm2' }],
      probe: { tools: true, context_window: 131072 },
    })
    mount()
    fireEvent.change(field('Preset'), { target: { value: 'ollama' } })
    fireEvent.click(screen.getByRole('button', { name: 'Test connection' }))
    const result = await screen.findByTestId('provider-test-result')
    expect(result.textContent).toContain('2 models found: m1, m2')
    expect(result.textContent).toContain('Tool calls: OK')
    expect(result.textContent).toContain('131,072')
    expect(test.mock.calls[0][0]).toMatchObject({ id: 'ollama', credential_ref: 'none' })
  })

  it('a locked vault shows the credentials_locked card', async () => {
    test.mockResolvedValue({
      ok: false,
      health: { status: 'unhealthy', error: { code: 'credentials_locked', message: '' } },
    })
    mount()
    fireEvent.change(field('Preset'), { target: { value: 'nim' } })
    await screen.findByRole('option', { name: 'my-nim-key' })
    fireEvent.change(field('Secret name'), { target: { value: 'my-nim-key' } })
    fireEvent.click(screen.getByRole('button', { name: 'Test connection' }))
    const card = await screen.findByTestId('provider-test-error')
    expect(card.getAttribute('data-error-code')).toBe('credentials_locked')
  })

  it('saving after a failed test asks for an explicit confirmation', async () => {
    test.mockResolvedValue({ ok: false, health: { status: 'unhealthy' } })
    mount()
    fireEvent.change(field('Preset'), { target: { value: 'ollama' } })
    fireEvent.click(screen.getByRole('button', { name: 'Test connection' }))
    await screen.findByText('Connection failed.')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(create).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole('button', { name: 'Save anyway' }))
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
  })

  it('a 403 reads "Only a signed-in user can change this"', async () => {
    create.mockRejectedValue(new ApiError(403, '{"error":"forbidden"}'))
    mount()
    fireEvent.change(field('Preset'), { target: { value: 'ollama' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Only a signed-in user can change this')
  })

  it('editing keeps the id fixed and PATCHes without id or kind', async () => {
    mount({ instance: DEEPSEEK })
    expect(field('Id').disabled).toBe(true)
    fireEvent.change(field('Label'), { target: { value: 'DS prod' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
    const [id, patch] = update.mock.calls[0] as [string, Record<string, unknown>]
    expect(id).toBe('deepseek')
    expect(patch.label).toBe('DS prod')
    expect(patch).not.toHaveProperty('id')
    expect(patch).not.toHaveProperty('kind')
    expect(patch.credential_ref).toBe('vault:deepseek-key')
  })
})
