import { useState } from 'react'
import { useAtom, useSetAtom } from 'jotai'
import { Loader2, Rocket, RefreshCw } from 'lucide-react'
import { setupConfigAtom, configExistsAtom, withSetupModelFallback } from '@/atoms/setup'
import { pendingSetupProviderAtom } from '@/atoms/setupProvider'
import { toToolPolicyMode } from '@/types/provider'
import { SETUP_MODE_SUMMARIES } from '@/constants/toolPolicy'
import { isTauri } from '@/services/env'
import { useT } from '@/i18n'
import { Link } from 'react-router-dom'
import { setupLaunchNoEngineSummary } from '@/constants/setupProviders'
import { Button, Switch, focusRing, inlineLink, surface } from '@/components/ui'
import { StatusBanner } from './StatusBanner'

type LaunchPhase = 'review' | 'generating' | 'generated' | 'restarting' | 'error'

export function LaunchPage() {
  const { t } = useT()
  const [config, setConfig] = useAtom(setupConfigAtom)
  const [pendingProvider] = useAtom(pendingSetupProviderAtom)
  const setConfigExists = useSetAtom(configExistsAtom)
  const [phase, setPhase] = useState<LaunchPhase>('review')
  const [configPath, setConfigPath] = useState<string>('')
  const [errorMessage, setErrorMessage] = useState<string>('')

  const handleGenerate = async () => {
    setPhase('generating')
    setErrorMessage('')

    if (!isTauri) {
      // Web mode — can't generate config, show info message
      setPhase('generated')
      setConfigPath(t('siteSetup.launch.webMode'))
      return
    }

    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const path = await invoke<string>('generate_config', { config: withSetupModelFallback(config) })
      setConfigPath(path)
      setConfigExists(true)
      setPhase('generated')
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err))
      setPhase('error')
    }
  }

  const handleRestart = async () => {
    if (!isTauri) return
    setPhase('restarting')
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('restart_app')
      // The app will restart — this code won't reach
    } catch (err) {
      setErrorMessage(t('siteSetup.launch.failedRestart', { error: err instanceof Error ? err.message : String(err) }))
      setPhase('error')
    }
  }

  return (
    <div className="space-y-6">
      {/* Auto-update application toggle */}
      {isTauri && (
        <div className={`${surface} p-4`}>
          <Switch
            checked={config.chatAutoUpdateApp}
            onChange={(checked) => setConfig((prev) => ({ ...prev, chatAutoUpdateApp: checked }))}
            label={
              <span className="block min-w-0 text-sm">
                <span className="block font-medium text-gray-200">{t('siteSetup.launch.autoUpdateApp')}</span>
                <span className="mt-0.5 block text-xs leading-4 text-gray-500">{t('siteSetup.launch.autoUpdateAppHint')}</span>
              </span>
            }
          />
        </div>
      )}

      {/* Configuration summary */}
      <section className={`${surface} p-4 md:p-5`} aria-labelledby="setup-summary-title">
        <h3 id="setup-summary-title" className="mb-2 text-sm font-semibold text-gray-200">
          {t('siteSetup.launch.summary')}
        </h3>
        <dl className="divide-y divide-white/[0.04]">
          <SummaryGroup>
            <SummaryRow
              label={t('siteSetup.launch.rowInfrastructure')}
              value={config.infraMode === 'docker' ? t('siteSetup.launch.valueDocker') : t('siteSetup.launch.valueExternal')}
            />
            {config.infraMode === 'external' && (
              <>
                <SummaryRow label="Neo4j" value={config.neo4jUri} />
                <SummaryRow label="MeiliSearch" value={config.meilisearchUrl} />
              </>
            )}
            <SummaryRow
              label="NATS"
              value={
                !config.natsEnabled
                  ? t('siteSetup.launch.valueDisabled')
                  : config.infraMode === 'docker'
                    ? t('siteSetup.launch.valueEnabledDocker')
                    : t('siteSetup.launch.valueEnabledUrl', { url: config.natsUrl || 'nats://localhost:4222' })
              }
            />
            <SummaryRow label={t('siteSetup.launch.rowApiPort')} value={String(config.serverPort)} />
            {config.publicUrl.trim() && (
              <SummaryRow label={t('siteSetup.launch.rowPublicUrl')} value={config.publicUrl.trim().replace(/\/+$/, '')} />
            )}
          </SummaryGroup>

          <SummaryGroup>
            <SummaryRow
              label={t('siteSetup.launch.rowAuthentication')}
              value={
                config.authMode === 'none'
                  ? t('siteSetup.launch.valueDisabled')
                  : config.authMode === 'password'
                    ? t('siteSetup.launch.valuePassword', { who: config.rootEmail || t('siteSetup.launch.noEmailSet') })
                    : t('siteSetup.launch.valueOidc', { name: config.oidcProviderName || t('siteSetup.launch.valueCustom') })
              }
            />
            {(config.allowedEmailDomain || config.allowedEmails) && (
              <SummaryRow
                label={t('siteSetup.launch.rowAccess')}
                value={[
                  config.allowedEmailDomain ? `@${config.allowedEmailDomain}` : '',
                  config.allowedEmails ? t('siteSetup.launch.emailCount', { count: config.allowedEmails.split('\n').filter(Boolean).length }) : '',
                ].filter(Boolean).join(' + ')}
              />
            )}
            {!(config.allowedEmailDomain || config.allowedEmails) && config.authMode !== 'none' && (
              <SummaryRow label={t('siteSetup.launch.rowAccess')} value={t('siteSetup.launch.noRestrictions')} />
            )}
          </SummaryGroup>

          <SummaryGroup>
            {config.chatProvider === 'none' ? (
              <SummaryRow
                label={t('siteSetup.launch.rowChatProvider')}
                value={
                  pendingProvider
                    ? t('siteSetup.launch.pendingAdded', { label: pendingProvider.label })
                    : setupLaunchNoEngineSummary()
                }
              />
            ) : (
              <>
                <SummaryRow label={t('siteSetup.launch.rowChatModel')} value={config.chatModel || t('siteSetup.launch.notSelected')} />
                <SummaryRow label={t('siteSetup.launch.rowMaxSessions')} value={String(config.chatMaxSessions)} />
                <SummaryRow label={t('siteSetup.launch.rowMaxTurns')} value={String(config.chatMaxTurns)} />
                <SummaryRow
                  label={t('siteSetup.launch.rowPermissions')}
                  value={SETUP_MODE_SUMMARIES[toToolPolicyMode(config.chatPermissionMode) ?? 'plan_only']}
                />
                {config.chatProcessPath && (
                  <SummaryRow label={t('siteSetup.launch.rowProcessPath')} value={config.chatProcessPath} truncate />
                )}
                {config.chatClaudeCliPath && (
                  <SummaryRow label={t('siteSetup.launch.rowCliPath')} value={config.chatClaudeCliPath} truncate />
                )}
                <SummaryRow label={t('siteSetup.launch.rowAutoUpdateCli')} value={config.chatAutoUpdateCli ? t('siteSetup.launch.valueEnabled') : t('siteSetup.launch.valueDisabled')} />
              </>
            )}
          </SummaryGroup>

          <SummaryGroup>
            <SummaryRow
              label={t('siteSetup.launch.rowEmbeddings')}
              value={
                config.embeddingProvider === 'local'
                  ? t('siteSetup.launch.valueLocalOnnx', { model: config.embeddingFastembedModel })
                  : config.embeddingProvider === 'http'
                    ? t('siteSetup.launch.valueHttpApi', { model: config.embeddingModel || config.embeddingUrl || t('siteSetup.launch.valueDefault') })
                    : t('siteSetup.launch.valueDisabled')
              }
            />
          </SummaryGroup>
        </dl>
      </section>

      {/* Success message */}
      {phase === 'generated' && (
        <StatusBanner tone="success" title={t('siteSetup.launch.savedTitle')} role="status">
          {configPath && <p className="break-all font-mono text-xs leading-4 text-gray-500">{configPath}</p>}
          <p>{t('siteSetup.launch.savedRestart')}</p>
          {config.chatProvider === 'none' ? (
            <p>
              {t('siteSetup.launch.savedNext')}
              <Link to="/settings" className={inlineLink}>
                {t('siteSetup.launch.savedNextLink')}
              </Link>
              {t('siteSetup.launch.savedNextTail')}
            </p>
          ) : (
            <p>
              {t('siteSetup.launch.savedMore')}
              <Link to="/settings" className={inlineLink}>
                {t('siteSetup.launch.savedMoreVault')}
              </Link>
              {t('siteSetup.launch.savedMoreMid')}
              <Link to="/settings" className={inlineLink}>
                {t('siteSetup.launch.savedMoreProviders')}
              </Link>
              {t('siteSetup.launch.savedMoreTail')}
            </p>
          )}
        </StatusBanner>
      )}

      {/* Error message */}
      {phase === 'error' && (
        <StatusBanner tone="danger" title={t('siteSetup.launch.failedTitle')} role="alert">
          <p className="break-words">{errorMessage}</p>
        </StatusBanner>
      )}

      {/* Restarting indicator */}
      {phase === 'restarting' && (
        <StatusBanner
          tone="progress"
          title={t('siteSetup.launch.restarting')}
          role="status"
          icon={<Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-indigo-300" aria-hidden="true" />}
        />
      )}

      {/* Action: the ONE primary of this screen (the step nav is hidden here) */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        {phase === 'review' && (
          <Button size="lg" onClick={handleGenerate}>
            <Rocket className="h-5 w-5" aria-hidden="true" />
            {t('siteSetup.launch.generate')}
          </Button>
        )}

        {phase === 'generating' && (
          <p className="flex items-center gap-2 text-sm text-gray-400" role="status">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            {t('siteSetup.launch.generating')}
          </p>
        )}

        {phase === 'generated' && isTauri && (
          <Button size="lg" onClick={handleRestart}>
            <RefreshCw className="h-5 w-5" aria-hidden="true" />
            {t('siteSetup.launch.restart')}
          </Button>
        )}

        {phase === 'error' && (
          <Button variant="secondary" size="lg" onClick={() => setPhase('review')}>
            {t('siteSetup.launch.tryAgain')}
          </Button>
        )}
      </div>

      {/* Credits */}
      <CreditsSection />
    </div>
  )
}

// ============================================================================
// Sub-components
// ============================================================================

function SummaryGroup({ children }: { children: React.ReactNode }) {
  return <div className="py-2 first:pt-0 last:pb-0">{children}</div>
}

/** One line of the summary: the label, then the value — it wraps on a phone, a long path is truncated with its full value in `title`. */
function SummaryRow({ label, value, truncate }: { label: string; value: string; truncate?: boolean }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-1">
      <dt className="text-xs leading-4 text-gray-500">{label}</dt>
      <dd
        className={`min-w-0 text-xs font-medium leading-4 text-gray-300 ${truncate ? 'max-w-full truncate font-mono' : 'break-words text-right'}`}
        title={truncate ? value : undefined}
      >
        {value}
      </dd>
    </div>
  )
}

