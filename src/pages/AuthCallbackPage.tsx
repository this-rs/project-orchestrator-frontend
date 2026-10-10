import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useSetAtom } from 'jotai'
import { authTokenAtom, currentUserAtom } from '@/atoms'
import { authApi, setAuthToken } from '@/services'
import { useT } from '@/i18n'
import { Button, Spinner } from '@/components/ui'
import { ProductMark, ScreenHeader, StandaloneScreen, StatusBanner } from '@/pages/setup'

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
  const { t } = useT()
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
  const error = providerError ?? (code ? exchangeError : t('auth.callback.missingCode'))

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
        setExchangeError(e instanceof Error ? e.message : t('auth.callback.failed'))
      })
  }, [code, navigate, setToken, setUser, t])

  if (error) {
    return (
      <StandaloneScreen width="xs" center>
        <ScreenHeader kicker={<ProductMark />} title={t('auth.callback.failedTitle')} lead={t('auth.callback.failedLead')} />
        <div className="mt-8 space-y-6">
          <StatusBanner tone="danger" title={t('auth.callback.reason')} role="alert">
            <p className="break-words">{error}</p>
          </StatusBanner>
          <Button onClick={() => navigate('/login')}>{t('auth.callback.backToLogin')}</Button>
        </div>
      </StandaloneScreen>
    )
  }

  return (
    <StandaloneScreen width="xs" center>
      <div className="flex flex-col items-center gap-4 text-center" role="status">
        <Spinner size="lg" />
        <p className="text-sm text-gray-400">{t('auth.callback.signingIn')}</p>
      </div>
    </StandaloneScreen>
  )
}
