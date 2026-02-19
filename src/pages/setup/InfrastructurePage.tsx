import { useState } from 'react'
import { useAtom } from 'jotai'
import { Package, Link as LinkIcon, Info, Globe, Loader2, Wifi, Check, X } from 'lucide-react'
import { setupConfigAtom } from '@/atoms/setup'
import { isTauri } from '@/services/env'

export function InfrastructurePage() {
  const [config, setConfig] = useAtom(setupConfigAtom)

  const update = (patch: Partial<typeof config>) =>
    setConfig((prev) => ({ ...prev, ...patch }))

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold">Infrastructure</h2>
        <p className="mt-1 text-sm text-gray-400">
          Choose how to run the required services (Neo4j, MeiliSearch &amp; NATS).
        </p>
      </div>

      {/* Mode selection */}
      <div className="grid gap-4 sm:grid-cols-2">
        <ModeCard
          active={config.infraMode === 'docker'}
          onClick={() => update({ infraMode: 'docker' })}
          title="Docker (recommended)"
          description="Automatically start Neo4j, MeiliSearch, and NATS in Docker containers. Requires Docker Desktop."
          icon={<Package className="h-6 w-6" />}
        />
        <ModeCard
          active={config.infraMode === 'external'}
          onClick={() => update({ infraMode: 'external' })}
          title="External servers"
          description="Connect to existing Neo4j, MeiliSearch, and NATS instances running elsewhere."
          icon={<LinkIcon className="h-6 w-6" />}
        />
      </div>

      {/* External servers config */}
      {config.infraMode === 'external' && (
        <div className="space-y-6 rounded-xl border border-white/[0.06] bg-white/[0.02] p-6">
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-300">Neo4j Connection</h3>
              <TestConnectionButton service="neo4j" url={config.neo4jUri} />
            </div>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Field
                label="URI"
                value={config.neo4jUri}
                onChange={(v) => update({ neo4jUri: v })}
                placeholder="bolt://localhost:7687"
              />
              <Field
                label="User"
                value={config.neo4jUser}
                onChange={(v) => update({ neo4jUser: v })}
                placeholder="neo4j"
              />
              <Field
                label="Password"
                type="password"
                value={config.neo4jPassword}
                onChange={(v) => update({ neo4jPassword: v })}
                placeholder={config.hasNeo4jPassword ? '(unchanged)' : 'Enter password'}
                hint={config.hasNeo4jPassword ? 'A password is already configured — leave blank to keep it' : undefined}
                className="sm:col-span-2"
              />
            </div>
          </div>

          <div className="border-t border-white/[0.06] pt-6">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-300">MeiliSearch Connection</h3>
              <TestConnectionButton service="meilisearch" url={config.meilisearchUrl} />
            </div>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Field
                label="URL"
                value={config.meilisearchUrl}
                onChange={(v) => update({ meilisearchUrl: v })}
                placeholder="http://localhost:7700"
              />
              <Field
                label="API Key"
                type="password"
                value={config.meilisearchKey}
                onChange={(v) => update({ meilisearchKey: v })}
                placeholder={config.hasMeilisearchKey ? '(unchanged)' : 'Master key'}
                hint={config.hasMeilisearchKey ? 'A key is already configured — leave blank to keep it' : undefined}
              />
            </div>
          </div>

          {/* NATS connection — only shown when NATS is enabled in external mode */}
          {config.natsEnabled && (
            <div className="border-t border-white/[0.06] pt-6">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-300">NATS Connection</h3>
                <TestConnectionButton service="nats" url={config.natsUrl || 'nats://localhost:4222'} />
              </div>
              <div className="mt-3">
                <Field
                  label="URL"
                  value={config.natsUrl}
                  onChange={(v) => update({ natsUrl: v })}
                  placeholder="nats://localhost:4222"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Docker info — dynamic based on NATS toggle */}
      {config.infraMode === 'docker' && (
        <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-5">
          <div className="flex gap-3">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-indigo-400" />
            <div className="text-sm text-gray-300">
              <p className="font-medium text-indigo-400">Docker mode</p>
              <p className="mt-1">
                {config.natsEnabled
                  ? 'Neo4j, MeiliSearch, and NATS will be started automatically as Docker containers.'
                  : 'Neo4j and MeiliSearch will be started automatically as Docker containers.'}
                {' '}Make sure Docker Desktop is running on your machine.
              </p>
              <p className="mt-2 text-gray-500">
                Ports: Neo4j (7474, 7687) &middot; MeiliSearch (7700)
                {config.natsEnabled && <> &middot; NATS (4222)</>}
                {' '}&middot; API ({config.serverPort})
              </p>
            </div>
          </div>
        </div>
      )}

      {/* NATS toggle — visible in both modes */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={config.natsEnabled}
            onChange={(e) => update({ natsEnabled: e.target.checked })}
            className="mt-0.5 h-4 w-4 rounded border-white/20 bg-white/[0.04] text-indigo-600 focus:ring-indigo-500/30 focus:ring-offset-0 accent-indigo-600"
          />
          <div>
            <span className="text-sm font-medium text-gray-300">
              Enable real-time events (NATS)
            </span>
            <p className="mt-1 text-xs text-gray-500">
              Enables live updates via NATS pub/sub. Required for multi-instance deployments
              and real-time synchronization between the desktop app, web UI, and MCP server.
            </p>
            {!config.natsEnabled && (
              <p className="mt-1.5 text-xs text-amber-400/70">
                Without NATS, events are only broadcast in-process. Changes made in one instance
                won&apos;t appear in others until refresh.
              </p>
            )}
          </div>
        </label>
      </div>

      {/* Server port */}
      <div>
        <Field
          label="API Server Port"
          type="number"
          value={String(config.serverPort)}
          onChange={(v) => update({ serverPort: parseInt(v) || 6600 })}
          placeholder="6600"
          className="max-w-[200px]"
        />
        <p className="mt-1.5 text-xs text-gray-500">
          Port for the backend API server.
        </p>
      </div>

      {/* Serve frontend on API port */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={config.serveFrontend}
            onChange={(e) => update({ serveFrontend: e.target.checked })}
            className="mt-0.5 h-4 w-4 rounded border-white/20 bg-white/[0.04] text-indigo-600 focus:ring-indigo-500/30 focus:ring-offset-0 accent-indigo-600"
          />
          <div>
            <span className="text-sm font-medium text-gray-300">
              Serve frontend on API port
            </span>
            <p className="mt-1 text-xs text-gray-500">
              Enable to access the web UI at{' '}
              <code className="rounded bg-white/[0.06] px-1 py-0.5 text-gray-400">
                http://localhost:{config.serverPort}
              </code>{' '}
              from any browser. Useful for accessing the app from other devices on the same
              network.
            </p>
          </div>
        </label>
      </div>

      {/* Public URL (optional) — only when serving frontend */}
      {config.serveFrontend && (
        <div>
          <Field
            label="Public URL (optional)"
            value={config.publicUrl}
            onChange={(v) => update({ publicUrl: v })}
            placeholder="https://myapp.example.com"
            hint="If you use a reverse proxy (e.g. Cloudflare Tunnel, ngrok, ffs.dev), enter the public URL here. Used for OAuth callbacks and CORS."
          />
          {config.publicUrl.trim() && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-indigo-500/20 bg-indigo-500/[0.06] px-4 py-2.5">
              <Globe className="h-4 w-4 shrink-0 text-indigo-400" />
              <span className="text-xs text-indigo-300">
                Local:{' '}
                <code className="rounded bg-white/[0.06] px-1 py-0.5 text-gray-400">
                  http://localhost:{config.serverPort}
                </code>
                {' '}&middot; Public:{' '}
                <code className="rounded bg-white/[0.06] px-1 py-0.5 text-gray-400">
                  {config.publicUrl.trim().replace(/\/+$/, '')}
                </code>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Reusable sub-components
// ============================================================================

function ModeCard({
  active,
  onClick,
  title,
  description,
  icon,
}: {
  active: boolean
  onClick: () => void
  title: string
  description: string
  icon: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-start gap-3 rounded-xl border p-5 text-left transition ${
        active
          ? 'border-indigo-500/50 bg-indigo-500/10'
          : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.04]'
      }`}
    >
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-lg ${
          active ? 'bg-indigo-600 text-white' : 'bg-white/[0.06] text-gray-400'
        }`}
      >
        {icon}
      </div>
      <div>
        <div className={`text-sm font-medium ${active ? 'text-white' : 'text-gray-300'}`}>
          {title}
        </div>
        <div className="mt-1 text-xs text-gray-500">{description}</div>
      </div>
    </button>
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

/** Test Connection button — calls `test_connection` Tauri command and shows result. */
function TestConnectionButton({ service, url }: { service: string; url: string }) {
  const [status, setStatus] = useState<'idle' | 'testing' | 'success' | 'failure'>('idle')

  const handleTest = async () => {
    if (!isTauri || !url.trim()) return
    setStatus('testing')
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const ok = await invoke<boolean>('test_connection', { service, url })
      setStatus(ok ? 'success' : 'failure')
    } catch {
      setStatus('failure')
    }
    // Auto-reset after 4 seconds
    setTimeout(() => setStatus('idle'), 4000)
  }

  if (!isTauri) return null

  return (
    <button
      type="button"
      onClick={handleTest}
      disabled={status === 'testing'}
      className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition hover:bg-white/[0.06] disabled:opacity-50"
      title={`Test ${service} connection`}
    >
      {status === 'testing' && (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
          <span className="text-gray-400">Testing...</span>
        </>
      )}
      {status === 'idle' && (
        <>
          <Wifi className="h-3.5 w-3.5 text-gray-500" />
          <span className="text-gray-500">Test</span>
        </>
      )}
      {status === 'success' && (
        <>
          <Check className="h-3.5 w-3.5 text-emerald-400" />
          <span className="text-emerald-400">Connected</span>
        </>
      )}
      {status === 'failure' && (
        <>
          <X className="h-3.5 w-3.5 text-red-400" />
          <span className="text-red-400">Failed</span>
        </>
      )}
    </button>
  )
}
