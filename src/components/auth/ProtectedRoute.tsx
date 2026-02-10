import { useEffect, useState } from 'react'
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
  const [loading, setLoading] = useState(true)

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

  // Phase 2: Validate token when auth is required
  useEffect(() => {
    if (!providersLoaded) return

    // No-auth mode → done immediately
    if (authMode === 'none') {
      setLoading(false)
      return
    }

    // No token → done (will redirect)
    if (!isAuthenticated) {
      setLoading(false)
      return
    }

    // User already loaded (e.g. from login callback)
    if (user) {
      setLoading(false)
      return
    }

    // Fetch user from /auth/me
    authApi
      .me()
      .then((u) => {
        setUser(u)
      })
      .catch((e: unknown) => {
        // Only clear token on 401 (invalid/expired token).
        // Other errors (404, 500) may be transient — keep the session alive.
        const msg = e instanceof Error ? e.message : ''
        if (msg.includes('401') || msg.includes('Unauthorized')) {
          setToken(null)
        }
      })
      .finally(() => setLoading(false))
  }, [providersLoaded, authMode, isAuthenticated, user, setUser, setToken])

  // Still loading providers or validating token
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
