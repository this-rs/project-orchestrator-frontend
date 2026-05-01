import { useState } from 'react'
import type { ContentBlock } from '@/types'
import { chatApi } from '@/services'
import { ToolContent, getToolSummary, getToolIcon } from './tools'
import { useElapsedMs, formatDurationShort } from './useElapsedMs'
import { useChatSessionId } from './ChatSessionContext'
import { ChevronRight, Square } from 'lucide-react'

const MCP_PREFIX = 'mcp__project-orchestrator__'

/** Map an MCP action verb to a micro-badge color class, or null for read-only */
function getMcpBadgeColor(toolName: string, toolInput?: Record<string, unknown>): string | null {
  // Use toolInput.action (mega-tool sub-action) for better classification
  const subAction = typeof toolInput?.action === 'string' ? toolInput.action : undefined
  const action = subAction ?? (toolName.startsWith(MCP_PREFIX)
    ? toolName.slice(MCP_PREFIX.length)
    : toolName)
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
  const [stopRequested, setStopRequested] = useState(false)
  const sessionId = useChatSessionId()
  const toolName = block.metadata?.tool_name as string || block.content
  const toolInput = (block.metadata?.tool_input as Record<string, unknown>) ?? {}
  const isError = resultBlock?.metadata?.is_error as boolean | undefined
  const isCancelled = resultBlock?.metadata?.is_cancelled as boolean | undefined
  const isLoading = !resultBlock
  const durationMs = resultBlock?.metadata?.duration_ms as number | undefined
  const createdAt = block.metadata?.created_at as string | undefined
  const elapsedMs = useElapsedMs(createdAt, isLoading)

  const icon = getToolIcon(toolName, toolInput)
  const summary = getToolSummary(toolName, toolInput)
  const headerText = summary || toolName

  // Plan 5985a7c4 (F5+F6): when this tool_use is a Monitor / Bash bg
  // (long-running subprocess), every BackgroundOutput event whose
  // `correlation_id` matches our `tool_call_id` is appended by
  // `chatAssembly.ts` to `block.metadata.child_outputs`. Render them
  // as a sticky sub-list below the header so users can see live
  // activity without expanding the tool details.
  const childOutputs =
    (block.metadata?.child_outputs as
      | Array<{ source: string; content: string; received_at: string }>
      | undefined) ?? []
  const hasChildOutputs = childOutputs.length > 0

  const isMcp = toolName.startsWith(MCP_PREFIX) || typeof toolInput.action === 'string'
  const badgeColor = isMcp ? getMcpBadgeColor(toolName, toolInput) : null

  // Plan 28e9afe3 — Stop button visible only on running tools (no
  // result yet, not already cancelled). Clicking calls
  // POST /api/chat/sessions/{id}/cancel-tools which sends SIGINT to
  // the CLI's descendant process(es). The agent receives a cancelled
  // tool_result and continues its turn (does NOT end it).
  const canStop = isLoading && !isCancelled && sessionId !== null && !stopRequested
  const handleStop = async (e: React.MouseEvent) => {
    // Don't toggle the expansion when clicking the Stop chip.
    e.stopPropagation()
    if (!sessionId) return
    setStopRequested(true)
    try {
      const result = await chatApi.cancelTools(sessionId)
      if (result.capped) {
        // Re-enable so the user can retry once the cap window clears.
        // 6s ≈ 10 retries spread over the 60s cap window.
        setTimeout(() => setStopRequested(false), 6000)
      }
      // Otherwise stays disabled — the cancelled ToolResult arriving
      // on the broadcast will switch isLoading→false and the button
      // will disappear naturally.
    } catch {
      // Network/404 — re-enable after a beat so the user can retry.
      setTimeout(() => setStopRequested(false), 2000)
    }
  }

  return (
    <div className="my-2 rounded-lg bg-white/[0.04] border border-white/[0.06] overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-3 py-2 text-left text-xs hover:bg-white/[0.02] transition-colors"
      >
        <div className={`w-0.5 h-4 rounded-full shrink-0 ${isError ? 'bg-red-400' : isCancelled ? 'bg-gray-400' : isLoading ? 'bg-amber-400 animate-pulse' : 'bg-green-400'}`} />
        <ChevronRight className={`w-3 h-3 text-gray-500 transition-transform shrink-0 ${expanded ? 'rotate-90' : ''}`} />
        {icon && (
          <span className="font-mono text-gray-600 shrink-0 text-[10px]">{icon}</span>
        )}
        {badgeColor && (
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${badgeColor}`} />
        )}
        <span className="font-mono text-gray-400 truncate">{headerText}</span>
        {isCancelled ? (
          <span className="ml-auto text-gray-500 shrink-0">cancelled</span>
        ) : isLoading ? (
          <span className="ml-auto text-gray-600 shrink-0">
            {elapsedMs != null ? `${formatDurationShort(elapsedMs)} — ` : ''}running...
          </span>
        ) : durationMs != null ? (
          <span className="ml-auto text-gray-600 shrink-0">
            {formatDurationShort(durationMs)}
          </span>
        ) : null}
        {canStop && (
          <span
            role="button"
            tabIndex={0}
            onClick={handleStop}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                handleStop(e as unknown as React.MouseEvent)
              }
            }}
            title="Stop this tool (sends SIGINT to the running subprocess; the agent's turn continues)"
            className="ml-2 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-mono text-red-300 bg-red-500/10 hover:bg-red-500/20 transition-colors shrink-0"
          >
            <Square className="w-2.5 h-2.5" />
            stop
          </span>
        )}
        {stopRequested && isLoading && !isCancelled && (
          <span className="ml-2 text-[10px] font-mono text-amber-300 shrink-0">
            stopping…
          </span>
        )}
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

      {/* Live child outputs (Monitor / Bash bg events grouped here by
          correlation_id — F5+F6 of plan 5985a7c4). Always visible
          when present so the user sees ticks roll in without having
          to expand the tool. */}
      {hasChildOutputs && (
        <ul
          className="mx-3 mb-2 mt-1 max-h-40 overflow-y-auto rounded border border-white/[0.04] bg-white/[0.02] divide-y divide-white/[0.04]"
          aria-label={`${childOutputs.length} live event${childOutputs.length > 1 ? 's' : ''} from ${toolName}`}
        >
          {childOutputs.map((out, i) => {
            const localTime = new Date(out.received_at).toLocaleTimeString(undefined, {
              hour12: false,
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })
            return (
              <li
                key={`${out.received_at}-${i}`}
                className="px-2 py-1 flex gap-2 text-[10px] font-mono"
              >
                <span className="text-gray-600 shrink-0">{localTime}</span>
                <span className="text-emerald-400/80 shrink-0">{out.source}</span>
                <span className="text-gray-300 truncate" title={out.content}>
                  {out.content}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