// ============================================================================
// Credits
// ============================================================================

interface Dependency {
  name: string
  license: string
}

interface DependencyCategory {
  key: 'backend' | 'frontend' | 'desktop'
  deps: Dependency[]
}

const CREDITS: DependencyCategory[] = [
  {
    key: 'backend',
    deps: [
      { name: 'tokio', license: 'MIT' },
      { name: 'tokio-stream', license: 'MIT' },
      { name: 'futures', license: 'MIT / Apache-2.0' },
      { name: 'axum', license: 'MIT' },
      { name: 'tower', license: 'MIT' },
      { name: 'tower-http', license: 'MIT' },
      { name: 'serde', license: 'MIT / Apache-2.0' },
      { name: 'serde_json', license: 'MIT / Apache-2.0' },
      { name: 'serde_yaml', license: 'MIT / Apache-2.0' },
      { name: 'neo4rs', license: 'MIT' },
      { name: 'meilisearch-sdk', license: 'MIT' },
      { name: 'tree-sitter', license: 'MIT' },
      { name: 'tree-sitter-rust', license: 'MIT' },
      { name: 'tree-sitter-typescript', license: 'MIT' },
      { name: 'tree-sitter-python', license: 'MIT' },
      { name: 'tree-sitter-go', license: 'MIT' },
      { name: 'tree-sitter-java', license: 'MIT' },
      { name: 'tree-sitter-c', license: 'MIT' },
      { name: 'tree-sitter-cpp', license: 'MIT' },
      { name: 'tree-sitter-ruby', license: 'MIT' },
      { name: 'tree-sitter-php', license: 'MIT' },
      { name: 'tree-sitter-kotlin-ng', license: 'MIT' },
      { name: 'tree-sitter-swift', license: 'MIT' },
      { name: 'tree-sitter-bash', license: 'MIT' },
      { name: 'clap', license: 'MIT / Apache-2.0' },
      { name: 'tracing', license: 'MIT' },
      { name: 'tracing-subscriber', license: 'MIT' },
      { name: 'anyhow', license: 'MIT / Apache-2.0' },
      { name: 'thiserror', license: 'MIT / Apache-2.0' },
      { name: 'uuid', license: 'MIT / Apache-2.0' },
      { name: 'chrono', license: 'MIT / Apache-2.0' },
      { name: 'walkdir', license: 'Unlicense / MIT' },
      { name: 'glob', license: 'MIT / Apache-2.0' },
      { name: 'sha2', license: 'MIT / Apache-2.0' },
      { name: 'hex', license: 'MIT / Apache-2.0' },
      { name: 'async-trait', license: 'MIT / Apache-2.0' },
      { name: 'reqwest', license: 'MIT / Apache-2.0' },
      { name: 'nexus-claude', license: 'MIT' },
      { name: 'jsonwebtoken', license: 'MIT' },
      { name: 'bcrypt', license: 'MIT' },
      { name: 'flate2', license: 'MIT / Apache-2.0' },
      { name: 'tar', license: 'MIT / Apache-2.0' },
      { name: 'zip', license: 'MIT' },
      { name: 'dirs', license: 'MIT / Apache-2.0' },
      { name: 'async-nats', license: 'Apache-2.0' },
      { name: 'dotenvy', license: 'MIT' },
      { name: 'urlencoding', license: 'MIT' },
      { name: 'notify', license: 'CC0-1.0' },
      { name: 'rust-embed', license: 'MIT' },
      { name: 'mime_guess', license: 'MIT' },
    ],
  },
  {
    key: 'frontend',
    deps: [
      { name: 'react', license: 'MIT' },
      { name: 'react-dom', license: 'MIT' },
      { name: 'react-router-dom', license: 'MIT' },
      { name: '@xyflow/react', license: 'MIT' },
      { name: 'dagre', license: 'MIT' },
      { name: '@dnd-kit/core', license: 'MIT' },
      { name: '@dnd-kit/sortable', license: 'MIT' },
      { name: '@dnd-kit/utilities', license: 'MIT' },
      { name: 'react-markdown', license: 'MIT' },
      { name: 'rehype-highlight', license: 'MIT' },
      { name: 'remark-gfm', license: 'MIT' },
      { name: 'jotai', license: 'MIT' },
      { name: 'vite', license: 'MIT' },
      { name: 'tailwindcss', license: 'MIT' },
      { name: 'typescript', license: 'Apache-2.0' },
    ],
  },
  {
    key: 'desktop',
    deps: [
      { name: 'tauri', license: 'MIT / Apache-2.0' },
      { name: 'tauri-plugin-shell', license: 'MIT / Apache-2.0' },
      { name: 'tauri-plugin-updater', license: 'MIT / Apache-2.0' },
      { name: 'tauri-plugin-opener', license: 'MIT / Apache-2.0' },
      { name: '@tauri-apps/api', license: 'MIT / Apache-2.0' },
      { name: '@tauri-apps/plugin-updater', license: 'MIT / Apache-2.0' },
      { name: '@cloudworxx/tauri-plugin-mac-rounded-corners', license: 'MIT' },
      { name: 'bollard', license: 'Apache-2.0' },
      { name: 'cocoa', license: 'MIT / Apache-2.0' },
      { name: 'objc', license: 'MIT' },
    ],
  },
]

