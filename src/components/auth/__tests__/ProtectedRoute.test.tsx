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
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { Provider, createStore } from 'jotai'
import { authModeAtom, authModeConfirmedAtom, authTokenAtom } from '@/atoms'

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
  Button: ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => <button onClick={onClick}>{children}</button>,
  ErrorState: ({ onRetry }: { onRetry: () => void }) => <button onClick={onRetry}>Retry</button>,
}))

import { authApi } from '@/services'
import { forceLogout, refreshToken } from '@/services/authManager'
import { ProtectedRoute } from '../ProtectedRoute'

function renderGuard(token: string | null = 'jwt-from-background-refresh') {
  const store = createStore()
  // Simulate the background refresh having already set the token before the
  // guard mounts: `isAuthenticated` is true, but the user has not been fetched.
  store.set(authTokenAtom, token)
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

describe('ProtectedRoute: validating the current user', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(authApi.getProviders).mockResolvedValue({
      auth_required: true,
      providers: [],
      allow_registration: false,
    } as Awaited<ReturnType<typeof authApi.getProviders>>)
  })

  it.each([new TypeError('network error'), Object.assign(new Error('server error'), { status: 500 })])(
    'keeps the session on a temporary failure and retries',
    async (failure) => {
      vi.mocked(authApi.me)
        .mockRejectedValueOnce(failure)
        .mockResolvedValueOnce({ id: '1', email: 'a@b.com', name: 'A' } as Awaited<ReturnType<typeof authApi.me>>)

      renderGuard()

      expect(await screen.findByRole('alert')).toBeInTheDocument()
      expect(forceLogout).not.toHaveBeenCalled()
      expect(screen.queryByText('Protected content')).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
      expect(await screen.findByText('Protected content')).toBeInTheDocument()
      expect(authApi.me).toHaveBeenCalledTimes(2)
      expect(forceLogout).not.toHaveBeenCalled()
    },
  )

  it('refreshes an expired access token before retrying /auth/me', async () => {
    vi.mocked(authApi.me)
      .mockRejectedValueOnce(Object.assign(new Error('unauthorized'), { status: 401 }))
      .mockResolvedValueOnce({ id: '1', email: 'a@b.com', name: 'A' } as Awaited<ReturnType<typeof authApi.me>>)
    vi.mocked(refreshToken).mockResolvedValue('new-token')
    renderGuard()
    expect(await screen.findByText('Protected content')).toBeInTheDocument()
    expect(refreshToken).toHaveBeenCalledTimes(1)
    expect(forceLogout).not.toHaveBeenCalled()
  })

  it('still logs out when the refreshed access token is rejected', async () => {
    vi.mocked(authApi.me).mockRejectedValue(Object.assign(new Error('unauthorized'), { status: 401 }))
    vi.mocked(refreshToken).mockResolvedValue('new-token')
    renderGuard()
    await waitFor(() => expect(forceLogout).toHaveBeenCalledTimes(1))
  })

  it('ignores a stale authentication failure after unmount', async () => {
    let rejectMe!: (error: Error) => void
    vi.mocked(authApi.me).mockImplementation(() => new Promise((_, reject) => { rejectMe = reject }))
    const view = renderGuard()
    await waitFor(() => expect(authApi.me).toHaveBeenCalledTimes(1))
    view.unmount()
    rejectMe(Object.assign(new Error('unauthorized'), { status: 401 }))
    await Promise.resolve()
    expect(refreshToken).not.toHaveBeenCalled()
    expect(forceLogout).not.toHaveBeenCalled()
  })
})

describe('ProtectedRoute: a slow boot refresh', () => {
  it('offers to keep waiting without a second refresh and accepts a late result', async () => {
    vi.resetAllMocks()
    vi.useFakeTimers()
    try {
      vi.mocked(authApi.getProviders).mockResolvedValue({
        auth_required: true,
        providers: [],
        allow_registration: false,
      } as Awaited<ReturnType<typeof authApi.getProviders>>)
      vi.mocked(authApi.me).mockResolvedValue({
        id: '1', email: 'a@b.com', name: 'A',
      } as Awaited<ReturnType<typeof authApi.me>>)
      let finish!: (token: string) => void
      vi.mocked(refreshToken).mockReturnValue(new Promise((resolve) => { finish = resolve }))

      renderGuard(null)
      await act(async () => {})
      expect(refreshToken).toHaveBeenCalledTimes(1)
      expect(screen.getByTestId('spinner')).toBeInTheDocument()

      act(() => vi.advanceTimersByTime(15_000))
      expect(screen.getByText('Sign-in is taking longer than expected')).toBeInTheDocument()
      expect(screen.getByText('The request is still in progress. You will be signed in when it finishes.')).toBeInTheDocument()
      expect(forceLogout).not.toHaveBeenCalled()
      fireEvent.click(screen.getByRole('button', { name: 'Keep waiting' }))
      expect(screen.getByTestId('spinner')).toBeInTheDocument()
      expect(refreshToken).toHaveBeenCalledTimes(1)

      await act(async () => { finish('late-token') })
      expect(screen.getByText('Protected content')).toBeInTheDocument()
      expect(forceLogout).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('ProtectedRoute: an auth mode the server said vs. a guess', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function mountWithStore() {
    const store = createStore()
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/p']}>
          <Routes>
            <Route element={<ProtectedRoute />}>
              <Route path="/p" element={<div>Protected content</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </Provider>
    )
    return store
  }

  it('/auth/providers answering "no sign-in" confirms the mode', async () => {
    vi.mocked(authApi.getProviders).mockResolvedValue({
      auth_required: false,
      providers: [],
      allow_registration: false,
    } as Awaited<ReturnType<typeof authApi.getProviders>>)
    const store = mountWithStore()
    await waitFor(() => expect(store.get(authModeConfirmedAtom)).toBe(true))
    expect(store.get(authModeAtom)).toBe('none')
  })

  it('/auth/providers failing falls back to "none" but does not confirm it', async () => {
    vi.mocked(authApi.getProviders).mockRejectedValue(new Error('unreachable'))
    const store = mountWithStore()
    await waitFor(() => expect(store.get(authModeAtom)).toBe('none'))
    expect(store.get(authModeConfirmedAtom)).toBe(false)
  })
})
