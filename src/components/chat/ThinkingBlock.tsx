import { useState } from 'react'
import { ChevronRight } from 'lucide-react'

interface ThinkingBlockProps {
  content: string
  isStreaming?: boolean
}

export function ThinkingBlock({ content, isStreaming }: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="my-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-400 transition-colors"
      >
        {isStreaming && (
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
        )}
        <ChevronRight className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        <span>{isStreaming ? 'Thinking...' : 'Thought process'}</span>
      </button>
      {expanded && (
        <div className="mt-1.5 pl-4 border-l border-white/[0.06] text-xs text-gray-500 whitespace-pre-wrap">
          {content}
        </div>
      )}
    </div>
  )
}