/** The licences, folded by default: a native `<details>`, no local button class. */
function CreditsSection() {
  const { t } = useT()
  const categoryTitles = {
    backend: t('siteSetup.launch.creditsBackend'),
    frontend: t('siteSetup.launch.creditsFrontend'),
    desktop: t('siteSetup.launch.creditsDesktop'),
  }
  return (
    <details className={`${surface} group/credits`}>
      <summary
        className={`flex min-h-9 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 text-left transition-colors hover:bg-white/[0.02] [&::-webkit-details-marker]:hidden md:px-5 ${focusRing}`}
      >
        <span className="min-w-0">
          <span className="block text-sm font-medium text-gray-200">{t('siteSetup.launch.credits')}</span>
          <span className="mt-0.5 block text-xs leading-4 text-gray-500">MIT AND BUSL-1.1 &mdash; &copy; 2026 FFS SASU</span>
        </span>
        <span className="shrink-0 text-xs text-gray-500 group-open/credits:hidden">{t('siteSetup.launch.show')}</span>
        <span className="hidden shrink-0 text-xs text-gray-500 group-open/credits:inline">{t('siteSetup.launch.hide')}</span>
      </summary>

      <div className="space-y-4 border-t border-white/[0.04] px-4 pb-4 pt-4 md:px-5">
        {CREDITS.map((cat) => (
          <div key={cat.key}>
            <h4 className="mb-2 text-xs font-medium text-gray-400">{categoryTitles[cat.key]}</h4>
            <ul className="grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
              {cat.deps.map((dep) => (
                <li key={dep.name} className="flex items-center justify-between gap-2 py-0.5">
                  <span className="truncate text-[11px] leading-4 text-gray-400">{dep.name}</span>
                  <span className="shrink-0 text-[11px] leading-4 text-gray-500">{dep.license}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </details>
  )
}
