/* eslint-disable react-refresh/only-export-components */
import { memo } from 'react'
import { Paperclip } from 'lucide-react'
import { useT } from '@/i18n'
import { formatBytes } from './attachmentState'
import { ReferenceChip } from './ReferenceChip'
import { placeRefs } from '@/refs/placeRefs'
import type { ChatMessage, ContentBlock } from '@/types'
import { MarkdownText } from './MarkdownText'
import { ThinkingBlock } from './ThinkingBlock'
import { ToolCallGroup } from './ToolCallGroup'
import { AgentGroup } from './AgentGroup'
import { PermissionRequestBlock } from './PermissionRequestBlock'
import { AskUserQuestionBlock } from './AskUserQuestionBlock'
import { CompactBoundaryBlock } from './CompactBoundaryBlock'
import { SessionEventBlock } from './SessionEventBlock'
import { ModelChangedBlock } from './ModelChangedBlock'
import { ResultMaxTurnsBlock } from './ResultMaxTurnsBlock'
import { ResultErrorBlock } from './ResultErrorBlock'
import { SystemInitBlock } from './SystemInitBlock'
import { ContinueIndicatorBlock } from './ContinueIndicatorBlock'
import { RetryIndicatorBlock } from './RetryIndicatorBlock'
import { BackgroundActivityGroup } from './BackgroundActivityBlock'
import { VizBlockRenderer } from './viz'
import { CopyMarkdownButton } from './CopyMarkdownButton'
import { messageBodyToMarkdown } from '@/utils/chatExport'
import { ProviderStateCard } from './ProviderStateCard'
import { CostDisplay } from '@/components/ui/CostDisplay'
import { costOfMessage } from '@/utils/cost'
import type { PermissionScope, ProviderErrorInfo, SubagentsSupport } from '@/types/provider'
import { useChatCapabilities } from './ChatSessionContext'

// ============================================================================
// Agent grouping types & utilities
// ============================================================================

/** A group of blocks produced by a sub-agent (identified by parent_tool_use_id) */
export interface AgentGroupData {
  kind: 'agent_group'
  /** The tool_use block that spawned this agent (tool_name = "Task") */
  parentBlock: ContentBlock
  /** All blocks produced by this agent (tool_use, tool_result, text, thinking, etc.) */
  childBlocks: ContentBlock[]
}

/** Either a regular ContentBlock, a consecutive tool group, or an agent group */
export type GroupedBlock =
  | { kind: 'block'; block: ContentBlock }
  | { kind: 'tool_group'; blocks: ContentBlock[] }
  | AgentGroupData

/**
 * Group blocks by agent (parent_tool_use_id) and consecutive tool_use runs.
 *
 * 1. Identify blocks with `metadata.parent_tool_use_id` — they belong to a sub-agent.
 * 2. Find the parent tool_use block whose `metadata.tool_call_id` matches.
 * 3. Group consecutive top-level tool_use blocks together (existing behavior).
 * 4. Return a flat array of GroupedBlock items preserving chronological order.
 *
 * Blocks without parent_tool_use_id are treated as top-level (no visual change).
 *
 * `subagents` is the capability of the session's provider (default: Claude's).
 */
