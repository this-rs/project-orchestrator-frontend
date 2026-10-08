/**
 * AgentExecutionDetail — detailed metrics panel for a single agent execution.
 *
 * Reusable across DetachedRunsPanel, RunnerDashboard, and DiscussionTreeView.
 * Shows status, duration (live timer if running), cost, files modified,
 * commits, tools used, and a "View Conversation" action.
 */

import { FileCode2, Clock, DollarSign, GitCommitHorizontal, Wrench, Eye, X } from 'lucide-react'
import { Button, ToneText } from '@/components/ui'
import { iconButton, glassFlat } from '@/components/ui/classes'
import { useElapsedTime } from '@/hooks/useElapsedTime'
import { agentStateMeta, finalDurationSecs, runCost } from './shared'
import { CostDisplay } from '@/components/ui/CostDisplay'
import { ExecutionModel } from './ExecutionModel'
import { formatUsd2, hasCost } from '@/utils/cost'
import type { AgentExecution } from '@/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseToolsUsed(toolsJson?: string | null): string[] {
  if (!toolsJson) return []
  try {
    const parsed = JSON.parse(toolsJson)
    if (Array.isArray(parsed)) return parsed.map(String)
    return []
  } catch {
    return []
  }
}

function shortSha(sha: string): string {
  return sha.slice(0, 7)
}

function shortTaskId(taskId: string): string {
  return taskId.slice(0, 8)
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface AgentExecutionDetailProps {
  execution: AgentExecution
  onClose?: () => void
  onViewConversation?: (sessionId: string) => void
}

export function AgentExecutionDetail({
  execution,
  onClose,
  onViewConversation,
}: AgentExecutionDetailProps) {
  const isRunning = execution.status === 'running'
  const meta = agentStateMeta(execution.status)
  const elapsed = useElapsedTime(execution.started_at, isRunning, finalDurationSecs(execution))
  const tools = parseToolsUsed(execution.tools_used)
  const cost = runCost(execution)

  return (
    <div className="rounded-lg border border-border-subtle bg-white/[0.03] p-4 space-y-4">
      {/* Header: status (dot + word) + close button */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <ToneText tone={meta.tone} label={meta.label} pulse={meta.live && isRunning} className="text-xs" />
          <span className="text-xs text-gray-500 truncate max-w-[180px]">
            Task {shortTaskId(execution.task_id)}
          </span>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close" className={`${iconButton('ghost', 'size-9 md:size-8')} ${glassFlat} text-gray-500`}>
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Metrics row */}
      <div className="flex items-center gap-4 text-xs text-gray-400">
        <span className="inline-flex items-center gap-1">
          <Clock className="w-3.5 h-3.5 text-gray-500" />
          <span className="font-mono tabular-nums">{elapsed}</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <DollarSign className="w-3.5 h-3.5 text-gray-500" />
          {hasCost(cost, { format: formatUsd2 }) ? (
            <CostDisplay cost={cost} format={formatUsd2} className="font-mono tabular-nums" />
          ) : (
            // No figure for this execution: said as such, not as $0.00.
            <span className="font-mono tabular-nums" title="Cost unknown">—</span>
          )}
        </span>
      </div>

      <ExecutionModel execution={execution} />

      {/* Files modified */}
      {execution.files_modified.length > 0 && (
        <div className="space-y-1.5">
          <h4 className="text-[11px] font-medium text-gray-500">Files modified</h4>
          <ul className="space-y-0.5">
            {execution.files_modified.map((file) => (
              <li key={file} className="flex items-center gap-1.5 text-xs text-gray-400">
                <FileCode2 className="w-3 h-3 text-gray-500 shrink-0" />
                <span className="truncate font-mono">{file}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Commits */}
      {execution.commits.length > 0 && (
        <div className="space-y-1.5">
          <h4 className="text-[11px] font-medium text-gray-500">Commits</h4>
          <ul className="space-y-0.5">
            {execution.commits.map((sha) => (
              <li key={sha} className="flex items-center gap-1.5 text-xs text-gray-400">
                <GitCommitHorizontal className="w-3 h-3 text-gray-500 shrink-0" />
                <span className="font-mono">{shortSha(sha)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Tools used */}
      {tools.length > 0 && (
        <div className="space-y-1.5">
          <h4 className="text-[11px] font-medium text-gray-500 flex items-center gap-1">
            <Wrench className="w-3 h-3" aria-hidden="true" />
            Tools used
          </h4>
          <div className="flex flex-wrap gap-1">
            {tools.map((tool) => (
              <span
                key={tool}
                className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-white/[0.06] text-gray-400"
              >
                {tool}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Persona profile */}
      {execution.persona_profile && (
        <div className="text-xs text-gray-500 italic truncate">
          Persona: {execution.persona_profile}
        </div>
      )}

      {/* View Conversation button */}
      {execution.session_id && onViewConversation && (
        <Button size="sm" variant="secondary" flat onClick={() => onViewConversation(execution.session_id!)} className="w-full gap-1.5 text-xs">
          <Eye className="w-3.5 h-3.5" aria-hidden="true" />
          View conversation
        </Button>
      )}
    </div>
  )
}
