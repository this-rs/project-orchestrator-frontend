import { useEffect, useRef, useState } from 'react'
import { Navigate, Outlet, useNavigate } from 'react-router-dom'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import {
  authModeAtom,
  authProvidersAtom,
  authProvidersLoadedAtom,
  authTokenAtom,
  allowRegistrationAtom,
  currentUserAtom,
  isAuthenticatedAtom,
} from '@/atoms'
import { authApi, setAuthMode as setAuthModeService } from '@/services'
import {
  setNavigate,
  setJotaiSetter,
  initCrossTabSync,
  refreshToken,
  forceLogout,
} from '@/services/authManager'
import { Spinner } from '@/components/ui'

/**
 * Route guard that protects all child routes.
 *
 * Boot sequence (3 phases):
 * 1. Fetch GET /auth/providers to determine the auth mode
 * 2. If auth required & no in-memory token → attempt silent refresh via HttpOnly cookie
 * 3. Fetch /auth/me to load the current user
 *
 * No-auth mode (auth_required=false) → render <Outlet /> directly, no login needed.
 *
 * Also injects React Router navigate and Jotai setters into the authManager
 * singleton so that forceLogout() can work from anywhere (WebSocket handlers, etc.).
 *
 * If /auth/providers fails (e.g. backend not configured), falls back to no-auth mode
 * to avoid locking users out.
 */
export function ProtectedRoute() {
  const navigate = useNavigate()
  const isAuthenticated = useAtomValue(isAuthenticatedAtom)
  const authMode = useAtomValue(authModeAtom)
  const [providersLoaded, setProvidersLoaded] = useAtom(authProvidersLoadedAtom)
  const setAuthMode = useSetAtom(authModeAtom)
  const setProviders = useSetAtom(authProvidersAtom)
  const setAllowRegistration = useSetAtom(allowRegistrationAtom)
  const [user, setUser] = useAtom(currentUserAtom)
  const setToken = useSetAtom(authTokenAtom)
  const [authError, setAuthError] = useState(false)
  const [bootRefreshDone, setBootRefreshDone] = useState(false)
  const bootRefreshStarted = useRef(false)

  // Inject React Router navigate + Jotai setters into authManager singleton
  useEffect(() => {
    setNavigate(navigate)
    setJotaiSetter({
      setToken: (t: string | null) => setToken(t),
      setUser: () => setUser(null),
    })
  }, [navigate, setToken, setUser])

  // Start cross-tab sync (BroadcastChannel — listen for logout from other tabs)
  useEffect(() => {
    const cleanup = initCrossTabSync()
    return cleanup
  }, [])

  // Phase 1: Fetch auth providers (once)
  useEffect(() => {
    if (providersLoaded) {
      return
    }

    authApi
      .getProviders()
      .then((resp) => {
        const mode = resp.auth_required ? 'required' : 'none'
        setAuthMode(mode)
        setAuthModeService(mode) // sync module-level cache for api.ts 401 handling
        setProviders(resp.providers)
        setAllowRegistration(resp.allow_registration)
        setProvidersLoaded(true)
      })
      .catch(() => {
        // Backend unreachable or no auth configured → fall back to no-auth
        setAuthMode('none')
        setAuthModeService('none')
        setProvidersLoaded(true)
      })
  }, [providersLoaded, setAuthMode, setProviders, setAllowRegistration, setProvidersLoaded])

  // Phase 2: Silent token refresh via HttpOnly cookie on page reload.
  //
  // After a page reload, the in-memory access token is null. If auth is required,
  // attempt to get a fresh JWT from POST /auth/refresh (the browser sends the
  // HttpOnly cookie automatically). If this succeeds, set the token in memory +
  // Jotai so that Phase 3 (/auth/me) can proceed. If it fails, the user will be
  // redirected to /login — this is expected when the cookie is absent or expired.
  //
  // When the user is already authenticated (e.g. just logged in), we skip the
  // refresh — the `needsBootRefresh` guard below prevents the effect from running.
  const needsBootRefresh = providersLoaded && authMode === 'required' && !isAuthenticated
  useEffect(() => {
    if (!needsBootRefresh) return

    // Prevent double-fire in StrictMode
    if (bootRefreshStarted.current) return
    bootRefreshStarted.current = true

    refreshToken()
      .then((token) => {
        setToken(token)
        setBootRefreshDone(true)
      })
      .catch(() => {
        // No valid cookie → user needs to log in
        setBootRefreshDone(true)
      })
  }, [needsBootRefresh, setToken])

  // Phase 3: Validate token when auth is required — fetch /auth/me
  useEffect(() => {
    if (!providersLoaded || !bootRefreshDone || authMode === 'none' || !isAuthenticated || user) {
      return
    }

    authApi
      .me()
      .then((u) => {
        setUser(u)
      })
      .catch(() => {
        // Token invalid/expired → force full logout (clears memory + Jotai + WS)
        setAuthError(true)
        forceLogout()
      })
  }, [providersLoaded, bootRefreshDone, authMode, isAuthenticated, user, setUser])

  // Derive loading: waiting for providers OR boot refresh OR user validation
  // authError short-circuits loading to prevent infinite spinner
  //
  // Boot refresh is only needed when !isAuthenticated (page reload scenario).
  // When already authenticated (e.g. just logged in), skip waiting for bootRefreshDone.
  const needsUserFetch = authMode === 'required' && isAuthenticated && !user
  const waitingForBootRefresh =
    authMode === 'required' && !isAuthenticated && !bootRefreshDone
  const loading =
    !providersLoaded || waitingForBootRefresh || (needsUserFetch && !authError)

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[var(--surface-base)]">
        <Spinner size="lg" />
      </div>
    )
  }

  // No-auth mode → always render
  if (authMode === 'none') {
    return <Outlet />
  }

  // Auth required but not authenticated → redirect to login
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
