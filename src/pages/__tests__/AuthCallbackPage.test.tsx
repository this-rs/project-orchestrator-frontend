/**
 * Regression test for the OAuth callback double-exchange bug.
 *
 * Bug (fixed in this commit): React StrictMode (dev only) double-invokes
 * effects on mount. Without a guard, the code-exchange effect in
 * `AuthCallbackPage` fired `exchangeOidcCode(code)` twice with the same
 * single-use authorization code. The first request consumed the code; the
 * second always failed with `invalid_grant`. Depending on which promise
 * resolved last, that failing result could be the one applied to state,
 * producing a login <-> Overview redirect loop instead of a successful
 * login. The fix adds a `useRef` guard so only the first invocation fires.
 *
 * Run with: npx vitest run src/pages/__tests__/AuthCallbackPage.test.tsx
 */
import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { Provider, createStore } from 'jotai'

vi.mock('@/services', () => ({
  authApi: {
    exchangeOidcCode: vi.fn(),
    exchangeCode: vi.fn(),
  },
  setAuthToken: vi.fn(),
}))

import { authApi } from '@/services'
import { installMatchMedia } from './testUtils'
import { AuthCallbackPage } from '../AuthCallbackPage'

// jsdom has no matchMedia; the screen's chrome reads it (HaloPointer).
installMatchMedia()

function renderCallback(code: string) {
  const store = createStore()
  return render(
    <StrictMode>
      <Provider store={store}>
        <MemoryRouter initialEntries={[`/auth/callback?code=${code}`]}>
          <Routes>
            <Route path="/auth/callback" element={<AuthCallbackPage />} />
            <Route path="/" element={<div>Overview</div>} />
          </Routes>
        </MemoryRouter>
      </Provider>
    </StrictMode>
  )
}

describe('AuthCallbackPage (regression: StrictMode must not double-exchange the code)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls exchangeOidcCode exactly once under StrictMode, even though effects run twice', async () => {
    vi.mocked(authApi.exchangeOidcCode).mockResolvedValue({
      token: 'jwt-token',
      user: { id: '1', email: 'a@b.com', name: 'A' },
    } as Awaited<ReturnType<typeof authApi.exchangeOidcCode>>)

    renderCallback('single-use-code')

    await waitFor(() => {
      expect(screen.getByText('Overview')).toBeInTheDocument()
    })

    // The load-bearing assertion: exactly one request for the single-use code,
    // not two (StrictMode's dev-only double-invoke of the effect).
    expect(authApi.exchangeOidcCode).toHaveBeenCalledTimes(1)
    expect(authApi.exchangeOidcCode).toHaveBeenCalledWith('single-use-code')
  })

  it('does not surface a spurious invalid_grant error when the (guarded) single exchange succeeds', async () => {
    vi.mocked(authApi.exchangeOidcCode).mockResolvedValue({
      token: 'jwt-token',
      user: { id: '1', email: 'a@b.com', name: 'A' },
    } as Awaited<ReturnType<typeof authApi.exchangeOidcCode>>)

    renderCallback('single-use-code')

    await waitFor(() => {
      expect(screen.getByText('Overview')).toBeInTheDocument()
    })

    expect(screen.queryByText(/authentication failed/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/invalid_grant/i)).not.toBeInTheDocument()
  })

  it('says what the provider answered, in a readable alert, with one primary back to sign-in', async () => {
    vi.mocked(authApi.exchangeOidcCode).mockRejectedValue(new Error('invalid_grant: code already used'))
    const { container } = renderCallback('used-code')
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/invalid_grant: code already used/)
    const title = screen.getByRole('heading', { level: 1 })
    expect(title.textContent).toBe('Authentication failed')
    expect(title.className).toContain('display-3')
    const primaries = container.querySelectorAll('.btn-primary')
    expect(primaries).toHaveLength(1)
    expect(primaries[0].textContent).toBe('Back to sign in')
  })
})
