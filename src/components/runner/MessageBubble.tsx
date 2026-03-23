/**
 * MessageBubble — renders a single ChatMessage with role-based styling.
 *
 * Iterates over the message's ContentBlock[] and renders each block
 * with type-specific labels and colours.
 */

import type { ChatMessage, ContentBlock } from '@/types'

// ---------------------------------------------------------------------------
// Style config per block type
// ---------------------------------------------------------------------------

const blockStyles: Record<string, { label: string; border: string; bg: string; text: string }> = {
  text:               { label: 'Text',       border: 'border-blue-500/20',   bg: 'bg-blue-500/[0.04]',   text: 'text-blue-400' },
  thinking:           { label: 'Thinking',   border: 'border-yellow-500/20', bg: 'bg-yellow-500/[0.04]', text: 'text-yellow-400' },
  tool_use:           { label: 'Tool Use',   border: 'border-purple-500/20', bg: 'bg-purple-500/[0.04]', text: 'text-purple-400' },
  tool_result:        { label: 'Result',     border: 'border-cyan-500/20',   bg: 'bg-cyan-500/[0.04]',   text: 'text-cyan-400' },
  error:              { label: 'Error',      border: 'border-red-500/20',    bg: 'bg-red-500/[0.04]',    text: 'text-red-400' },
  permission_request: { label: 'Permission', border: 'border-orange-500/20', bg: 'bg-orange-500/[0.04]', text: 'text-orange-400' },
  system_init:        { label: 'System',     border: 'border-gray-500/20',   bg: 'bg-white/[0.02]',      text: 'text-gray-500' },
}

const defaultBlockStyle = { label: 'Event', border: 'border-gray-500/20', bg: 'bg-white/[0.02]', text: 'text-gray-500' }

// ---------------------------------------------------------------------------
// Sub-component: single block
// ---------------------------------------------------------------------------

function BlockView({ block }: { block: ContentBlock }) {
  const style = blockStyles[block.type] ?? defaultBlockStyle
  const toolName = block.type === 'tool_use' ? (block.metadata?.tool_name as string ?? block.content) : null

  return (
    <div className={`border-l-2 ${style.border} ${style.bg} rounded-r-md px-3 py-2`}>
      <div className="flex items-center gap-2 mb-1">
        <span className={`text-[10px] font-medium uppercase ${style.text}`}>
          {toolName ? `Tool: ${toolName}` : style.label}
        </span>
      </div>
      <pre className="text-xs text-gray-300 whitespace-pre-wrap break-words font-mono leading-relaxed max-h-60 overflow-y-auto">
        {block.content}
      </pre>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface MessageBubbleProps {
  message: ChatMessage
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user'

  return (
    <div className={`space-y-1 ${isUser ? 'pl-4' : ''}`}>
      {/* Role label */}
      <span className={`text-[10px] font-medium uppercase ${isUser ? 'text-green-400' : 'text-blue-400'}`}>
        {isUser ? 'User' : 'Assistant'}
        {message.isStreaming && (
          <span className="ml-1.5 text-yellow-400 animate-pulse">streaming…</span>
        )}
      </span>
      {/* Render each block */}
      {message.blocks.map((block) => (
        <BlockView key={block.id} block={block} />
      ))}
    </div>
  )
}
