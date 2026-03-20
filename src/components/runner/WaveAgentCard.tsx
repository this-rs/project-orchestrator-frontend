/**
 * WaveAgentCard — compact card for a single agent within a wave section.
 *
 * Shows agent status, metrics (elapsed time, cost), conversation toggle,
 * retry button for failed agents, and expandable execution details.
 */

import { useState, useMemo } from 'react'
import {
  Clock,
  DollarSign,
  ChevronDown,
  Eye,
  RotateCcw,
  FileCode2,
  GitCommitHorizontal,
  Wrench,
} from 'lucide-react'
import { PulseIndicator } from '@/components/ui'
import type { ActiveAgentSnapshot } from '@/services/runner'
import type { AgentExecution } from '@/types'
import { formatElapsed, formatCost, agentStatusConfig } from './shared'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface WaveAgentCardProps {
  agent: ActiveAgentSnapshot
  execution?: AgentExecution
  isSelected: boolean
  onToggleConversation: (sessionId: string, taskTitle: string) => void
  onRetryTask?: (taskId: string, taskTitle: string) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WaveAgentCard({
  agent,
  execution,
  isSelected,
  onToggleConversation,
  onRetryTask,
}: WaveAgentCardProps) {
  const cfg = agentStatusConfig[agent.status] ?? agentStatusConfig.running
  const [detailOpen, setDetailOpen] = useState(false)
  const isLive = agent.status === 'running' || agent.status === 'spawning' || agent.status === 'verifying'

  const tools = useMemo(() => {
    if (!execution?.tools_used) return []
    try {
      const parsed = JSON.parse(execution.tools_used)
      return Array.isArray(parsed) ? parsed.map(String) : []
    } catch { return [] }
  }, [execution?.tools_used])

  return (
    <div
      className={`
        rounded-lg border p-3 transition-all duration-200
        ${isSelected
          ? 'border-indigo-500/40 bg-indigo-500/[0.06] shadow-[0_0_12px_rgba(99,102,241,0.1)]'
          : 'border-border-subtle bg-white/[0.04] hover:bg-white/[0.06] hover:border-border-default'
        }
      `}
    >
      {/* Header: title + status */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className="text-sm font-medium text-gray-200 leading-snug line-clamp-2 flex-1 min-w-0">
          {agent.task_title}
        </h4>
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${cfg.bg} ${cfg.text}`}>
          {isLive && <PulseIndicator variant="active" size={6} />}
          {!isLive && <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />}
          {cfg.label}
        </span>
      </div>

      {/* Metrics */}
      <div className="flex items-center gap-4 text-xs text-gray-500 mb-2">
        <span className="inline-flex items-center gap-1">
          <Clock className="w-3 h-3" />
          <span className="font-mono tabular-nums">{formatElapsed(agent.elapsed_secs)}</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <DollarSign className="w-3 h-3" />
          <span className="font-mono tabular-nums">{formatCost(agent.cost_usd)}</span>
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {agent.session_id && (
          <button
            onClick={() => onToggleConversation(agent.session_id!, agent.task_title)}
            className={`
              flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium
              transition-colors cursor-pointer
              ${isSelected
                ? 'bg-indigo-500/20 text-indigo-300'
                : 'bg-white/[0.06] text-gray-400 hover:bg-white/[0.1] hover:text-gray-200'
              }
            `}
          >
            <Eye className="w-3.5 h-3.5" />
            {isSelected ? 'Viewing' : 'Conversation'}
            {isLive && !isSelected && (
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            )}
          </button>
        )}
        {agent.status === 'failed' && onRetryTask && (
          <button
            onClick={() => onRetryTask(agent.task_id, agent.task_title)}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-colors cursor-pointer"
            title="Retry this task"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Retry
          </button>
        )}
        {execution && (
          <button
            onClick={() => setDetailOpen(!detailOpen)}
            className="flex items-center justify-center p-1.5 rounded-md text-xs text-gray-500 bg-white/[0.06] hover:bg-white/[0.1] hover:text-gray-300 transition-colors cursor-pointer"
            title={detailOpen ? 'Hide details' : 'Show details'}
          >
            {detailOpen ? <ChevronDown className="w-3.5 h-3.5 rotate-180" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>

      {/* Expandable execution detail */}
      {detailOpen && execution && (
        <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-2">
          {execution.files_modified.length > 0 && (
            <div className="space-y-1">
              <h5 className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Files modified</h5>
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
          {execution.commits.length > 0 && (
            <div className="space-y-1">
              <h5 className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Commits</h5>
              <ul className="space-y-0.5">
                {execution.commits.map((sha) => (
                  <li key={sha} className="flex items-center gap-1.5 text-xs text-gray-400">
                    <GitCommitHorizontal className="w-3 h-3 text-gray-500 shrink-0" />
                    <span className="font-mono">{sha.slice(0, 7)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {tools.length > 0 && (
            <div className="space-y-1">
              <h5 className="text-[10px] font-medium text-gray-500 uppercase tracking-wider flex items-center gap-1">
                <Wrench className="w-3 h-3" /> Tools used
              </h5>
              <div className="flex flex-wrap gap-1">
                {tools.map((tool) => (
                  <span key={tool} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-white/[0.06] text-gray-400">
                    {tool}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
