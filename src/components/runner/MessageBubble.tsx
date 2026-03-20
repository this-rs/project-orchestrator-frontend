/**
 * MessageBubble — renders a single conversation message with type-specific styling.
 */

import type { ConversationMessage } from '@/hooks/runner'

// ---------------------------------------------------------------------------
// Style config per message type
// ---------------------------------------------------------------------------

const typeStyles: Record<ConversationMessage['type'], { label: string; border: string; bg: string; text: string }> = {
  text:        { label: 'Assistant', border: 'border-blue-500/20',   bg: 'bg-blue-500/[0.04]',   text: 'text-blue-400' },
  tool_use:    { label: 'Tool Use',  border: 'border-purple-500/20', bg: 'bg-purple-500/[0.04]', text: 'text-purple-400' },
  tool_result: { label: 'Result',    border: 'border-cyan-500/20',   bg: 'bg-cyan-500/[0.04]',   text: 'text-cyan-400' },
  system:      { label: 'System',    border: 'border-gray-500/20',   bg: 'bg-white/[0.02]',      text: 'text-gray-500' },
  error:       { label: 'Error',     border: 'border-red-500/20',    bg: 'bg-red-500/[0.04]',    text: 'text-red-400' },
  unknown:     { label: 'Event',     border: 'border-gray-500/20',   bg: 'bg-white/[0.02]',      text: 'text-gray-500' },
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface MessageBubbleProps {
  message: ConversationMessage
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MessageBubble({ message }: MessageBubbleProps) {
  const style = typeStyles[message.type] ?? typeStyles.unknown
  return (
    <div className={`border-l-2 ${style.border} ${style.bg} rounded-r-md px-3 py-2`}>
      <div className="flex items-center gap-2 mb-1">
        <span className={`text-[10px] font-medium uppercase ${style.text}`}>{style.label}</span>
      </div>
      <pre className="text-xs text-gray-300 whitespace-pre-wrap break-words font-mono leading-relaxed max-h-60 overflow-y-auto">
        {message.content}
      </pre>
    </div>
  )
}
