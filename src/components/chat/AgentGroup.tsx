import { useState, useMemo } from 'react'
import type { ContentBlock } from '@/types'
import { ToolCallBlock } from './ToolCallBlock'
import { ThinkingBlock } from './ThinkingBlock'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { ChevronRight } from 'lucide-react'

// ============================================================================
// Color palette for distinguishing multiple agents
// ============================================================================

const AGENT_COLORS = [
  { border: 'border-l-indigo-400', bg: 'bg-indigo-400', text: 'text-indigo-400' },
  { border: 'border-l-cyan-400', bg: 'bg-cyan-400', text: 'text-cyan-400' },
  { border: 'border-l-amber-400', bg: 'bg-amber-400', text: 'text-amber-400' },
  { border: 'border-l-emerald-400', bg: 'bg-emerald-400', text: 'text-emerald-400' },
  { border: 'border-l-pink-400', bg: 'bg-pink-400', text: 'text-pink-400' },
  { border: 'border-l-violet-400', bg: 'bg-violet-400', text: 'text-violet-400' },
]

/** Simple hash to assign a stable color index to an agent ID */
function hashToColorIndex(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0
  }
  return Math.abs(hash) % AGENT_COLORS.length
}

// ============================================================================
// AgentGroup component
// ============================================================================

interface AgentGroupProps {
  /** The tool_use block that spawned this agent (tool_name = "Task") */
  parentBlock: ContentBlock
  /** All blocks produced by this sub-agent */
  childBlocks: ContentBlock[]
  /** All blocks in the message (for finding tool_results) */
  allBlocks: ContentBlock[]
  /** Whether the overall message is still streaming */
  isStreaming?: boolean
}

export function AgentGroup({ parentBlock, childBlocks, allBlocks, isStreaming }: AgentGroupProps) {
  // Extract agent description from the Task tool input
  const toolInput = (parentBlock.metadata?.tool_input as Record<string, unknown>) ?? {}
  const description = (toolInput.description as string)
    || (toolInput.prompt as string)
    || 'Sub-agent'

  // Extract short description (first line, max 80 chars)
  const shortDescription = useMemo(() => {
    const firstLine = description.split('\n')[0]
    return firstLine.length > 80 ? firstLine.slice(0, 77) + '...' : firstLine
  }, [description])

  // Find the tool_result for the parent Task tool_use (if completed)
  const parentResult = allBlocks.find(
    (b) => b.type === 'tool_result' && b.metadata?.tool_call_id === parentBlock.metadata?.tool_call_id,
  )

  // Separate child blocks by type for rendering
  const childToolBlocks = childBlocks.filter((b) => b.type === 'tool_use')
  const childTextBlocks = childBlocks.filter((b) => b.type === 'text')
  const childThinkingBlocks = childBlocks.filter((b) => b.type === 'thinking')
  const childErrorBlocks = childBlocks.filter((b) => b.type === 'error')

  // Count completed vs running child tools
  const getChildResult = (block: ContentBlock) =>
    childBlocks.find(
      (b) => b.type === 'tool_result' && b.metadata?.tool_call_id === block.metadata?.tool_call_id,
    ) ?? allBlocks.find(
      (b) => b.type === 'tool_result' && b.metadata?.tool_call_id === block.metadata?.tool_call_id,
    )

  const completedToolCount = childToolBlocks.filter((b) => getChildResult(b)).length
  const runningToolCount = childToolBlocks.length - completedToolCount
  const hasErrors = childErrorBlocks.length > 0 || childToolBlocks.some((b) => {
    const result = getChildResult(b)
    return result?.metadata?.is_error
  })

  const agentDone = !!parentResult
  const agentRunning = !agentDone && isStreaming

  // Auto-expand: show when running, collapse when done
  const [expanded, setExpanded] = useState(!agentDone)

  // Color based on stable hash of the parent tool_call_id
  const toolCallId = (parentBlock.metadata?.tool_call_id as string) ?? ''
  const colorIdx = hashToColorIndex(toolCallId)
  const color = AGENT_COLORS[colorIdx]

  // Agent type from tool input
  const agentType = (toolInput.subagent_type as string) || (toolInput.type as string) || null

  return (
    <div className={`my-2 rounded-lg border-l-2 ${color.border} bg-white/[0.02] overflow-hidden`}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-3 py-2 text-left text-xs hover:bg-white/[0.02] transition-colors"
      >
        {/* Status indicator */}
        <div
          className={`w-1 h-5 rounded-full shrink-0 ${
            hasErrors
              ? 'bg-red-400'
              : agentRunning
                ? 'bg-amber-400 animate-pulse'
                : 'bg-green-400'
          }`}
        />

        {/* Chevron */}
        <ChevronRight className={`w-3 h-3 text-gray-500 transition-transform shrink-0 ${expanded ? 'rotate-90' : ''}`} />

        {/* Robot icon */}
        <span className={`shrink-0 text-sm ${color.text}`}>
          &#x1F916;
        </span>

        {/* Agent type badge */}
        {agentType && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-white/[0.06] text-gray-500 uppercase tracking-wider shrink-0">
            {agentType}
          </span>
        )}

        {/* Description */}
        <span className="text-gray-400 truncate">{shortDescription}</span>

        {/* Counters */}
        <span className="ml-auto text-gray-600 shrink-0 text-[11px] tabular-nums">
          {childToolBlocks.length > 0 && (
            <>
              {childToolBlocks.length} tool{childToolBlocks.length !== 1 ? 's' : ''}
              {runningToolCount > 0 && (
                <span className="text-amber-400/70 ml-1">{runningToolCount} running</span>
              )}
            </>
          )}
        </span>
      </button>

      {/* Body */}
      {expanded && (
        <div className="pl-4 pr-2 pb-2 space-y-1">
          {/* Thinking blocks */}
          {childThinkingBlocks.map((block) => (
            <ThinkingBlock key={block.id} content={block.content} isStreaming={false} />
          ))}

          {/* Text blocks (agent output) */}
          {childTextBlocks.map((block) => (
            <div key={block.id} className="chat-markdown prose prose-invert prose-sm max-w-none break-words overflow-x-auto text-gray-300/90 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                {block.content}
              </ReactMarkdown>
            </div>
          ))}

          {/* Tool calls */}
          {childToolBlocks.map((block) => (
            <ToolCallBlock key={block.id} block={block} resultBlock={getChildResult(block)} />
          ))}

          {/* Errors */}
          {childErrorBlocks.map((block) => (
            <div key={block.id} className="px-3 py-2 rounded-lg bg-red-900/10 border border-red-500/20 text-sm text-red-400">
              {block.content}
            </div>
          ))}

          {/* Running indicator when no child blocks yet */}
          {agentRunning && childBlocks.length === 0 && (
            <div className="flex items-center gap-1.5 text-gray-500 text-sm py-1">
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${color.bg} animate-pulse`} />
              <span>Agent running...</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
