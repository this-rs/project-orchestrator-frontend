import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { useSetAtom } from 'jotai'
import { authTokenAtom, currentUserAtom } from '@/atoms'
import { AlertCircle } from 'lucide-react'
import { authApi, setAuthToken } from '@/services'
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
  // Guards against StrictMode's dev-only double-invoke of the exchange effect
  // below. The OAuth `code` is single-use: firing the exchange twice sends
  // two requests to the same provider, the first consumes the code, and the
  // second comes back `invalid_grant` — which, without this guard, is the
  // request whose result actually lands in state (see effect comment).
  const exchangeStarted = useRef(false)

  // Remove the dark overlay injected by LoginPage before SSO redirect
  useEffect(() => {
    document.getElementById('sso-overlay')?.remove()
  }, [])

  // Derive missing code error from search params (avoids synchronous setState in effect)
  const code = useMemo(() => searchParams.get('code'), [searchParams])
  // Capture OIDC provider errors (e.g. Cognito sends ?error=...&error_description=...)
  const providerError = useMemo(() => {
    const err = searchParams.get('error')
    const desc = searchParams.get('error_description')
    if (err) return desc ? `${err}: ${desc}` : err
    return null
  }, [searchParams])
  const error = providerError ?? (code ? exchangeError : 'Missing authorization code')

  useEffect(() => {
    if (!code) return

    // StrictMode (dev) runs this effect twice on mount: setup, cleanup,
    // setup again — synchronously, before the fetch below can resolve.
    // `exchangeStarted` ensures the single-use `code` is only ever POSTed
    // once across that synthetic cycle (a second POST always fails with
    // `invalid_grant` once the first has consumed the code).
    //
    // Deliberately NOT using a `cancelled`-on-cleanup flag to gate applying
    // the result: this page's sole job is to consume one code and redirect,
    // and StrictMode's synthetic cleanup runs on the *first* (real)
    // invocation while the guard above skips the second — so a `cancelled`
    // flag closed over the first invocation would be flipped `true` by that
    // synthetic cleanup and silently swallow the real result once the fetch
    // resolves, leaving the user stuck on "Signing you in...". See the
    // regression test in `__tests__/AuthCallbackPage.test.tsx`.
    if (exchangeStarted.current) return
    exchangeStarted.current = true

    // Try generic OIDC first, fall back to legacy Google only if OIDC is not configured (403)
    authApi
      .exchangeOidcCode(code)
      .catch((oidcErr: Error & { status?: number }) => {
        // Only fall back to legacy Google if OIDC endpoint returned 403 (not configured).
        // For real OIDC errors (token exchange, userinfo, scope), surface them directly.
        if (oidcErr.status === 403) return authApi.exchangeCode(code)
        throw oidcErr
      })
      .then(({ token, user }) => {
        setAuthToken(token) // Module-level cache for api.ts Bearer header
        setToken(token)
        setUser(user)
        navigate('/', { replace: true })
      })
      .catch((e) => {
        setExchangeError(e instanceof Error ? e.message : 'Authentication failed')
      })
  }, [code, navigate, setToken, setUser])

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[var(--surface-base)]">
        <div className="w-full max-w-sm space-y-6 px-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-900/50">
            <AlertCircle className="h-6 w-6 text-red-400" />
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
