/**
 * ProtocolDetailPage — Detail view for a single protocol.
 *
 * Tabs:
 *   1. FSM  — Interactive state machine viewer (FsmViewer)
 *   2. Runs — List of protocol runs with RunTreeView side panel
 *   3. Gantt — Timeline visualization of runs
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, RefreshCw, Network, Play, BarChart3, X } from 'lucide-react'

import { protocolApi } from '@/services'
import { FsmViewer } from '@/components/protocols/FsmViewer'
import { RunTreeView } from '@/components/protocols/RunTreeView'
import { RunStatusBadge } from '@/components/protocols/RunStatusBadge'
import { GanttTimeline } from '@/components/protocols/GanttTimeline'
import type { GanttRun } from '@/components/protocols/GanttTimeline'
import { Spinner, ErrorState, EmptyState, Button } from '@/components/ui'
import { ProtocolRunWidget } from '@/components/particles/widgets'
import { useFeedbackVizData } from '@/hooks/useVizData'
import { useWorkspaceSlug } from '@/hooks'
import { workspacePath } from '@/utils/paths'
import type { Protocol, ProtocolRun, ProtocolStatus } from '@/types/protocol'

// ---------------------------------------------------------------------------
// Status badge for the protocol itself
// ---------------------------------------------------------------------------

const protocolStatusConfig: Record<ProtocolStatus, { label: string; bg: string; text: string }> = {
  draft:    { label: 'Draft',    bg: 'bg-white/[0.08]',  text: 'text-gray-300' },
  active:   { label: 'Active',   bg: 'bg-green-500/15',  text: 'text-green-400' },
  archived: { label: 'Archived', bg: 'bg-white/[0.06]',  text: 'text-gray-500' },
}

function ProtocolStatusBadge({ status }: { status?: ProtocolStatus }) {
  const cfg = protocolStatusConfig[status ?? 'active'] ?? protocolStatusConfig.active
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Tab types
// ---------------------------------------------------------------------------

type Tab = 'fsm' | 'runs' | 'gantt'

const tabs: { value: Tab; label: string; icon: typeof Network }[] = [
  { value: 'fsm', label: 'FSM', icon: Network },
  { value: 'runs', label: 'Runs', icon: Play },
  { value: 'gantt', label: 'Gantt', icon: BarChart3 },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProtocolDetailPage() {
  const { protocolId } = useParams<{ protocolId: string }>()
  const wsSlug = useWorkspaceSlug()

  const [protocol, setProtocol] = useState<Protocol | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [activeTab, setActiveTab] = useState<Tab>('fsm')

  // FSM highlight state (set by spiral marker click)
  const [highlightedStateId, setHighlightedStateId] = useState<string | null>(null)

  // Runs tab state
  const [runs, setRuns] = useState<ProtocolRun[]>([])
  const [runsLoading, setRunsLoading] = useState(false)
  const [runsError, setRunsError] = useState<string | null>(null)
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)

  // ── Fetch protocol ───────────────────────────────────────────────────
  const fetchProtocol = useCallback(async () => {
    if (!protocolId) return
    setLoading(true)
    setError(null)
    try {
      const data = await protocolApi.getProtocol(protocolId)
      setProtocol(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load protocol')
    } finally {
      setLoading(false)
    }
  }, [protocolId])

  useEffect(() => {
    fetchProtocol()
  }, [fetchProtocol])

  // ── Fetch runs (when Runs or Gantt tab is active) ────────────────────
  const fetchRuns = useCallback(async () => {
    if (!protocolId) return
    setRunsLoading(true)
    setRunsError(null)
    try {
      const res = await protocolApi.listRuns(protocolId, { limit: 100 })
      setRuns(res.items)
    } catch (err) {
      setRunsError(err instanceof Error ? err.message : 'Failed to load runs')
    } finally {
      setRunsLoading(false)
    }
  }, [protocolId])

  useEffect(() => {
    if (activeTab === 'runs' || activeTab === 'gantt') {
      fetchRuns()
    }
  }, [activeTab, fetchRuns])

  // ── Map runs to Gantt format ─────────────────────────────────────────
  const ganttRuns: GanttRun[] = useMemo(
    () =>
      runs.map((run) => ({
        id: run.id,
        protocol_name: run.protocol_name ?? protocol?.name ?? 'Unknown',
        status: run.status,
        started_at: run.started_at,
        finished_at: run.completed_at ?? null,
      })),
    [runs, protocol],
  )

  // ── Loading / Error states ───────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner size="lg" />
      </div>
    )
  }

  if (error || !protocol) {
    return (
      <div className="pt-6">
        <BackLink wsSlug={wsSlug} />
        <ErrorState
          title="Failed to load protocol"
          description={error ?? 'Protocol not found'}
          onRetry={fetchProtocol}
        />
      </div>
    )
  }

  return (
    <div className="pt-6">
      {/* Back link */}
      <BackLink wsSlug={wsSlug} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1
              className="font-bold tracking-tight text-gray-100"
              style={{ fontSize: 'var(--fluid-3xl)' }}
            >
              {protocol.name}
            </h1>
            <ProtocolStatusBadge status={protocol.status} />
          </div>
          {protocol.description && (
            <p className="text-gray-400 mt-1 max-w-2xl">{protocol.description}</p>
          )}
          <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
            <span>{(protocol.states ?? []).length} states</span>
            <span>{(protocol.transitions ?? []).length} transitions</span>
            {(protocol.tags ?? []).length > 0 && (
              <span>{protocol.tags!.join(', ')}</span>
            )}
          </div>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex items-center gap-1 mb-6 border-b border-white/[0.06]">
        {tabs.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={`px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 ${
                activeTab === tab.value
                  ? 'border-indigo-500 text-white'
                  : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              <Icon className="w-4 h-4 inline-block mr-1.5 -mt-0.5" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'fsm' && (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden" style={{ height: '70vh' }}>
          <FsmViewer protocol={protocol} highlightedStateId={highlightedStateId} />
        </div>
      )}

      {activeTab === 'runs' && (
        <RunsTab
          runs={runs}
          loading={runsLoading}
          error={runsError}
          selectedRunId={selectedRunId}
          onSelectRun={setSelectedRunId}
          onRefresh={fetchRuns}
          onNavigateToFsmState={(stateId) => {
            setHighlightedStateId(stateId)
            setActiveTab('fsm')
          }}
        />
      )}

      {activeTab === 'gantt' && (
        <GanttTab
          runs={ganttRuns}
          loading={runsLoading}
          error={runsError}
          onRefresh={fetchRuns}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// BackLink
// ---------------------------------------------------------------------------

function BackLink({ wsSlug }: { wsSlug: string }) {
  return (
    <Link
      to={workspacePath(wsSlug, '/protocols')}
      className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors mb-4"
    >
      <ArrowLeft className="w-4 h-4" />
      Back to Protocols
    </Link>
  )
}

// ---------------------------------------------------------------------------
// RunsTab
// ---------------------------------------------------------------------------

interface RunsTabProps {
  runs: ProtocolRun[]
  loading: boolean
  error: string | null
  selectedRunId: string | null
  onSelectRun: (id: string | null) => void
  onRefresh: () => void
  /** Navigate to FSM tab and highlight a specific state */
  onNavigateToFsmState?: (stateId: string) => void
}

function RunsTab({ runs, loading, error, selectedRunId, onSelectRun, onRefresh, onNavigateToFsmState }: RunsTabProps) {
  const feedbackViz = useFeedbackVizData(selectedRunId ?? undefined)

  if (error) {
    return <ErrorState title="Failed to load runs" description={error} onRetry={onRefresh} />
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner size="md" />
      </div>
    )
  }

  if (runs.length === 0) {
    return (
      <EmptyState
        title="No runs yet"
        description="Start a protocol run to see execution history here."
      />
    )
  }

  return (
    <div className="flex gap-4">
      {/* Run list */}
      <div className={`space-y-2 ${selectedRunId ? 'w-1/2' : 'w-full'} transition-all`}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-gray-400">{runs.length} run{runs.length !== 1 ? 's' : ''}</span>
          <Button variant="secondary" size="sm" onClick={onRefresh}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            Refresh
          </Button>
        </div>
        {runs.map((run) => (
          <button
            key={run.id}
            onClick={() => onSelectRun(run.id === selectedRunId ? null : run.id)}
            className={`w-full text-left p-3 rounded-lg border transition-colors ${
              run.id === selectedRunId
                ? 'border-indigo-500/40 bg-indigo-500/[0.05]'
                : 'border-white/[0.06] bg-white/[0.02] hover:border-white/10'
            }`}
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-sm font-medium text-gray-200 truncate">
                {run.protocol_name ?? 'Run'}
              </span>
              <RunStatusBadge status={run.status} />
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span className="font-mono">{run.id.slice(0, 8)}</span>
              {(run.current_state_name || run.states_visited?.slice(-1)[0]?.state_name) && (
                <span className="text-gray-400">
                  {run.current_state_name ?? run.states_visited?.slice(-1)[0]?.state_name}
                </span>
              )}
              <span className="ml-auto">
                {new Date(run.started_at).toLocaleDateString()}
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* Side panel: Run tree */}
      {selectedRunId && (
        <div className="w-1/2 space-y-4">
          <div className="border border-white/[0.06] rounded-xl bg-white/[0.02] p-3 relative">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-200">Run Tree</h3>
              <button
                onClick={() => onSelectRun(null)}
                className="p-1 rounded hover:bg-white/[0.06] text-gray-400 hover:text-gray-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <RunTreeView rootRunId={selectedRunId} />
          </div>
          {feedbackViz.data && (
            <ProtocolRunWidget
              data={feedbackViz.data}
              height={200}
              className="rounded-lg"
              interactive
              onMarkerClick={(info) => {
                const stateId = info.metadata?.state_id as string | undefined
                if (stateId && onNavigateToFsmState) {
                  onNavigateToFsmState(stateId)
                }
              }}
            />
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// GanttTab
// ---------------------------------------------------------------------------

interface GanttTabProps {
  runs: GanttRun[]
  loading: boolean
  error: string | null
  onRefresh: () => void
}

function GanttTab({ runs, loading, error, onRefresh }: GanttTabProps) {
  if (error) {
    return <ErrorState title="Failed to load runs" description={error} onRetry={onRefresh} />
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner size="md" />
      </div>
    )
  }

  if (runs.length === 0) {
    return (
      <EmptyState
        title="No timeline data"
        description="Start protocol runs to visualize them on a Gantt timeline."
      />
    )
  }

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <GanttTimeline runs={runs} />
    </div>
  )
}
