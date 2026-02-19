import { useState } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { Check, X, Loader2, Rocket, RefreshCw, ChevronDown } from 'lucide-react'
import { setupConfigAtom, configExistsAtom } from '@/atoms/setup'
import { isTauri } from '@/services/env'

type LaunchPhase = 'review' | 'generating' | 'generated' | 'restarting' | 'error'

export function LaunchPage() {
  const config = useAtomValue(setupConfigAtom)
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
      setConfigPath('(web mode — config.yaml must be created manually on the server)')
      return
    }

    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const path = await invoke<string>('generate_config', { config })
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
      setErrorMessage(`Failed to restart: ${err instanceof Error ? err.message : String(err)}`)
      setPhase('error')
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold">Launch</h2>
        <p className="mt-1 text-sm text-gray-400">
          Review your configuration and generate the config file.
        </p>
      </div>

      {/* Configuration summary */}
      <div className="space-y-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-6">
        <h3 className="text-sm font-medium text-gray-300">Configuration Summary</h3>

        <SummaryRow
          label="Infrastructure"
          value={config.infraMode === 'docker' ? 'Docker (automatic)' : 'External servers'}
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
              ? 'Disabled'
              : config.infraMode === 'docker'
                ? 'Enabled (Docker)'
                : `Enabled (${config.natsUrl || 'nats://localhost:4222'})`
          }
        />
        <SummaryRow label="API Port" value={String(config.serverPort)} />
        {config.publicUrl.trim() && (
          <SummaryRow label="Public URL" value={config.publicUrl.trim().replace(/\/+$/, '')} />
        )}

        <div className="border-t border-white/[0.04] pt-2" />

        <SummaryRow
          label="Authentication"
          value={
            config.authMode === 'none'
              ? 'Disabled'
              : config.authMode === 'password'
                ? `Password (${config.rootEmail || 'no email set'})`
                : `OIDC (${config.oidcProviderName || 'Custom'})`
          }
        />
        {(config.allowedEmailDomain || config.allowedEmails) && (
          <SummaryRow
            label="Access"
            value={[
              config.allowedEmailDomain ? `@${config.allowedEmailDomain}` : '',
              config.allowedEmails ? `${config.allowedEmails.split('\n').filter(Boolean).length} email(s)` : '',
            ].filter(Boolean).join(' + ')}
          />
        )}
        {!(config.allowedEmailDomain || config.allowedEmails) && config.authMode !== 'none' && (
          <SummaryRow label="Access" value="No restrictions" />
        )}

        <div className="border-t border-white/[0.04] pt-2" />

        <SummaryRow label="Chat Model" value={config.chatModel} />
        <SummaryRow label="Max Sessions" value={String(config.chatMaxSessions)} />
        <SummaryRow label="Max Turns" value={String(config.chatMaxTurns)} />
        <SummaryRow
          label="Permissions"
          value={
            config.chatPermissionMode === 'bypassPermissions' ? 'Bypass (all auto-approved)'
            : config.chatPermissionMode === 'default' ? 'Default (ask for edits & shell)'
            : config.chatPermissionMode === 'acceptEdits' ? 'Accept Edits (ask for shell only)'
            : 'Plan Only (read-only)'
          }
        />
      </div>

      {/* Success message */}
      {phase === 'generated' && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-6">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
              <Check className="h-4 w-4" />
            </span>
            <div className="space-y-1">
              <p className="text-sm font-medium text-emerald-300">Configuration saved!</p>
              {configPath && (
                <p className="text-xs text-emerald-400/70 break-all font-mono">{configPath}</p>
              )}
              <p className="mt-2 text-xs text-gray-400">
                The application needs to restart to apply the new configuration.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Error message */}
      {phase === 'error' && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/[0.06] p-6">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-500/20 text-red-400">
              <X className="h-4 w-4" />
            </span>
            <div className="space-y-1">
              <p className="text-sm font-medium text-red-300">Configuration failed</p>
              <p className="text-xs text-red-400/70">{errorMessage}</p>
            </div>
          </div>
        </div>
      )}

      {/* Restarting indicator */}
      {phase === 'restarting' && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-6">
          <div className="flex items-center justify-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
            <span className="text-sm text-gray-400">Restarting application...</span>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex justify-center gap-4">
        {phase === 'review' && (
          <button
            onClick={handleGenerate}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-8 py-3 text-sm font-medium text-white transition hover:bg-indigo-500"
          >
            <Rocket className="h-5 w-5" />
            Generate Config &amp; Save
          </button>
        )}

        {phase === 'generating' && (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            Generating configuration...
          </div>
        )}

        {phase === 'generated' && isTauri && (
          <button
            onClick={handleRestart}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 px-8 py-3 text-sm font-medium text-white transition hover:bg-emerald-500"
          >
            <RefreshCw className="h-5 w-5" />
            Restart Application
          </button>
        )}

        {phase === 'error' && (
          <button
            onClick={() => setPhase('review')}
            className="flex items-center gap-2 rounded-xl bg-gray-700 px-8 py-3 text-sm font-medium text-white transition hover:bg-gray-600"
          >
            Try Again
          </button>
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

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-xs font-medium text-gray-300">{value}</span>
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
  title: string
  icon: string
  deps: Dependency[]
}

const CREDITS: DependencyCategory[] = [
  {
    title: 'Backend (Rust)',
    icon: '\u2699\uFE0F',
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
    title: 'Frontend (JavaScript)',
    icon: '\uD83C\uDF10',
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
    title: 'Desktop (Tauri)',
    icon: '\uD83D\uDDA5\uFE0F',
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

function CreditsSection() {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02]">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-6 py-4 text-left transition hover:bg-white/[0.02]"
      >
        <div>
          <h3 className="text-sm font-medium text-gray-300">Credits & Licenses</h3>
          <p className="mt-0.5 text-xs text-gray-500">
            MIT AND BUSL-1.1 &mdash; &copy; 2026 FFS SAS
          </p>
        </div>
        <ChevronDown className={`h-4 w-4 shrink-0 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="space-y-4 border-t border-white/[0.04] px-6 pb-6 pt-4">
          {CREDITS.map((cat) => (
            <div key={cat.title}>
              <h4 className="mb-2 text-xs font-medium text-gray-400">
                {cat.icon} {cat.title}
              </h4>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                {cat.deps.map((dep) => (
                  <div key={dep.name} className="flex items-center justify-between py-0.5">
                    <span className="truncate text-[11px] text-gray-400">{dep.name}</span>
                    <span className="ml-2 shrink-0 text-[10px] text-gray-600">{dep.license}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
