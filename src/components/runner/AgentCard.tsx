/**
 * AgentCard — displays a single active agent in the runner dashboard.
 *
 * Shows: task title, status badge (color-coded), elapsed time (mm:ss),
 * cost ($X.XX), and a button to open the live conversation panel.
 */

import { useState } from 'react'
import { Eye, ChevronDown, ChevronUp } from 'lucide-react'
import type { ActiveAgentSnapshot, AgentStatus } from '@/services/runner'

// ---------------------------------------------------------------------------
// Status badge config
// ---------------------------------------------------------------------------

const statusConfig: Record<AgentStatus, { label: string; bg: string; text: string; dot: string }> = {
  spawning:   { label: 'Spawning',   bg: 'bg-yellow-500/15', text: 'text-yellow-400', dot: 'bg-yellow-400' },
  running:    { label: 'Running',    bg: 'bg-blue-500/15',   text: 'text-blue-400',   dot: 'bg-blue-400' },
  verifying:  { label: 'Verifying',  bg: 'bg-purple-500/15', text: 'text-purple-400', dot: 'bg-purple-400' },
  completed:  { label: 'Completed',  bg: 'bg-green-500/15',  text: 'text-green-400',  dot: 'bg-green-400' },
  failed:     { label: 'Failed',     bg: 'bg-red-500/15',    text: 'text-red-400',    dot: 'bg-red-400' },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatElapsed(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function formatCost(usd: number): string {
  return `$${usd.toFixed(2)}`
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface AgentCardProps {
  agent: ActiveAgentSnapshot
  /** Whether this card is currently selected (conversation open) */
  isSelected?: boolean
  onViewConversation: (sessionId: string) => void
  /** Optional expandable detail content (e.g. AgentExecutionDetail) */
  detailContent?: React.ReactNode
}

export function AgentCard({ agent, isSelected, onViewConversation, detailContent }: AgentCardProps) {
  const cfg = statusConfig[agent.status] ?? statusConfig.running
  const [detailOpen, setDetailOpen] = useState(false)

  return (
    <div
      className={`
        rounded-lg border p-4 transition-all duration-200
        ${isSelected
          ? 'border-indigo-500/40 bg-indigo-500/[0.06] shadow-[0_0_12px_rgba(99,102,241,0.1)]'
          : 'border-border-subtle bg-white/[0.04] hover:bg-white/[0.06] hover:border-border-default'
        }
      `}
    >
      {/* Header: title + status badge */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <h3 className="text-sm font-medium text-gray-200 leading-snug line-clamp-2 flex-1 min-w-0">
          {agent.task_title}
        </h3>
        <span
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${cfg.bg} ${cfg.text}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
          {cfg.label}
        </span>
      </div>

      {/* Metrics row */}
      <div className="flex items-center gap-4 text-xs text-gray-500 mb-3">
        <span className="font-mono tabular-nums">{formatElapsed(agent.elapsed_secs)}</span>
        <span className="font-mono tabular-nums">{formatCost(agent.cost_usd)}</span>
      </div>

      {/* Actions row */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => agent.session_id && onViewConversation(agent.session_id)}
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
          {isSelected ? 'Viewing' : 'View conversation'}
        </button>
        {detailContent && (
          <button
            onClick={() => setDetailOpen(!detailOpen)}
            className="flex items-center justify-center p-1.5 rounded-md text-xs text-gray-500 bg-white/[0.06] hover:bg-white/[0.1] hover:text-gray-300 transition-colors cursor-pointer"
            title={detailOpen ? 'Hide details' : 'Show details'}
          >
            {detailOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>

      {/* Expandable detail */}
      {detailOpen && detailContent && (
        <div className="mt-3 pt-3 border-t border-white/[0.06]">
          {detailContent}
        </div>
      )}
    </div>
  )
}
