/**
 * "Add a provider" wizard: steps, presets, validation, what blocks
 * "Next", the chain secret → instance → grant → test, a failure half-way,
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
const sshHostKey = vi.fn()
vi.mock('@/services/providers', async (orig) => ({
  ...(await orig<typeof import('@/services/providers')>()),
  providersApi: {
    test: (...a: unknown[]) => test(...a),
    create: (...a: unknown[]) => create(...a),
    remove: (...a: unknown[]) => remove(...a),
    allow: (...a: unknown[]) => allow(...a),
    update: (...a: unknown[]) => update(...a),
    list: (...a: unknown[]) => list(...a),
    sshHostKey: (...a: unknown[]) => sshHostKey(...a),
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

const update = vi.fn()
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
  return mountSettings(
    <ProviderWizard
      existingIds={['claude-code', 'deepseek']}
      onClose={onClose}
      onFinished={onFinished}
    />,
    {
      providers: [CLAUDE, DEEPSEEK],
      list,
    }
  )
}
const field = (name: string | RegExp) => screen.getByLabelText(name) as HTMLInputElement
const button = (name: string | RegExp) => screen.getByRole('button', { name })
const current = () =>
  screen.getByRole('list', { name: 'Wizard steps' }).querySelector('[aria-current="step"]')
    ?.textContent

/** Pick an option of a kit Select (a combobox + listbox, not a native select). */
function pick(combo: string, option: string) {
  const trigger = screen.getByRole('combobox', { name: combo })
  fireEvent.click(trigger)
  const listbox = document.getElementById(trigger.getAttribute('aria-controls')!)!
  fireEvent.click(within(listbox).getByRole('option', { name: option, hidden: true }))
}

beforeEach(() => {
  list.mockReset().mockResolvedValue(response([CLAUDE, DEEPSEEK]))
  update.mockReset().mockResolvedValue({})
  for (const m of [
    test,
    create,
    remove,
    allow,
    putSecret,
    createGrant,
    deleteSecret,
    revokeGrant,
    onClose,
    onFinished,
    sshHostKey,
  ])
    m.mockReset()
  proof = true
  overview.mockReset().mockResolvedValue(OPEN_VAULT)
  create.mockResolvedValue({})
  remove.mockResolvedValue(undefined)
  allow.mockResolvedValue({})
  putSecret.mockResolvedValue({})
  createGrant.mockResolvedValue({ id: 'grant-1' })
  deleteSecret.mockResolvedValue({})
  revokeGrant.mockResolvedValue({})
  test.mockResolvedValue({
    ok: true,
    health: { state: 'ok' },
    models: [{ id: 'qwen3' }, { id: 'llama3' }],
    probe: { tools: true, context_window: 131072 },
  })
})

describe('ProviderWizard — steps and presets', () => {
  it('shows five numbered steps and starts on "Model"', () => {
    mount()
    const steps = within(screen.getByRole('list', { name: 'Wizard steps' })).getAllByRole(
      'listitem'
    )
    expect(steps.map((s) => s.textContent)).toEqual([
      '1Model',
      '2Key',
      '3Connection',
      '4Project',
      '5Summary',
    ])
    expect(current()).toContain('Model')
    expect(screen.getByText('Step 1 of 5')).toBeTruthy()
  })

  it('a preset pre-fills id, label, base URL, model, cost and the kind of key', () => {
    mount()
    fireEvent.click(screen.getByRole('radio', { name: /Ollama \(local\)/ }))
    expect(field('Identifier').value).toBe('ollama')
    expect(field('Display name').value).toBe('Ollama (local)')
    expect(field('Base URL').value).toBe('http://localhost:11434/v1')
    expect(screen.getByRole('combobox', { name: 'Cost source' }).textContent).toContain(
      'Free (local)'
    )
    fireEvent.click(button('Next'))
    expect((screen.getByRole('radio', { name: /No key/ }) as HTMLInputElement).checked).toBe(
      true
    )
    expect(screen.getByTestId('wizard-credential-ref').textContent).toBe('none')
  })

  it('DeepSeek pre-fills its model and a vault key named after the id', () => {
    mount()
    fireEvent.change(field('Identifier'), { target: { value: 'ds' } })
    expect(field('Default model').value).toBe('deepseek-chat')
    expect(field('Base URL').value).toBe('https://api.deepseek.com')
    fireEvent.click(button('Next'))
    expect(
      (screen.getByRole('radio', { name: /Type a new key/ }) as HTMLInputElement).checked
    ).toBe(true)
    expect(field('Name in the vault').value).toBe('ds')
    expect(screen.getByTestId('wizard-credential-ref').textContent).toBe('vault:ds')
  })

  it('Codex and opencode (ACP) have no URL field; ACP only allows no key', () => {
    mount()
    fireEvent.click(screen.getByRole('radio', { name: /opencode \(ACP\)/ }))
    expect(screen.queryByLabelText('Base URL')).toBeNull()
    expect(screen.getByText(/CHAT_PROVIDER_ACP_COMMANDS/, { selector: 'p' })).toBeTruthy()
    fireEvent.click(button('Next'))
    expect(
      (screen.getByRole('radio', { name: /Type a new key/ }) as HTMLInputElement).disabled
    ).toBe(true)
    expect((screen.getByRole('radio', { name: /No key/ }) as HTMLInputElement).checked).toBe(
      true
    )
  })

  it('"Previous" goes back and keeps what was typed', () => {
    mount()
    fireEvent.click(screen.getByRole('radio', { name: /Ollama/ }))
    fireEvent.change(field('Identifier'), { target: { value: 'my-ollama' } })
    fireEvent.click(button('Next'))
    expect(current()).toContain('Key')
    fireEvent.click(button('Previous'))
    expect(current()).toContain('Model')
    expect(field('Identifier').value).toBe('my-ollama')
  })
})

