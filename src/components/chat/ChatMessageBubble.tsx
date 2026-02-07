import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import type { ChatMessage } from '@/types'
import { ThinkingBlock } from './ThinkingBlock'
import { ToolCallBlock } from './ToolCallBlock'
import { PermissionRequestBlock } from './PermissionRequestBlock'
import { InputRequestBlock } from './InputRequestBlock'

interface ChatMessageBubbleProps {
  message: ChatMessage
  isStreaming?: boolean
  onRespondPermission: (toolCallId: string, allowed: boolean) => void
  onRespondInput: (requestId: string, response: string) => void
}

export function ChatMessageBubble({ message, isStreaming, onRespondPermission, onRespondInput }: ChatMessageBubbleProps) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end mb-4">
        <div className="max-w-[85%] px-3 py-2 rounded-xl bg-indigo-600/20 text-sm text-gray-200 whitespace-pre-wrap">
          {message.blocks[0]?.content}
        </div>
      </div>
    )
  }

  // Assistant message
  return (
    <div className="mb-4">
      <div className="max-w-full">
        {message.blocks.map((block, index) => {
          switch (block.type) {
            case 'text': {
              // Skip empty metadata-only blocks (result cost info)
              if (!block.content && block.metadata) return null
              return (
                <div key={block.id} className="chat-markdown prose prose-invert prose-sm max-w-none break-words overflow-x-auto [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                    {block.content}
                  </ReactMarkdown>
                </div>
              )
            }

            case 'thinking': {
              const isLastBlock = index === message.blocks.length - 1
              return (
                <ThinkingBlock
                  key={block.id}
                  content={block.content}
                  isStreaming={isStreaming && isLastBlock}
                />
              )
            }

            case 'tool_use': {
              // Find matching tool_result
              const resultBlock = message.blocks.find(
                (b) => b.type === 'tool_result' && b.metadata?.tool_call_id === block.metadata?.tool_call_id,
              )
              return (
                <ToolCallBlock key={block.id} block={block} resultBlock={resultBlock} />
              )
            }

            case 'tool_result':
              // Rendered as part of tool_use, skip
              return null

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
