/**
 * DiscussionNodeRow — a single node in the discussion tree.
 *
 * Shows title, status icon, cost, duration, message count.
 * Expandable/collapsible if it has children.
 * Clickable to select and view the inline conversation.
 */

import { useState } from 'react'
import {
  ChevronRight,
  ChevronDown,
  MessageSquare,
  Clock,
  DollarSign,
  Circle,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react'
import type { DiscussionNode } from '@/services/discussions'

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

const statusConfig: Record<
  DiscussionNode['status'],
  { icon: typeof Circle; color: string; dotClass: string; label: string }
> = {
  streaming: {
    icon: Loader2,
    color: 'text-blue-400',
    dotClass: 'bg-blue-400 animate-pulse',
    label: 'Streaming',
  },
  completed: {
    icon: CheckCircle2,
    color: 'text-green-400',
    dotClass: 'bg-green-400',
    label: 'Completed',
  },
  failed: {
    icon: XCircle,
    color: 'text-red-400',
    dotClass: 'bg-red-400',
    label: 'Failed',
  },
  idle: {
    icon: Circle,
    color: 'text-gray-500',
    dotClass: 'bg-gray-500',
    label: 'Idle',
  },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(secs: number): string {
  if (secs < 60) return `${Math.round(secs)}s`
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}m${s > 0 ? ` ${s}s` : ''}`
}

function formatCost(usd: number): string {
  if (usd === 0) return '$0.00'
  if (usd < 0.01) return `$${usd.toFixed(4)}`
  return `$${usd.toFixed(2)}`
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface DiscussionNodeRowProps {
  node: DiscussionNode
  depth: number
  selectedSessionId: string | null
  onSelectNode: (sessionId: string) => void
}

export function DiscussionNodeRow({
  node,
  depth,
  selectedSessionId,
  onSelectNode,
}: DiscussionNodeRowProps) {
  const [expanded, setExpanded] = useState(true)
  const children = node.children ?? []
  const hasChildren = children.length > 0
  const isSelected = selectedSessionId === node.session_id
  const cfg = statusConfig[node.status] ?? statusConfig.idle
  const StatusIcon = cfg.icon

  const title = node.title || node.metadata?.task_id || 'Untitled session'

  return (
    <div>
      {/* Node row */}
      <div
        className={`
          group flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer
          transition-colors duration-150
          ${isSelected
            ? 'bg-indigo-500/[0.08] border border-indigo-500/30'
            : 'hover:bg-white/[0.04] border border-transparent'
          }
        `}
        style={{ paddingLeft: `${12 + depth * 20}px` }}
        onClick={() => onSelectNode(node.session_id)}
      >
        {/* Expand/collapse toggle */}
        <button
          className={`p-0.5 rounded transition-colors flex-shrink-0 ${
            hasChildren
              ? 'text-gray-500 hover:text-gray-300 cursor-pointer'
              : 'text-transparent pointer-events-none'
          }`}
          onClick={(e) => {
            e.stopPropagation()
            if (hasChildren) setExpanded(!expanded)
          }}
          tabIndex={hasChildren ? 0 : -1}
        >
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
        </button>

        {/* Status icon */}
        <StatusIcon
          className={`w-4 h-4 flex-shrink-0 ${cfg.color} ${
            node.status === 'streaming' ? 'animate-spin' : ''
          }`}
        />

        {/* Title */}
        <span
          className={`text-sm truncate flex-1 min-w-0 ${
            isSelected ? 'text-gray-100 font-medium' : 'text-gray-300'
          }`}
          title={title}
        >
          {title}
        </span>

        {/* Metrics (visible on hover or when selected) */}
        <div
          className={`flex items-center gap-3 flex-shrink-0 text-[11px] text-gray-500 transition-opacity ${
            isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
        >
          <span className="flex items-center gap-1">
            <MessageSquare className="w-3 h-3" />
            {node.message_count}
          </span>
          <span className="flex items-center gap-1 font-mono tabular-nums">
            <Clock className="w-3 h-3" />
            {formatDuration(node.duration_secs)}
          </span>
          <span className="flex items-center gap-1 font-mono tabular-nums">
            <DollarSign className="w-3 h-3" />
            {formatCost(node.cost_usd)}
          </span>
        </div>
      </div>

      {/* Children */}
      {hasChildren && expanded && (
        <div>
          {children.map((child) => (
            <DiscussionNodeRow
              key={child.session_id}
              node={child}
              depth={depth + 1}
              selectedSessionId={selectedSessionId}
              onSelectNode={onSelectNode}
            />
          ))}
        </div>
      )}
    </div>
  )
}
