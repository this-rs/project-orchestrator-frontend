import { useState, useEffect, useCallback, useRef } from 'react'
import { useAtom, useSetAtom, useAtomValue } from 'jotai'
import { Package, Link as LinkIcon, Info, Globe, Loader2, Wifi, Check, X, AlertTriangle, Download, Play } from 'lucide-react'
import { setupConfigAtom, infraValidAtom, trayNavigationAtom } from '@/atoms/setup'
import { isTauri } from '@/services/env'

type DockerStatus = 'unknown' | 'not_installed' | 'installed' | 'running'

/** Connection test result: null = not tested, true = success, false = failure */
type ConnectionTestMap = {
  neo4j: boolean | null
  meilisearch: boolean | null
  nats: boolean | null
}

export function InfrastructurePage() {
  const [config, setConfig] = useAtom(setupConfigAtom)
  const setInfraValid = useSetAtom(infraValidAtom)
  const isTrayNavigation = useAtomValue(trayNavigationAtom)

  // ── Docker state (docker mode only) ────────────────────────────────
  const [dockerStatus, setDockerStatus] = useState<DockerStatus>('unknown')
  const [dockerChecking, setDockerChecking] = useState(false)

  // ── Connection test state (external mode only) ─────────────────────
  const [connectionTested, setConnectionTested] = useState<ConnectionTestMap>({
    neo4j: null,
    meilisearch: null,
    nats: null,
  })

  const update = (patch: Partial<typeof config>) =>
    setConfig((prev) => ({ ...prev, ...patch }))

  // ── Docker auto-detection at mount ─────────────────────────────────
  const checkDocker = useCallback(async () => {
    if (!isTauri) return
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const result = await invoke<{ available: boolean; status: string }>('check_docker')
      if (result.status === 'running') {
        setDockerStatus('running')
      } else if (result.available || result.status === 'installed') {
        setDockerStatus('installed')
      } else {
        setDockerStatus('not_installed')
      }
    } catch {
      setDockerStatus('not_installed')
    }
  }, [])

  useEffect(() => {
    if (config.infraMode !== 'docker' || !isTauri) return
    setDockerChecking(true)
    checkDocker().finally(() => setDockerChecking(false))
  }, [config.infraMode, checkDocker])

  // ── Docker polling ─────────────────────────────────────────────────
  useEffect(() => {
    if (config.infraMode !== 'docker' || !isTauri) return
    if (dockerStatus === 'running') return // no need to poll

    const interval = dockerStatus === 'not_installed' ? 5000 : 3000
    const timer = setInterval(() => {
      checkDocker()
    }, interval)

    return () => clearInterval(timer)
  }, [config.infraMode, dockerStatus, checkDocker])

  // ── Open Docker Desktop ────────────────────────────────────────────
  const handleOpenDocker = async () => {
    if (!isTauri) return
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('open_docker_desktop')
    } catch (e) {
      console.warn('Failed to open Docker Desktop:', e)
    }
  }

  // ── Install Docker — open download page ────────────────────────────
  const handleInstallDocker = async () => {
    if (!isTauri) return
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const platform = navigator.platform?.toLowerCase() || ''
      let url = 'https://www.docker.com/products/docker-desktop/'
      if (platform.includes('mac')) {
        url = 'https://docs.docker.com/desktop/setup/install/mac-install/'
      } else if (platform.includes('win')) {
        url = 'https://docs.docker.com/desktop/setup/install/windows-install/'
      } else if (platform.includes('linux')) {
        url = 'https://docs.docker.com/desktop/setup/install/linux/'
      }
      await invoke('open_url', { url })
    } catch (e) {
      console.warn('Failed to open Docker install URL:', e)
    }
  }

  // ── Connection test callback (external mode) ───────────────────────
  const handleConnectionTestResult = useCallback((service: keyof ConnectionTestMap, success: boolean) => {
    setConnectionTested((prev) => ({ ...prev, [service]: success }))
  }, [])

  // ── Reset connection test when URL/credentials change ──────────────
  const prevNeo4jRef = useRef(config.neo4jUri + config.neo4jUser + config.neo4jPassword)
  const prevMeiliRef = useRef(config.meilisearchUrl + config.meilisearchKey)
  const prevNatsRef = useRef(config.natsUrl)

  useEffect(() => {
    const key = config.neo4jUri + config.neo4jUser + config.neo4jPassword
    if (key !== prevNeo4jRef.current) {
      prevNeo4jRef.current = key
      setConnectionTested((prev) => ({ ...prev, neo4j: null }))
    }
  }, [config.neo4jUri, config.neo4jUser, config.neo4jPassword])

  useEffect(() => {
    const key = config.meilisearchUrl + config.meilisearchKey
    if (key !== prevMeiliRef.current) {
      prevMeiliRef.current = key
      setConnectionTested((prev) => ({ ...prev, meilisearch: null }))
    }
  }, [config.meilisearchUrl, config.meilisearchKey])

  useEffect(() => {
    if (config.natsUrl !== prevNatsRef.current) {
      prevNatsRef.current = config.natsUrl
      setConnectionTested((prev) => ({ ...prev, nats: null }))
    }
  }, [config.natsUrl])

  // ── Compute & propagate infraValid ─────────────────────────────────
  useEffect(() => {
    // In tray mode, we don't enforce blocking — the atom stays true
    if (isTrayNavigation) {
      setInfraValid(true)
      return
    }

    // In browser (non-Tauri) mode, skip Docker/connection checks
    if (!isTauri) {
      setInfraValid(true)
      return
    }

    if (config.infraMode === 'docker') {
      setInfraValid(dockerStatus === 'running')
    } else {
      // External mode: neo4j + meilisearch + nats must all pass
      const neo4jOk = connectionTested.neo4j === true
      const meiliOk = connectionTested.meilisearch === true
      const natsOk = connectionTested.nats === true
      setInfraValid(neo4jOk && meiliOk && natsOk)
    }
  }, [config.infraMode, dockerStatus, connectionTested, isTrayNavigation, setInfraValid])

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
              <TestConnectionButton service="neo4j" url={config.neo4jUri} tested={connectionTested.neo4j} onResult={(ok) => handleConnectionTestResult('neo4j', ok)} />
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
              <TestConnectionButton service="meilisearch" url={config.meilisearchUrl} tested={connectionTested.meilisearch} onResult={(ok) => handleConnectionTestResult('meilisearch', ok)} />
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

          {/* NATS connection */}
          <div className="border-t border-white/[0.06] pt-6">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-300">NATS Connection</h3>
              <TestConnectionButton service="nats" url={config.natsUrl || 'nats://localhost:4222'} tested={connectionTested.nats} onResult={(ok) => handleConnectionTestResult('nats', ok)} />
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
        </div>
      )}

      {/* Docker status banner + info */}
      {config.infraMode === 'docker' && (
        <div className="space-y-4">
          {/* Docker status banner — only in Tauri */}
          {isTauri && (
            <DockerBanner
              status={dockerStatus}
              checking={dockerChecking}
              onInstall={handleInstallDocker}
              onOpen={handleOpenDocker}
            />
          )}

          {/* Docker info */}
          <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-5">
            <div className="flex gap-3">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-indigo-400" />
              <div className="text-sm text-gray-300">
                <p className="font-medium text-indigo-400">Docker mode</p>
                <p className="mt-1">
                  Neo4j, MeiliSearch, and NATS will be started automatically as Docker containers.
                  {' '}Make sure Docker Desktop is running on your machine.
                </p>
                <p className="mt-2 text-gray-500">
                  Ports: Neo4j (7474, 7687) &middot; MeiliSearch (7700) &middot; NATS (4222)
                  {' '}&middot; API ({config.serverPort})
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

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

// ============================================================================
// Docker status banner
// ============================================================================

function DockerBanner({
  status,
  checking,
  onInstall,
  onOpen,
}: {
  status: DockerStatus
  checking: boolean
  onInstall: () => void
  onOpen: () => void
}) {
  if (checking || status === 'unknown') {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        <span className="text-sm text-gray-400">Detecting Docker Desktop...</span>
      </div>
    )
  }

  if (status === 'not_installed') {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/[0.08] p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-400">Docker Desktop is required</p>
            <p className="mt-1 text-xs text-gray-400">
              Docker Desktop must be installed to run the required services.
              Install it, then come back — it will be detected automatically.
            </p>
            <button
              onClick={onInstall}
              className="mt-3 flex items-center gap-2 rounded-lg bg-red-500/20 px-4 py-2 text-sm font-medium text-red-300 transition hover:bg-red-500/30"
            >
              <Download className="h-4 w-4" />
              Install Docker Desktop
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (status === 'installed') {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.08] p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-400">Docker Desktop is not running</p>
            <p className="mt-1 text-xs text-gray-400">
              Docker Desktop is installed but not started. Start it to continue —
              it will be detected automatically.
            </p>
            <button
              onClick={onOpen}
              className="mt-3 flex items-center gap-2 rounded-lg bg-amber-500/20 px-4 py-2 text-sm font-medium text-amber-300 transition hover:bg-amber-500/30"
            >
              <Play className="h-4 w-4" />
              Open Docker Desktop
            </button>
          </div>
        </div>
      </div>
    )
  }

  // running
  return (
    <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.08] p-4">
      <Check className="h-5 w-5 text-emerald-400" />
      <span className="text-sm font-medium text-emerald-400">Docker Desktop is running</span>
    </div>
  )
}

