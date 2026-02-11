import { useAtom } from 'jotai'
import { useCallback, useState } from 'react'
import {
  setupConfigAtom,
  OIDC_PROVIDERS,
  type AuthMode,
  type OidcProvider,
  type SetupConfig,
} from '@/atoms/setup'
import { isTauri } from '@/services/env'

// ============================================================================
// AuthPage — Step 2 of the setup wizard
// ============================================================================

export function AuthPage() {
  const [config, setConfig] = useAtom(setupConfigAtom)

  const update = (patch: Partial<SetupConfig>) =>
    setConfig((prev) => ({ ...prev, ...patch }))

  const modes: { value: AuthMode; label: string; description: string }[] = [
    {
      value: 'none',
      label: 'No authentication',
      description: 'Open access — best for local development or trusted networks.',
    },
    {
      value: 'password',
      label: 'Password',
      description: 'Create a root account with email and password.',
    },
    {
      value: 'oidc',
      label: 'OIDC / OAuth',
      description: 'Use Google, Microsoft, Okta, or any OpenID Connect provider.',
    },
  ]

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold">Authentication</h2>
        <p className="mt-1 text-sm text-gray-400">
          Configure how users will sign in to the application.
        </p>
      </div>

      {/* Mode selection */}
      <div className="space-y-3">
        {modes.map((m) => (
          <label
            key={m.value}
            className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${
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
            <div>
              <div className="text-sm font-medium text-white">{m.label}</div>
              <div className="mt-0.5 text-xs text-gray-500">{m.description}</div>
            </div>
          </label>
        ))}
      </div>

      {/* No-auth warning */}
      {config.authMode === 'none' && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <div className="flex gap-3">
            <svg
              className="mt-0.5 h-5 w-5 shrink-0 text-amber-400"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
            <div className="text-sm text-gray-300">
              <p className="font-medium text-amber-400">Security notice</p>
              <p className="mt-1">
                Without authentication, anyone with network access to this server can view and
                modify all data. Only use this mode for local development.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Password config */}
      {config.authMode === 'password' && (
        <div className="space-y-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-6">
          <h3 className="text-sm font-medium text-gray-300">Root Account</h3>
          <Field
            label="Email"
            type="email"
            value={config.rootEmail}
            onChange={(v) => update({ rootEmail: v })}
            placeholder="admin@example.com"
          />
          <Field
            label="Password"
            type="password"
            value={config.rootPassword}
            onChange={(v) => update({ rootPassword: v })}
            placeholder="Minimum 8 characters"
          />
          <p className="text-xs text-gray-500">
            This will be the initial administrator account. You can add more users later.
          </p>
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

      {/* Access control — visible for password and oidc */}
      {(config.authMode === 'password' || config.authMode === 'oidc') && (
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
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  ),
  microsoft: (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
      <rect x="1" y="1" width="10" height="10" />
      <rect x="13" y="1" width="10" height="10" />
      <rect x="1" y="13" width="10" height="10" />
      <rect x="13" y="13" width="10" height="10" />
    </svg>
  ),
  okta: (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="12" r="10" fillOpacity="0.3" />
      <circle cx="12" cy="12" r="5" />
    </svg>
  ),
  auth0: (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.2 2H6.8L2 12l4.8 10h10.4L22 12 17.2 2zM12 16a4 4 0 110-8 4 4 0 010 8z" />
    </svg>
  ),
  keycloak: (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z"
      />
    </svg>
  ),
  custom: (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
}

function OidcProviderSelect({
  config,
  update,
}: {
  config: SetupConfig
  update: (patch: Partial<SetupConfig>) => void
}) {
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
      <h3 className="text-sm font-medium text-gray-300">OIDC Provider</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        {PROVIDER_KEYS.map((key) => {
          const provider = OIDC_PROVIDERS[key]
          const active = config.oidcProvider === key
          return (
            <button
              key={key}
              onClick={() => handleSelect(key)}
              className={`flex items-start gap-3 rounded-xl border p-4 text-left transition ${
                active
                  ? 'border-indigo-500/50 bg-indigo-500/10'
                  : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.04]'
              }`}
            >
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                  active ? 'bg-indigo-600 text-white' : 'bg-white/[0.06] text-gray-400'
                }`}
              >
                {PROVIDER_ICONS[key]}
              </div>
              <div className="min-w-0">
                <div
                  className={`text-sm font-medium ${active ? 'text-white' : 'text-gray-300'}`}
                >
                  {provider.label}
                </div>
                <div className="mt-0.5 text-xs text-gray-500">{provider.description}</div>
              </div>
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
        throw new Error('Invalid discovery document: missing required endpoints')
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
      setDiscoveryError(e instanceof Error ? e.message : 'Failed to fetch discovery document')
    }
  }, [config.oidcDiscoveryUrl, update])

  return (
    <div className="space-y-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-6">
      {/* Tenant field for parameterized providers */}
      {needsTenant && (
        <div>
          <Field
            label={provider.tenantLabel || 'Tenant'}
            value={config.oidcTenant}
            onChange={handleTenantChange}
            placeholder={provider.tenantPlaceholder || ''}
          />
          {isKeycloak && (
            <p className="mt-1.5 text-xs text-gray-500">
              Enter the full server URL. You may need to edit the realm name in the discovery URL
              below.
            </p>
          )}
        </div>
      )}

      {/* Discovery URL + Verify button */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-gray-400">Discovery URL</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={config.oidcDiscoveryUrl}
            onChange={(e) => update({ oidcDiscoveryUrl: e.target.value })}
            placeholder="https://.../.well-known/openid-configuration"
            className="flex-1 rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-sm text-white placeholder-gray-600 transition focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
          />
          <button
            onClick={handleVerifyDiscovery}
            disabled={!config.oidcDiscoveryUrl.trim() || discoveryStatus === 'fetching'}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-xs font-medium text-gray-300 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {discoveryStatus === 'fetching' ? (
              <>
                <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Verifying...
              </>
            ) : (
              <>
                <svg
                  className="h-3.5 w-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                Verify
              </>
            )}
          </button>
        </div>
        {provider.discoveryUrl && (
          <p className="mt-1 text-xs text-gray-600">
            Pre-filled for {provider.label}. Click Verify to confirm it&apos;s reachable.
          </p>
        )}
      </div>

      {/* Discovery result feedback */}
      {discoveryStatus === 'success' && discoveredEndpoints && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] p-3">
          <div className="mb-2 flex items-center gap-1.5">
            <svg
              className="h-4 w-4 text-emerald-400"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span className="text-xs font-medium text-emerald-400">
              Discovery successful
              {discoveredEndpoints.issuer && (
                <> &mdash; Issuer: {discoveredEndpoints.issuer}</>
              )}
            </span>
          </div>
          <div className="space-y-1 text-xs text-gray-400">
            <div>
              <span className="text-gray-500">Authorization:</span>{' '}
              <code className="text-emerald-300/70">
                {discoveredEndpoints.authorization_endpoint}
              </code>
            </div>
            <div>
              <span className="text-gray-500">Token:</span>{' '}
              <code className="text-emerald-300/70">{discoveredEndpoints.token_endpoint}</code>
            </div>
            {discoveredEndpoints.userinfo_endpoint && (
              <div>
                <span className="text-gray-500">Userinfo:</span>{' '}
                <code className="text-emerald-300/70">
                  {discoveredEndpoints.userinfo_endpoint}
                </code>
              </div>
            )}
          </div>
        </div>
      )}

      {discoveryStatus === 'error' && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          <span className="font-medium">Discovery failed:</span> {discoveryError}
        </div>
      )}

      {/* Provider name + Scopes */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Provider Name"
          value={config.oidcProviderName}
          onChange={(v) => update({ oidcProviderName: v })}
          placeholder="Google, Okta, Auth0..."
          hint="Display name shown on the login page"
        />
        <Field
          label="Scopes"
          value={config.oidcScopes}
          onChange={(v) => update({ oidcScopes: v })}
          placeholder="openid email profile"
          hint="Space-separated list of OIDC scopes"
        />
      </div>

      {/* Client ID + Secret */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Client ID"
          value={config.oidcClientId}
          onChange={(v) => update({ oidcClientId: v })}
          placeholder="your-client-id"
        />
        <Field
          label="Client Secret"
          type="password"
          value={config.oidcClientSecret}
          onChange={(v) => update({ oidcClientSecret: v })}
          placeholder={config.hasOidcSecret ? '(unchanged)' : 'your-client-secret'}
          hint={
            config.hasOidcSecret
              ? 'A secret is already configured — leave blank to keep it'
              : undefined
          }
        />
      </div>

      {/* Console link */}
      {provider.consoleUrl && (
        <p className="text-xs text-gray-500">
          Get your credentials from{' '}
          <a
            href={provider.consoleUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-400 underline hover:text-indigo-300"
          >
            {provider.label} developer console
          </a>
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
  const localBase = `http://localhost:${config.serverPort}`
  const publicBase = config.publicUrl.trim().replace(/\/+$/, '')
  const hasPublicUrl = !!publicBase

  return (
    <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/[0.04] p-6">
      <div className="flex items-start gap-3">
        <svg
          className="mt-0.5 h-5 w-5 shrink-0 text-indigo-400"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
          />
        </svg>
        <div className="flex-1 space-y-3">
          <p className="text-sm font-medium text-indigo-300">
            Configure your OAuth provider with these URLs
          </p>
          <p className="text-xs text-gray-400">
            Add the following values in your provider&apos;s console. The redirect URI must match
            exactly.
          </p>

          {/* Primary URLs — public if available, otherwise local */}
          <div className="space-y-2">
            <CopyableUrl
              label={hasPublicUrl ? 'Redirect URI (public)' : 'Authorized redirect URI'}
              value={`${hasPublicUrl ? publicBase : localBase}/auth/callback`}
            />
            <CopyableUrl
              label={hasPublicUrl ? 'JavaScript origin (public)' : 'Authorized JavaScript origin'}
              value={hasPublicUrl ? publicBase : localBase}
            />
          </div>

          {/* Additional local URLs when a public URL is configured */}
          {hasPublicUrl && (
            <div className="space-y-2 border-t border-white/[0.06] pt-3">
              <p className="text-xs text-gray-500">
                For local development, also add these URLs:
              </p>
              <CopyableUrl
                label="Redirect URI (local)"
                value={`${localBase}/auth/callback`}
              />
              <CopyableUrl label="JavaScript origin (local)" value={localBase} />
            </div>
          )}

          {/* Provider-specific help */}
          {config.oidcProvider === 'google' && (
            <p className="text-xs text-gray-500">
              For Google: Go to{' '}
              <a
                href="https://console.cloud.google.com/apis/credentials"
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-400 underline hover:text-indigo-300"
              >
                console.cloud.google.com/apis/credentials
              </a>{' '}
              → edit your OAuth 2.0 Client ID → paste these URLs.
            </p>
          )}
          {config.oidcProvider === 'microsoft' && (
            <p className="text-xs text-gray-500">
              For Microsoft: Go to{' '}
              <a
                href="https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps"
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-400 underline hover:text-indigo-300"
              >
                Azure Portal → App registrations
              </a>{' '}
              → select your app → Authentication → add the redirect URI.
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
  const emails = config.allowedEmails
    .split('\n')
    .map((e) => e.trim())
    .filter(Boolean)
  const domain = config.allowedEmailDomain.trim()

  // Build dynamic summary
  const summaryParts: string[] = []
  if (emails.length > 0) {
    summaryParts.push(`${emails.length} user${emails.length > 1 ? 's' : ''} whitelisted`)
  }
  if (domain) {
    summaryParts.push(`all @${domain} emails`)
  }
  const summary = summaryParts.length > 0 ? summaryParts.join(' + ') : null

  return (
    <div className="space-y-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-6">
      {/* Header with shield icon */}
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-gray-400">
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
            />
          </svg>
        </div>
        <div>
          <h3 className="text-sm font-medium text-gray-300">Who can access your instance?</h3>
          <p className="mt-1 text-xs text-gray-500">
            By default anyone who authenticates can access the app. Restrict access by domain or
            individual email.
          </p>
        </div>
      </div>

      {/* Domain field with dynamic preview */}
      <div>
        <Field
          label="Allowed email domain"
          value={config.allowedEmailDomain}
          onChange={(v) => update({ allowedEmailDomain: v })}
          placeholder="example.com"
        />
        {domain && (
          <p className="mt-1.5 text-xs text-indigo-400/80">
            Only <span className="font-medium">@{domain}</span> emails will be allowed to sign in.
          </p>
        )}
      </div>

      {/* OR logic explanation */}
      {domain && (
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-white/[0.06]" />
          <span className="text-[10px] font-medium uppercase tracking-widest text-gray-600">or</span>
          <div className="h-px flex-1 bg-white/[0.06]" />
        </div>
      )}

      {/* Email chips input */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-gray-400">
          Individual emails
        </label>
        <EmailChipsInput
          emails={emails}
          onChange={(newEmails) => update({ allowedEmails: newEmails.join('\n') })}
        />
        {domain && emails.length > 0 && (
          <p className="mt-1.5 text-xs text-gray-600">
            A user is allowed if their email matches the domain <span className="font-medium text-gray-500">or</span> is in the list above.
          </p>
        )}
      </div>

      {/* Dynamic summary */}
      <div
        className={`rounded-lg px-3 py-2 text-xs ${
          summary
            ? 'border border-indigo-500/20 bg-indigo-500/[0.04] text-indigo-300'
            : 'border border-white/[0.04] bg-white/[0.01] text-gray-600'
        }`}
      >
        {summary ? (
          <span className="flex items-center gap-1.5">
            <svg
              className="h-3.5 w-3.5 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
              />
            </svg>
            Access restricted: {summary}
          </span>
        ) : (
          'No restrictions — all authenticated users have access'
        )}
      </div>
    </div>
  )
}

// ============================================================================
// Email Chips Input
// ============================================================================

function EmailChipsInput({
  emails,
  onChange,
}: {
  emails: string[]
  onChange: (emails: string[]) => void
}) {
  const [inputValue, setInputValue] = useState('')
  const [error, setError] = useState('')

  const addEmail = (raw: string) => {
    const email = raw.trim().toLowerCase()
    if (!email) return

    // Basic email validation
    if (!email.includes('@') || !email.includes('.')) {
      setError('Invalid email address')
      return
    }

    // Duplicate check
    if (emails.includes(email)) {
      setError('Email already added')
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
      <div className="min-h-[42px] rounded-lg border border-white/[0.1] bg-white/[0.04] px-2 py-1.5 transition focus-within:border-indigo-500/50 focus-within:ring-1 focus-within:ring-indigo-500/30">
        <div className="flex flex-wrap gap-1.5">
          {emails.map((email, i) => (
            <span
              key={email}
              className="flex items-center gap-1 rounded-md bg-white/[0.08] px-2 py-0.5 text-xs text-gray-300"
            >
              {email}
              <button
                type="button"
                onClick={() => removeEmail(i)}
                className="ml-0.5 rounded p-0.5 text-gray-500 transition hover:bg-white/[0.1] hover:text-gray-300"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
          <input
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
            placeholder={emails.length === 0 ? 'alice@gmail.com, bob@company.org...' : 'Add email...'}
            className="min-w-[120px] flex-1 border-none bg-transparent px-1 py-0.5 text-sm text-white placeholder-gray-600 outline-none"
          />
        </div>
      </div>
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
      {!error && (
        <p className="mt-1 text-xs text-gray-600">
          Type an email and press Enter. Paste a comma or newline-separated list to add multiple.
        </p>
      )}
    </div>
  )
}

// ============================================================================
// Sub-components
// ============================================================================

function CopyableUrl({ label, value }: { label: string; value: string }) {
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
      <div className="mb-1 text-xs font-medium text-gray-400">{label}</div>
      <div className="flex items-center gap-2">
        <code className="flex-1 break-all text-xs text-indigo-300">{value}</code>
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 rounded-md p-1.5 text-gray-500 transition hover:bg-white/[0.06] hover:text-gray-300"
          title="Copy to clipboard"
        >
          {copied ? (
            <svg
              className="h-3.5 w-3.5 text-emerald-400"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          ) : (
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184"
              />
            </svg>
          )}
        </button>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  className,
  hint,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  className?: string
  hint?: string
}) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-xs font-medium text-gray-400">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-sm text-white placeholder-gray-600 transition focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
      />
      {hint && <p className="mt-1 text-xs text-gray-600">{hint}</p>}
    </div>
  )
}
