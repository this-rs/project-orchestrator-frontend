import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import type { ChatMessage, ContentBlock } from '@/types'
import { ExternalLink } from '@/components/ui/ExternalLink'
import { ThinkingBlock } from './ThinkingBlock'
import { ToolCallGroup } from './ToolCallGroup'
import { PermissionRequestBlock } from './PermissionRequestBlock'
import { InputRequestBlock } from './InputRequestBlock'
import { AskUserQuestionBlock } from './AskUserQuestionBlock'

/**
 * Markdown link component: uses ExternalLink which renders differently
 * in Tauri (no href, onClick only) vs browser (normal <a>).
 */
const markdownComponents = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  a: ({ href, children, ...props }: any) => (
    <ExternalLink href={href} {...props}>
      {children}
    </ExternalLink>
  ),
}

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
 */
export function groupBlocksByAgent(blocks: ContentBlock[]): GroupedBlock[] {
  // Step 1: Collect all parent_tool_use_ids and their child blocks
  const childrenByParent = new Map<string, ContentBlock[]>()
  const parentIds = new Set<string>()

  for (const block of blocks) {
    const parentId = block.metadata?.parent_tool_use_id as string | undefined
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
    const parentId = block.metadata?.parent_tool_use_id as string | undefined

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

// Group consecutive tool_use blocks together (legacy — used as fallback)
function groupBlocks(blocks: ContentBlock[]): (ContentBlock | ContentBlock[])[] {
  const result: (ContentBlock | ContentBlock[])[] = []
  let currentToolGroup: ContentBlock[] = []

  for (const block of blocks) {
    if (block.type === 'tool_use') {
      currentToolGroup.push(block)
    } else if (block.type === 'tool_result') {
      // Skip - rendered as part of tool_use
      continue
    } else {
      // Flush tool group if any
      if (currentToolGroup.length > 0) {
        result.push(currentToolGroup)
        currentToolGroup = []
      }
      result.push(block)
    }
  }

  // Flush remaining tool group
  if (currentToolGroup.length > 0) {
    result.push(currentToolGroup)
  }

  return result
}

interface ChatMessageBubbleProps {
  message: ChatMessage
  isStreaming?: boolean
  highlighted?: boolean
  onRespondPermission: (toolCallId: string, allowed: boolean, remember?: { toolName: string }) => void
  onRespondInput: (requestId: string, response: string) => void
}

export function ChatMessageBubble({ message, isStreaming, highlighted, onRespondPermission, onRespondInput }: ChatMessageBubbleProps) {
  const highlightClass = highlighted
    ? 'ring-2 ring-amber-400/50 bg-amber-400/[0.06] rounded-xl transition-all duration-500'
    : 'transition-all duration-1000'

  if (message.role === 'user') {
    return (
      <div className={`flex justify-end mb-4 ${highlightClass}`}>
        <div className="max-w-[85%] px-3 py-2 rounded-xl bg-indigo-600/20 text-sm text-gray-200 whitespace-pre-wrap break-words overflow-hidden">
          {message.blocks[0]?.content}
        </div>
      </div>
    )
  }

  // Assistant message - group consecutive tool_use blocks
  const groupedBlocks = groupBlocks(message.blocks)

  return (
    <div className={`mb-4 ${highlightClass}`}>
      <div className="max-w-full">
        {groupedBlocks.map((item, index) => {
          // Tool group (array of tool_use blocks)
          if (Array.isArray(item)) {
            return (
              <ToolCallGroup
                key={`tool-group-${index}`}
                toolBlocks={item}
                allBlocks={message.blocks}
              />
            )
          }

          const block = item
          switch (block.type) {
            case 'text': {
              // Skip empty metadata-only blocks (result cost info)
              if (!block.content && block.metadata) return null
              return (
                <div key={block.id} className="chat-markdown prose prose-invert prose-sm max-w-none break-words overflow-x-auto [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={markdownComponents}>
                    {block.content}
                  </ReactMarkdown>
                </div>
              )
            }

            case 'thinking': {
              const isLastBlock = index === groupedBlocks.length - 1
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

            case 'input_request':
              return (
                <InputRequestBlock
                  key={block.id}
                  block={block}
                  onRespond={onRespondInput}
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

            case 'error':
              return (
                <div key={block.id} className="my-2 px-3 py-2 rounded-lg bg-red-900/10 border border-red-500/20 text-sm text-red-400">
                  {block.content}
                </div>
              )

            default:
              return null
          }
        })}
        {isStreaming && message.blocks.length === 0 && (
          <div className="flex items-center gap-1.5 text-gray-500 text-sm">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
            <span>Thinking...</span>
          </div>
        )}
      </div>
    </div>
  )
}
