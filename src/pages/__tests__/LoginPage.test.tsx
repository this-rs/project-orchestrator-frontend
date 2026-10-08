/**
 * LoginPage after the design migration: the same chrome as the setup
 * assistant (display-3 title + lead), a form in a narrow column, ONE primary,
 * the sign-in provider as a secondary glass button next to a form (primary
 * when it is the only way in), a readable error, 16 px inputs on phones.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Provider, createStore } from 'jotai'
import { authProvidersAtom, authProvidersLoadedAtom, authModeAtom, allowRegistrationAtom } from '@/atoms'
import { installMatchMedia } from './testUtils'

const getOidcAuthUrl = vi.fn()

vi.mock('@/services', () => ({
  authApi: {
    getProviders: vi.fn(),
    getOidcAuthUrl: (...a: unknown[]) => getOidcAuthUrl(...a),
    loginWithPassword: vi.fn(),
    register: vi.fn(),
  },
  setAuthMode: vi.fn(),
  setAuthToken: vi.fn(),
}))

import { LoginPage } from '../LoginPage'

installMatchMedia()

type ProviderInfo = { type: 'password' | 'oidc'; name: string }

function renderLogin(providers: ProviderInfo[], allowRegistration = false) {
  const store = createStore()
  store.set(authProvidersLoadedAtom, true)
  store.set(authModeAtom, 'required')
  store.set(authProvidersAtom, providers as never)
  store.set(allowRegistrationAtom, allowRegistration)
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<div>Overview</div>} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  )
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('names the screen once in the display scale with a lead, and keeps one primary next to a secondary provider', () => {
    const { container } = renderLogin([
      { type: 'password', name: 'Password' },
      { type: 'oidc', name: 'Google' },
    ])
    const title = screen.getByRole('heading', { level: 1 })
    expect(title.textContent).toBe('Sign in')
    expect(title.className).toContain('display-3')
    expect(screen.getByText(/Use your email and password, or your Google account/)).toBeTruthy()
    expect(container.querySelectorAll('.display-2, .display-3')).toHaveLength(1)

    const primaries = container.querySelectorAll('.btn-primary')
    expect(primaries).toHaveLength(1)
    expect(primaries[0].textContent).toBe('Sign in')
    const oidc = screen.getByRole('button', { name: 'Sign in with Google' })
    expect(oidc.className).toContain('btn-secondary')
    // Inputs are 16 px on phones (DESIGN.md § 10).
    for (const input of Array.from(container.querySelectorAll('input'))) {
      expect(input.className).toContain('text-base')
    }
  })

  it('makes the provider the primary when it is the only way in', () => {
    const { container } = renderLogin([{ type: 'oidc', name: 'Okta' }])
    expect(screen.getByText(/Continue with your Okta account/)).toBeTruthy()
    const oidc = screen.getByRole('button', { name: 'Sign in with Okta' })
    expect(oidc.className).toContain('btn-primary')
    expect(container.querySelectorAll('.btn-primary')).toHaveLength(1)
  })

  it('shows a readable alert when the provider cannot start, and the button recovers', async () => {
    getOidcAuthUrl.mockRejectedValueOnce(new Error('discovery document unreachable'))
    renderLogin([{ type: 'oidc', name: 'Google' }])
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/Sign-in could not start/)
    expect(alert.textContent).toMatch(/discovery document unreachable/)
    await waitFor(() => expect((screen.getByRole('button', { name: 'Sign in with Google' }) as HTMLButtonElement).disabled).toBe(false))
  })

  it('switches to the registration form through a text link, keeping one primary', () => {
    const { container } = renderLogin([{ type: 'password', name: 'Password' }], true)
    fireEvent.click(screen.getByRole('button', { name: 'No account yet? Create one' }))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Create your account')
    expect(screen.getByText('Create the account you will sign in with.')).toBeTruthy()
    const primaries = container.querySelectorAll('.btn-primary')
    expect(primaries).toHaveLength(1)
    expect(primaries[0].textContent).toBe('Create account')
  })
})
