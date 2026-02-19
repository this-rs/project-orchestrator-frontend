import { useAtom } from 'jotai'
import { useCallback, useState } from 'react'
import { AlertTriangle, Key, Settings, Loader2, CheckCircle2, Info, ShieldCheck, X, Check, Clipboard } from 'lucide-react'
import {
  setupConfigAtom,
  OIDC_PROVIDERS,
  type AuthMode,
  type OidcProvider,
  type SetupConfig,
} from '@/atoms/setup'
import { isTauri } from '@/services/env'
import { ExternalLink } from '@/components/ui/ExternalLink'

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
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
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
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  ),
  microsoft: (
    /* Brand logo — keep as SVG */
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
      <rect x="1" y="1" width="10" height="10" />
      <rect x="13" y="1" width="10" height="10" />
      <rect x="1" y="13" width="10" height="10" />
      <rect x="13" y="13" width="10" height="10" />
    </svg>
  ),
  okta: (
    /* Brand logo — keep as SVG */
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="12" r="10" fillOpacity="0.3" />
      <circle cx="12" cy="12" r="5" />
    </svg>
  ),
  auth0: (
    /* Brand logo — keep as SVG */
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.2 2H6.8L2 12l4.8 10h10.4L22 12 17.2 2zM12 16a4 4 0 110-8 4 4 0 010 8z" />
    </svg>
  ),
  keycloak: (
    <Key className="h-5 w-5" />
  ),
  custom: (
    <Settings className="h-5 w-5" />
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
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Verifying...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" />
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
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
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
          <ExternalLink
            href={provider.consoleUrl}
            className="text-indigo-400 underline hover:text-indigo-300"
          >
            {provider.label} developer console
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
  const localBase = `http://localhost:${config.serverPort}`
  const publicBase = config.publicUrl.trim().replace(/\/+$/, '')
  const hasPublicUrl = !!publicBase

  return (
    <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/[0.04] p-6">
      <div className="flex items-start gap-3">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-indigo-400" />
        <div className="flex-1 space-y-3">
          <p className="text-sm font-medium text-indigo-300">
            Configure your OAuth provider with these URLs
          </p>
          <p className="text-xs text-gray-400">
            Add the following values in your provider&apos;s console. The redirect URI must match
            exactly.
          </p>

          {/* When both public + local: show both as required */}
          {hasPublicUrl ? (
            <>
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.04] px-3 py-2">
                <p className="text-xs text-amber-300">
                  Register <strong>BOTH</strong> redirect URIs below to support desktop + web access.
                </p>
              </div>
              <div className="space-y-2">
                <CopyableUrl
                  label="Redirect URI (web)"
                  value={`${publicBase}/auth/callback`}
                />
                <CopyableUrl
                  label="Redirect URI (desktop)"
                  value={`${localBase}/auth/callback`}
                />
              </div>
              <div className="space-y-2 border-t border-white/[0.06] pt-3">
                <p className="text-xs text-gray-500">
                  Authorized JavaScript origins:
                </p>
                <CopyableUrl label="JavaScript origin (web)" value={publicBase} />
                <CopyableUrl label="JavaScript origin (desktop)" value={localBase} />
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <CopyableUrl
                label="Authorized redirect URI"
                value={`${localBase}/auth/callback`}
              />
              <CopyableUrl
                label="Authorized JavaScript origin"
                value={localBase}
              />
            </div>
          )}

          {/* Provider-specific help */}
          {config.oidcProvider === 'google' && (
            <p className="text-xs text-gray-500">
              For Google: Go to{' '}
              <ExternalLink
                href="https://console.cloud.google.com/apis/credentials"
                className="text-indigo-400 underline hover:text-indigo-300"
              >
                console.cloud.google.com/apis/credentials
              </ExternalLink>{' '}
              → edit your OAuth 2.0 Client ID → paste these URLs.
            </p>
          )}
          {config.oidcProvider === 'microsoft' && (
            <p className="text-xs text-gray-500">
              For Microsoft: Go to{' '}
              <ExternalLink
                href="https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps"
                className="text-indigo-400 underline hover:text-indigo-300"
              >
                Azure Portal → App registrations
              </ExternalLink>{' '}
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
          <ShieldCheck className="h-5 w-5" />
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
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
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
                <X className="h-3 w-3" />
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
            <Check className="h-3.5 w-3.5 text-emerald-400" />
          ) : (
            <Clipboard className="h-3.5 w-3.5" />
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
