import { useState } from 'react'
import type { ContentBlock } from '@/types'

interface ToolCallBlockProps {
  block: ContentBlock
  resultBlock?: ContentBlock
}

export function ToolCallBlock({ block, resultBlock }: ToolCallBlockProps) {
  const [expanded, setExpanded] = useState(false)
  const toolName = block.metadata?.tool_name as string || block.content
  const toolInput = block.metadata?.tool_input as Record<string, unknown> | undefined
  const isError = resultBlock?.metadata?.is_error as boolean | undefined
  const isLoading = !resultBlock

  return (
    <div className="my-2 rounded-lg bg-white/[0.04] border border-white/[0.06] overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-3 py-2 text-left text-xs hover:bg-white/[0.02] transition-colors"
      >
        <div className={`w-0.5 h-4 rounded-full shrink-0 ${isError ? 'bg-red-400' : isLoading ? 'bg-amber-400 animate-pulse' : 'bg-green-400'}`} />
        <svg
          className={`w-3 h-3 text-gray-500 transition-transform shrink-0 ${expanded ? 'rotate-90' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span className="font-mono text-gray-400 truncate">{toolName}</span>
        {isLoading && (
          <span className="ml-auto text-gray-600 shrink-0">running...</span>
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-2 space-y-2">
          {toolInput && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-gray-600 mb-1">Input</div>
              <pre className="text-xs text-gray-500 bg-black/20 rounded p-2 overflow-x-auto max-h-40 overflow-y-auto">
                {JSON.stringify(toolInput, null, 2)}
              </pre>
            </div>
          )}
          {resultBlock && (
            <div>
              <div className={`text-[10px] uppercase tracking-wider mb-1 ${isError ? 'text-red-400' : 'text-gray-600'}`}>
                {isError ? 'Error' : 'Result'}
              </div>
              <pre className={`text-xs rounded p-2 overflow-x-auto max-h-40 overflow-y-auto ${isError ? 'text-red-400 bg-red-900/10' : 'text-gray-500 bg-black/20'}`}>
                {resultBlock.content.length > 2000
                  ? resultBlock.content.slice(0, 2000) + '\n... (truncated)'
                  : resultBlock.content}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
