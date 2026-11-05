import { useState, useEffect, useCallback, useRef } from 'react'
import { useAtom, useSetAtom, useAtomValue } from 'jotai'
import { Package, Link as LinkIcon, Info, Globe, Loader2, Wifi, Check, X, Download, Play } from 'lucide-react'
import { setupConfigAtom, infraValidAtom, trayNavigationAtom } from '@/atoms/setup'
import { isTauri } from '@/services/env'
import { useT } from '@/i18n'
import { Button, Switch, surface } from '@/components/ui'
import { Field } from './Field'
import { StatusBanner } from './StatusBanner'

type DockerStatus = 'unknown' | 'not_installed' | 'installed' | 'unresponsive' | 'running' | 'check_failed'

/** Connection test result: null = not tested, true = success, false = failure */
type ConnectionTestMap = {
  neo4j: boolean | null
  meilisearch: boolean | null
  nats: boolean | null
}

/** Why a test failed, or how far it could check (from the desktop's `test_connection_detailed`). */
type ConnectionDetail = { hint: string | null; verifiedBy: string | null }
type ConnectionDetailMap = Partial<Record<keyof ConnectionTestMap, ConnectionDetail | null>>

export function InfrastructurePage() {
  const { t } = useT()
  const [config, setConfig] = useAtom(setupConfigAtom)
  const setInfraValid = useSetAtom(infraValidAtom)
  const isTrayNavigation = useAtomValue(trayNavigationAtom)

  // ── Docker state (docker mode only) ────────────────────────────────
  const [dockerStatus, setDockerStatus] = useState<DockerStatus>('unknown')
  /** Why the last Docker check failed (only with `check_failed`). */
  const [dockerError, setDockerError] = useState<string | null>(null)
  const [dockerChecking, setDockerChecking] = useState(false)
  /** Docker's API does not answer but every configured service does: the containers run on. */
  const [dockerServicesUp, setDockerServicesUp] = useState(false)

  // ── Connection test state (external mode only) ─────────────────────
  const [connectionTested, setConnectionTested] = useState<ConnectionTestMap>({
    neo4j: null,
    meilisearch: null,
    nats: null,
  })

  const [connectionDetail, setConnectionDetail] = useState<ConnectionDetailMap>({})

  const update = (patch: Partial<typeof config>) =>
    setConfig((prev) => ({ ...prev, ...patch }))

  // ── Docker auto-detection at mount ─────────────────────────────────
  const checkDocker = useCallback(async () => {
    if (!isTauri) return
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const result = await invoke<{ available: boolean; status: string; servicesReachable?: boolean }>('check_docker')
      setDockerError(null)
      // Only ever meaningful with `unresponsive`: the desktop asked Neo4j, Meilisearch and NATS
      // themselves (each with its own protocol) because the Docker socket did not answer.
      setDockerServicesUp(result.status === 'unresponsive' && result.servicesReachable === true)
      if (result.status === 'running') {
        setDockerStatus('running')
      } else if (result.status === 'unresponsive') {
        // A runtime holds the socket and takes connections but never answers (Docker Desktop
        // frozen, or still booting): "open it" would change nothing.
        setDockerStatus('unresponsive')
      } else if (result.available || result.status === 'installed') {
        setDockerStatus('installed')
      } else {
        setDockerStatus('not_installed')
      }
    } catch (e) {
      // A check that FAILS says nothing about whether Docker is there: reporting "not installed"
      // sent people who have Docker to install it. Say it failed, and why.
      console.warn('check_docker failed:', e)
      setDockerError(e instanceof Error ? e.message : String(e))
      setDockerStatus('check_failed')
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
  const handleConnectionTestResult = useCallback(
    (service: keyof ConnectionTestMap, success: boolean, detail?: ConnectionDetail) => {
      setConnectionTested((prev) => ({ ...prev, [service]: success }))
      setConnectionDetail((prev) => ({ ...prev, [service]: detail ?? null }))
    },
    [],
  )

  // ── Reset connection test when URL/credentials change ──────────────
  const prevNeo4jRef = useRef(config.neo4jUri + config.neo4jUser + config.neo4jPassword)
  const prevMeiliRef = useRef(config.meilisearchUrl + config.meilisearchKey)
  const prevNatsRef = useRef(config.natsUrl)

  useEffect(() => {
    const key = config.neo4jUri + config.neo4jUser + config.neo4jPassword
    if (key !== prevNeo4jRef.current) {
      prevNeo4jRef.current = key
      setConnectionTested((prev) => ({ ...prev, neo4j: null }))
      setConnectionDetail((prev) => ({ ...prev, neo4j: null }))
    }
  }, [config.neo4jUri, config.neo4jUser, config.neo4jPassword])

  useEffect(() => {
    const key = config.meilisearchUrl + config.meilisearchKey
    if (key !== prevMeiliRef.current) {
      prevMeiliRef.current = key
      setConnectionTested((prev) => ({ ...prev, meilisearch: null }))
      setConnectionDetail((prev) => ({ ...prev, meilisearch: null }))
    }
  }, [config.meilisearchUrl, config.meilisearchKey])

  useEffect(() => {
    if (config.natsUrl !== prevNatsRef.current) {
      prevNatsRef.current = config.natsUrl
      setConnectionTested((prev) => ({ ...prev, nats: null }))
      setConnectionDetail((prev) => ({ ...prev, nats: null }))
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
      // A Docker whose API is stuck but whose services answer is as good as a running one: the
      // services are what the app needs, and asking to restart Docker would stop them.
      setInfraValid(dockerStatus === 'running' || (dockerStatus === 'unresponsive' && dockerServicesUp))
    } else {
      // External mode: neo4j + meilisearch + nats must all pass
      const neo4jOk = connectionTested.neo4j === true
      const meiliOk = connectionTested.meilisearch === true
      const natsOk = connectionTested.nats === true
      setInfraValid(neo4jOk && meiliOk && natsOk)
    }
  }, [config.infraMode, dockerStatus, dockerServicesUp, connectionTested, isTrayNavigation, setInfraValid])

  return (
    <div className="space-y-6">
      {/* Mode selection */}
      <div className="grid gap-3 sm:grid-cols-2" role="group" aria-label={t('siteSetup.infra.modeGroup')}>
        <ModeCard
          active={config.infraMode === 'docker'}
          onClick={() => update({ infraMode: 'docker' })}
          title={t('siteSetup.infra.modeDocker')}
          description={t('siteSetup.infra.modeDockerDesc')}
          icon={<Package className="h-5 w-5" aria-hidden="true" />}
        />
        <ModeCard
          active={config.infraMode === 'external'}
          onClick={() => update({ infraMode: 'external' })}
          title={t('siteSetup.infra.modeExternal')}
          description={t('siteSetup.infra.modeExternalDesc')}
          icon={<LinkIcon className="h-5 w-5" aria-hidden="true" />}
        />
      </div>

      {/* External servers config */}
      {config.infraMode === 'external' && (
        <div className={`${surface} space-y-6 p-4 md:p-5`}>
          <section>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-gray-200">{t('siteSetup.infra.neo4jConnection')}</h3>
              <TestConnectionButton service="neo4j" url={config.neo4jUri} tested={connectionTested.neo4j} onResult={(ok, detail) => handleConnectionTestResult('neo4j', ok, detail)} />
            </div>
            <ConnectionHint tested={connectionTested.neo4j} detail={connectionDetail.neo4j} />
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field
                label="URI"
                value={config.neo4jUri}
                onChange={(v) => update({ neo4jUri: v })}
                placeholder="bolt://localhost:7687"
              />
              <Field
                label={t('siteSetup.infra.user')}
                value={config.neo4jUser}
                onChange={(v) => update({ neo4jUser: v })}
                placeholder="neo4j"
              />
              <Field
                label={t('siteSetup.infra.password')}
                type="password"
                value={config.neo4jPassword}
                onChange={(v) => update({ neo4jPassword: v })}
                placeholder={config.hasNeo4jPassword ? t('siteSetup.infra.unchanged') : t('siteSetup.infra.enterPassword')}
                hint={config.hasNeo4jPassword ? t('siteSetup.infra.passwordConfigured') : undefined}
                className="sm:col-span-2"
              />
            </div>
          </section>

          <section className="border-t border-white/[0.06] pt-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-gray-200">{t('siteSetup.infra.meilisearchConnection')}</h3>
              <TestConnectionButton service="meilisearch" url={config.meilisearchUrl} tested={connectionTested.meilisearch} onResult={(ok, detail) => handleConnectionTestResult('meilisearch', ok, detail)} />
            </div>
            <ConnectionHint tested={connectionTested.meilisearch} detail={connectionDetail.meilisearch} />
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field
                label="URL"
                value={config.meilisearchUrl}
                onChange={(v) => update({ meilisearchUrl: v })}
                placeholder="http://localhost:7700"
              />
              <Field
                label={t('siteSetup.infra.apiKey')}
                type="password"
                value={config.meilisearchKey}
                onChange={(v) => update({ meilisearchKey: v })}
                placeholder={config.hasMeilisearchKey ? t('siteSetup.infra.unchanged') : t('siteSetup.infra.masterKey')}
                hint={config.hasMeilisearchKey ? t('siteSetup.infra.keyConfigured') : undefined}
              />
            </div>
          </section>

          {/* NATS connection */}
          <section className="border-t border-white/[0.06] pt-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-gray-200">{t('siteSetup.infra.natsConnection')}</h3>
              <TestConnectionButton service="nats" url={config.natsUrl || 'nats://localhost:4222'} tested={connectionTested.nats} onResult={(ok, detail) => handleConnectionTestResult('nats', ok, detail)} />
            </div>
            <ConnectionHint tested={connectionTested.nats} detail={connectionDetail.nats} />
            <div className="mt-3">
              <Field
                label="URL"
                value={config.natsUrl}
                onChange={(v) => update({ natsUrl: v })}
                placeholder="nats://localhost:4222"
              />
            </div>
          </section>
        </div>
      )}

      {/* Docker status banner + info */}
      {config.infraMode === 'docker' && (
        <div className="space-y-3">
          {/* Docker status banner — only in Tauri */}
          {isTauri && (
            <DockerBanner
              status={dockerStatus}
              servicesUp={dockerServicesUp}
              checking={dockerChecking}
              error={dockerError}
              onInstall={handleInstallDocker}
              onOpen={handleOpenDocker}
              onRetry={() => void checkDocker()}
            />
          )}

          {/* What Docker runs */}
          <div className={`${surface} flex gap-3 p-4`}>
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-gray-500" aria-hidden="true" />
            <div className="min-w-0 text-sm text-gray-300">
              <p className="font-medium text-gray-200">{t('siteSetup.infra.dockerInfoTitle')}</p>
              <p className="mt-1 text-gray-400">{t('siteSetup.infra.dockerInfo')}</p>
              <p className="mt-2 break-words text-xs leading-4 text-gray-500 tabular-nums">{t('siteSetup.infra.ports', { api: config.serverPort })}</p>
            </div>
          </div>
        </div>
      )}

      {/* Server port */}
      <Field
        label={t('siteSetup.infra.portLabel')}
        type="number"
        value={String(config.serverPort)}
        onChange={(v) => update({ serverPort: parseInt(v) || 6600 })}
        placeholder="6600"
        hint={t('siteSetup.infra.portHint')}
        className="max-w-xs"
      />

      {/* Serve frontend on API port */}
      <div className={`${surface} p-4`}>
        <Switch
          checked={config.serveFrontend}
          onChange={(checked) => update({ serveFrontend: checked })}
          label={
            <span className="block min-w-0 text-sm">
              <span className="block font-medium text-gray-200">{t('siteSetup.infra.serveFrontend')}</span>
              <span className="mt-0.5 block break-words text-xs leading-4 text-gray-500">{t('siteSetup.infra.serveFrontendHint', { port: config.serverPort })}</span>
            </span>
          }
        />
      </div>

      {/* Public URL (optional) — only when serving frontend */}
      {config.serveFrontend && (
        <div>
          <Field
            label={t('siteSetup.infra.publicUrl')}
            value={config.publicUrl}
            onChange={(v) => update({ publicUrl: v })}
            placeholder="https://myapp.example.com"
            hint={t('siteSetup.infra.publicUrlHint')}
          />
          {config.publicUrl.trim() && (
            <p className="mt-3 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-4 text-gray-400">
              <Globe className="h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
              <span>
                {t('siteSetup.infra.localLine')} <code className="break-all text-gray-300">http://localhost:{config.serverPort}</code>
              </span>
              <span>
                {t('siteSetup.infra.publicLine')} <code className="break-all text-gray-300">{config.publicUrl.trim().replace(/\/+$/, '')}</code>
              </span>
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Reusable sub-components
// ============================================================================

/** One of two exclusive choices: an opaque surface (glass is for buttons, not content), `aria-pressed` says which one is on. */
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
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex min-w-0 items-start gap-3 rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500/60 ${
        active
          ? 'border-indigo-500/50 bg-indigo-500/10'
          : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.04]'
      }`}
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
          active ? 'bg-indigo-500/20 text-indigo-300' : 'bg-white/[0.06] text-gray-400'
        }`}
      >
        {active ? <Check className="h-5 w-5" aria-hidden="true" /> : icon}
      </span>
      <span className="min-w-0">
        <span className={`block text-sm font-medium ${active ? 'text-gray-50' : 'text-gray-200'}`}>{title}</span>
        <span className="mt-1 block text-xs leading-4 text-gray-500">{description}</span>
      </span>
    </button>
  )
}

// ============================================================================
// Docker status banner
// ============================================================================

/**
 * What the Docker check found, in words (#246 frozen daemon, #248 API not answering while the
 * services do, #237 a check that failed, #230 install vs. open). The titles are the contract the
 * tests read; the bodies say why and what to do next, the way the site does.
 */
function DockerBanner({
  status,
  servicesUp,
  checking,
  error,
  onInstall,
  onOpen,
  onRetry,
}: {
  status: DockerStatus
  /** With `unresponsive`: the services answer anyway. */
  servicesUp: boolean
  checking: boolean
  error: string | null
  onRetry: () => void
  onInstall: () => void
  onOpen: () => void
}) {
  const { t } = useT()
  if (checking || status === 'unknown') {
    return (
      <StatusBanner
        tone="neutral"
        title={t('siteSetup.infra.docker.detecting')}
        role="status"
        icon={<Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-gray-400" aria-hidden="true" />}
      />
    )
  }

  if (status === 'check_failed') {
    return (
      <StatusBanner
        tone="warning"
        title={t('siteSetup.infra.docker.checkFailedTitle')}
        role="alert"
        action={
          <Button variant="secondary" size="sm" onClick={onRetry}>
            {t('siteSetup.infra.docker.checkAgain')}
          </Button>
        }
      >
        <p>{t('siteSetup.infra.docker.checkFailedBody')}</p>
        {error && <p className="break-words font-mono text-xs leading-4 text-gray-500">{error}</p>}
      </StatusBanner>
    )
  }

  if (status === 'not_installed') {
    return (
      <StatusBanner
        tone="danger"
        title={t('siteSetup.infra.docker.notInstalledTitle')}
        role="alert"
        action={
          <Button variant="secondary" size="sm" onClick={onInstall}>
            <Download className="h-4 w-4" aria-hidden="true" />
            {t('siteSetup.infra.docker.installDocker')}
          </Button>
        }
      >
        <p>{t('siteSetup.infra.docker.notInstalledBody')}</p>
      </StatusBanner>
    )
  }

  if (status === 'unresponsive' && servicesUp) {
    return (
      <StatusBanner tone="success" title={t('siteSetup.infra.docker.servicesUpTitle')} role="status">
        <p>{t('siteSetup.infra.docker.servicesUpBody')}</p>
      </StatusBanner>
    )
  }

  if (status === 'unresponsive') {
    return (
      <StatusBanner
        tone="warning"
        title={t('siteSetup.infra.docker.unresponsiveTitle')}
        role="alert"
        action={
          <Button variant="secondary" size="sm" onClick={onOpen}>
            <Play className="h-4 w-4" aria-hidden="true" />
            {t('siteSetup.infra.docker.openDocker')}
          </Button>
        }
      >
        <p>{t('siteSetup.infra.docker.unresponsiveBody')}</p>
      </StatusBanner>
    )
  }

  if (status === 'installed') {
    return (
      <StatusBanner
        tone="warning"
        title={t('siteSetup.infra.docker.installedTitle')}
        role="alert"
        action={
          <Button variant="secondary" size="sm" onClick={onOpen}>
            <Play className="h-4 w-4" aria-hidden="true" />
            {t('siteSetup.infra.docker.openDocker')}
          </Button>
        }
      >
        <p>{t('siteSetup.infra.docker.installedBody')}</p>
      </StatusBanner>
    )
  }

  // running
  return <StatusBanner tone="success" title={t('siteSetup.infra.docker.runningTitle')} role="status" />
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
  onResult: (success: boolean, detail?: ConnectionDetail) => void
}) {
  const { t } = useT()
  const [testing, setTesting] = useState(false)

  const handleTest = async () => {
    if (!isTauri || !url.trim()) return
    setTesting(true)
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      try {
        const result = await invoke<{ ok: boolean; hint?: string | null; verifiedBy?: string | null }>(
          'test_connection_detailed',
          { service, url },
        )
        onResult(result.ok, { hint: result.hint ?? null, verifiedBy: result.verifiedBy ?? null })
      } catch (e) {
        if (/not found|unknown command/i.test(String(e))) {
          // A desktop build older than the detailed command: the plain answer, without a reason.
          onResult(await invoke<boolean>('test_connection', { service, url }))
        } else {
          // Say what happened ("not an address", a failed call): a bare "Failed" tells nothing.
          onResult(false, { hint: typeof e === 'string' ? e : String(e), verifiedBy: null })
        }
      }
    } catch (e) {
      onResult(false, { hint: String(e), verifiedBy: null })
    } finally {
      setTesting(false)
    }
  }

  if (!isTauri) return null

  return (
    <div className="flex items-center gap-2">
      {/* Persistent badge: a glyph and a word, never the colour alone */}
      {tested === true && (
        <span className="flex items-center gap-1 text-xs font-medium text-emerald-400">
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
          {t('siteSetup.infra.connected')}
        </span>
      )}
      {tested === false && (
        <span className="flex items-center gap-1 text-xs font-medium text-red-400">
          <X className="h-3.5 w-3.5" aria-hidden="true" />
          {t('siteSetup.infra.failed')}
        </span>
      )}
      {/* Test button: flat — three of them sit in the same card */}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        flat
        onClick={handleTest}
        disabled={testing}
        title={t('siteSetup.infra.testConnectionTitle', { service })}
      >
        {testing ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            {t('siteSetup.infra.testing')}
          </>
        ) : (
          <>
            <Wifi className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
            {tested !== null ? t('siteSetup.infra.retest') : t('siteSetup.infra.test')}
          </>
        )}
      </Button>
    </div>
  )
}

/** The reason a test failed (a refused port, an unreachable host, the macOS local-network
 * permission...), or what could not be checked on a TLS address. */
function ConnectionHint({ tested, detail }: { tested: boolean | null; detail?: ConnectionDetail | null }) {
  const { t } = useT()
  if (!isTauri || !detail) return null
  if (tested === false && detail.hint) {
    return (
      <p role="alert" className="mt-2 break-words text-xs leading-relaxed text-red-300">
        {detail.hint}
      </p>
    )
  }
  if (tested === true && detail.verifiedBy === 'tcp') {
    return (
      <p className="mt-2 text-xs leading-relaxed text-gray-500">
        {t('siteSetup.infra.reachableTls')}
      </p>
    )
  }
  return null
}
