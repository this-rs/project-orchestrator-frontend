import { useState } from 'react'
import { ChevronRight } from 'lucide-react'

interface ThinkingBlockProps {
  content: string
  isStreaming?: boolean
}

export function ThinkingBlock({ content, isStreaming }: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(false)

  // Recent models (Opus 4.7+, Sonnet 5+) return thinking blocks with an EMPTY text
  // and only an encrypted signature: the API default is `display: "omitted"`, and the
  // model emits one such block before every tool call. Measured on a real session:
  // 114 of 117 blocks were empty. Rendering them produced stacks of
  // "Thought process" toggles that expand onto nothing.
  // While streaming, the "Thinking..." pulse is still useful feedback; once done,
  // an empty block carries no information and is not shown.
  if (!isStreaming && !content.trim()) return null

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
