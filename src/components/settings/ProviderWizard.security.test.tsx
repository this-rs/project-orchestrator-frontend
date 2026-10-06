/**
 * Where the API key of the wizard goes — checked at the network boundary
 * (`fetch`), with the REAL services, not mocks of them:
 * - it is in exactly one request, `PUT /api/vault/secrets/{name}`, with the
 *   unlock proof of this tab;
 * - it is in no request to `/api/chat/providers` (create or test), whose body
 *   only carries `credential_ref: "vault:<name>"`;
 * - the field is emptied, and the key is in neither the DOM nor a message,
 *   after a success and after a failure half-way;
 * - a locked vault sends no write at all.
 *
 * Run with: npx vitest run src/components/settings/ProviderWizard.security.test.tsx
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'

vi.mock('@/services/authManager', () => ({
  getValidToken: () => Promise.resolve('human-token'),
  refreshToken: vi.fn(),
  forceLogout: vi.fn(),
}))
vi.mock('@/services/auth', () => ({ getAuthMode: () => 'none' }))
vi.mock('@/services/env', async (orig) => ({
  ...(await orig<typeof import('@/services/env')>()),
  isTauri: false,
  getApiBase: () => '/api',
}))

import { forgetUnlockProof, vaultApi } from '@/services/vault'
import { ProviderWizard } from './ProviderWizard'
import { CLAUDE, mountSettings } from './settingsTestKit'

const SECRET = 'sk-live-THE-SECRET-4f9a2c'

interface Call {
  method: string
  path: string
  body: string
  headers: Record<string, string>
}
let calls: Call[] = []
let vaultOpen = true
let createStatus = 201

const json = (status: number, body: unknown) =>
  new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function route(method: string, path: string): Response {
  if (method === 'GET' && path === '/api/vault') {
    return json(200, {
      initialized: true,
      unlocked_until: vaultOpen ? '2999-01-01T00:00:00Z' : null,
      secret_count: 0,
      unavailable: null,
      secrets: [],
      grants: [],
      requests: [],
    })
  }
  if (method === 'POST' && path === '/api/vault/unlock') return json(200, { unlocked_until: '2999-01-01T00:00:00Z', unlock_proof: 'proof-of-this-tab' })
  if (path.startsWith('/api/vault/secrets/')) return new Response(null, { status: 204 })
  if (method === 'POST' && path === '/api/vault/grants') return json(201, { id: 'grant-1', secrets: {}, scope: {}, created_at: '', expires_at: '' })
  if (method === 'POST' && path === '/api/chat/providers') {
    return createStatus === 201 ? json(201, { id: 'ds' }) : json(createStatus, { error: 'security_gate_closed: authentication is off' })
  }
  if (method === 'POST' && path === '/api/chat/providers/test') {
    return json(200, {
      ok: false,
      health: { state: 'ok', code: 'model_no_tools' },
      models: [{ id: 'deepseek-flash' }, { id: 'deepseek-v4-pro' }],
      probe: { tools: false, context_window: 1048576 },
    })
  }
  if (method === 'PUT' && path.startsWith('/api/chat/providers/')) return json(200, { id: 'ds' })
  if (method === 'GET' && path === '/api/chat/providers') return json(200, { providers: [{ id: 'claude-code', kind: 'claude_code', health: { state: 'ok' } }] })
  if (method === 'GET' && path === '/api/projects') return json(200, { items: [] })
  return json(404, { error: 'unexpected route' })
}

beforeEach(async () => {
  calls = []
  vaultOpen = true
  createStatus = 201
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const u = new URL(url, 'http://localhost')
      const method = (init.method ?? 'GET').toUpperCase()
      calls.push({
        method,
        path: u.pathname,
        body: typeof init.body === 'string' ? init.body : '',
        headers: (init.headers ?? {}) as Record<string, string>,
      })
      return route(method, u.pathname)
    }),
  )
  forgetUnlockProof()
})

afterEach(() => {
  vi.unstubAllGlobals()
  forgetUnlockProof()
})

async function fillUpToKey() {
  const utils = mountSettings(<ProviderWizard existingIds={['claude-code']} onClose={vi.fn()} onFinished={vi.fn()} />, { providers: [CLAUDE] })
  fireEvent.change(screen.getByLabelText('Identifiant'), { target: { value: 'ds' } })
  fireEvent.click(screen.getByRole('button', { name: 'Suivant' }))
  return utils
}

const carries = (c: Call) => c.body.includes(SECRET) || Object.values(c.headers).some((v) => String(v).includes(SECRET))

describe('the API key of the wizard', () => {
  it('goes ONLY to PUT /api/vault/secrets/{name}, never to /api/chat/providers; the field is emptied', async () => {
    await vaultApi.unlock('the passphrase', 60)
    const { container } = await fillUpToKey()
    await screen.findByTestId('wizard-vault-open')
    const input = screen.getByLabelText('Clé d’API') as HTMLInputElement
    expect(input.type).toBe('password')
    expect(input.getAttribute('autocomplete')).toBe('off')
    fireEvent.change(input, { target: { value: SECRET } })
    expect(container.innerHTML).not.toContain(SECRET) // uncontrolled: no value attribute
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer et tester' }))
    expect(input.value).toBe('') // emptied before anything is sent
    await screen.findByTestId('wizard-test-result')

    const withSecret = calls.filter(carries)
    expect(withSecret.map((c) => `${c.method} ${c.path}`)).toEqual(['PUT /api/vault/secrets/ds'])
    expect(JSON.parse(withSecret[0].body)).toMatchObject({ value: SECRET })
    expect(withSecret[0].headers['x-vault-proof']).toBe('proof-of-this-tab')

    const providerCalls = calls.filter((c) => c.path.startsWith('/api/chat/providers') && c.method !== 'GET')
    expect(providerCalls.map((c) => `${c.method} ${c.path}`)).toEqual(['POST /api/chat/providers', 'POST /api/chat/providers/test'])
    for (const c of providerCalls) {
      const body = JSON.parse(c.body) as Record<string, unknown>
      expect(body.credential_ref).toBe('vault:ds')
      expect(body).not.toHaveProperty('api_key')
      expect(c.body).not.toContain(SECRET)
    }
    const grant = calls.find((c) => c.path === '/api/vault/grants')!
    expect(JSON.parse(grant.body)).toMatchObject({ secrets: { kind: 'names', names: ['ds'] }, scope: { kind: 'provider', value: 'ds' } })
    expect(grant.body).not.toContain(SECRET)

    // Order: secret → instance → grant → test.
    const order = calls.filter((c) => c.method !== 'GET').map((c) => `${c.method} ${c.path}`)
    expect(order.slice(1)).toEqual(['PUT /api/vault/secrets/ds', 'POST /api/chat/providers', 'POST /api/vault/grants', 'POST /api/chat/providers/test'])
    expect(document.body.innerHTML).not.toContain(SECRET)
  })

  it('after a failure half-way: what exists is said, and the key is in neither the DOM nor any message', async () => {
    createStatus = 409
    await vaultApi.unlock('the passphrase', 60)
    await fillUpToKey()
    await screen.findByTestId('wizard-vault-open')
    fireEvent.change(screen.getByLabelText('Clé d’API'), { target: { value: SECRET } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer et tester' }))
    const failure = await screen.findByTestId('wizard-failure')
    expect(screen.getByTestId('wizard-already-done').textContent).toBe(
      'Déjà fait : la clé « ds » est enregistrée dans le coffre. Rien d’autre n’a été créé.',
    )
    expect(failure.textContent).not.toContain(SECRET)
    for (const alert of screen.getAllByRole('alert')) expect(alert.textContent).not.toContain(SECRET)
    expect(document.body.innerHTML).not.toContain(SECRET)
    expect(document.title).not.toContain(SECRET)
    expect(calls.filter(carries).map((c) => c.path)).toEqual(['/api/vault/secrets/ds'])

    // Cancel removes the secret this wizard wrote.
    fireEvent.click(screen.getByRole('button', { name: 'Annuler et supprimer ce qui a été créé' }))
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer ce qui a été créé' }))
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && c.path === '/api/vault/secrets/ds')).toBe(true))
    expect(calls.some((c) => c.method === 'DELETE' && c.path.startsWith('/api/chat/providers'))).toBe(false)
  })

  it('a locked vault: no write request at all', async () => {
    vaultOpen = false
    await fillUpToKey()
    await screen.findByTestId('wizard-vault-locked')
    fireEvent.change(screen.getByLabelText('Clé d’API'), { target: { value: SECRET } })
    const go = screen.getByRole('button', { name: 'Enregistrer et tester' }) as HTMLButtonElement
    expect(go.disabled).toBe(true)
    fireEvent.click(go)
    await new Promise((r) => setTimeout(r, 20))
    expect(calls.filter((c) => c.method !== 'GET')).toEqual([])
    expect(calls.filter(carries)).toEqual([])
  })

  it('testing another model and making it the default: still no key outside the vault request', async () => {
    await vaultApi.unlock('the passphrase', 60)
    await fillUpToKey()
    await screen.findByTestId('wizard-vault-open')
    fireEvent.change(screen.getByLabelText('Clé d’API'), { target: { value: SECRET } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer et tester' }))
    await screen.findByTestId('wizard-model-picker')
    fireEvent.click(screen.getByRole('radio', { name: /deepseek-v4-pro/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Tester ce modèle' }))
    await waitFor(() => expect(calls.filter((c) => c.path === '/api/chat/providers/test')).toHaveLength(2))
    const retest = calls.filter((c) => c.path === '/api/chat/providers/test')[1]
    expect(JSON.parse(retest.body)).toMatchObject({ default_model: 'deepseek-v4-pro', credential_ref: 'vault:ds' })
    expect(calls.filter((c) => c.path.startsWith('/api/vault/secrets'))).toHaveLength(1)
    expect(calls.filter(carries).map((c) => `${c.method} ${c.path}`)).toEqual(['PUT /api/vault/secrets/ds'])
    expect(document.body.innerHTML).not.toContain(SECRET)
  })

  it('is never written to browser storage', async () => {
    await vaultApi.unlock('the passphrase', 60)
    await fillUpToKey()
    await screen.findByTestId('wizard-vault-open')
    fireEvent.change(screen.getByLabelText('Clé d’API'), { target: { value: SECRET } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer et tester' }))
    await screen.findByTestId('wizard-test-result')
    const dump = (s: Storage) => Array.from({ length: s.length }, (_, i) => `${s.key(i)}=${s.getItem(s.key(i)!)}`).join('\n')
    expect(dump(localStorage)).not.toContain(SECRET)
    expect(dump(sessionStorage)).not.toContain(SECRET)
    expect(window.location.href).not.toContain(SECRET)
  })
})
