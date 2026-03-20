/**
 * WaveAgentCard — card for a single agent within a wave section.
 *
 * 3-zone layout:
 *   Header — task title + Badge status
 *   Body   — spaced metrics (elapsed, cost)
 *   Footer — explicit action buttons with labels (Conversation, Retry, Details)
 */

import { useState, useMemo } from 'react'
import {
  Clock,
  DollarSign,
  ChevronUp,
  Eye,
  EyeOff,
  RotateCcw,
  FileCode2,
  GitCommitHorizontal,
  Wrench,
  List,
} from 'lucide-react'
import { Badge, PulseIndicator } from '@/components/ui'
import type { ActiveAgentSnapshot } from '@/services/runner'
import type { AgentExecution } from '@/types'
import { formatElapsed, formatCost, agentStatusConfig, agentStatusBadgeVariant } from './shared'

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
  const badgeVariant = agentStatusBadgeVariant[agent.status] ?? 'info'
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
        rounded-lg border transition-all duration-200 flex flex-col
        ${isSelected
          ? 'border-indigo-500/40 bg-indigo-500/[0.06] shadow-[0_0_12px_rgba(99,102,241,0.1)]'
          : 'border-border-subtle bg-white/[0.04] hover:bg-white/[0.06] hover:border-border-default'
        }
      `}
    >
      {/* ── Header: title + Badge status ── */}
      <div className="flex items-start justify-between gap-2 px-4 pt-3 pb-2">
        <h4 className="text-sm font-medium text-gray-200 leading-snug line-clamp-2 flex-1 min-w-0">
          {agent.task_title}
        </h4>
        <Badge variant={badgeVariant} className="shrink-0 gap-1.5">
          {isLive && <PulseIndicator variant="active" size={6} />}
          {!isLive && <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />}
          {cfg.label}
        </Badge>
      </div>

      {/* ── Body: spaced metrics ── */}
      <div className="flex items-center gap-6 px-4 py-2 border-t border-white/[0.04]">
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <Clock className="w-3.5 h-3.5 text-gray-500" />
          <span className="font-mono tabular-nums">{formatElapsed(agent.elapsed_secs)}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <DollarSign className="w-3.5 h-3.5 text-gray-500" />
          <span className="font-mono tabular-nums">{formatCost(agent.cost_usd)}</span>
        </div>
      </div>

      {/* ── Footer: explicit action buttons with labels ── */}
      <div className="flex items-center gap-2 px-4 pt-2 pb-3 border-t border-white/[0.04]">
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
            {isSelected ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {isSelected ? 'Hide conversation' : 'View conversation'}
            {isLive && !isSelected && (
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            )}
          </button>
        )}
        {agent.status === 'failed' && onRetryTask && (
          <button
            onClick={() => onRetryTask(agent.task_id, agent.task_title)}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Retry task
          </button>
        )}
        {execution && (
          <button
            onClick={() => setDetailOpen(!detailOpen)}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-gray-500 bg-white/[0.06] hover:bg-white/[0.1] hover:text-gray-300 transition-colors cursor-pointer"
          >
            {detailOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <List className="w-3.5 h-3.5" />}
            {detailOpen ? 'Hide details' : 'View details'}
          </button>
        )}
      </div>

      {/* ── Expandable execution detail ── */}
      {detailOpen && execution && (
        <div className="px-4 pb-3 border-t border-white/[0.06] pt-3 space-y-2">
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
