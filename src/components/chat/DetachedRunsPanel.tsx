import { memo, useState, useEffect } from 'react'
import { useAtomValue } from 'jotai'
import { providersAtom } from '@/atoms'
import { describeSessionProvider, shouldShowProviderBadge } from '@/constants/providers'
import { CostDisplay } from '@/components/ui/CostDisplay'
import { ProviderBadge } from './ProviderBadge'
import { costReport, formatUsd2, hasCost } from '@/utils/cost'
import { PulseIndicator } from '@/components/ui'
import { ChevronDown, ChevronUp, Eye, Square, Clock, DollarSign } from 'lucide-react'
import { AgentExecutionDetail } from '@/components/runner/AgentExecutionDetail'
import { chatApi } from '@/services/chat'
import type { AgentExecution } from '@/types'
import type { DetachedRun } from '@/hooks'

interface DetachedRunsPanelProps {
  /** List of detached child runs */
  runs: DetachedRun[]
  /** Whether any run is currently active */
  hasActiveRuns: boolean
  /** Navigate to a child session */
  onViewRun: (sessionId: string) => void
  /** Interrupt a running session */
  onStopRun: (sessionId: string) => void
}

// ---------------------------------------------------------------------------
// Inline hook: fetch agent executions for a run
// ---------------------------------------------------------------------------