export function groupBlocksByAgent(blocks: ContentBlock[], subagents: SubagentsSupport = 'nested'): GroupedBlock[] {
  // A provider without sub-agents has no agent to group under: whatever
  // `parent_tool_use_id` its events carry is ignored and the blocks stay flat,
  // in arrival order. `separate_thread` keeps the grouping, like `nested`.
  const nested = subagents !== 'none'
  const parentOf = (block: ContentBlock) =>
    nested ? (block.metadata?.parent_tool_use_id as string | undefined) : undefined

  // Step 1: Collect all parent_tool_use_ids and their child blocks
  const childrenByParent = new Map<string, ContentBlock[]>()
  const parentIds = new Set<string>()

  for (const block of blocks) {
    const parentId = parentOf(block)
    if (parentId) {
      parentIds.add(parentId)
      let children = childrenByParent.get(parentId)
      if (!children) {
        children = []
        childrenByParent.set(parentId, children)
      }
      children.push(block)
    }
  }

  // Step 2: Build agent groups, preserving order by first appearance of the parent tool_use
  const result: GroupedBlock[] = []
  let currentToolGroup: ContentBlock[] = []
  const emittedParents = new Set<string>()

  for (const block of blocks) {
    const parentId = parentOf(block)

    // Skip blocks that belong to a sub-agent — they'll be rendered inside their AgentGroupData
    if (parentId) {
      continue
    }

    // Skip tool_result blocks — rendered as part of their tool_use
    if (block.type === 'tool_result') {
      continue
    }

    // Check if this tool_use is a parent of sub-agent blocks
    const toolCallId = block.metadata?.tool_call_id as string | undefined
    if (block.type === 'tool_use' && toolCallId && parentIds.has(toolCallId)) {
      // This is an agent parent — flush any pending tool group first
      if (currentToolGroup.length > 0) {
        result.push({ kind: 'tool_group', blocks: currentToolGroup })
        currentToolGroup = []
      }
      if (!emittedParents.has(toolCallId)) {
        emittedParents.add(toolCallId)
        result.push({
          kind: 'agent_group',
          parentBlock: block,
          childBlocks: childrenByParent.get(toolCallId) ?? [],
        })
      }
      continue
    }

    // Regular tool_use (not an agent parent) — group consecutively
    if (block.type === 'tool_use') {
      currentToolGroup.push(block)
      continue
    }

    // Non-tool block — flush tool group first, then add block
    if (currentToolGroup.length > 0) {
      result.push({ kind: 'tool_group', blocks: currentToolGroup })
      currentToolGroup = []
    }
    result.push({ kind: 'block', block })
  }

  // Flush remaining tool group
  if (currentToolGroup.length > 0) {
    result.push({ kind: 'tool_group', blocks: currentToolGroup })
  }

  return result
}

/** Format a Date as "HH:MM" in local time */
function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

/** Format duration in ms to a human-readable string */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  const mins = Math.floor(ms / 60000)
  const secs = Math.round((ms % 60000) / 1000)
  return `${mins}m${secs}s`
}

interface ChatMessageBubbleProps {
  message: ChatMessage
  isStreaming?: boolean
  onRespondPermission: (toolCallId: string, allowed: boolean, scope?: PermissionScope) => boolean | void
  onRespondInput: (requestId: string, response: string) => boolean | void
  onContinue?: () => void
}

/**
 * Memoized: `handleEvent` in useChat clones ONLY the message it touches (the
 * trailing assistant message during streaming) — every other message keeps
 * reference identity across events. With memo, a stream_delta re-renders one
 * bubble instead of the whole conversation. The callback props are stable
 * (useCallback in useChat/ChatPanel) and `isStreaming` is already scoped by
 * ChatMessages to the last assistant bubble only.
 */
