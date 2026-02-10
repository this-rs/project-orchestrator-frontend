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
      window.location.href = auth_url
    } catch (e) {
      setOidcError(e instanceof Error ? e.message : 'Failed to start login')
      setOidcLoading(false)
    }
  }

  // Still loading providers
  if (!providersLoaded) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-gray-950">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-gray-950">
      <div className="w-full max-w-sm space-y-8 px-6">
        {/* Logo & Title */}
        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-600">
            <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
            </svg>
          </div>
          <h1 className="mt-6 text-2xl font-bold text-white">Project Orchestrator</h1>
          <p className="mt-2 text-sm text-gray-400">
            {showRegister ? 'Create your account' : 'Sign in to continue'}
          </p>
        </div>

        {/* Auth forms */}
        <div className="space-y-6">
          {/* Password login or registration form */}
          {hasPassword && (
            showRegister ? <RegisterForm /> : <PasswordLoginForm />
          )}

          {/* Separator when both password and OIDC are available */}
          {hasPassword && oidcProvider && (
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/[0.1]" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-gray-950 px-3 text-gray-500">or</span>
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
        {hasPassword && allowRegistration && (
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
    </div>
  )
}