// ============================================================================
// Test Connection button — persistent badges, callback on result
// ============================================================================

/**
 * Test Connection button with persistent badge.
 * The `tested` prop reflects the external state (null=not tested, true=ok, false=fail).
 * The `onResult` callback is called with the test outcome.
 * Badges persist until the parent resets `tested` (e.g. when URL changes).
 */
function TestConnectionButton({
  service,
  url,
  tested,
  onResult,
}: {
  service: string
  url: string
  tested: boolean | null
  onResult: (success: boolean) => void
}) {
  const [testing, setTesting] = useState(false)

  const handleTest = async () => {
    if (!isTauri || !url.trim()) return
    setTesting(true)
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const ok = await invoke<boolean>('test_connection', { service, url })
      onResult(ok)
    } catch {
      onResult(false)
    } finally {
      setTesting(false)
    }
  }

  if (!isTauri) return null

  return (
    <div className="flex items-center gap-2">
      {/* Persistent badge */}
      {tested === true && (
        <span className="flex items-center gap-1 text-xs font-medium text-emerald-400">
          <Check className="h-3.5 w-3.5" />
          Connected
        </span>
      )}
      {tested === false && (
        <span className="flex items-center gap-1 text-xs font-medium text-red-400">
          <X className="h-3.5 w-3.5" />
          Failed
        </span>
      )}
      {/* Test button */}
      <button
        type="button"
        onClick={handleTest}
        disabled={testing}
        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition hover:bg-white/[0.06] disabled:opacity-50"
        title={`Test ${service} connection`}
      >
        {testing ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
            <span className="text-gray-400">Testing...</span>
          </>
        ) : (
          <>
            <Wifi className="h-3.5 w-3.5 text-gray-500" />
            <span className="text-gray-500">{tested !== null ? 'Re-test' : 'Test'}</span>
          </>
        )}
      </button>
    </div>
  )
}
