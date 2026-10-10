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
import { LogIn } from 'lucide-react'
import { Spinner, Branding, Button, textLink } from '@/components/ui'
import { useT } from '@/i18n'
import { PasswordLoginForm } from '@/components/auth/PasswordLoginForm'
import { RegisterForm } from '@/components/auth/RegisterForm'
import { ProductMark, ScreenHeader, StandaloneScreen, StatusBanner } from '@/pages/setup'

/**
 * Dynamic login page that adapts to the available auth providers.
 *
 * - No-auth mode -> redirect to /workspaces immediately
 * - Password provider -> email/password form
 * - OIDC provider -> "Sign in with {name}" button
 * - Both -> password form + "or" separator + OIDC button
 * - allow_registration -> toggle to registration form
 *
 * The screen continues the setup assistant (same chrome: `display-3` title,
 * lead, glass buttons). ONE primary: the form's submit when a form is shown,
 * otherwise the single sign-in provider.
 */
export function LoginPage() {
  const { t } = useT()
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
      navigate('/', { replace: true })
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
      setOidcError(e instanceof Error ? e.message : t('auth.login.startFailed'))
      setOidcLoading(false)
    }
  }

  // Still loading providers
  if (!providersLoaded) {
    return (
      <StandaloneScreen width="xs" center>
        <div className="flex justify-center" aria-busy="true" aria-label={t('auth.login.loadingAria')}>
          <Spinner size="lg" />
        </div>
      </StandaloneScreen>
    )
  }

  const showsForm = (hasPassword && !showRegister) || (allowRegistration && showRegister)
  const lead = showRegister
    ? t('auth.login.leadRegister')
    : hasPassword && oidcProvider
      ? t('auth.login.leadBoth', { name: oidcProvider.name })
      : oidcProvider
        ? t('auth.login.leadOidc', { name: oidcProvider.name })
        : t('auth.login.leadPassword')

  return (
    <StandaloneScreen width="xs" center footer={<Branding />}>
      <ScreenHeader kicker={<ProductMark />} title={showRegister ? t('auth.login.register') : t('auth.login.signIn')} lead={lead} />

      <div className="mt-8 space-y-6">
        {/* Password login or registration form */}
        {hasPassword && !showRegister && <PasswordLoginForm />}
        {allowRegistration && showRegister && <RegisterForm />}

        {/* Separator when both password/register and OIDC are available */}
        {showsForm && oidcProvider && (
          <div className="relative" role="separator" aria-label={t('auth.login.or')}>
            <div className="absolute inset-0 flex items-center" aria-hidden="true">
              <div className="w-full border-t border-white/[0.1]" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="bg-surface-base px-3 text-gray-500">{t('auth.login.or')}</span>
            </div>
          </div>
        )}

        {/* OIDC SSO button: secondary next to a form, the primary when it is the only way in */}
        {oidcProvider && (
          <div className="space-y-3">
            <Button
              variant={showsForm ? 'secondary' : 'primary'}
              onClick={handleOidcLogin}
              loading={oidcLoading}
              className="w-full"
            >
              {!oidcLoading && <LogIn className="h-4 w-4" aria-hidden="true" />}
              {t('auth.login.oidc', { name: oidcProvider.name })}
            </Button>

            {oidcError && (
              <StatusBanner tone="danger" title={t('auth.login.oidcFailed')} role="alert">
                <p className="break-words">{oidcError}</p>
              </StatusBanner>
            )}
          </div>
        )}

        {/* Registration toggle */}
        {allowRegistration && (
          <div className="text-center">
            <button type="button" onClick={() => setShowRegister(!showRegister)} className={`min-h-9 px-2 text-sm ${textLink}`}>
              {showRegister ? t('auth.login.toSignIn') : t('auth.login.toRegister')}
            </button>
          </div>
        )}
      </div>
    </StandaloneScreen>
  )
}
