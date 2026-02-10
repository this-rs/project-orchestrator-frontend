import { useAtom } from 'jotai'
import { setupConfigAtom, type AuthMode } from '@/atoms/setup'

export function AuthPage() {
  const [config, setConfig] = useAtom(setupConfigAtom)

  const update = (patch: Partial<typeof config>) =>
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
      description: 'Use Google, GitHub, or any OpenID Connect provider.',
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
            <svg className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <div className="text-sm text-gray-300">
              <p className="font-medium text-amber-400">Security notice</p>
              <p className="mt-1">
                Without authentication, anyone with network access to this server can view and modify all data.
                Only use this mode for local development.
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

      {/* OIDC config */}
      {config.authMode === 'oidc' && (
        <div className="space-y-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-6">
          <h3 className="text-sm font-medium text-gray-300">OIDC Provider</h3>
          <Field
            label="Discovery URL"
            value={config.oidcDiscoveryUrl}
            onChange={(v) => update({ oidcDiscoveryUrl: v })}
            placeholder="https://accounts.google.com/.well-known/openid-configuration"
          />
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
              placeholder="your-client-secret"
            />
          </div>
          <p className="text-xs text-gray-500">
            The redirect URI will be automatically set to{' '}
            <code className="rounded bg-white/[0.06] px-1 py-0.5 text-indigo-400">
              http://localhost:{config.serverPort}/auth/callback
            </code>
          </p>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Field component (shared with InfrastructurePage but inlined to keep simple)
// ============================================================================

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  className,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  className?: string
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
    </div>
  )
}
