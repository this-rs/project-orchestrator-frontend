import { useState } from 'react'
import type { ContentBlock } from '@/types'
import { ToolCallBlock } from './ToolCallBlock'

interface ToolCallGroupProps {
  toolBlocks: ContentBlock[]
  allBlocks: ContentBlock[]
}

export function ToolCallGroup({ toolBlocks, allBlocks }: ToolCallGroupProps) {
  const [expanded, setExpanded] = useState(false)

  // Find result blocks for each tool
  const getResultBlock = (block: ContentBlock) =>
    allBlocks.find(
      (b) => b.type === 'tool_result' && b.metadata?.tool_call_id === block.metadata?.tool_call_id,
    )

  // Count completed vs running
  const completedCount = toolBlocks.filter((b) => getResultBlock(b)).length
  const runningCount = toolBlocks.length - completedCount
  const hasErrors = toolBlocks.some((b) => {
    const result = getResultBlock(b)
    return result?.metadata?.is_error
  })

  // If only 1 tool, render it directly without grouping
  if (toolBlocks.length === 1) {
    return <ToolCallBlock block={toolBlocks[0]} resultBlock={getResultBlock(toolBlocks[0])} />
  }

  // Get tool names for summary
  const toolNames = toolBlocks.map((b) => (b.metadata?.tool_name as string) || b.content)
  const uniqueTools = [...new Set(toolNames)]
  const summary =
    uniqueTools.length <= 3
      ? uniqueTools.join(', ')
      : `${uniqueTools.slice(0, 2).join(', ')} +${uniqueTools.length - 2} more`

  return (
    <div className="my-2 rounded-lg bg-white/[0.04] border border-white/[0.06] overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-3 py-2 text-left text-xs hover:bg-white/[0.02] transition-colors"
      >
        <div
          className={`w-0.5 h-4 rounded-full shrink-0 ${
            hasErrors
              ? 'bg-red-400'
              : runningCount > 0
                ? 'bg-amber-400 animate-pulse'
                : 'bg-green-400'
          }`}
        />
        <svg
          className={`w-3 h-3 text-gray-500 transition-transform shrink-0 ${expanded ? 'rotate-90' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span className="font-mono text-gray-400">
          {toolBlocks.length} tools
          <span className="text-gray-600 ml-2">({summary})</span>
        </span>
        {runningCount > 0 && (
          <span className="ml-auto text-gray-600 shrink-0">{runningCount} running...</span>
        )}
      </button>

      {expanded && (
        <div className="px-2 pb-2 space-y-1">
          {toolBlocks.map((block) => (
            <ToolCallBlock key={block.id} block={block} resultBlock={getResultBlock(block)} />
          ))}
        </div>
      )}
    </div>
  )
}
