import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import {
  allowRegistrationAtom,
  authModeAtom,
  authProvidersAtom,
  authProvidersLoadedAtom,
  isAuthenticatedAtom,
} from '@/atoms'
import { authApi, setAuthMode as setAuthModeService } from '@/services'
import { Spinner } from '@/components/ui'
import { PasswordLoginForm } from '@/components/auth/PasswordLoginForm'
import { RegisterForm } from '@/components/auth/RegisterForm'

/**
 * Dynamic login page that adapts to the available auth providers.
 *
 * - No-auth mode -> redirect to /workspaces immediately
 * - Password provider -> email/password form
 * - OIDC provider -> "Sign in with {name}" button
 * - Both -> password form + "or" separator + OIDC button
 * - allow_registration -> toggle to registration form
 */
export function LoginPage() {
  const navigate = useNavigate()
  const isAuthenticated = useAtomValue(isAuthenticatedAtom)
  const authMode = useAtomValue(authModeAtom)
  const providers = useAtomValue(authProvidersAtom)
  const allowRegistration = useAtomValue(allowRegistrationAtom)
  const [providersLoaded, setProvidersLoaded] = useAtom(authProvidersLoadedAtom)
  const setAuthMode = useSetAtom(authModeAtom)
  const setProviders = useSetAtom(authProvidersAtom)
  const setAllowRegistration = useSetAtom(allowRegistrationAtom)

  const [showRegister, setShowRegister] = useState(false)
  const [oidcLoading, setOidcLoading] = useState(false)
  const [oidcError, setOidcError] = useState<string | null>(null)

  // Fetch providers if not already loaded (e.g. navigating to /login directly)
  useEffect(() => {
    if (providersLoaded) return

    authApi
      .getProviders()
      .then((resp) => {
        const mode = resp.auth_required ? 'required' : 'none'
        setAuthMode(mode)
        setAuthModeService(mode)
        setProviders(resp.providers)
        setAllowRegistration(resp.allow_registration)
        setProvidersLoaded(true)
      })
      .catch(() => {
        setAuthMode('none')
        setAuthModeService('none')
        setProvidersLoaded(true)
      })
  }, [providersLoaded, setAuthMode, setProviders, setAllowRegistration, setProvidersLoaded])

  // Redirect if already authenticated or no-auth mode
  useEffect(() => {
    if (!providersLoaded) return
    if (isAuthenticated || authMode === 'none') {
      navigate('/workspaces', { replace: true })
    }
  }, [providersLoaded, isAuthenticated, authMode, navigate])

  const hasPassword = providers.some((p) => p.type === 'password')
  const oidcProvider = providers.find((p) => p.type === 'oidc')

  const handleOidcLogin = async () => {
    setOidcLoading(true)
    setOidcError(null)
    try {
      const { auth_url } = await authApi.getOidcAuthUrl()
      // Cover the viewport with a dark overlay before navigating away.
      // This prevents a white flash while the browser loads the provider page
      // (Google, Microsoft, etc.) and when it navigates back to /auth/callback.
      const overlay = document.createElement('div')
      overlay.id = 'sso-overlay'
      overlay.style.cssText =
        'position:fixed;inset:0;z-index:99999;background:#0f1117'
      document.body.appendChild(overlay)
      window.location.href = auth_url
    } catch (e) {
      document.getElementById('sso-overlay')?.remove()
      setOidcError(e instanceof Error ? e.message : 'Failed to start login')
      setOidcLoading(false)
    }
  }

  // Still loading providers
  if (!providersLoaded) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[var(--surface-base)]">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col items-center justify-center overflow-hidden bg-[var(--surface-base)]">
      <div className="w-full max-w-sm space-y-6 px-6">
        {/* Logo & Title */}
        <div className="text-center">
          <img src="/logo-192.png" alt="Project Orchestrator" className="mx-auto h-20 w-20 rounded-2xl sm:h-28 sm:w-28 sm:rounded-3xl" />
          <h1 className="mt-4 text-2xl font-bold text-white">Project Orchestrator</h1>
          <p className="mt-1.5 text-sm text-gray-400">
            {showRegister ? 'Create your account' : 'Sign in to continue'}
          </p>
        </div>

        {/* Auth forms */}
        <div className="space-y-6">
          {/* Password login or registration form */}
          {hasPassword && !showRegister && <PasswordLoginForm />}
          {allowRegistration && showRegister && <RegisterForm />}

          {/* Separator when both password/register and OIDC are available */}
          {(hasPassword || (allowRegistration && showRegister)) && oidcProvider && (
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/[0.1]" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-[var(--surface-base)] px-3 text-gray-500">or</span>
              </div>
            </div>
          )}

          {/* OIDC SSO button */}
          {oidcProvider && (
            <div className="space-y-3">
              <button
                onClick={handleOidcLogin}
                disabled={oidcLoading}
                className="flex w-full items-center justify-center gap-3 rounded-lg bg-white px-4 py-3 text-sm font-medium text-gray-900 shadow-sm transition hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-950 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {oidcLoading ? (
                  <Spinner size="sm" className="text-gray-600" />
                ) : (
                  <svg className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                  </svg>
                )}
                Sign in with {oidcProvider.name}
              </button>

              {oidcError && (
                <div className="rounded-lg bg-red-900/50 px-4 py-3 text-sm text-red-300">
                  {oidcError}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Registration toggle */}
        {allowRegistration && (
          <div className="text-center">
            <button
              type="button"
              onClick={() => setShowRegister(!showRegister)}
              className="text-sm text-indigo-400 transition hover:text-indigo-300"
            >
              {showRegister
                ? 'Already have an account? Sign in'
                : "Don't have an account? Create one"}
            </button>
          </div>
        )}
      </div>

      {/* Branding */}
      <div className="absolute bottom-6 text-center text-xs tracking-wide text-gray-600">
        Freedom From Scratch
      </div>
    </div>
  )
}
