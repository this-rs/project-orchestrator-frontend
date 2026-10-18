/**
 * A locked vault at the point of use, on the settings page: the provider check
 * that failed with `credentials_locked` offers the unlock IN PLACE, then runs the
 * check again. Checked at the network boundary (`fetch`) with the real vault
 * service: the passphrase is only in the body of `POST /api/vault/unlock`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

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

import { forgetUnlockProof, hasUnlockProof } from '@/services/vault'
import { SettingsErrorCard } from './SettingsErrorCard'

const PASSPHRASE = 'fake-passphrase-NOT-REAL-27'
const LOCKED = { code: 'credentials_locked' as const, message: '' }

let calls: { method: string; url: string; body: string; headers: Record<string, string> }[] = []

beforeEach(() => {
  calls = []
  forgetUnlockProof()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({
        method: (init.method ?? 'GET').toUpperCase(),
        url: String(url),
        body: typeof init.body === 'string' ? init.body : '',
        headers: (init.headers ?? {}) as Record<string, string>,
      })
      if (String(url).endsWith('/api/vault/unlock'))
        return new Response(JSON.stringify({ unlocked_until: '2999-01-01T00:00:00Z', unlock_proof: 'proof-of-this-tab' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      return new Response(JSON.stringify({ error: 'unexpected route' }), { status: 404 })
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  forgetUnlockProof()
})

describe('SettingsErrorCard — a locked vault at the point of use', () => {
  it('unlocks in place, then runs the check again; the passphrase is only in the body of POST /api/vault/unlock', async () => {
    const recheck = vi.fn()
    render(
      <MemoryRouter>
        <SettingsErrorCard error={LOCKED} testId="card" onUnlocked={recheck} />
      </MemoryRouter>,
    )
    const card = screen.getByTestId('card')
    expect(card.getAttribute('data-error-code')).toBe('credentials_locked')
    screen.getByTestId('settings-vault-unlock')
    fireEvent.change(screen.getByLabelText('Vault locked'), { target: { value: PASSPHRASE } })
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }))
    await waitFor(() => expect(recheck).toHaveBeenCalledTimes(1))
    expect((await screen.findByRole('status')).textContent).toContain('Vault unlocked: the provider is being checked again.')
    expect(hasUnlockProof()).toBe(true)

    const withPass = calls.filter((c) => c.url.includes(PASSPHRASE) || c.body.includes(PASSPHRASE) || Object.values(c.headers).join(' ').includes(PASSPHRASE))
    expect(withPass.map((c) => `${c.method} ${new URL(c.url, 'http://x').pathname}`)).toEqual(['POST /api/vault/unlock'])
    expect(withPass[0].url).not.toContain(PASSPHRASE)
    expect(JSON.parse(withPass[0].body)).toMatchObject({ passphrase: PASSPHRASE })
    expect(document.body.innerHTML).not.toContain(PASSPHRASE)
    const storage = [localStorage, sessionStorage].flatMap((s) => Array.from({ length: s.length }, (_, i) => `${s.key(i)}=${s.getItem(s.key(i)!)}`))
    expect(storage.join('\n')).not.toContain(PASSPHRASE)
  })

  it('without a re-check to run: a link to the vault page, no passphrase field', () => {
    render(
      <MemoryRouter>
        <SettingsErrorCard error={LOCKED} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'Unlock the vault' }).getAttribute('href')).toBe('/vault')
    expect(screen.queryByTestId('settings-vault-unlock')).toBeNull()
  })
})
