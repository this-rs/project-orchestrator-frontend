import { useMemo, useState } from 'react'
import { useAtomValue } from 'jotai'
import { chatBackgroundTasksAtom } from '@/atoms'
import { buildActivityFromToolCall } from '@/utils/backgroundActivity'
import { ActivityCard } from './BackgroundActivityCard'
import type { ContentBlock } from '@/types'
import { ToolContent, getToolSummary, getToolIcon } from './tools'
import { useElapsedMs, formatDurationShort } from './useElapsedMs'
import { useBlockProviderKind } from './useBlockProviderKind'
import { ChevronRight } from 'lucide-react'
import { useT } from '@/i18n'
import { ToolEngineMissingNote } from './ToolEngineMissingNote'
import { isEngineNotInstalled } from '@/utils/toolEngineMissing'

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
  const { t } = useT()
  const toolName = block.metadata?.tool_name as string || block.content
  const toolInput = (block.metadata?.tool_input as Record<string, unknown>) ?? {}
  const isError = resultBlock?.metadata?.is_error as boolean | undefined
  const isCancelled = resultBlock?.metadata?.is_cancelled as boolean | undefined
  const isLoading = !resultBlock
  const durationMs = resultBlock?.metadata?.duration_ms as number | undefined
  const createdAt = block.metadata?.created_at as string | undefined
  const elapsedMs = useElapsedMs(createdAt, isLoading)

  // Which provider's tool this is (see `useBlockProviderKind`).
  const providerKind = useBlockProviderKind()
  const toolContext = useMemo(
    () => ({
      providerKind,
      canonical: block.metadata?.tool_canonical as string | undefined,
    }),
    [providerKind, block.metadata?.tool_canonical],
  )

  const icon = getToolIcon(toolName, toolInput, toolContext)
  const summary = getToolSummary(toolName, toolInput, toolContext)
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
  const backgroundTasks = useAtomValue(chatBackgroundTasksAtom)
  const childActivity = useMemo(
    () =>
      hasChildOutputs
        ? buildActivityFromToolCall(block, resultBlock, {
            activeIds: new Set(backgroundTasks.map((t) => t.id)),
          })
        : null,
    [hasChildOutputs, block, resultBlock, backgroundTasks],
  )

  const isMcp = toolName.startsWith(MCP_PREFIX) || typeof toolInput.action === 'string'
  const badgeColor = isMcp ? getMcpBadgeColor(toolName, toolInput) : null

  // The cancel-tools API stops every tool in a session, so it must not be
  // exposed as a button on an individual tool. Background tasks have their
  // own targeted controls in the activity bar.

  return (
    <div
      className="my-2 rounded-lg bg-white/[0.04] border border-white/[0.06] overflow-hidden"
      // The activity bar scrolls here ("show in the conversation").
      data-tool-call-id={(block.metadata?.tool_call_id as string | undefined) ?? block.id}
    >
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
          <span className="ml-auto text-gray-500 shrink-0">{t('siteChat.toolCall.cancelled')}</span>
        ) : isLoading ? (
          <span className="ml-auto text-gray-600 shrink-0">
            {elapsedMs != null
              ? t('siteChat.toolCall.runningElapsed', { elapsed: formatDurationShort(elapsedMs) })
              : t('siteChat.toolCall.running')}
          </span>
        ) : durationMs != null ? (
          <span className="ml-auto text-gray-600 shrink-0">
            {formatDurationShort(durationMs)}
          </span>
        ) : null}
      </button>

      {isEngineNotInstalled(isError, resultBlock?.content) && <ToolEngineMissingNote />}

      {expanded && (
        <div className="px-3 pb-2">
          <ToolContent
            toolName={toolName}
            toolInput={toolInput}
            toolCallId={(block.metadata?.tool_call_id as string | undefined) ?? block.id}
            providerKind={toolContext.providerKind}
            canonical={toolContext.canonical}
            resultContent={resultBlock?.content}
            isError={isError}
            isLoading={isLoading}
          />
        </div>
      )}

      {/* Live child outputs (Monitor / Bash bg / Workflow / Task events grouped
          here by correlation_id — F5+F6 of plan 5985a7c4), rendered by the
          activity renderer for the tool's type instead of raw ticks. */}
      {childActivity && (
        <ActivityCard
          className="mx-3 mb-2 mt-1"
          activity={childActivity}
          // One line while it runs (title, status, progress hint): the activity
          // bar follows it. Opened on failure only.
          defaultOpen={childActivity.status === 'failed'}
        />
      )}
    </div>
  )
}