describe('ProviderWizard — validation blocks "Next"', () => {
  it('a taken id blocks the step and says why', () => {
    mount()
    // The DeepSeek preset suggests `deepseek`, which exists already.
    expect((button('Next') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByTestId('wizard-blocker').textContent).toContain(
      'A provider already has this identifier.'
    )
    fireEvent.change(field('Identifier'), { target: { value: 'deepseek-2' } })
    expect((button('Next') as HTMLButtonElement).disabled).toBe(false)
  })

  it.each([
    ['Mon_ID', 'Lowercase letters'],
    ['claude-code', 'reserved'],
  ])('refuses the id %s', (id, msg) => {
    mount()
    fireEvent.change(field('Identifier'), { target: { value: id } })
    fireEvent.blur(field('Identifier'))
    expect((button('Next') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('alert').textContent).toContain(msg)
  })

  it('refuses plain http outside loopback', () => {
    mount()
    fireEvent.change(field('Identifier'), { target: { value: 'x' } })
    fireEvent.change(field('Base URL'), { target: { value: 'http://example.com/v1' } })
    fireEvent.blur(field('Base URL'))
    expect((button('Next') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('alert').textContent).toContain('Use https')
  })

  it('step 2: a new key must be typed, and an existing vault name is never overwritten', async () => {
    mount()
    fireEvent.change(field('Identifier'), { target: { value: 'ds' } })
    fireEvent.click(button('Next'))
    await screen.findByTestId('wizard-vault-open')
    const go = button('Save and test') as HTMLButtonElement
    expect(go.disabled).toBe(true)
    expect(screen.getByTestId('wizard-blocker').textContent).toContain('Enter the API key')
    fireEvent.change(field('API key'), { target: { value: 'sk-x' } })
    fireEvent.change(field('Name in the vault'), { target: { value: 'old-key' } })
    expect(go.disabled).toBe(true)
    expect(screen.getByTestId('wizard-blocker').textContent).toContain(
      'A key already has this name in the vault'
    )
    fireEvent.change(field('Name in the vault'), { target: { value: 'ds-key' } })
    expect(go.disabled).toBe(false)
  })

  it('step 2: an env reference needs a variable name', () => {
    mount()
    fireEvent.change(field('Identifier'), { target: { value: 'ds' } })
    fireEvent.click(button('Next'))
    fireEvent.click(screen.getByRole('radio', { name: /Server environment variable/ }))
    expect((button('Save and test') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(field('Variable name'), { target: { value: 'DEEPSEEK_API_KEY' } })
    expect(screen.getByTestId('wizard-credential-ref').textContent).toBe('env:DEEPSEEK_API_KEY')
    expect((button('Save and test') as HTMLButtonElement).disabled).toBe(false)
  })

  it('a locked vault: the unlock flow of the vault page is shown, and nothing is written', async () => {
    proof = false
    overview.mockResolvedValue({ ...OPEN_VAULT, unlocked_until: null })
    mount()
    fireEvent.change(field('Identifier'), { target: { value: 'ds' } })
    fireEvent.click(button('Next'))
    const locked = await screen.findByTestId('wizard-vault-locked')
    expect(within(locked).getByLabelText('Vault passphrase')).toBeTruthy()
    fireEvent.change(field('API key'), { target: { value: 'sk-locked' } })
    const go = button('Save and test') as HTMLButtonElement
    expect(go.disabled).toBe(true)
    expect(screen.getByTestId('wizard-blocker').textContent).toContain('Unlock the vault')
    fireEvent.click(go)
    expect(putSecret).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })
})

describe('ProviderWizard — the chain and the test', () => {
  it('no key (Ollama): create → test, readable verdict, consent bound to the origin, summary, finish', async () => {
    mount()
    fireEvent.click(screen.getByRole('radio', { name: /Ollama/ }))
    fireEvent.click(button('Next'))
    fireEvent.click(button('Save and test'))
    const result = await screen.findByTestId('wizard-test-result')
    expect(result.textContent).toContain('The connection works.')
    expect(result.textContent).toContain('2 found: qwen3, llama3')
    expect(result.textContent).toContain('Tool call')
    expect(result.textContent).toContain('131')
    expect(create).toHaveBeenCalledTimes(1)
    expect(create.mock.calls[0][0]).toMatchObject({
      id: 'ollama',
      kind: 'openai_compatible',
      preset: 'ollama',
      credential_ref: 'none',
    })
    expect(putSecret).not.toHaveBeenCalled()
    expect(createGrant).not.toHaveBeenCalled()
    expect(screen.getByTestId('wizard-task-instance').getAttribute('data-state')).toBe('done')
    expect(screen.getByTestId('wizard-task-test').getAttribute('data-state')).toBe('done')
    expect(screen.queryByTestId('wizard-task-secret')).toBeNull()

    fireEvent.click(button('Next'))
    expect(current()).toContain('Project')
    expect(screen.getByTestId('wizard-origin').textContent).toBe('http://localhost:11434')
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Project' }).hasAttribute('disabled')).toBe(false)
    )
    pick('Project', 'Acme')
    fireEvent.click(button('Allow http://localhost:11434'))
    await screen.findByTestId('wizard-consented')
    expect(allow).toHaveBeenCalledWith('acme', 'ollama', 'http://localhost:11434')

    fireEvent.click(button('Next'))
    const summary = screen.getByTestId('wizard-summary')
    expect(summary.textContent).toContain('ollama')
    expect(summary.textContent).toContain('passed')
    expect(summary.textContent).toContain('acme allowed')
    fireEvent.click(button('Finish'))
    expect(onFinished).toHaveBeenCalledWith('ollama')
  })

  it('the project step can be skipped', async () => {
    mount()
    fireEvent.click(screen.getByRole('radio', { name: /Ollama/ }))
    fireEvent.click(button('Next'))
    fireEvent.click(button('Save and test'))
    await screen.findByTestId('wizard-test-result')
    fireEvent.click(button('Next'))
    fireEvent.click(button('Skip this step'))
    expect(screen.getByTestId('wizard-summary').textContent).toContain('none allowed')
  })

  it('a failed test is translated from its code, and does not hide that the instance exists', async () => {
    test.mockResolvedValue({
      ok: false,
      health: { state: 'unreachable', code: 'endpoint_unreachable' },
    })
    mount()
    fireEvent.click(screen.getByRole('radio', { name: /Ollama/ }))
    fireEvent.click(button('Next'))
    fireEvent.click(button('Save and test'))
    const result = await screen.findByTestId('wizard-test-result')
    expect(result.textContent).toContain('Test failed')
    expect(screen.getByTestId('wizard-test-problem').textContent).toBe(
      'The endpoint does not answer. Check the URL and that the service is running.'
    )
    expect(result.textContent).toContain('No')
    expect(screen.getByText(/You can continue: the instance exists/)).toBeTruthy()
    test.mockResolvedValue({ ok: true, health: { state: 'ok' }, models: [] })
    fireEvent.click(button('Test again'))
    await waitFor(() =>
      expect(screen.getByTestId('wizard-test-result').textContent).toContain(
        'The connection works.'
      )
    )
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('a new key: secret → instance → grant → test, in that order, with the reference only in the instance body', async () => {
    mount()
    fireEvent.change(field('Identifier'), { target: { value: 'ds' } })
    fireEvent.click(button('Next'))
    await screen.findByTestId('wizard-vault-open')
    fireEvent.change(field('API key'), { target: { value: 'sk-very-secret' } })
    pick('Grant duration', '7 days')
    fireEvent.click(button('Save and test'))
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
    for (const body of [create.mock.calls[0][0], test.mock.calls[0][0]] as Record<
      string,
      unknown
    >[]) {
      expect(body.credential_ref).toBe('vault:ds')
      expect(JSON.stringify(body)).not.toContain('sk-very-secret')
      for (const k of ['api_key', 'key', 'secret', 'token', 'value', 'password'])
        expect(body).not.toHaveProperty(k)
    }
  })

  it('a key already in the vault: no secret is written, the grant names that key', async () => {
    mount()
    fireEvent.change(field('Identifier'), { target: { value: 'ds' } })
    fireEvent.click(button('Next'))
    await screen.findByTestId('wizard-vault-open')
    fireEvent.click(screen.getByRole('radio', { name: /Key already in the vault/ }))
    pick('Vault key', 'old-key')
    fireEvent.click(button('Save and test'))
    await screen.findByTestId('wizard-test-result')
    expect(putSecret).not.toHaveBeenCalled()
    expect(create.mock.calls[0][0]).toMatchObject({ credential_ref: 'vault:old-key' })
    expect(createGrant.mock.calls[0][0]).toMatchObject({
      secrets: { kind: 'names', names: ['old-key'] },
    })
  })

  it('a failure half-way says exactly what exists, offers to resume, or to cancel and remove it', async () => {
    create.mockRejectedValueOnce(
      new ApiError(409, '{"error":"security_gate_closed: authentication is off"}')
    )
    mount()
    fireEvent.change(field('Identifier'), { target: { value: 'ds' } })
    fireEvent.click(button('Next'))
    await screen.findByTestId('wizard-vault-open')
    fireEvent.change(field('API key'), { target: { value: 'sk-half-way' } })
    fireEvent.click(button('Save and test'))
    const failure = await screen.findByTestId('wizard-failure')
    expect(failure.textContent).toContain('Failed: Create the instance.')
    expect(failure.textContent).toContain('require authentication to be enabled')
    expect(screen.getByTestId('wizard-already-done').textContent).toBe(
      'Already done: the key “ds” is saved in the vault. Nothing else was created.'
    )
    expect(screen.getByTestId('wizard-task-secret').getAttribute('data-state')).toBe('done')
    expect(screen.getByTestId('wizard-task-instance').getAttribute('data-state')).toBe('error')
    expect(screen.getByTestId('wizard-task-grant').getAttribute('data-state')).toBe('todo')
    expect((button('Next') as HTMLButtonElement).disabled).toBe(true)
    expect((button('Previous') as HTMLButtonElement).disabled).toBe(true)
    expect(document.body.innerHTML).not.toContain('sk-half-way')

    // Cancel: removes the secret THIS wizard wrote, and nothing else.
    fireEvent.click(
      within(failure).getByRole('button', { name: 'Cancel and delete what was created' })
    )
    const confirm = screen.getByRole('alertdialog')
    expect(confirm.textContent).toContain('the key “ds” is saved in the vault')
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete what was created' }))
    await waitFor(() => expect(deleteSecret).toHaveBeenCalledWith('ds'))
    expect(remove).not.toHaveBeenCalled()
    expect(revokeGrant).not.toHaveBeenCalled()
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('"Resume" continues from the failed sub-step without writing the secret again', async () => {
    createGrant.mockRejectedValueOnce(
      new ApiError(400, '{"error":"a provider grant names its secret"}')
    )
    mount()
    fireEvent.change(field('Identifier'), { target: { value: 'ds' } })
    fireEvent.click(button('Next'))
    await screen.findByTestId('wizard-vault-open')
    fireEvent.change(field('API key'), { target: { value: 'sk-resume' } })
    fireEvent.click(button('Save and test'))
    await screen.findByTestId('wizard-failure')
    expect(screen.getByTestId('wizard-already-done').textContent).toContain(
      'the instance “ds” is created'
    )
    fireEvent.click(button('Resume'))
    await screen.findByTestId('wizard-test-result')
    expect(putSecret).toHaveBeenCalledTimes(1)
    expect(create).toHaveBeenCalledTimes(1)
    expect(createGrant).toHaveBeenCalledTimes(2)
    expect((button('Next') as HTMLButtonElement).disabled).toBe(false)
  })

  it('a failure before anything exists says so, and sends back to the key step', async () => {
    putSecret.mockRejectedValueOnce(new ApiError(409, '{"error":"vault locked"}'))
    mount()
    fireEvent.change(field('Identifier'), { target: { value: 'ds' } })
    fireEvent.click(button('Next'))
    await screen.findByTestId('wizard-vault-open')
    fireEvent.change(field('API key'), { target: { value: 'sk-first' } })
    fireEvent.click(button('Save and test'))
    await screen.findByTestId('wizard-failure')
    expect(screen.getByTestId('wizard-already-done').textContent).toBe(
      'Nothing was created: no key, no instance, no grant.'
    )
    expect(create).not.toHaveBeenCalled()
    fireEvent.click(button('Back to the Key step'))
    expect(current()).toContain('Key')
    expect(field('API key').value).toBe('')
  })

  it('cancelling with nothing created just closes', () => {
    mount()
    fireEvent.click(button('Cancel'))
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
        expect(b.classList.contains('btn')).toBe(true) // the glass recipe of <Button>
      }
      const footer = wizard.querySelector('footer')!
      const sizes = new Set(
        [...footer.querySelectorAll('button')].map((b) =>
          /min-h-9 px-3 py-2 text-sm/.test(b.className)
        )
      )
      expect(sizes).toEqual(new Set([true]))
    }
    check()
    fireEvent.change(field('Identifier'), { target: { value: 'ds' } })
    fireEvent.click(button('Next'))
    await screen.findByTestId('wizard-vault-locked')
    check()
  })

  it('the main actions sit on the right of a single footer', () => {
    const { container } = mount()
    const footers = container.querySelectorAll('[data-testid="provider-wizard"] footer')
    expect(footers).toHaveLength(1)
    const right = within(footers[0] as HTMLElement).getByRole('button', {
      name: 'Next',
    }).parentElement!
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
    fireEvent.click(button('Next'))
    fireEvent.click(button('Save and test'))
    await screen.findByTestId('wizard-test-result')
    await waitFor(() => expect(list.mock.calls.length).toBeGreaterThan(before))
  })
})

describe('ProviderWizard — the model the tool test is about', () => {
  const NO_TOOLS = {
    ok: false,
    health: { state: 'ok', code: 'model_no_tools' },
    models: [{ id: 'deepseek-flash' }, { id: 'deepseek-v4-pro' }],
    probe: { tools: false, context_window: 1048576 },
  }

  /** DeepSeek preset (model `deepseek-chat`), a new key, up to the first verdict. */
  async function toFirstVerdict(model?: string) {
    mount()
    fireEvent.change(field('Identifier'), { target: { value: 'ds' } })
    if (model !== undefined)
      fireEvent.change(field('Default model'), { target: { value: model } })
    fireEvent.click(button('Next'))
    await screen.findByTestId('wizard-vault-open')
    fireEvent.change(field('API key'), { target: { value: 'sk-model-test' } })
    fireEvent.click(button('Save and test'))
    await screen.findByTestId('wizard-test-result')
  }
  const radio = (name: string) =>
    screen.getByRole('radio', { name: new RegExp(name) }) as HTMLInputElement

  it('(a) tools=false with two models: both are offered, the model tested is named, the message is nuanced', async () => {
    test.mockResolvedValue(NO_TOOLS)
    await toFirstVerdict('deepseek-flash')
    const result = screen.getByTestId('wizard-test-result')
    expect(result.textContent).toContain('Model tested')
    expect(result.textContent).toContain('deepseek-flash')
    expect(screen.getByTestId('wizard-test-problem').textContent).toBe(
      'This model did not call the test tool (some reasoning models do not): try another listed model.'
    )
    expect(result.textContent).not.toContain('ne peut pas appeler')
    const picker = screen.getByTestId('wizard-model-picker')
    expect(within(picker).getByText('Model to test')).toBeTruthy()
    expect(radio('deepseek-flash').checked).toBe(true)
    expect(
      within(picker).getByRole('radio', { name: /deepseek-flash.*Tested: failed/ })
    ).toBeTruthy()
    expect(
      within(picker).getByRole('radio', { name: /deepseek-v4-pro.*Not tested yet/ })
    ).toBeTruthy()
    expect(test.mock.calls[0][0]).toMatchObject({ default_model: 'deepseek-flash' })
  })

  it('(b) "Test this model" posts a test with the chosen model, and touches neither the vault nor the instance', async () => {
    test.mockResolvedValue(NO_TOOLS)
    await toFirstVerdict('deepseek-flash')
    const before = {
      put: putSecret.mock.calls.length,
      grant: createGrant.mock.calls.length,
      create: create.mock.calls.length,
    }
    test.mockResolvedValue({
      ...NO_TOOLS,
      ok: true,
      health: { state: 'ok' },
      probe: { tools: true, context_window: 1048576 },
    })
    fireEvent.click(radio('deepseek-v4-pro'))
    fireEvent.click(button('Test this model'))
    await waitFor(() => expect(test).toHaveBeenCalledTimes(2))
    const body = test.mock.calls[1][0] as Record<string, unknown>
    expect(body).toMatchObject({
      id: 'ds',
      default_model: 'deepseek-v4-pro',
      credential_ref: 'vault:ds',
    })
    expect(JSON.stringify(body)).not.toContain('sk-model-test')
    expect(putSecret.mock.calls.length).toBe(before.put)
    expect(createGrant.mock.calls.length).toBe(before.grant)
    expect(create.mock.calls.length).toBe(before.create)
    expect(overview).toHaveBeenCalledTimes(1) // the initial read, nothing since
    await waitFor(() =>
      expect(screen.getByTestId('wizard-test-result').textContent).toContain(
        'The connection works.'
      )
    )
    expect(screen.getByTestId('wizard-test-result').textContent).toContain('deepseek-v4-pro')
  })

  it('(c) success with another model: "Use this model as default" updates that single field', async () => {
    test.mockResolvedValue(NO_TOOLS)
    await toFirstVerdict('deepseek-flash')
    expect(screen.getByTestId('wizard-saved-default').textContent).toContain('deepseek-flash')
    expect(screen.queryByRole('button', { name: 'Use this model as default' })).toBeNull()
    test.mockResolvedValue({
      ...NO_TOOLS,
      ok: true,
      health: { state: 'ok' },
      probe: { tools: true },
    })
    fireEvent.click(radio('deepseek-v4-pro'))
    fireEvent.click(button('Test this model'))
    const offer = await screen.findByRole('button', { name: 'Use this model as default' })
    expect(screen.getByTestId('wizard-default-offer').textContent).toContain(
      'deepseek-v4-pro passed the test'
    )
    fireEvent.click(offer)
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith('ds', { default_model: 'deepseek-v4-pro' })
    )
    await waitFor(() =>
      expect(screen.getByTestId('wizard-saved-default').textContent).toContain('deepseek-v4-pro')
    )
    expect(screen.queryByRole('button', { name: 'Use this model as default' })).toBeNull()
    fireEvent.click(button('Next'))
    fireEvent.click(button('Skip this step'))
    expect(screen.getByTestId('wizard-summary').textContent).toContain('deepseek-v4-pro')
  })

  it('a success with the model already saved as default: no offer, the saved default is named', async () => {
    test.mockResolvedValue({
      ...NO_TOOLS,
      ok: true,
      health: { state: 'ok' },
      probe: { tools: true },
    })
    await toFirstVerdict('deepseek-flash')
    expect(screen.queryByRole('button', { name: 'Use this model as default' })).toBeNull()
    expect(screen.getByTestId('wizard-saved-default').textContent).toBe(
      'Model saved as default for this instance: deepseek-flash.'
    )
  })

  it('(d) the suggested default model is not listed: said explicitly, and the first listed is pre-selected', async () => {
    test.mockResolvedValue(NO_TOOLS)
    await toFirstVerdict() // DeepSeek preset suggests deepseek-chat
    expect(test.mock.calls[0][0]).toMatchObject({ default_model: 'deepseek-chat' })
    expect(screen.getByTestId('wizard-model-missing').textContent).toContain(
      'The model suggested by default (deepseek-chat) is not offered by this server'
    )
    expect(radio('deepseek-flash').checked).toBe(true)
    expect(screen.queryByRole('radio', { name: /deepseek-chat/ })).toBeNull()
    fireEvent.click(button('Test this model'))
    await waitFor(() => expect(test).toHaveBeenCalledTimes(2))
    expect(test.mock.calls[1][0]).toMatchObject({ default_model: 'deepseek-flash' })
  })

  it('the step explains that the tool test depends on the model', async () => {
    test.mockResolvedValue(NO_TOOLS)
    await toFirstVerdict()
    expect(screen.getByText(/The tool-call test is about ONE model/)).toBeTruthy()
  })
})

describe('ProviderWizard — test button robustness', () => {
  it('a double click on "Save and test" runs the chain once', async () => {
    mount()
    fireEvent.click(screen.getByRole('radio', { name: /Ollama/ }))
    fireEvent.click(button('Next'))
    const go = button('Save and test')
    fireEvent.click(go)
    fireEvent.click(go)
    await screen.findByTestId('wizard-test-result')
    expect(create).toHaveBeenCalledTimes(1)
    expect(test).toHaveBeenCalledTimes(1)
  })

  it('a double click on "Test this model" sends one test', async () => {
    test.mockResolvedValue({
      ok: false,
      health: { state: 'ok', code: 'model_no_tools' },
      models: [{ id: 'a' }, { id: 'b' }],
      probe: { tools: false },
    })
    mount()
    fireEvent.click(screen.getByRole('radio', { name: /Ollama/ }))
    fireEvent.click(button('Next'))
    fireEvent.click(button('Save and test'))
    await screen.findByTestId('wizard-model-picker')
    const b = button('Test this model')
    fireEvent.click(b)
    fireEvent.click(b)
    await waitFor(() => expect(test).toHaveBeenCalledTimes(2))
  })

  it('more than 8 models: a searchable combobox instead of radios, the first listed pre-selected', async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ id: `model-${i}` }))
    test.mockResolvedValue({
      ok: false,
      health: { state: 'ok', code: 'model_no_tools' },
      models: many,
      probe: { tools: false },
    })
    mount()
    fireEvent.click(screen.getByRole('radio', { name: /Ollama/ }))
    fireEvent.click(button('Next'))
    fireEvent.click(button('Save and test'))
    const picker = await screen.findByTestId('wizard-model-picker')
    const box = within(picker).getByRole('combobox', { name: 'Model to test' }) as HTMLInputElement
    expect(box.value).toBe('model-0')
    fireEvent.click(box)
    expect(within(picker).getByText('12 models')).toBeTruthy()
    fireEvent.change(box, { target: { value: 'model-11' } })
    expect(within(picker).queryByRole('option', { name: 'model-3' })).toBeNull()
    expect(within(picker).getByRole('option', { name: 'model-11' })).toBeTruthy()
    expect(within(picker).getByText('1 of 12')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// Claude Code distant (SSH)
// ---------------------------------------------------------------------------

const FINGERPRINT = 'SHA256:abc123fingerprintOfTheMachine'
const HOST_KEY = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIPinnedPublicKeyOfTheMachine'

function pickRemote() {
  mount()
  fireEvent.click(screen.getByRole('radio', { name: /Claude Code remote \(SSH\)/ }))
}

async function fillRemote({ confirm = true }: { confirm?: boolean } = {}) {
  sshHostKey.mockResolvedValue({ host_key: HOST_KEY, host_key_fingerprint: FINGERPRINT })
  fireEvent.change(field('Machine name'), { target: { value: 'lab' } })
  fireEvent.change(field('Machine (name or address)'), { target: { value: 'lab.example.com' } })
  fireEvent.change(field('User'), { target: { value: 'me' } })
  fireEvent.change(field('SSH port'), { target: { value: '2222' } })
  fireEvent.change(field('Working folder on the machine'), { target: { value: '/srv/work' } })
  fireEvent.click(button('Fetch the machine’s key'))
  await screen.findByTestId('remote-fingerprint')
  if (confirm) fireEvent.click(screen.getByRole('checkbox', { name: /I confirm this fingerprint is the machine’s/ }))
}

describe('ProviderWizard — Claude Code distant (SSH)', () => {
  it('offers the kind, with machine fields and no URL', () => {
    pickRemote()
    expect(screen.getByText('Claude Code remote (SSH)', { selector: 'span, div, strong' })).toBeTruthy()
    expect(screen.queryByLabelText('Base URL')).toBeNull()
    expect(screen.getByTestId('remote-fields')).toBeTruthy()
  })

  it('refuses an invalid host (leading dash, forbidden characters) and says so', () => {
    pickRemote()
    fireEvent.change(field('Machine name'), { target: { value: 'lab' } })
    const host = field('Machine (name or address)')
    fireEvent.change(host, { target: { value: '-oProxyCommand=evil' } })
    fireEvent.blur(host)
    expect(screen.getAllByText(/cannot start with “-”/).length).toBeGreaterThan(0)
    fireEvent.change(host, { target: { value: 'lab; rm -rf /' } })
    expect(screen.getAllByText(/letters, digits and/i).length).toBeGreaterThan(0)
    expect(button('Next').hasAttribute('disabled')).toBe(true)
    fireEvent.change(field('SSH port'), { target: { value: '70000' } })
    fireEvent.blur(field('SSH port'))
    expect(screen.getByText('A port between 1 and 65535.')).toBeTruthy()
  })

  it('shows the fetched fingerprint and blocks "Next" until the human confirms it', async () => {
    pickRemote()
    await fillRemote({ confirm: false })
    expect(sshHostKey).toHaveBeenCalledWith({ host: 'lab.example.com', ssh_port: 2222 })
    expect(screen.getByTestId('remote-fingerprint').textContent).toContain(FINGERPRINT)
    expect(button('Next').hasAttribute('disabled')).toBe(true)
    expect(screen.getByTestId('wizard-blocker').textContent).toContain('Confirm that the fingerprint')
    fireEvent.click(screen.getByRole('checkbox', { name: /I confirm this fingerprint is the machine’s/ }))
    expect(button('Next').hasAttribute('disabled')).toBe(false)
  })

  it('changing the host after the confirmation drops the pinned key and the confirmation', async () => {
    pickRemote()
    await fillRemote()
    fireEvent.change(field('Machine (name or address)'), { target: { value: 'other.example.com' } })
    expect(screen.queryByTestId('remote-fingerprint')).toBeNull()
    expect(button('Next').hasAttribute('disabled')).toBe(true)
  })

  it('refuses a pasted private key as the host key, and never offers to confirm it', () => {
    pickRemote()
    const box = field('Machine public key')
    fireEvent.change(box, { target: { value: '-----BEGIN OPENSSH PRIVATE KEY-----' } })
    fireEvent.blur(box)
    expect(screen.getByText(/looks like a private key/)).toBeTruthy()
    expect(screen.queryByTestId('remote-fingerprint')).toBeNull()
    expect(button('Next').hasAttribute('disabled')).toBe(true)
  })

  it('accepts a pasted public key, but still requires the confirmation', () => {
    pickRemote()
    fireEvent.change(field('Machine public key'), { target: { value: HOST_KEY } })
    expect(screen.getByTestId('remote-fingerprint').textContent).toContain('computed by the server')
    expect(screen.getByRole('checkbox', { name: /I confirm/ })).toBeTruthy()
  })

  it('"Rock’n roll" is off by default and warned', () => {
    pickRemote()
    const box = screen.getByRole('checkbox', { name: /Allow “Rock’n roll” mode on this machine/ }) as HTMLInputElement
    expect(box.checked).toBe(false)
    expect(screen.getByRole('note').textContent).toContain('without asking for confirmation')
  })

  it('the key step only offers a vault key: no field to type a private key', async () => {
    pickRemote()
    await fillRemote()
    fireEvent.click(button('Next'))
    expect(screen.queryByLabelText('API key')).toBeNull()
    expect(document.querySelector('input[type="password"]')).toBeNull()
    expect((screen.getByRole('radio', { name: /Type a new key/ }) as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByRole('radio', { name: /No key/ }) as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByRole('radio', { name: /Key already in the vault/ }) as HTMLInputElement).checked).toBe(true)
    expect(screen.getByTestId('wizard-remote-key-note')).toBeTruthy()
    expect(button('Save and test').hasAttribute('disabled')).toBe(true)
  })

  it('tells the key must be dedicated and without passphrase', async () => {
    pickRemote()
    await fillRemote()
    fireEvent.click(button('Next'))
    expect(screen.getByTestId('remote-key-hint').textContent).toBe(
      'Use a dedicated key without a passphrase: the connection is non-interactive and does not use an SSH agent.'
    )
  })

  it('runs the chain with the pinned key and a vault reference, shows the ssh origin, and sends allow_trust=false', async () => {
    pickRemote()
    await fillRemote()
    fireEvent.click(button('Next'))
    pick('Vault key', 'old-key')
    expect(screen.getByTestId('wizard-credential-ref').textContent).toBe('vault:old-key')
    fireEvent.click(button('Save and test'))
    await screen.findByTestId('wizard-test-result')
    expect(putSecret).not.toHaveBeenCalled()
    expect(create).toHaveBeenCalledTimes(1)
    const body = create.mock.calls[0][0] as Record<string, unknown>
    expect(body).toMatchObject({
      id: 'claude-code@lab',
      kind: 'claude_code_remote',
      base_url: '',
      credential_ref: 'vault:old-key',
      host: 'lab.example.com',
      ssh_user: 'me',
      ssh_port: 2222,
      host_key: HOST_KEY,
      remote_cwd: '/srv/work',
      allow_trust: false,
    })
    expect(JSON.stringify(body)).not.toContain('BEGIN')
    expect(createGrant).toHaveBeenCalledWith(
      expect.objectContaining({ scope: { kind: 'provider', value: 'claude-code@lab' } })
    )
    expect(test).toHaveBeenCalled()
    fireEvent.click(button('Next'))
    expect(screen.getByTestId('wizard-origin').textContent).toBe('ssh:me@lab.example.com:2222')
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Project' }).hasAttribute('disabled')).toBe(false)
    )
    pick('Project', 'Acme')
    fireEvent.click(button('Allow ssh:me@lab.example.com:2222'))
    await screen.findByTestId('wizard-consented')
    expect(allow).toHaveBeenCalledWith('acme', 'claude-code@lab', 'ssh:me@lab.example.com:2222')
  })

  it('grants the key to the id the SERVER gave the instance, not the one the wizard computed', async () => {
    create.mockResolvedValue({ id: 'claude-code@claude-code-distant' })
    pickRemote()
    await fillRemote()
    fireEvent.click(button('Next'))
    pick('Vault key', 'old-key')
    fireEvent.click(button('Save and test'))
    await screen.findByTestId('wizard-test-result')
    expect(createGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: { kind: 'provider', value: 'claude-code@claude-code-distant' },
      })
    )
  })

  it('sends allow_trust=true only when the human ticked it', async () => {
    pickRemote()
    await fillRemote()
    fireEvent.click(screen.getByRole('checkbox', { name: /Allow “Rock’n roll” mode/ }))
    fireEvent.click(button('Next'))
    pick('Vault key', 'old-key')
    fireEvent.click(button('Save and test'))
    await screen.findByTestId('wizard-test-result')
    expect((create.mock.calls[0][0] as Record<string, unknown>).allow_trust).toBe(true)
  })

  it('a failed host-key scan is said, and nothing is pinned', async () => {
    pickRemote()
    sshHostKey.mockRejectedValue(new ApiError(502, 'ssh-keyscan failed'))
    fireEvent.change(field('Machine name'), { target: { value: 'lab' } })
    fireEvent.change(field('Machine (name or address)'), { target: { value: 'lab.example.com' } })
    fireEvent.click(button('Fetch the machine’s key'))
    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0))
    expect(screen.queryByTestId('remote-fingerprint')).toBeNull()
    expect(button('Next').hasAttribute('disabled')).toBe(true)
  })
})
