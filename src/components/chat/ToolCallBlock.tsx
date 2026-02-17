import { useState } from 'react'
import type { ContentBlock } from '@/types'
import { ToolContent, getToolSummary, getToolIcon } from './tools'

const MCP_PREFIX = 'mcp__project-orchestrator__'

/** Map an MCP action verb to a micro-badge color class, or null for read-only */
function getMcpBadgeColor(toolName: string): string | null {
  const action = toolName.startsWith(MCP_PREFIX)
    ? toolName.slice(MCP_PREFIX.length)
    : toolName
  if (/^(create|add)/.test(action)) return 'bg-green-400'
  if (/^update/.test(action)) return 'bg-blue-400'
  if (/^delete/.test(action)) return 'bg-red-400'
  if (/^(search|find|list)/.test(action)) return 'bg-gray-400'
  if (/^link/.test(action)) return 'bg-indigo-400'
  // get = read-only, no dot
  return null
}

interface ToolCallBlockProps {
  block: ContentBlock
  resultBlock?: ContentBlock
}

export function ToolCallBlock({ block, resultBlock }: ToolCallBlockProps) {
  const [expanded, setExpanded] = useState(false)
  const toolName = block.metadata?.tool_name as string || block.content
  const toolInput = (block.metadata?.tool_input as Record<string, unknown>) ?? {}
  const isError = resultBlock?.metadata?.is_error as boolean | undefined
  const isLoading = !resultBlock
  const durationMs = resultBlock?.metadata?.duration_ms as number | undefined

  const icon = getToolIcon(toolName)
  const summary = getToolSummary(toolName, toolInput)
  const headerText = summary || toolName

  const isMcp = toolName.startsWith(MCP_PREFIX)
  const badgeColor = isMcp ? getMcpBadgeColor(toolName) : null

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
        {icon && (
          <span className="font-mono text-gray-600 shrink-0 text-[10px]">{icon}</span>
        )}
        {badgeColor && (
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${badgeColor}`} />
        )}
        <span className="font-mono text-gray-400 truncate">{headerText}</span>
        {isLoading ? (
          <span className="ml-auto text-gray-600 shrink-0">running...</span>
        ) : durationMs != null ? (
          <span className="ml-auto text-gray-600 shrink-0">
            {durationMs < 1000 ? `${Math.round(durationMs)}ms` : `${(durationMs / 1000).toFixed(1)}s`}
          </span>
        ) : null}
      </button>

      {expanded && (
        <div className="px-3 pb-2">
          <ToolContent
            toolName={toolName}
            toolInput={toolInput}
            resultContent={resultBlock?.content}
            isError={isError}
            isLoading={isLoading}
          />
        </div>
      )}
    </div>
  )
}
