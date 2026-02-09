import { useEffect, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { authTokenAtom, currentUserAtom, isAuthenticatedAtom } from '@/atoms'
import { authApi } from '@/services'
import { Spinner } from '@/components/ui'

/**
 * Route guard that protects all child routes.
 *
 * - No token → redirect to /login
 * - Token present but user not loaded → fetch /auth/me
 * - /auth/me fails (401) → clear token, redirect to /login
 * - User loaded → render <Outlet />
 */
export function ProtectedRoute() {
  const isAuthenticated = useAtomValue(isAuthenticatedAtom)
  const [user, setUser] = useAtom(currentUserAtom)
  const setToken = useSetAtom(authTokenAtom)
  const [loading, setLoading] = useState(false)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    if (!isAuthenticated) {
      setChecked(true)
      return
    }

    // User already loaded (e.g. from callback)
    if (user) {
      setChecked(true)
      return
    }

    // Fetch user from /auth/me
    setLoading(true)
    authApi
      .me()
      .then((u) => {
        setUser(u)
        setChecked(true)
      })
      .catch(() => {
        // Token invalid/expired → clear and redirect
        setToken(null)
        setChecked(true)
      })
      .finally(() => setLoading(false))
  }, [isAuthenticated, user, setUser, setToken])

  if (!checked || loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-gray-950">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
