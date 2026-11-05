import { useAtom } from 'jotai'
import { useCallback, useState } from 'react'
import { Key, Settings, Loader2, CheckCircle2, Info, ShieldCheck, X, Check, Clipboard } from 'lucide-react'
import {
  setupConfigAtom,
  OIDC_PROVIDERS,
  type AuthMode,
  type OidcProvider,
  type SetupConfig,
} from '@/atoms/setup'
import { isTauri } from '@/services/env'
import { useT } from '@/i18n'
import { Button, Input, focusRing, inlineLink, surface } from '@/components/ui'
import { ExternalLink } from '@/components/ui/ExternalLink'
import { Field } from './Field'
import { StatusBanner } from './StatusBanner'
import { setupChatTexts } from '@/constants/setupProviders'

// ============================================================================
// AuthPage — Step 2 of the setup wizard
// ============================================================================

export function AuthPage() {
  const { t } = useT()
  const [config, setConfig] = useAtom(setupConfigAtom)

  const update = (patch: Partial<SetupConfig>) =>
    setConfig((prev) => ({ ...prev, ...patch }))

  const modes: { value: AuthMode; label: string; description: string }[] = [
    { value: 'none', label: t('siteSetup.auth.modeNone'), description: t('siteSetup.auth.modeNoneDesc') },
    { value: 'password', label: t('siteSetup.auth.modePassword'), description: t('siteSetup.auth.modePasswordDesc') },
    { value: 'oidc', label: t('siteSetup.auth.modeOidc'), description: t('siteSetup.auth.modeOidcDesc') },
  ]

  return (
    <div className="space-y-6">
      {/* Mode selection */}
      <fieldset className="space-y-2">
        <legend className="sr-only">{t('siteSetup.auth.modesLegend')}</legend>
        {modes.map((m) => (
          <label
            key={m.value}
            className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors has-[:focus-visible]:ring-1 has-[:focus-visible]:ring-indigo-500/60 ${
              config.authMode === m.value
                ? 'border-indigo-500/50 bg-indigo-500/10'
                : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]'
            }`}
          >
            <input
              type="radio"
              name="authMode"
              value={m.value}
              checked={config.authMode === m.value}
              onChange={() => update({ authMode: m.value })}
              className="mt-0.5 h-4 w-4 accent-indigo-600"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-gray-100">{m.label}</span>
              <span className="mt-0.5 block text-xs leading-4 text-gray-500">{m.description}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {/* No-auth warning */}
      {config.authMode === 'none' && (
        <StatusBanner tone="warning" title={t('siteSetup.auth.noneTitle')} role="status">
          <p>{t('siteSetup.auth.noneNotice')}</p>
          <p data-testid="setup-auth-none-providers">{setupChatTexts().authNoneNote}</p>
        </StatusBanner>
      )}

      {/* Password config */}
      {config.authMode === 'password' && (
        <div className={`${surface} space-y-3 p-4 md:p-5`}>
          <h3 className="text-sm font-semibold text-gray-200">{t('siteSetup.auth.rootAccount')}</h3>
          <Field
            label={t('siteSetup.auth.email')}
            type="email"
            value={config.rootEmail}
            onChange={(v) => update({ rootEmail: v })}
            placeholder="admin@example.com"
          />
          <Field
            label={t('siteSetup.auth.password')}
            type="password"
            value={config.rootPassword}
            onChange={(v) => update({ rootPassword: v })}
            placeholder={t('siteSetup.auth.passwordMinPlaceholder')}
            hint={t('siteSetup.auth.rootHint')}
          />
        </div>
      )}

      {/* OIDC config — provider select + details */}
      {config.authMode === 'oidc' && (
        <>
          <OidcProviderSelect config={config} update={update} />
          <OidcDetailsSection config={config} update={update} />
          <OidcCallbackUrls config={config} />
        </>
      )}

      {/* Access control — only for OIDC (password mode has a single root account) */}
      {config.authMode === 'oidc' && (
        <AccessControlSection config={config} update={update} />
      )}
    </div>
  )
}

// ============================================================================
// OIDC Provider Select — card grid
// ============================================================================

const PROVIDER_KEYS: OidcProvider[] = ['google', 'microsoft', 'okta', 'auth0', 'keycloak', 'custom']

const PROVIDER_ICONS: Record<OidcProvider, React.ReactNode> = {
  google: (
    /* Brand logo — keep as SVG */
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  ),
  microsoft: (
    /* Brand logo — keep as SVG */
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="1" y="1" width="10" height="10" />
      <rect x="13" y="1" width="10" height="10" />
      <rect x="1" y="13" width="10" height="10" />
      <rect x="13" y="13" width="10" height="10" />
    </svg>
  ),
  okta: (
    /* Brand logo — keep as SVG */
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fillOpacity="0.3" />
      <circle cx="12" cy="12" r="5" />
    </svg>
  ),
  auth0: (
    /* Brand logo — keep as SVG */
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.2 2H6.8L2 12l4.8 10h10.4L22 12 17.2 2zM12 16a4 4 0 110-8 4 4 0 010 8z" />
    </svg>
  ),
  keycloak: <Key className="h-5 w-5" aria-hidden="true" />,
  custom: <Settings className="h-5 w-5" aria-hidden="true" />,
}

function OidcProviderSelect({
  config,
  update,
}: {
  config: SetupConfig
  update: (patch: Partial<SetupConfig>) => void
}) {
  const { t } = useT()
  const handleSelect = (key: OidcProvider) => {
    const provider = OIDC_PROVIDERS[key]
    const patch: Partial<SetupConfig> = {
      oidcProvider: key,
      oidcProviderName: provider.label === 'Custom' ? '' : provider.label,
    }

    // Auto-fill discovery URL for providers with a fixed one
    if (provider.discoveryUrl) {
      patch.oidcDiscoveryUrl = provider.discoveryUrl
    } else if (key !== config.oidcProvider) {
      // Clear discovery URL when switching to a different provider that needs tenant
      patch.oidcDiscoveryUrl = ''
    }

    // Clear tenant when switching providers
    if (key !== config.oidcProvider) {
      patch.oidcTenant = ''
      // Clear resolved endpoints
      patch.oidcAuthEndpoint = ''
      patch.oidcTokenEndpoint = ''
      patch.oidcUserinfoEndpoint = ''
    }

    update(patch)
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-200">{t('siteSetup.auth.provider')}</h3>
      <div className="grid gap-3 sm:grid-cols-3" role="group" aria-label={t('siteSetup.auth.providerGroup')}>
        {PROVIDER_KEYS.map((key) => {
          const provider = OIDC_PROVIDERS[key]
          const active = config.oidcProvider === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => handleSelect(key)}
              aria-pressed={active}
              className={`flex min-w-0 items-start gap-3 rounded-xl border p-4 text-left transition-colors ${focusRing} ${
                active
                  ? 'border-indigo-500/50 bg-indigo-500/10'
                  : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.04]'
              }`}
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                  active ? 'bg-indigo-500/20 text-indigo-300' : 'bg-white/[0.06] text-gray-400'
                }`}
              >
                {PROVIDER_ICONS[key]}
              </span>
              <span className="min-w-0">
                <span className={`block text-sm font-medium ${active ? 'text-gray-50' : 'text-gray-200'}`}>{provider.label}</span>
                <span className="mt-0.5 block text-xs leading-4 text-gray-500">{provider.description}</span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================================
// OIDC Details — tenant field, discovery, client credentials
// ============================================================================

type DiscoveryStatus = 'idle' | 'fetching' | 'success' | 'error'

function OidcDetailsSection({
  config,
  update,
}: {
  config: SetupConfig
  update: (patch: Partial<SetupConfig>) => void
}) {
  const { t } = useT()
  const provider = OIDC_PROVIDERS[config.oidcProvider]
  const needsTenant = !provider.discoveryUrl && config.oidcProvider !== 'custom'
  const isKeycloak = config.oidcProvider === 'keycloak'

  const [discoveryStatus, setDiscoveryStatus] = useState<DiscoveryStatus>('idle')
  const [discoveryError, setDiscoveryError] = useState('')
  const [discoveredEndpoints, setDiscoveredEndpoints] = useState<{
    authorization_endpoint?: string
    token_endpoint?: string
    userinfo_endpoint?: string
    issuer?: string
  } | null>(null)

  // Build discovery URL from tenant input when using parameterized providers
  const buildDiscoveryUrl = useCallback(
    (tenant: string): string => {
      if (!provider.discoveryTemplate || !tenant.trim()) return ''
      if (isKeycloak) {
        // Keycloak needs server URL + realm — for now we build with a default realm
        // The template is: {tenant}/realms/{realm}/.well-known/openid-configuration
        // We use the tenant as server URL and ask for realm separately
        return provider.discoveryTemplate.replace('{tenant}', tenant.trim().replace(/\/+$/, ''))
      }
      return provider.discoveryTemplate.replace('{tenant}', tenant.trim())
    },
    [provider.discoveryTemplate, isKeycloak],
  )

  // Handle tenant change — auto-build discovery URL
  const handleTenantChange = (value: string) => {
    const patch: Partial<SetupConfig> = { oidcTenant: value }
    const url = buildDiscoveryUrl(value)
    if (url) {
      patch.oidcDiscoveryUrl = url
    }
    update(patch)
  }

  // Verify discovery URL — fetch and parse .well-known/openid-configuration
  // In Tauri mode, uses a Rust command to bypass browser CSP restrictions.
  // In browser mode, uses a direct fetch() call.
  const handleVerifyDiscovery = useCallback(async () => {
    const url = config.oidcDiscoveryUrl.trim()
    if (!url) return

    setDiscoveryStatus('fetching')
    setDiscoveryError('')
    setDiscoveredEndpoints(null)

    try {
      let data: {
        issuer?: string
        authorization_endpoint?: string
        token_endpoint?: string
        userinfo_endpoint?: string
        // Tauri command returns camelCase fields
        authorizationEndpoint?: string
        tokenEndpoint?: string
        userinfoEndpoint?: string
      }

      if (isTauri) {
        // Tauri mode: use Rust command to bypass CSP and CORS
        const { invoke } = await import('@tauri-apps/api/core')
        data = await invoke('verify_oidc_discovery', { url })
        // Tauri command returns camelCase — normalize to snake_case keys
        data = {
          issuer: data.issuer,
          authorization_endpoint: data.authorizationEndpoint || data.authorization_endpoint,
          token_endpoint: data.tokenEndpoint || data.token_endpoint,
          userinfo_endpoint: data.userinfoEndpoint || data.userinfo_endpoint,
        }
      } else {
        // Browser mode: direct fetch
        const res = await fetch(url)
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`)
        }
        data = await res.json()
      }

      if (!data.authorization_endpoint || !data.token_endpoint) {
        throw new Error(t('siteSetup.auth.discoveryMissingEndpoints'))
      }

      setDiscoveredEndpoints(data)
      setDiscoveryStatus('success')

      // Auto-fill resolved endpoints
      update({
        oidcAuthEndpoint: data.authorization_endpoint || '',
        oidcTokenEndpoint: data.token_endpoint || '',
        oidcUserinfoEndpoint: data.userinfo_endpoint || '',
      })
    } catch (e) {
      setDiscoveryStatus('error')
      setDiscoveryError(e instanceof Error ? e.message : t('siteSetup.auth.discoveryFallbackError'))
    }
  }, [config.oidcDiscoveryUrl, update, t])

  return (
    <div className={`${surface} space-y-4 p-4 md:p-5`}>
      {/* Tenant field for parameterized providers */}
      {needsTenant && (
        <Field
          label={provider.tenantLabel || t('siteSetup.auth.tenantDefault')}
          value={config.oidcTenant}
          onChange={handleTenantChange}
          placeholder={provider.tenantPlaceholder || ''}
          hint={isKeycloak ? t('siteSetup.auth.keycloakHint') : undefined}
        />
      )}

      {/* Discovery URL + Verify button */}
      <div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1 basis-56">
            <Input
              type="text"
              label={t('siteSetup.auth.discoveryUrl')}
              value={config.oidcDiscoveryUrl}
              onChange={(e) => update({ oidcDiscoveryUrl: e.target.value })}
              placeholder="https://.../.well-known/openid-configuration"
            />
          </div>
          <Button
            variant="secondary"
            size="sm"
            flat
            onClick={handleVerifyDiscovery}
            disabled={!config.oidcDiscoveryUrl.trim() || discoveryStatus === 'fetching'}
            className="mb-px"
          >
            {discoveryStatus === 'fetching' ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                {t('siteSetup.auth.verifying')}
              </>
            ) : (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                {t('siteSetup.auth.verify')}
              </>
            )}
          </Button>
        </div>
        {provider.discoveryUrl && (
          <p className="mt-1 text-xs leading-4 text-gray-500">
            {t('siteSetup.auth.prefilled', { provider: provider.label })}
          </p>
        )}
      </div>

      {/* Discovery result feedback */}
      {discoveryStatus === 'success' && discoveredEndpoints && (
        <StatusBanner
          tone="success"
          title={discoveredEndpoints.issuer
            ? t('siteSetup.auth.discoverySuccessIssuer', { issuer: discoveredEndpoints.issuer })
            : t('siteSetup.auth.discoverySuccess')}
          role="status"
        >
          <dl className="space-y-1 text-xs leading-4 text-gray-400">
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-gray-500">{t('siteSetup.auth.discoveryAuthorization')}</dt>
              <dd className="min-w-0 break-all font-mono text-gray-300">{discoveredEndpoints.authorization_endpoint}</dd>
            </div>
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-gray-500">{t('siteSetup.auth.discoveryToken')}</dt>
              <dd className="min-w-0 break-all font-mono text-gray-300">{discoveredEndpoints.token_endpoint}</dd>
            </div>
            {discoveredEndpoints.userinfo_endpoint && (
              <div className="flex flex-wrap gap-x-2">
                <dt className="text-gray-500">{t('siteSetup.auth.discoveryUserinfo')}</dt>
                <dd className="min-w-0 break-all font-mono text-gray-300">{discoveredEndpoints.userinfo_endpoint}</dd>
              </div>
            )}
          </dl>
        </StatusBanner>
      )}

      {discoveryStatus === 'error' && (
        <StatusBanner tone="danger" title={t('siteSetup.auth.discoveryFailed')} role="alert">
          <p className="break-words">{discoveryError}</p>
        </StatusBanner>
      )}

      {/* Provider name + Scopes */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label={t('siteSetup.auth.providerName')}
          value={config.oidcProviderName}
          onChange={(v) => update({ oidcProviderName: v })}
          placeholder="Google, Okta, Auth0..."
          hint={t('siteSetup.auth.providerNameHint')}
        />
        <Field
          label={t('siteSetup.auth.scopes')}
          value={config.oidcScopes}
          onChange={(v) => update({ oidcScopes: v })}
          placeholder="openid email profile"
          hint={t('siteSetup.auth.scopesHint')}
        />
      </div>

      {/* Client ID + Secret */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label={t('siteSetup.auth.clientId')}
          value={config.oidcClientId}
          onChange={(v) => update({ oidcClientId: v })}
          placeholder="your-client-id"
        />
        <Field
          label={t('siteSetup.auth.clientSecret')}
          type="password"
          value={config.oidcClientSecret}
          onChange={(v) => update({ oidcClientSecret: v })}
          placeholder={config.hasOidcSecret ? t('siteSetup.auth.unchanged') : 'your-client-secret'}
          hint={
            config.hasOidcSecret
              ? t('siteSetup.auth.secretConfigured')
              : undefined
          }
        />
      </div>

      {/* Console link */}
      {provider.consoleUrl && (
        <p className="text-xs leading-4 text-gray-500">
          {t('siteSetup.auth.consolePrefix')}{' '}
          <ExternalLink href={provider.consoleUrl} className={inlineLink}>
            {t('siteSetup.auth.consoleLink', { provider: provider.label })}
          </ExternalLink>
          .
        </p>
      )}
    </div>
  )
}

// ============================================================================
// OIDC Callback URLs — with publicUrl support
// ============================================================================

function OidcCallbackUrls({ config }: { config: SetupConfig }) {
  const { t } = useT()
  const localBase = `http://localhost:${config.serverPort}`
  const publicBase = config.publicUrl.trim().replace(/\/+$/, '')
  const hasPublicUrl = !!publicBase

  return (
    <div className={`${surface} p-4 md:p-5`}>
      <div className="flex items-start gap-3">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-gray-500" aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-3">
          <p className="text-sm font-medium text-gray-200">{t('siteSetup.auth.callbackTitle')}</p>
          <p className="text-xs leading-4 text-gray-400">
            {t('siteSetup.auth.callbackHint')}
          </p>

          {/* When both public + local: show both as required */}
          {hasPublicUrl ? (
            <>
              <p className="text-xs leading-4 text-amber-400">
                {t('siteSetup.auth.bothBefore')}{' '}
                <strong>{t('siteSetup.auth.bothEmphasis')}</strong>{' '}
                {t('siteSetup.auth.bothAfter')}
              </p>
              <div className="space-y-2">
                <CopyableUrl
                  label={t('siteSetup.auth.redirectWeb')}
                  value={`${publicBase}/auth/callback`}
                />
                <CopyableUrl
                  label={t('siteSetup.auth.redirectDesktop')}
                  value={`${localBase}/auth/callback`}
                />
              </div>
              <div className="space-y-2 border-t border-white/[0.06] pt-3">
                <p className="text-xs leading-4 text-gray-500">{t('siteSetup.auth.originsIntro')}</p>
                <CopyableUrl label={t('siteSetup.auth.originWeb')} value={publicBase} />
                <CopyableUrl label={t('siteSetup.auth.originDesktop')} value={localBase} />
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <CopyableUrl
                label={t('siteSetup.auth.redirectSingle')}
                value={`${localBase}/auth/callback`}
              />
              <CopyableUrl
                label={t('siteSetup.auth.originSingle')}
                value={localBase}
              />
            </div>
          )}

          {/* Provider-specific help */}
          {config.oidcProvider === 'google' && (
            <p className="text-xs leading-4 text-gray-500">
              {t('siteSetup.auth.googlePrefix')}{' '}
              <ExternalLink href="https://console.cloud.google.com/apis/credentials" className={inlineLink}>
                console.cloud.google.com/apis/credentials
              </ExternalLink>
              {t('siteSetup.auth.googleSuffix')}
            </p>
          )}
          {config.oidcProvider === 'microsoft' && (
            <p className="text-xs leading-4 text-gray-500">
              {t('siteSetup.auth.microsoftPrefix')}{' '}
              <ExternalLink href="https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps" className={inlineLink}>
                {t('siteSetup.auth.microsoftLink')}
              </ExternalLink>
              {t('siteSetup.auth.microsoftSuffix')}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Access Control Section
// ============================================================================

function AccessControlSection({
  config,
  update,
}: {
  config: SetupConfig
  update: (patch: Partial<SetupConfig>) => void
}) {
  const { t } = useT()
  const emails = config.allowedEmails
    .split('\n')
    .map((e) => e.trim())
    .filter(Boolean)
  const domain = config.allowedEmailDomain.trim()

  // Build dynamic summary
  const summaryParts: string[] = []
  if (emails.length > 0) {
    summaryParts.push(
      t(emails.length > 1 ? 'siteSetup.auth.peopleMany' : 'siteSetup.auth.peopleOne', { count: emails.length }),
    )
  }
  if (domain) {
    summaryParts.push(t('siteSetup.auth.domainAllowed', { domain }))
  }
  const summary = summaryParts.length > 0 ? summaryParts.join(' + ') : null

  return (
    <div className={`${surface} space-y-4 p-4 md:p-5`}>
      {/* Header with shield icon */}
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-gray-500" aria-hidden="true" />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-200">{t('siteSetup.auth.accessTitle')}</h3>
          <p className="mt-1 text-xs leading-4 text-gray-500">
            {t('siteSetup.auth.accessHint')}
          </p>
        </div>
      </div>

      {/* Domain field with dynamic preview */}
      <Field
        label={t('siteSetup.auth.allowedDomain')}
        value={config.allowedEmailDomain}
        onChange={(v) => update({ allowedEmailDomain: v })}
        placeholder="example.com"
        hint={domain ? t('siteSetup.auth.allowedDomainHint', { domain }) : undefined}
      />

      {/* Email chips input */}
      <div>
        <label htmlFor="setup-allowed-emails" className="mb-1 block text-sm font-medium text-gray-300">
          {t('siteSetup.auth.individualEmails')}
        </label>
        <EmailChipsInput
          inputId="setup-allowed-emails"
          emails={emails}
          onChange={(newEmails) => update({ allowedEmails: newEmails.join('\n') })}
        />
        {domain && emails.length > 0 && (
          <p className="mt-1.5 text-xs leading-4 text-gray-500">
            {t('siteSetup.auth.ruleBefore')}{' '}
            <span className="font-medium text-gray-400">{t('siteSetup.auth.ruleOr')}</span>{' '}
            {t('siteSetup.auth.ruleAfter')}
          </p>
        )}
      </div>

      {/* Dynamic summary: a glyph and words, never a tinted box alone */}
      <p className="flex items-start gap-1.5 text-xs leading-4 text-gray-400">
        <ShieldCheck className={`mt-px h-3.5 w-3.5 shrink-0 ${summary ? 'text-indigo-300' : 'text-gray-600'}`} aria-hidden="true" />
        <span className="min-w-0 break-words">
          {summary ? t('siteSetup.auth.restricted', { summary }) : t('siteSetup.auth.noRestriction')}
        </span>
      </p>
    </div>
  )
}

// ============================================================================
// Email Chips Input
// ============================================================================

function EmailChipsInput({
  inputId,
  emails,
  onChange,
}: {
  inputId?: string
  emails: string[]
  onChange: (emails: string[]) => void
}) {
  const { t } = useT()
  const [inputValue, setInputValue] = useState('')
  const [error, setError] = useState('')

  const addEmail = (raw: string) => {
    const email = raw.trim().toLowerCase()
    if (!email) return

    // Basic email validation
    if (!email.includes('@') || !email.includes('.')) {
      setError(t('siteSetup.auth.invalidEmail'))
      return
    }

    // Duplicate check
    if (emails.includes(email)) {
      setError(t('siteSetup.auth.duplicateEmail'))
      return
    }

    setError('')
    onChange([...emails, email])
    setInputValue('')
  }

  const removeEmail = (index: number) => {
    onChange(emails.filter((_, i) => i !== index))
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addEmail(inputValue)
    } else if (e.key === 'Backspace' && !inputValue && emails.length > 0) {
      removeEmail(emails.length - 1)
    }
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text')
    if (text.includes('\n') || text.includes(',')) {
      e.preventDefault()
      const newEmails = text
        .split(/[,\n]/)
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s && s.includes('@'))
      const unique = newEmails.filter((em) => !emails.includes(em))
      if (unique.length > 0) {
        onChange([...emails, ...unique])
      }
      setInputValue('')
    }
  }

  return (
    <div>
      <div className="min-h-[42px] rounded-lg border border-border-default bg-surface-base px-2 py-1.5 transition-colors focus-within:border-indigo-500/50 focus-within:ring-1 focus-within:ring-indigo-500/30">
        <div className="flex flex-wrap gap-1.5">
          {emails.map((email, i) => (
            <span
              key={email}
              className="flex min-w-0 items-center gap-1 rounded-md bg-white/[0.08] px-2 py-0.5 text-xs text-gray-300"
            >
              <span className="min-w-0 break-all">{email}</span>
              <button
                type="button"
                onClick={() => removeEmail(i)}
                aria-label={t('siteSetup.auth.removeEmail', { email })}
                className={`ml-0.5 rounded p-1 text-gray-500 transition-colors hover:bg-white/[0.1] hover:text-gray-300 ${focusRing}`}
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </span>
          ))}
          <input
            id={inputId}
            type="email"
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value)
              setError('')
            }}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onBlur={() => {
              if (inputValue.trim()) addEmail(inputValue)
            }}
            placeholder={emails.length === 0 ? 'alice@gmail.com, bob@company.org...' : t('siteSetup.auth.addEmailPlaceholder')}
            className="min-w-[120px] flex-1 border-none bg-transparent px-1 py-0.5 text-base text-gray-100 placeholder-gray-500 outline-none md:text-sm"
          />
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-1 text-xs leading-4 text-red-400">
          {error}
        </p>
      )}
      {!error && (
        <p className="mt-1 text-xs leading-4 text-gray-500">
          {t('siteSetup.auth.chipsHelp')}
        </p>
      )}
    </div>
  )
}

// ============================================================================
// Sub-components
// ============================================================================

function CopyableUrl({ label, value }: { label: string; value: string }) {
  const { t } = useT()
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard
      .writeText(value)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
      .catch(() => {
        // Fallback: select text in the code element
      })
  }

  return (
    <div className="rounded-lg bg-white/[0.04] p-3">
      <div className="mb-1 text-xs leading-4 text-gray-400">{label}</div>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 break-all text-xs text-gray-200">{value}</code>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          flat
          onClick={handleCopy}
          aria-label={copied ? t('siteSetup.auth.copied', { label }) : t('siteSetup.auth.copy', { label })}
          title={t('siteSetup.auth.copyTitle')}
          className="btn-icon size-9 p-0! md:size-8"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
          ) : (
            <Clipboard className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </Button>
      </div>
    </div>
  )
}
