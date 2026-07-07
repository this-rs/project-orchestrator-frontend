/**
 * Regression test for the boot-refresh race that stranded the spinner.
 *
 * Bug (fixed in this commit): on page reload the in-memory access token is
 * null, so an always-mounted background request (e.g. the model catalog
 * loader) calls getValidToken() → refreshToken() via the HttpOnly cookie and
 * sets `authTokenAtom` — flipping `isAuthenticated` to true BEFORE
 * ProtectedRoute's Phase 2 evaluates. That makes `needsBootRefresh` false, so
 * Phase 2 never runs and `bootRefreshDone` never becomes true. Phase 3
 * (`/auth/me`) was gated on `bootRefreshDone`, so it never fired: the app was
 * authenticated (token) but had no user and no way to fetch one — an infinite
 * spinner, with the user forced to navigate to /login manually.
 *
 * The fix drops the `bootRefreshDone` gate from Phase 3: whenever a token
 * exists (`isAuthenticated`), `/auth/me` is always validated.
 *
 * Run with: npx vitest run src/components/auth/__tests__/ProtectedRoute.test.tsx
 */
import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { Provider, createStore } from 'jotai'
import { authTokenAtom } from '@/atoms'

vi.mock('@/services', () => ({
  authApi: {
    getProviders: vi.fn(),
    me: vi.fn(),
  },
  setAuthMode: vi.fn(),
}))

vi.mock('@/services/authManager', () => ({
  setNavigate: vi.fn(),
  setJotaiSetter: vi.fn(),
  initCrossTabSync: vi.fn(() => () => {}),
  refreshToken: vi.fn(),
  forceLogout: vi.fn(),
}))

vi.mock('@/components/ui', () => ({
  Spinner: () => <div data-testid="spinner" />,
}))

import { authApi } from '@/services'
import { refreshToken } from '@/services/authManager'
import { ProtectedRoute } from '../ProtectedRoute'

function renderGuard() {
  const store = createStore()
  // Simulate the background refresh having already set the token before the
  // guard mounts: `isAuthenticated` is true, but the user has not been fetched.
  store.set(authTokenAtom, 'jwt-from-background-refresh')
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/workspace/x/overview']}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/workspace/x/overview" element={<div>Protected content</div>} />
          </Route>
          <Route path="/login" element={<div>Login page</div>} />
        </Routes>
      </MemoryRouter>
    </Provider>
  )
}

describe('ProtectedRoute (regression: background refresh must not strand the spinner)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches /auth/me and renders the outlet when a token arrived before Phase 2 (bootRefreshDone stays false)', async () => {
    vi.mocked(authApi.getProviders).mockResolvedValue({
      auth_required: true,
      providers: [],
      allow_registration: false,
    } as Awaited<ReturnType<typeof authApi.getProviders>>)
    vi.mocked(authApi.me).mockResolvedValue({
      id: '1',
      email: 'a@b.com',
      name: 'A',
    } as Awaited<ReturnType<typeof authApi.me>>)

    renderGuard()

    // The load-bearing assertion: the guard validates the pre-existing token
    // instead of hanging forever on the spinner.
    await waitFor(() => {
      expect(screen.getByText('Protected content')).toBeInTheDocument()
    })
    expect(authApi.me).toHaveBeenCalledTimes(1)
    // Phase 2's boot refresh must NOT have run — the token was already present.
    expect(refreshToken).not.toHaveBeenCalled()
  })
})
