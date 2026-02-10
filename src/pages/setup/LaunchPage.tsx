import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAtomValue } from 'jotai'
import { setupConfigAtom } from '@/atoms/setup'

type ServiceStatus = 'pending' | 'checking' | 'ok' | 'error'

interface ServiceCheck {
  name: string
  status: ServiceStatus
  message?: string
}

export function LaunchPage() {
  const config = useAtomValue(setupConfigAtom)
  const navigate = useNavigate()
  const [launching, setLaunching] = useState(false)
  const [, setLaunched] = useState(false)
  const [services, setServices] = useState<ServiceCheck[]>([
    { name: 'Neo4j', status: 'pending' },
    { name: 'MeiliSearch', status: 'pending' },
    { name: 'API Server', status: 'pending' },
  ])

  const updateService = useCallback(
    (name: string, status: ServiceStatus, message?: string) => {
      setServices((prev) =>
        prev.map((s) => (s.name === name ? { ...s, status, message } : s)),
      )
    },
    [],
  )

  const allOk = services.every((s) => s.status === 'ok')

  // Poll health checks once launched
  useEffect(() => {
    if (!launching) return

    const port = config.serverPort || 8080

    const checkHealth = async () => {
      // Check API server (which implies Neo4j + MeiliSearch are connected)
      updateService('API Server', 'checking')
      try {
        const resp = await fetch(`http://localhost:${port}/health`)
        if (resp.ok) {
          updateService('API Server', 'ok')
          updateService('Neo4j', 'ok')
          updateService('MeiliSearch', 'ok')
          setLaunched(true)
          return true
        } else {
          updateService('API Server', 'checking', 'Waiting for server...')
        }
      } catch {
        updateService('API Server', 'checking', 'Waiting for server...')
        updateService('Neo4j', 'checking', 'Waiting...')
        updateService('MeiliSearch', 'checking', 'Waiting...')
      }
      return false
    }

    // Initial check + polling interval
    let intervalId: ReturnType<typeof setInterval> | null = null

    checkHealth().then((ok) => {
      if (!ok) {
        intervalId = setInterval(async () => {
          const done = await checkHealth()
          if (done && intervalId) {
            clearInterval(intervalId)
          }
        }, 2000)
      }
    })

    return () => {
      if (intervalId) clearInterval(intervalId)
    }
  }, [launching, config.serverPort, updateService])

  const handleLaunch = async () => {
    setLaunching(true)

    // In Tauri: invoke('generate_config', { config })
    // For web preview, we just simulate
    updateService('Neo4j', 'checking', 'Starting...')
    updateService('MeiliSearch', 'checking', 'Starting...')
    updateService('API Server', 'checking', 'Starting...')
  }

  const handleOpen = () => {
    navigate('/', { replace: true })
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold">Launch</h2>
        <p className="mt-1 text-sm text-gray-400">
          Review your configuration and start the services.
        </p>
      </div>

      {/* Configuration summary */}
      <div className="space-y-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-6">
        <h3 className="text-sm font-medium text-gray-300">Configuration Summary</h3>

        <SummaryRow label="Infrastructure" value={config.infraMode === 'docker' ? 'Docker (automatic)' : 'External servers'} />
        {config.infraMode === 'external' && (
          <>
            <SummaryRow label="Neo4j" value={config.neo4jUri} />
            <SummaryRow label="MeiliSearch" value={config.meilisearchUrl} />
          </>
        )}
        <SummaryRow
          label="Authentication"
          value={
            config.authMode === 'none'
              ? 'Disabled'
              : config.authMode === 'password'
                ? `Password (${config.rootEmail || 'no email set'})`
                : 'OIDC'
          }
        />
        <SummaryRow label="API Port" value={String(config.serverPort)} />
        <SummaryRow label="Chat Model" value={config.chatModel} />
        <SummaryRow label="Max Sessions" value={String(config.chatMaxSessions)} />
      </div>

      {/* Service health checks */}
      {launching && (
        <div className="space-y-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-6">
          <h3 className="text-sm font-medium text-gray-300">Service Status</h3>
          <div className="space-y-2">
            {services.map((svc) => (
              <div key={svc.name} className="flex items-center justify-between rounded-lg bg-white/[0.02] px-4 py-3">
                <span className="text-sm text-gray-300">{svc.name}</span>
                <div className="flex items-center gap-2">
                  {svc.message && (
                    <span className="text-xs text-gray-500">{svc.message}</span>
                  )}
                  <StatusIndicator status={svc.status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex justify-center">
        {!launching ? (
          <button
            onClick={handleLaunch}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-8 py-3 text-sm font-medium text-white transition hover:bg-indigo-500"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
            </svg>
            Generate Config &amp; Start
          </button>
        ) : allOk ? (
          <button
            onClick={handleOpen}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 px-8 py-3 text-sm font-medium text-white transition hover:bg-emerald-500"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Open Application
          </button>
        ) : (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Starting services...
          </div>
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

function StatusIndicator({ status }: { status: ServiceStatus }) {
  switch (status) {
    case 'ok':
      return (
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </span>
      )
    case 'error':
      return (
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500/20 text-red-400">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </span>
      )
    case 'checking':
      return (
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/20 text-amber-400">
          <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </span>
      )
    default:
      return (
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/[0.06] text-gray-600">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" />
          </svg>
        </span>
      )
  }
}
