import { useState } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
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
      </div>

      {/* Success message */}
      {phase === 'generated' && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-6">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
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
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
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
            <svg className="h-5 w-5 animate-spin text-indigo-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
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
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
            </svg>
            Generate Config &amp; Save
          </button>
        )}

        {phase === 'generating' && (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Generating configuration...
          </div>
        )}

        {phase === 'generated' && isTauri && (
          <button
            onClick={handleRestart}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 px-8 py-3 text-sm font-medium text-white transition hover:bg-emerald-500"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182M2.985 19.644l3.181-3.183" />
            </svg>
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