export const ChatMessageBubble = memo(function ChatMessageBubble({ message, isStreaming, onRespondPermission, onRespondInput, onContinue }: ChatMessageBubbleProps) {
  // What the provider of this transcript can do (full Claude profile outside the chat panel).
  const { t } = useT()
  const caps = useChatCapabilities()
  if (message.role === 'user') {
    // No refs on the message (the server never announced refs_v1, or none were sent): the text is drawn as before.
    const placed = message.refs && message.refs.length > 0 ? placeRefs(message.blocks[0]?.content ?? '', message.refs) : null
    return (
      <div className="flex flex-col items-end mb-4">
        <div className="max-w-[85%] px-3 py-2 rounded-xl bg-indigo-600/20 text-sm text-gray-200 whitespace-pre-wrap break-words overflow-hidden">
          {placed ? (
            placed.segments.map((seg, i) =>
              seg.type === 'text' ? <span key={i}>{seg.text}</span> : <ReferenceChip key={i} reference={seg.ref} />,
            )
          ) : (
            message.blocks[0]?.content
          )}
        </div>
        {placed && placed.unplaced.length > 0 && (
          <ul className="flex flex-wrap justify-end gap-1.5 mt-1 max-w-[85%]" aria-label={t('chatA-messages.bubble.references')}>
            {placed.unplaced.map((r) => (
              <li key={`${r.kind}:${r.id}`}>
                <ReferenceChip reference={r} />
              </li>
            ))}
          </ul>
        )}
        {message.attachments && message.attachments.length > 0 && (
          <ul
            className="flex flex-wrap justify-end gap-1.5 mt-1 max-w-[85%]"
            aria-label={t('chatA-messages.bubble.attachments')}
          >
            {message.attachments.map((a) => (
              <li
                key={a.id}
                data-testid="message-attachment"
                title={a.filename}
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs text-gray-300"
              >
                <Paperclip className="w-3 h-3 text-gray-400 shrink-0" aria-hidden />
                <span className="truncate max-w-[14rem]">{a.filename}</span>
                <span className="text-gray-500">{formatBytes(a.size_bytes)}</span>
              </li>
            ))}
          </ul>
        )}
        {/* Footer: copy button · timestamp */}
        <div className="flex items-center gap-1 mt-0.5 mr-1 text-[10px] text-gray-600">
          <CopyMarkdownButton
            getMarkdown={() => messageBodyToMarkdown(message)}
            title={t('chatA-messages.bubble.copyMessage')}
          />
          {message.timestamp && (
            <>
              <span>·</span>
              <span>{formatTime(message.timestamp)}</span>
            </>
          )}
        </div>
      </div>
    )
  }

  // Assistant message - group blocks by agent and consecutive tool_use runs
  const grouped = groupBlocksByAgent(message.blocks, caps.subagents)

  return (
    <div className="mb-4">
      <div className="max-w-full">
        {grouped.map((item, index) => {
          // Agent group (sub-agent blocks)
          if (item.kind === 'agent_group') {
            return (
              <AgentGroup
                key={`agent-${item.parentBlock.id}`}
                parentBlock={item.parentBlock}
                childBlocks={item.childBlocks}
                allBlocks={message.blocks}
                isStreaming={isStreaming}
              />
            )
          }

          // Consecutive tool group (top-level tool_use blocks)
          if (item.kind === 'tool_group') {
            return (
              <ToolCallGroup
                key={`tool-group-${index}`}
                toolBlocks={item.blocks}
                allBlocks={message.blocks}
              />
            )
          }

          // Single block
          const block = item.block
          switch (block.type) {
            case 'text': {
              // Skip empty metadata-only blocks (result cost info)
              if (!block.content && block.metadata) return null
              return (
                <div key={block.id} className="chat-markdown prose prose-invert prose-sm max-w-none break-words overflow-x-auto [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                  <MarkdownText
                    citeRefs
                    content={block.content}
                    isStreaming={isStreaming && index === grouped.length - 1}
                  />
                </div>
              )
            }

            case 'thinking': {
              // A provider that emits no reasoning: nothing to show, not an
              // empty "Thought process" toggle.
              if (!caps.thinking) return null
              const isLastBlock = index === grouped.length - 1
              return (
                <ThinkingBlock
                  key={block.id}
                  content={block.content}
                  isStreaming={isStreaming && isLastBlock}
                />
              )
            }

            case 'permission_request':
              return (
                <PermissionRequestBlock
                  key={block.id}
                  block={block}
                  onRespond={onRespondPermission}
                />
              )

            case 'ask_user_question':
              return (
                <AskUserQuestionBlock
                  key={block.id}
                  block={block}
                  onRespond={onRespondInput}
                />
              )

            case 'model_changed':
              return (
                <ModelChangedBlock
                  key={block.id}
                  block={block}
                />
              )

            case 'conversation_relayed':
            case 'session_closed':
            case 'compaction_recovery':
              return <SessionEventBlock key={block.id} block={block} />

            case 'compact_boundary':
              return (
                <CompactBoundaryBlock
                  key={block.id}
                  block={block}
                />
              )

            case 'system_init':
              return (
                <SystemInitBlock
                  key={block.id}
                  block={block}
                />
              )

            case 'system_hint':
              // System hints are internal — never rendered in the UI.
              return null

            case 'result_max_turns': {
              // Hide the entire block if the user already continued past this point
              // (a continue_indicator follows in the same message), or if it was
              // dismissed because the user sent a normal message after max_turns.
              const alreadyContinued = message.blocks.some(
                (b) => b.type === 'continue_indicator',
              )
              if (alreadyContinued || block.metadata?.dismissed) return null
              return (
                <ResultMaxTurnsBlock
                  key={block.id}
                  block={block}
                  onContinue={onContinue ?? (() => {})}
                  isStreaming={isStreaming}
                />
              )
            }

            case 'continue_indicator':
              return (
                <ContinueIndicatorBlock
                  key={block.id}
                  block={block}
                />
              )

            case 'retry_indicator':
              return (
                <RetryIndicatorBlock
                  key={block.id}
                  block={block}
                />
              )

            case 'result_error':
              return (
                <ResultErrorBlock
                  key={block.id}
                  block={block}
                />
              )

            case 'viz':
              return (
                <VizBlockRenderer
                  key={block.id}
                  block={block}
                />
              )

            case 'background_activity': {
              // A run of consecutive background blocks renders as ONE chained
              // panel (status summary + timeline) anchored on its first block.
              const prev = grouped[index - 1]
              if (prev?.kind === 'block' && prev.block.type === 'background_activity') return null
              const run: ContentBlock[] = []
              for (let j = index; j < grouped.length; j++) {
                const g = grouped[j]
                if (g.kind !== 'block' || g.block.type !== 'background_activity') break
                run.push(g.block)
              }
              return <BackgroundActivityGroup key={block.id} blocks={run} />
            }

            case 'error': {
              // A `session_error` that carried a typed code: the card of that
              // failure, with the action that gets out of it.
              const providerError = block.metadata?.provider_error as ProviderErrorInfo | undefined
              if (providerError) {
                return <ProviderStateCard key={block.id} error={providerError} className="my-2" />
              }
              return (
                <div key={block.id} className="my-2 px-3 py-2 rounded-lg bg-red-900/10 border border-red-500/20 text-sm text-red-400">
                  {block.content}
                </div>
              )
            }

            default:
              return null
          }
        })}
        {isStreaming && message.blocks.length === 0 && (
          <div className="flex items-center gap-1.5 text-gray-500 text-sm">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
            <span>{t('chatA-messages.bubble.thinking')}</span>
          </div>
        )}
        {/* Turn summary: copy button · timestamp · duration · cost */}
        {!isStreaming && message.blocks.length > 0 && (
          <div className="flex items-center justify-end gap-1 mt-1 text-[10px] text-gray-600">
            <CopyMarkdownButton
              getMarkdown={() => messageBodyToMarkdown(message)}
              title={t('chatA-messages.bubble.copyReply')}
            />
            {message.timestamp && (
              <>
                <span>·</span>
                <span>{formatTime(message.timestamp)}</span>
              </>
            )}
            {message.duration_ms != null && (
              <>
                <span>·</span>
                <span>{formatDuration(message.duration_ms)}</span>
              </>
            )}
            {/* Amount, "est.", "local", "subscription" or tokens — by basis. Never "$0" for an unknown cost. */}
            <CostDisplay cost={costOfMessage(message)} before={<span>·</span>} />
          </div>
        )}
      </div>
    </div>
  )
})
