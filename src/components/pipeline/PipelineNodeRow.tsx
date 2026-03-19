import { useState } from 'react'
import {
  ChevronRight,
  Layers,
  Bot,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  SkipForward,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PipelineNodeType = 'wave' | 'agent' | 'gate'
export type PipelineNodeStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'timeout'

export interface PipelineNode {
  id: string
  type: PipelineNodeType
  label: string
  status: PipelineNodeStatus
  durationMs?: number
  children?: PipelineNode[]
  metadata?: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const typeIcons: Record<PipelineNodeType, typeof Layers> = {
  wave: Layers,
  agent: Bot,
  gate: ShieldCheck,
}

const statusConfig: Record<PipelineNodeStatus, { icon: typeof CheckCircle2; color: string; bgColor: string }> = {
  pending: { icon: Clock, color: 'text-gray-500', bgColor: 'bg-white/[0.06]' },
  running: { icon: Loader2, color: 'text-blue-400', bgColor: 'bg-blue-500/10' },
  completed: { icon: CheckCircle2, color: 'text-green-400', bgColor: 'bg-green-500/10' },
  failed: { icon: XCircle, color: 'text-red-400', bgColor: 'bg-red-500/10' },
  skipped: { icon: SkipForward, color: 'text-yellow-400', bgColor: 'bg-yellow-500/10' },
  timeout: { icon: Clock, color: 'text-orange-400', bgColor: 'bg-orange-500/10' },
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const secs = ms / 1000
  if (secs < 60) return `${secs.toFixed(1)}s`
  const mins = Math.floor(secs / 60)
  const remSecs = Math.round(secs % 60)
  return `${mins}m ${remSecs}s`
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface PipelineNodeRowProps {
  node: PipelineNode
  depth?: number
  defaultExpanded?: boolean
}

/**
 * Recursive tree node with icon per type, status indicator, and duration.
 */
export function PipelineNodeRow({ node, depth = 0, defaultExpanded = true }: PipelineNodeRowProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const hasChildren = (node.children?.length ?? 0) > 0

  const TypeIcon = typeIcons[node.type]
  const statusCfg = statusConfig[node.status]
  const StatusIcon = statusCfg.icon

  return (
    <div>
      <button
        onClick={() => hasChildren && setExpanded(!expanded)}
        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${statusCfg.bgColor} hover:bg-white/[0.08]`}
        style={{ paddingLeft: `${12 + depth * 20}px` }}
        disabled={!hasChildren}
      >
        {/* Expand chevron */}
        <span className="w-4 h-4 flex-shrink-0">
          {hasChildren ? (
            <ChevronRight
              className={`w-4 h-4 text-gray-500 transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}
            />
          ) : (
            <span className="w-4" />
          )}
        </span>

        {/* Type icon */}
        <TypeIcon className={`w-4 h-4 flex-shrink-0 ${statusCfg.color}`} />

        {/* Label */}
        <span className="flex-1 text-left text-sm text-gray-200 truncate">{node.label}</span>

        {/* Duration */}
        {node.durationMs !== undefined && node.durationMs > 0 && (
          <span className="text-xs text-gray-500 flex-shrink-0">
            {formatDuration(node.durationMs)}
          </span>
        )}

        {/* Status icon */}
        <StatusIcon
          className={`w-4 h-4 flex-shrink-0 ${statusCfg.color} ${node.status === 'running' ? 'animate-spin' : ''}`}
        />
      </button>

      {/* Children (recursive) */}
      {expanded && hasChildren && (
        <div className="space-y-0.5 mt-0.5">
          {node.children!.map((child) => (
            <PipelineNodeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              defaultExpanded={defaultExpanded}
            />
          ))}
        </div>
      )}
    </div>
  )
}