function useAgentExecutions(runId: string | undefined) {
  const [executions, setExecutions] = useState<AgentExecution[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!runId) { setExecutions([]); return }
    let cancelled = false
    setLoading(true)
    chatApi.getAgentExecutions(runId)
      .then((data) => { if (!cancelled) setExecutions(data) })
      .catch(() => { if (!cancelled) setExecutions([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [runId])

  return { executions, loading }
}

function formatDuration(startedAt: string): string {
  const start = new Date(startedAt)
  const now = new Date()
  const diffMs = now.getTime() - start.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  if (diffSecs < 60) return `${diffSecs}s`
  const diffMins = Math.floor(diffSecs / 60)
  if (diffMins < 60) return `${diffMins}m`
  const diffHours = Math.floor(diffMins / 60)
  return `${diffHours}h ${diffMins % 60}m`
}

/** Two decimals, and a reported zero is not shown — as this panel always did. */
const RUN_COST_FORMAT = { format: formatUsd2, hideZero: true } as const

/**
 * Collapsible panel showing detached child runs at the top of ChatPanel.
 * Displayed when the current session has spawned sub-sessions (via PlanRunner or sub-agents).
 *
 * Features:
 * - Compact header with run count and pulse indicator
 * - Expandable list with title, status, duration, cost
 * - "View" button to switch to the child session
 * - "Stop" button to interrupt a running child
 */
// ---------------------------------------------------------------------------
// RunRow — single run with expandable agent execution detail
// ---------------------------------------------------------------------------

function RunRow({
  run,
  isExpanded,
  onToggleExpand,
  onViewRun,
  onStopRun,
}: {
  run: DetachedRun
  isExpanded: boolean
  onToggleExpand: () => void
  onViewRun: (sessionId: string) => void
  onStopRun: (sessionId: string) => void
}) {
  const { executions, loading } = useAgentExecutions(isExpanded ? run.runId : undefined)
  const instances = useAtomValue(providersAtom)?.providers ?? null
  const provider = describeSessionProvider({ id: run.providerId }, instances)

  return (
    <div>
      <div
        onClick={run.runId ? onToggleExpand : undefined}
        className={`flex items-center gap-2 px-2 py-1.5 rounded-md bg-white/[0.02] hover:bg-white/[0.04] transition-colors group ${run.runId ? 'cursor-pointer' : ''}`}
      >
        {/* Status indicator */}
        {run.isStreaming ? (
          <PulseIndicator variant="active" size={6} />
        ) : (
          <span className="w-1.5 h-1.5 rounded-full bg-gray-500 shrink-0" />
        )}

        {/* Run info */}
        <div className="flex-1 min-w-0">
          <span className="text-xs text-gray-300 truncate block">
            {run.title}
          </span>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="inline-flex items-center gap-0.5 text-[10px] text-gray-500">
              <Clock className="w-2.5 h-2.5" />
              {formatDuration(run.startedAt)}
            </span>
            {hasCost(costReport(run.costUsd, run.costBasis), RUN_COST_FORMAT) && (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-gray-500">
                <DollarSign className="w-2.5 h-2.5" />
                <CostDisplay cost={costReport(run.costUsd, run.costBasis)} {...RUN_COST_FORMAT} />
              </span>
            )}
            {shouldShowProviderBadge(provider, instances) ? (
              <ProviderBadge description={provider} model={run.model} />
            ) : (
              <span className="text-[10px] text-gray-600 truncate max-w-[60px]">
                {run.model}
              </span>
            )}
          </div>
        </div>

        {/* Expand indicator */}
        {run.runId && (
          isExpanded
            ? <ChevronUp className="w-3 h-3 text-gray-500 shrink-0" />
            : <ChevronDown className="w-3 h-3 text-gray-500 shrink-0" />
        )}

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); onViewRun(run.sessionId) }}
            className="p-1 rounded text-gray-500 hover:text-indigo-400 hover:bg-indigo-500/10 transition-colors"
            title="View run"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
          {run.isStreaming && (
            <button
              onClick={(e) => { e.stopPropagation(); onStopRun(run.sessionId) }}
              className="p-1 rounded text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              title="Stop run"
            >
              <Square className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Expanded: agent execution details */}
      {isExpanded && (
        <div className="pl-5 pr-1 pt-1 pb-2 space-y-2">
          {loading && (
            <div className="flex items-center gap-2 py-2">
              <div className="w-3 h-3 rounded-full border-2 border-gray-600 border-t-gray-400 animate-spin" />
              <span className="text-[10px] text-gray-500">Loading executions...</span>
            </div>
          )}
          {!loading && executions.length === 0 && (
            <span className="text-[10px] text-gray-600 block py-1">No execution details available.</span>
          )}
          {executions.map((exec) => (
            <AgentExecutionDetail
              key={exec.id}
              execution={exec}
              onViewConversation={exec.session_id ? (sid) => onViewRun(sid) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export const DetachedRunsPanel = memo(function DetachedRunsPanel({
  runs,
  hasActiveRuns,
  onViewRun,
  onStopRun,
}: DetachedRunsPanelProps) {
  const [expanded, setExpanded] = useState(false)
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null)

  if (runs.length === 0) return null

  const activeCount = runs.filter(r => r.isStreaming).length
  const completedCount = runs.length - activeCount

  return (
    <div className="border-b border-white/[0.06] bg-amber-500/[0.03]">
      {/* Compact header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-amber-500/[0.04] transition-colors"
      >
        {hasActiveRuns && <PulseIndicator variant="pending" size={6} />}
        <span className="text-xs text-amber-400 font-medium">
          {activeCount > 0
            ? `${activeCount} run${activeCount > 1 ? 's' : ''} in progress`
            : `${completedCount} run${completedCount > 1 ? 's' : ''} completed`}
        </span>
        {completedCount > 0 && activeCount > 0 && (
          <span className="text-[10px] text-gray-500">
            · {completedCount} done
          </span>
        )}
        <div className="flex-1" />
        {expanded ? (
          <ChevronUp className="w-3.5 h-3.5 text-gray-500" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
        )}
      </button>

      {/* Expanded run list */}
      {expanded && (
        <div className="px-2 pb-2 space-y-1 max-h-80 overflow-y-auto">
          {runs.map(run => (
            <RunRow
              key={run.sessionId}
              run={run}
              isExpanded={expandedRunId === run.sessionId}
              onToggleExpand={() => setExpandedRunId(prev => prev === run.sessionId ? null : run.sessionId)}
              onViewRun={onViewRun}
              onStopRun={onStopRun}
            />
          ))}
        </div>
      )}
    </div>
  )
})
