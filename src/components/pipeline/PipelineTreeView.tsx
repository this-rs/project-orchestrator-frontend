import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { PipelineProgressHeader } from './PipelineProgressHeader'
import { PipelineNodeRow } from './PipelineNodeRow'
import type { PipelineNode } from './PipelineNodeRow'
import type { ProgressScoreResponse, GateResult } from '@/types/chat'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PipelineTreeViewProps {
  /** Tree of pipeline nodes (waves > agents > gates) */
  nodes: PipelineNode[]
  /** Progress score data from the API */
  progress: ProgressScoreResponse | null
  /** Gate results from the API */
  gates: GateResult[]
  /** Whether data is loading */
  isLoading?: boolean
  className?: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Assembles PipelineProgressHeader + PipelineNodeRow tree.
 * Manages global expand/collapse state.
 */
export function PipelineTreeView({
  nodes,
  progress,
  gates: _gates,
  isLoading = false,
  className = '',
}: PipelineTreeViewProps) {
  const [allExpanded, setAllExpanded] = useState(true)
  // Increment to force re-render of children with new default
  const [expandKey, setExpandKey] = useState(0)

  const toggleAll = () => {
    setAllExpanded(!allExpanded)
    setExpandKey((k) => k + 1)
  }

  if (isLoading) {
    return (
      <div className={`space-y-3 ${className}`}>
        <div className="h-24 bg-white/[0.04] rounded-lg animate-pulse" />
        <div className="h-12 bg-white/[0.04] rounded-lg animate-pulse" />
        <div className="h-12 bg-white/[0.04] rounded-lg animate-pulse" />
      </div>
    )
  }

  if (nodes.length === 0) {
    return (
      <div className={`p-6 text-center text-gray-500 text-sm ${className}`}>
        No pipeline execution data yet.
      </div>
    )
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Progress header */}
      <PipelineProgressHeader progress={progress} />

      {/* Expand/Collapse toggle */}
      <div className="flex items-center justify-between px-1">
        <span className="text-xs text-gray-500 uppercase tracking-wider">Execution Tree</span>
        <button
          onClick={toggleAll}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          {allExpanded ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" />
              Collapse all
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" />
              Expand all
            </>
          )}
        </button>
      </div>

      {/* Tree */}
      <div className="space-y-0.5">
        {nodes.map((node) => (
          <PipelineNodeRow
            key={`${node.id}-${expandKey}`}
            node={node}
            defaultExpanded={allExpanded}
          />
        ))}
      </div>
    </div>
  )
}
