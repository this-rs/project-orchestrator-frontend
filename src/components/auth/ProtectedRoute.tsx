import { useEffect } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
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
import { Spinner } from '@/components/ui'

/**
 * Route guard that protects all child routes.
 *
 * On first mount, fetches GET /auth/providers to determine the auth mode:
 * - No-auth mode (auth_required=false) → render <Outlet /> directly, no login needed
 * - Required mode (auth_required=true) → check token, fetch /auth/me, redirect if invalid
 *
 * If /auth/providers fails (e.g. backend not configured), falls back to no-auth mode
 * to avoid locking users out.
 */
export function ProtectedRoute() {
  const isAuthenticated = useAtomValue(isAuthenticatedAtom)
  const authMode = useAtomValue(authModeAtom)
  const [providersLoaded, setProvidersLoaded] = useAtom(authProvidersLoadedAtom)
  const setAuthMode = useSetAtom(authModeAtom)
  const setProviders = useSetAtom(authProvidersAtom)
  const setAllowRegistration = useSetAtom(allowRegistrationAtom)
  const [user, setUser] = useAtom(currentUserAtom)
  const setToken = useSetAtom(authTokenAtom)

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

  // Phase 2: Validate token when auth is required — fetch /auth/me
  // setUser (Jotai atom setter) is called in the async callback, not synchronously.
  useEffect(() => {
    if (!providersLoaded || authMode === 'none' || !isAuthenticated || user) {
      return
    }

    authApi
      .me()
      .then((u) => {
        setUser(u)
      })
      .catch((e: unknown) => {
        // Only clear token on 401 (invalid/expired token).
        const msg = e instanceof Error ? e.message : ''
        if (msg.includes('401') || msg.includes('Unauthorized')) {
          setToken(null)
        }
      })
  }, [providersLoaded, authMode, isAuthenticated, user, setUser, setToken])

  // Derive loading: waiting for providers OR waiting for user validation
  // When auth is required and we have a token but no user yet, we're loading /auth/me
  const needsUserFetch = authMode === 'required' && isAuthenticated && !user
  const loading = !providersLoaded || needsUserFetch

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-gray-950">
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
