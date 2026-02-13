import { useEffect, useMemo, useState } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { useSetAtom } from 'jotai'
import { authTokenAtom, currentUserAtom } from '@/atoms'
import { authApi } from '@/services'
import { Spinner } from '@/components/ui'

/**
 * OAuth/OIDC callback page.
 *
 * Handles both:
 * - New generic OIDC flow (exchangeOidcCode)
 * - Legacy Google flow (exchangeCode) as fallback
 *
 * Tries the generic OIDC endpoint first. If it fails with a non-auth error,
 * falls back to the legacy Google endpoint for backward compatibility.
 */
export function AuthCallbackPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const setToken = useSetAtom(authTokenAtom)
  const setUser = useSetAtom(currentUserAtom)
  const [exchangeError, setExchangeError] = useState<string | null>(null)

  // Derive missing code error from search params (avoids synchronous setState in effect)
  const code = useMemo(() => searchParams.get('code'), [searchParams])
  const error = code ? exchangeError : 'Missing authorization code'

  useEffect(() => {
    if (!code) return

    let cancelled = false

    // Try generic OIDC first, fall back to legacy Google
    authApi
      .exchangeOidcCode(code)
      .catch(() => authApi.exchangeCode(code))
      .then(({ token, user }) => {
        if (cancelled) return
        setToken(token)
        setUser(user)
        navigate('/workspaces', { replace: true })
      })
      .catch((e) => {
        if (cancelled) return
        setExchangeError(e instanceof Error ? e.message : 'Authentication failed')
      })

    return () => {
      cancelled = true
    }
  }, [code, navigate, setToken, setUser])

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[var(--surface-base)]">
        <div className="w-full max-w-sm space-y-6 px-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-900/50">
            <svg className="h-6 w-6 text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Authentication failed</h2>
            <p className="mt-2 text-sm text-gray-400">{error}</p>
          </div>
          <Link
            to="/login"
            className="inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500"
          >
            Back to login
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-[var(--surface-base)]">
      <div className="space-y-4 text-center">
        <Spinner size="lg" className="mx-auto" />
        <p className="text-sm text-gray-400">Signing you in...</p>
      </div>
    </div>
  )
}
