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

// Group consecutive tool_use blocks together
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
  onRespondPermission: (toolCallId: string, allowed: boolean) => void
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
