/**
 * Provider cards: state at a glance, what each card shows, Tester, Modifier,
 * Supprimer with a confirmation.
 *
 * Run with: npx vitest run src/components/settings/ProviderInstances.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'

const status = vi.fn()
const remove = vi.fn()
const list = vi.fn()
vi.mock('@/services/providers', async (orig) => ({
  ...(await orig<typeof import('@/services/providers')>()),
  providersApi: {
    status: (...a: unknown[]) => status(...a),
    remove: (...a: unknown[]) => remove(...a),
    list: (...a: unknown[]) => list(...a),
    test: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    get: vi.fn().mockRejectedValue(Object.assign(new Error('not found'), { status: 404 })),
    models: vi.fn().mockResolvedValue([]),
  },
}))
vi.mock('@/services/vault', async (orig) => ({
  ...(await orig<typeof import('@/services/vault')>()),
  vaultApi: { overview: vi.fn().mockResolvedValue({ secrets: [] }) },
}))

import { ProviderInstances } from './ProviderInstances'
import { normalizeProvidersResponse } from '@/services/providers'
import { CLAUDE, DEEPSEEK, LOCAL, REMOTE, mountSettings, response } from './settingsTestKit'

beforeEach(() => {
  status.mockReset().mockResolvedValue({ status: 'healthy' })
  remove.mockReset().mockResolvedValue(undefined)
  list.mockReset().mockResolvedValue(response([CLAUDE, DEEPSEEK, LOCAL]))
})

const card = (id: string) => screen.getByTestId(`instance-${id}`)

describe('ProviderInstances (cards)', () => {
  it('shows endpoint, default model, cost and the credential REFERENCE, with a state badge', () => {
    mountSettings(<ProviderInstances />)
    const row = card('deepseek')
    expect(row.textContent).toContain('https://api.deepseek.com')
    expect(row.textContent).toContain('deepseek-chat')
    expect(row.textContent).toContain('Tarifé (estimation)')
    expect(row.textContent).toContain('Coffre : deepseek-key')
    expect(row.textContent).toContain('Connecté')
    expect(row.getAttribute('data-status')).toBe('connected')
  })

  it.each([
    [{ status: 'auth_required' as const }, {}, 'key_missing', 'Clé manquante'],
    [
      { status: 'auth_required' as const, login_hint: 'codex login' },
      { credential_ref: 'none' as const },
      'login_required',
      'Connexion requise',
    ],
    [
      {
        status: 'unhealthy' as const,
        error: { code: 'endpoint_unreachable' as const, message: '' },
      },
      {},
      'unreachable',
      'Injoignable',
    ],
    [
      { status: 'unhealthy' as const, error: { code: 'credentials_locked' as const, message: '' } },
      {},
      'vault_locked',
      'Coffre verrouillé',
    ],
    [
      { status: 'healthy' as const },
      { allowed_for_project: false },
      'not_allowed',
      'Projet non autorisé',
    ],
  ])('state %#: %s', (health, extra, key, label) => {
    mountSettings(<ProviderInstances />, {
      list,
      providers: [CLAUDE, { ...DEEPSEEK, ...extra, health }],
    })
    expect(card('deepseek').getAttribute('data-status')).toBe(key)
    expect(card('deepseek').textContent).toContain(label)
  })

  it('the built-in instance can be tested, but neither edited nor deleted', () => {
    mountSettings(<ProviderInstances />)
    const row = within(card('claude-code'))
    expect(row.queryByRole('button', { name: /Supprimer/ })).toBeNull()
    expect(row.queryByRole('button', { name: /Modifier/ })).toBeNull()
    expect(row.getByRole('button', { name: 'Tester Claude Code' })).toBeTruthy()
  })

  it('an unhealthy instance shows its last error in the state card', () => {
    mountSettings(<ProviderInstances />, {
      list,
      providers: [
        CLAUDE,
        {
          ...DEEPSEEK,
          health: {
            status: 'unhealthy',
            error: { code: 'endpoint_unreachable', message: 'connection refused' },
          },
        },
      ],
    })
    expect(screen.getByTestId('instance-error-deepseek').getAttribute('data-error-code')).toBe(
      'endpoint_unreachable'
    )
  })

  it('auth_required shows the login command', () => {
    mountSettings(<ProviderInstances />, {
      list,
      providers: [{ ...CLAUDE, health: { status: 'auth_required', login_hint: 'claude login' } }],
    })
    expect(screen.getByTestId('instance-error-claude-code').textContent).toContain('claude login')
  })

  it('Tester calls GET status of that instance and shows the fresh health', async () => {
    status.mockResolvedValue({
      status: 'degraded',
      version: '1.2.3',
      checked_at: '2026-10-02T08:00:00Z',
    })
    mountSettings(<ProviderInstances />)
    fireEvent.click(screen.getByRole('button', { name: 'Tester Local llama' }))
    await waitFor(() => expect(status).toHaveBeenCalledWith('local-llama'))
    await waitFor(() => expect(card('local-llama').textContent).toContain('Dégradé'))
    expect(card('local-llama').textContent).toContain('1.2.3')
  })

  it('Supprimer names the instance, warns about conversations, then DELETEs and re-fetches', async () => {
    mountSettings(<ProviderInstances />)
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer DeepSeek' }))
    const dialog = screen.getByRole('alertdialog')
    expect(dialog.textContent).toContain('Supprimer DeepSeek ?')
    expect(dialog.textContent).toContain('ne pourront plus être reprises')
    expect(remove).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Supprimer DeepSeek' }))
    await waitFor(() => expect(remove).toHaveBeenCalledWith('deepseek'))
    await waitFor(() => expect(list).toHaveBeenCalled())
  })

  it('Supprimer can be cancelled', () => {
    mountSettings(<ProviderInstances />)
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer DeepSeek' }))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Garder' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(remove).not.toHaveBeenCalled()
  })

  it('the credential reads in words (raw form in the tooltip); the id only shows when it differs from the name', () => {
    mountSettings(<ProviderInstances />)
    const ds = screen.getByTestId('instance-deepseek')
    expect(within(ds).getByTitle('vault:deepseek-key').textContent).toBe('Coffre : deepseek-key')
    expect(screen.getByTestId('instance-local-llama').textContent).toContain('aucune')
    expect(screen.getByTestId('instance-local-llama').textContent).not.toMatch(/Clé\s*none/)
    expect(screen.getByTestId('instance-claude-code').textContent).not.toContain('claude-code')
  })

  it('Modifier loads the instance, then opens the edit form inside the card', async () => {
    mountSettings(<ProviderInstances />)
    fireEvent.click(screen.getByRole('button', { name: 'Modifier DeepSeek' }))
    expect(within(card('deepseek')).getByText('Chargement de l’instance enregistrée…')).toBeTruthy()
    expect(
      await within(card('deepseek')).findByRole('form', { name: 'Modifier DeepSeek' })
    ).toBeTruthy()
  })

  it('card actions: same kit size, right-aligned in one footer', () => {
    mountSettings(<ProviderInstances />)
    const buttons = within(card('deepseek')).getAllByRole('button')
    expect(buttons.map((b) => b.textContent)).toEqual(['Tester', 'Modifier', 'Supprimer'])
    for (const b of buttons) expect(b.className).toMatch(/min-h-9 px-3 py-2 text-sm/)
    expect(buttons[0].parentElement!.className).toContain('justify-end')
  })
})

describe('ProviderInstances — French card content', () => {
  it('a card error is in French and a retryable one says to click Tester (not to send a message)', () => {
    mountSettings(<ProviderInstances />, {
      list,
      providers: [
        CLAUDE,
        {
          ...DEEPSEEK,
          health: { status: 'unhealthy', error: { code: 'endpoint_unreachable', message: '' } },
        },
      ],
    })
    const card = screen.getByTestId('instance-error-deepseek')
    expect(card.textContent).toContain('Point d’accès injoignable')
    expect(card.textContent).toContain('Cliquez sur Tester pour réessayer.')
    expect(card.textContent).not.toMatch(/Send your message|Endpoint unreachable/)
  })

  it('a login: "Connexion requise", the command with "Copier", no English', () => {
    mountSettings(<ProviderInstances />, {
      list,
      providers: [
        {
          ...CLAUDE,
          id: 'codex',
          kind: 'codex',
          label: 'Codex',
          builtin: false,
          credential_ref: 'none',
          health: { status: 'auth_required', login_hint: 'codex login' },
        },
      ],
    })
    const card = screen.getByTestId('instance-codex')
    expect(card.textContent).toContain('Connexion requise')
    expect(within(card).getByRole('button', { name: 'Copier la commande' })).toBeTruthy()
    expect(card.textContent).not.toMatch(/Sign-in required|Re-check|Copy/)
  })

  it('only informative lines: no "Version inconnue", no empty model; "vérifié" is discreet in the subtitle', () => {
    mountSettings(<ProviderInstances />)
    const card = screen.getByTestId('instance-local-llama')
    expect(card.textContent).not.toContain('Version')
    expect(card.textContent).not.toContain('aucun par défaut')
    expect(screen.getByTestId('instance-claude-code').textContent).toContain('2.1.0')
    expect(screen.getByTestId('instance-deepseek').textContent).toContain('vérifié')
  })
})

describe('ProviderInstances — Claude Code distant (SSH)', () => {
  it('names the machine by its id (never just "Claude Code"), with its ssh origin, fingerprint and Rock’n roll state', () => {
    mountSettings(<ProviderInstances />, { list, providers: [CLAUDE, REMOTE] })
    const row = card('claude-code@lab')
    expect(within(row).getByRole('heading').textContent).toBe('claude-code@lab')
    expect(row.textContent).toContain('Claude Code distant (SSH)')
    expect(row.textContent).toContain('ssh:me@lab.example.com:2222')
    expect(row.textContent).toContain('SHA256:abc123fingerprintOfTheMachine')
    expect(row.textContent).toContain('Coffre : lab-ssh-key')
    expect(row.textContent).toContain('non autorisé')
    expect(row.getAttribute('data-status')).toBe('connected')
    // It can be edited and deleted, unlike the built-in local instance.
    expect(within(row).getByRole('button', { name: /Modifier/ })).toBeTruthy()
  })

  it.each([
    'lab: the machine cannot be reached',
    'lab: the host key does not match the pinned key',
    'lab: the machine refused the key',
  ])('unreachable: shows "Injoignable" with the reason "%s" and never suggests the local Claude Code', (reason) => {
    // The wire shape: state "unavailable" with a readable reason.
    const wire = normalizeProvidersResponse({
      providers: [
        { id: 'claude-code@lab', kind: 'claude_code_remote', label: 'Claude Code', health: { state: 'unavailable', message: reason } },
      ],
    })
    mountSettings(<ProviderInstances />, { list, providers: wire.providers })
    const row = card('claude-code@lab')
    expect(row.getAttribute('data-status')).toBe('unreachable')
    expect(row.textContent).toContain('Injoignable')
    expect(screen.getByTestId('instance-reason-claude-code@lab').textContent).toContain(reason)
    expect(row.textContent).not.toMatch(/repli|bascul|fallback|Claude Code local|localement/i)
  })
})

describe('normalizeProvidersResponse — remote instance', () => {
  it('reads the machine fields, and maps the health state "unavailable" to unhealthy with its reason', () => {
    const { providers } = normalizeProvidersResponse({
      providers: [
        {
          id: 'claude-code@lab',
          kind: 'claude_code_remote',
          host: 'lab.example.com',
          ssh_user: 'me',
          ssh_port: 2222,
          allow_trust: true,
          host_key_fingerprint: 'SHA256:xyz',
          origin: 'ssh:me@lab.example.com:2222',
          health: { state: 'unavailable', reason: 'lab: Claude Code CLI is missing' },
        },
      ],
    })
    expect(providers[0]).toMatchObject({ host: 'lab.example.com', ssh_user: 'me', ssh_port: 2222, allow_trust: true, host_key_fingerprint: 'SHA256:xyz', origin: 'ssh:me@lab.example.com:2222' })
    expect(providers[0].health.status).toBe('unhealthy')
    expect(providers[0].health.error?.message).toBe('lab: Claude Code CLI is missing')
  })
})

describe('ProviderInstances — the list offers to connect another provider', () => {
  it('ends the list with a « Connecter un provider » card that opens the wizard', async () => {
    const onAdd = vi.fn()
    mountSettings(<ProviderInstances onAdd={onAdd} />)
    await screen.findByTestId('instance-deepseek')
    const items = within(screen.getByRole('list', { name: 'Providers' })).getAllByRole('listitem')
    const last = items[items.length - 1]
    const card = within(last).getByRole('button', { name: /Connecter un provider/ })
    fireEvent.click(card)
    expect(onAdd).toHaveBeenCalledTimes(1)
  })

  it('is there with only Claude Code, where it is the natural next step', async () => {
    list.mockResolvedValue(response([CLAUDE]))
    mountSettings(<ProviderInstances onAdd={vi.fn()} />)
    expect(await screen.findByRole('button', { name: /Connecter un provider/ })).toBeTruthy()
  })

  it('is absent when the page gives no way to add (the list alone, as before)', async () => {
    mountSettings(<ProviderInstances />)
    await screen.findByTestId('instance-deepseek')
    expect(screen.queryByRole('button', { name: /Connecter un provider/ })).toBeNull()
  })
})
